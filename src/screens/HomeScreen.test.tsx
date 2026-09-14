import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RESTORE_MON14_BUTTON, RESTORE_WEEK1_BUTTON, RESTORE_WEEK1_TITLE_EMPTY, RESTORE_WEEK1_TITLE_MISSING_LAST, IMPORT_SESSION_JSON_BUTTON } from '../components/SessionBackupCard';
import { A2HS_EMPTY_STORE_LINE, mon14DayAReferenceSession, week1LastReferenceSessions } from '../domain/sessionBackup';
import { createDraftSession } from '../domain/sessionFactory';
import { isWarmupSet } from '../domain/sets';
import { HomeScreen } from './HomeScreen';

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

function noopAsync() {
  return Promise.resolve(0);
}

function homeProps(overrides: Partial<Parameters<typeof HomeScreen>[0]> = {}) {
  return {
    date: '2026-09-14',
    templateDay: 'A' as const,
    onTemplateDay: () => undefined,
    draft: null,
    history: [],
    historyCount: 0,
    onStart: () => undefined,
    onResume: () => undefined,
    onHistory: () => undefined,
    onInterval: () => undefined,
    onHealth: () => undefined,
    onImportSessions: async () => 0,
    onSeedWeek1: noopAsync,
    onSeedMon14: noopAsync,
    ...overrides,
  };
}

describe('HomeScreen Restore Week 1 weights', () => {
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

  it('on an empty install shows Restore Week 1, Mon 14 Day A, and JSON import above Start', () => {
    const { container, root } = mount(<HomeScreen {...homeProps()} />);
    nodes.push({ container, root });

    expect(container.textContent).toContain(RESTORE_WEEK1_TITLE_EMPTY);
    expect(container.textContent).toContain(RESTORE_WEEK1_BUTTON);
    expect(container.textContent).toContain(RESTORE_MON14_BUTTON);
    expect(container.textContent).toContain(IMPORT_SESSION_JSON_BUTTON);
    expect(container.textContent).toContain(A2HS_EMPTY_STORE_LINE);
    expect(container.textContent).toMatch(/Session log \(0\)/);
    expect(container.textContent).toContain('57.5 kg · 3 × 4');

    const start = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === 'Start session',
    );
    const week1 = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === RESTORE_WEEK1_BUTTON,
    );
    expect(start).toBeTruthy();
    expect(week1).toBeTruthy();
    const startPos = start && week1 ? start.compareDocumentPosition(week1) : 0;
    expect(startPos & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('still offers Restore on home when Session log (1) leaves T1 at No prior log', () => {
    const otherDay = createDraftSession('B', '2026-09-08');
    otherDay.status = 'complete';
    for (const lift of otherDay.lifts) {
      lift.sets = lift.sets.map((set) => (isWarmupSet(set) ? set : { ...set, completed: true }));
    }

    const { container, root } = mount(
      <HomeScreen {...homeProps({ history: [otherDay], historyCount: 1 })} />,
    );
    nodes.push({ container, root });

    expect(container.textContent).toMatch(/Session log \(1\)/);
    expect(container.textContent).toContain('No prior log');
    expect(container.textContent).toContain(RESTORE_WEEK1_BUTTON);
    expect(container.textContent).toContain(RESTORE_WEEK1_TITLE_MISSING_LAST);
    expect(container.textContent).not.toContain('Session log empty');
    expect(container.textContent).toContain('57.5 kg · 3 × 4');
    expect(container.textContent).toMatch(/Last: needs logged work sets/);
  });

  it('after Mon 14 Day A restore, Session log is not empty and W2 squat stays 57.5', () => {
    const history = [mon14DayAReferenceSession()];
    const { container, root } = mount(
      <HomeScreen {...homeProps({ history, historyCount: history.length })} />,
    );
    nodes.push({ container, root });

    expect(container.textContent).toMatch(/Session log \(1\)/);
    expect(container.textContent).not.toContain('Session log empty');
    expect(container.textContent).toContain('57.5 kg · 3 × 4');
    expect(container.textContent).toContain(RESTORE_WEEK1_BUTTON);
    expect(container.textContent).toContain(RESTORE_MON14_BUTTON);
    expect(container.textContent).toContain('No prior log');
  });

  it('hides the home restore card once T1 Last: is present', () => {
    const history = week1LastReferenceSessions();
    const { container, root } = mount(
      <HomeScreen {...homeProps({ history, historyCount: history.length })} />,
    );
    nodes.push({ container, root });

    expect(container.textContent).toContain('Last: 47.5 kg × 5');
    expect(container.textContent).not.toContain(RESTORE_WEEK1_BUTTON);
    expect(container.textContent).toMatch(/Session log \(4\)/);
  });
});
