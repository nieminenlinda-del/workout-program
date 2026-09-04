import { Unzip, UnzipInflate } from 'fflate';

const CHUNK_SIZE = 512 * 1024;

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
        return;
      }
      reject(new Error('Could not read file bytes'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsArrayBuffer(blob);
  });
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() ?? normalized;
}

/** v1: only apple_health_export/export.xml. Skip CDA, GPX routes, ECG, etc. */
export function shouldInflateHealthZipEntry(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (/(^|\/)workout-routes\//i.test(normalized)) return false;
  if (normalized.toLowerCase().endsWith('.gpx')) return false;
  return basename(normalized) === 'export.xml';
}

async function sniffKind(file: Blob): Promise<'zip' | 'xml'> {
  const head = await readBlobBytes(file.slice(0, 256));
  if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  const name = 'name' in file && typeof (file as File).name === 'string' ? (file as File).name.toLowerCase() : '';
  if (name.endsWith('.xml')) return 'xml';
  if (name.endsWith('.zip')) return 'zip';
  const preview = new TextDecoder('utf-8', { fatal: false }).decode(head);
  if (preview.includes('<') && /xml|HealthData|DOCTYPE/i.test(preview)) return 'xml';
  return 'zip';
}

async function forEachBlobChunk(
  blob: Blob,
  onChunk: (chunk: Uint8Array, last: boolean) => void | Promise<void>,
): Promise<void> {
  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK_SIZE, blob.size);
    const chunk = await readBlobBytes(blob.slice(offset, end));
    offset = end;
    await onChunk(chunk, offset >= blob.size);
  }
  if (blob.size === 0) await onChunk(new Uint8Array(), true);
}

/**
 * Stream UTF-8 text of `export.xml` from a Health zip, or the file itself if
 * it is already XML. Never materializes the whole archive as a string.
 */
export async function streamHealthExportXml(
  file: Blob,
  onTextChunk: (text: string, final: boolean) => void | Promise<void>,
): Promise<void> {
  const kind = await sniffKind(file);
  if (kind === 'xml') {
    const decoder = new TextDecoder('utf-8');
    await forEachBlobChunk(file, async (chunk, last) => {
      let text = decoder.decode(chunk, { stream: !last });
      if (last) text += decoder.decode();
      await onTextChunk(text, last);
    });
    return;
  }

  await streamXmlFromZip(file, onTextChunk);
}

function streamXmlFromZip(
  file: Blob,
  onTextChunk: (text: string, final: boolean) => void | Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder('utf-8');
    const uz = new Unzip();
    uz.register(UnzipInflate);

    let settled = false;
    let found = false;
    let xmlDone = false;
    let zipDone = false;
    let pending = Promise.resolve();

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const maybeFinish = () => {
      if (!zipDone) return;
      if (!found) {
        fail(new Error('No export.xml found in this zip. Export All Health Data from the Health app.'));
        return;
      }
      if (xmlDone) succeed();
    };

    uz.onfile = (zfile) => {
      const wanted = shouldInflateHealthZipEntry(zfile.name);
      if (!wanted) return;
      found = true;
      zfile.ondata = (err, data, final) => {
        if (err) {
          fail(err);
          return;
        }
        if (!wanted) return;
        found = true;
        let text = decoder.decode(data, { stream: !final });
        if (final) text += decoder.decode();
        pending = pending
          .then(() => onTextChunk(text, final))
          .then(() => {
            if (final) {
              xmlDone = true;
              maybeFinish();
            }
          })
          .catch(fail);
      };
      zfile.start();
    };

    void forEachBlobChunk(file, (chunk, last) => {
      uz.push(chunk, last);
      if (last) {
        zipDone = true;
        queueMicrotask(maybeFinish);
      }
    }).catch(fail);
  });
}
