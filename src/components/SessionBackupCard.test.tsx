import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { A2HS_EMPTY_STORE_LINE } from '../domain/sessionBackup';
import {
  IMPORT_SESSION_JSON_BUTTON,
  RESTORE_EMPTY_HELPER_COMPACT,
  RESTORE_EMPTY_NOTE,
  RESTORE_MON14_BUTTON,
  RESTORE_MON14_CONFIRM,
  RESTORE_MON14_DONE,
  RESTORE_WEEK1_BUTTON,
  RESTORE_WEEK1_CONFIRM,
  RESTORE_WEEK1_DONE,
  RESTORE_WEEK1_HELPER,
  RESTORE_WEEK1_HELPER_COMPACT,
  RESTORE_WEEK1_TITLE_EMPTY,
  RESTORE_WEEK1_TITLE_MISSING_LAST,
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

function noopSeed() {
  return Promise.resolve(0);
}

function cardProps(
  overrides: Partial<Parameters<typeof SessionBackupCard>[0]> = {},
): Parameters<typeof SessionBackupCard>[0] {
  return {
    historyCount: 0,
    onImport: async () => 0,
    onSeed: noopSeed,
    onSeedMon14: noopSeed,
    ...overrides,
  };
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

    const { container, root } = mount(<SessionBackupCard compact {...cardProps()} />);
    nodes.push({ container, root });

    const button = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === RESTORE_WEEK1_BUTTON,
    );
    expect(button).toBeTruthy();
    expect(container.textContent).toContain(RESTORE_EMPTY_HELPER_COMPACT);
    expect(container.textContent).toContain(RESTORE_WEEK1_TITLE_EMPTY);
    expect(container.textContent).not.toContain(RESTORE_WEEK1_TITLE_MISSING_LAST);
    expect(container.textContent).not.toMatch(/Seed Week 1 Last: reference/);
  });

  it('compact empty card makes Week 1, Mon 14, and JSON import impossible to miss', () => {
    expect(RESTORE_MON14_BUTTON).toBe('Restore today’s Mon 14 Day A');
    expect(RESTORE_EMPTY_HELPER_COMPACT).toContain(A2HS_EMPTY_STORE_LINE);
    expect(RESTORE_EMPTY_NOTE).toContain(A2HS_EMPTY_STORE_LINE);
    expect(RESTORE_WEEK1_HELPER).toContain(A2HS_EMPTY_STORE_LINE);
    expect(RESTORE_WEEK1_HELPER).toMatch(/Mon 14 Day A/);

    const { container, root } = mount(<SessionBackupCard compact {...cardProps()} />);
    nodes.push({ container, root });

    const labels = [...container.querySelectorAll('button')].map((el) => el.textContent);
    expect(labels).toContain(RESTORE_WEEK1_BUTTON);
    expect(labels).toContain(RESTORE_MON14_BUTTON);
    expect(labels).toContain(IMPORT_SESSION_JSON_BUTTON);
    expect(container.textContent).toContain(RESTORE_EMPTY_NOTE);
    expect(container.textContent).toMatch(/no server backup/i);
    const importBtn = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === IMPORT_SESSION_JSON_BUTTON,
    );
    expect(importBtn?.className).toMatch(/btn-primary/);
  });

  it('compact card with Session log (1) says Last: missing, not Session log empty', () => {
    const { container, root } = mount(
      <SessionBackupCard compact {...cardProps({ historyCount: 1, onSeed: async () => 4 })} />,
    );
    nodes.push({ container, root });

    const button = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === RESTORE_WEEK1_BUTTON,
    );
    expect(button).toBeTruthy();
    expect(container.textContent).toContain(RESTORE_WEEK1_TITLE_MISSING_LAST);
    expect(container.textContent).not.toContain(RESTORE_WEEK1_TITLE_EMPTY);
    expect(container.textContent).toContain(RESTORE_WEEK1_HELPER_COMPACT);
    expect(container.textContent).toContain(RESTORE_MON14_BUTTON);
  });

  it('confirms then seeds when this install already has sessions', async () => {
    const onSeed = vi.fn(async () => 4);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container, root } = mount(
      <SessionBackupCard compact {...cardProps({ historyCount: 1, onSeed })} />,
    );
    nodes.push({ container, root });

    const button = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === RESTORE_WEEK1_BUTTON,
    );
    await act(async () => {
      button?.click();
    });
    expect(confirm).toHaveBeenCalledWith(RESTORE_WEEK1_CONFIRM);
    expect(onSeed).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Restored Week 1 weights: 4 sessions on this install.');
    confirm.mockRestore();
  });

  it('skips seed when restore confirm is cancelled', async () => {
    const onSeed = vi.fn(async () => 4);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container, root } = mount(
      <SessionBackupCard compact {...cardProps({ historyCount: 1, onSeed })} />,
    );
    nodes.push({ container, root });

    const button = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === RESTORE_WEEK1_BUTTON,
    );
    await act(async () => {
      button?.click();
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(onSeed).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('keeps onSeed as the restore action', async () => {
    const onSeed = vi.fn(async () => 4);
    const { container, root } = mount(<SessionBackupCard {...cardProps({ onSeed })} />);
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

  it('seeds Mon 14 Day A without confirm on an empty install', async () => {
    const onSeedMon14 = vi.fn(async () => 1);
    const confirm = vi.spyOn(window, 'confirm');
    const { container, root } = mount(<SessionBackupCard compact {...cardProps({ onSeedMon14 })} />);
    nodes.push({ container, root });

    const button = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === RESTORE_MON14_BUTTON,
    );
    await act(async () => {
      button?.click();
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(onSeedMon14).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(`${RESTORE_MON14_DONE}: 1 session on this install.`);
    confirm.mockRestore();
  });

  it('confirms Mon 14 restore when this install already has sessions', async () => {
    const onSeedMon14 = vi.fn(async () => 1);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container, root } = mount(
      <SessionBackupCard compact {...cardProps({ historyCount: 1, onSeedMon14 })} />,
    );
    nodes.push({ container, root });

    const button = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === RESTORE_MON14_BUTTON,
    );
    await act(async () => {
      button?.click();
    });
    expect(confirm).toHaveBeenCalledWith(RESTORE_MON14_CONFIRM);
    expect(onSeedMon14).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });
});
