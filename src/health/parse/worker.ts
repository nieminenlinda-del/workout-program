import { createHealthIndexedDbRepository } from '../indexedDbRepository';
import type { ImportProgress } from '../types';
import { runHealthImport } from './ingest';

type Inbound = { type: 'import'; file: File; fileName?: string };
type Outbound =
  | ({ type: 'progress' } & ImportProgress)
  | { type: 'done'; meta: Awaited<ReturnType<typeof runHealthImport>> }
  | { type: 'error'; message: string };

type WorkerScope = {
  onmessage: ((event: MessageEvent<Inbound>) => void) | null;
  postMessage: (message: Outbound) => void;
};

const worker = self as unknown as WorkerScope;

worker.onmessage = async (event: MessageEvent<Inbound>) => {
  const data = event.data;
  if (!data || data.type !== 'import') return;
  try {
    const repo = createHealthIndexedDbRepository();
    const meta = await runHealthImport(data.file, repo, {
      fileName: data.fileName ?? data.file.name,
      onProgress: (progress) => {
        const message: Outbound = { type: 'progress', ...progress };
        worker.postMessage(message);
      },
    });
    const done: Outbound = { type: 'done', meta };
    worker.postMessage(done);
  } catch (err) {
    const message: Outbound = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Health import failed',
    };
    worker.postMessage(message);
  }
};
