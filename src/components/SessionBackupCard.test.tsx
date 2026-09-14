import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  RESTORE_WEEK1_BUTTON,
  RESTORE_WEEK1_CONFIRM,
  RESTORE_WEEK1_DONE,
  RESTORE_WEEK1_HELPER,
  RESTORE_WEEK1_HELPER_COMPACT,
  SessionBackupCard,
} from './SessionBackupCard';

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return { container, root };
}

function unmount(root: Root, container: HTMLDivElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function explainsRestoreCopy(text: string, { safari = true } = {}) {
  expect(text).toContain('Restore Week 1 weights');
  expect(text).toMatch(/Week 1 T1s/i);
  expect(text).toMatch(/Last:/);
  if (safari) expect(text).toMatch(/Home-screen store ≠ Safari/);
  expect(text).toMatch(/57\.5/);
  expect(text).not.toMatch(/Seed Week 1/);
}

describe('SessionBackupCard Restore Week 1 weights', () => {
  const nodes: { root: Root; container: HTMLDivElement }[] = [];

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    while (nodes.length) {
      const node = nodes.pop();
      if (node) unmount(node.root, node.container);
    }
  });

  it('labels the recovery button Restore Week 1 weights in English', () => {
    expect(RESTORE_WEEK1_BUTTON).toBe('Restore Week 1 weights');
    expect(RESTORE_WEEK1_DONE).toBe('Restored Week 1 weights');
    explainsRestoreCopy(RESTORE_WEEK1_HELPER_COMPACT);
    explainsRestoreCopy(RESTORE_WEEK1_HELPER);
    explainsRestoreCopy(RESTORE_WEEK1_CONFIRM, { safari: false });

    const { container, root } = mount(
      <SessionBackupCard
        compact
        historyCount={0}
        onImport={async () => 0}
        onSeed={async () => 4}
      />,
    );
    nodes.push({ container, root });

    const button = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === RESTORE_WEEK1_BUTTON,
    );
    expect(button).toBeTruthy();
    expect(container.textContent).toContain(RESTORE_WEEK1_HELPER_COMPACT);
    expect(container.textContent).not.toMatch(/Seed Week 1 Last: reference/);
  });

  it('keeps onSeed as the restore action', async () => {
    const onSeed = vi.fn(async () => 4);
    const { container, root } = mount(
      <SessionBackupCard historyCount={0} onImport={async () => 0} onSeed={onSeed} />,
    );
    nodes.push({ container, root });

    const button = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === 'Restore Week 1 weights',
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button?.click();
    });
    expect(onSeed).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Restored Week 1 weights: 4 sessions on this install.');
  });
});
