import type { ImportMeta, ImportProgress } from '../types';

type WorkerMessage =
  | ({ type: 'progress' } & ImportProgress)
  | { type: 'done'; meta: ImportMeta }
  | { type: 'error'; message: string };

export function importHealthFileInWorker(
  file: File,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportMeta> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const data = event.data;
      if (data.type === 'progress') {
        onProgress?.(data);
        return;
      }
      worker.terminate();
      if (data.type === 'done') resolve(data.meta);
      else reject(new Error(data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(event.error instanceof Error ? event.error : new Error(event.message || 'Health import worker failed'));
    };
    worker.postMessage({ type: 'import', file, fileName: file.name });
  });
}
