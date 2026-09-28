import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BlockPreviewScreen } from './BlockPreviewScreen';
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

describe('Block preview screen', () => {
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

  it('opens the current week and keeps a future week collapsed', () => {
    const { container, root } = mount(
      <BlockPreviewScreen asOf="2026-09-27" history={[]} onBack={() => undefined} />,
    );
    nodes.push({ container, root });

    const weeks = [...container.querySelectorAll('details')];
    expect(weeks.length).toBeGreaterThan(2);
    expect(weeks[0]?.open).toBe(true);
    expect(weeks[0]?.textContent).toContain('Block A · Week 3');
    expect(weeks[0]?.textContent).toContain('This week');
    expect(weeks[0]?.textContent).toContain('Hypertrophy');
    expect(weeks[0]?.textContent).toContain('60 kg · 3 × 3');
    expect(weeks[0]?.textContent).toContain('Wed 23 Sep · Day C');
    expect(weeks[1]?.open).toBe(false);
    expect(weeks[1]?.textContent).toContain('Block A · Week 4');
    expect(weeks[1]?.textContent).toContain('Deload');
    expect(weeks[1]?.textContent).toContain('45 kg · 2 × 5');
    expect(weeks[1]?.textContent).toContain('RPE 5–6');
    expect(weeks[1]?.textContent).toContain('55 kg · 2 × 5');
    expect(weeks[0]?.textContent).not.toContain('Deload');
    expect(weeks.filter((week) => week.textContent?.includes('Deload'))).toHaveLength(2);
    expect(weeks[1]?.textContent).toContain('Projected');
    expect(container.textContent).toContain('Fri 20 Nov');
    expect(container.textContent).toContain('Fri 20 Nov · 1RM test');

    const summary = weeks[1]?.querySelector('summary');
    expect(summary).toBeTruthy();
    act(() => {
      summary?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(weeks[1]?.open).toBe(true);
  });

  it('returns to Today', () => {
    let backs = 0;
    const { container, root } = mount(
      <BlockPreviewScreen asOf="2026-09-27" history={[]} onBack={() => {
        backs += 1;
      }} />,
    );
    nodes.push({ container, root });
    const back = [...container.querySelectorAll('button')].find((el) => el.textContent === 'Today');
    act(() => {
      back?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(backs).toBe(1);
  });
});

describe('Home Block preview entry', () => {
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

  it('puts a Block preview button on Today', () => {
    let opens = 0;
    const { container, root } = mount(
      <HomeScreen
        date="2026-09-27"
        templateDay="A"
        onTemplateDay={() => undefined}
        draft={null}
        history={[]}
        historyCount={0}
        onStart={() => undefined}
        onResume={() => undefined}
        onHistory={() => undefined}
        onBlockPreview={() => {
          opens += 1;
        }}
        onInterval={() => undefined}
        onHealth={() => undefined}
        onImportSessions={async () => 0}
        onSeedWeek1={async () => 0}
        onSeedMon14={async () => 0}
      />,
    );
    nodes.push({ container, root });
    const button = [...container.querySelectorAll('button')].find((el) => el.textContent === 'Block preview');
    expect(button).toBeTruthy();
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(opens).toBe(1);
  });
});
