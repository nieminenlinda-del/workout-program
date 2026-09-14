import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LoggedSet } from '../types/session';
import { SetLogger } from './SetLogger';

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

const plankSet: LoggedSet = {
  weight_kg: 0,
  reps: 60,
  rpe: 7,
  completed: false,
  target_weight_kg: 0,
  target_reps: 60,
};

describe('SetLogger timed holds', () => {
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

  it('lets a plank hold save 5 kg × 60s instead of forcing BW', async () => {
    const onComplete = vi.fn();
    const { container, root } = mount(
      <SetLogger
        exerciseName="Plank"
        setLabel="1"
        setCount={3}
        initial={plankSet}
        hasLaterSameKind
        timed
        equipment="bodyweight"
        onCancel={() => undefined}
        onComplete={onComplete}
      />,
    );
    nodes.push({ container, root });

    expect(container.textContent).toContain('Added weight');
    expect(container.textContent).toContain('Hold');
    const bump = container.querySelector('button[aria-label="Increase Added weight"]') as HTMLButtonElement | null;
    expect(bump).toBeTruthy();
    await act(async () => {
      bump?.click();
    });
    await act(async () => {
      bump?.click();
    });

    const complete = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === 'Complete set',
    );
    await act(async () => {
      complete?.click();
    });

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({
      weight_kg: 5,
      reps: 60,
      completed: true,
      amrap: false,
    });
  });

  it('still logs a bodyweight hold as 0 kg', async () => {
    const onComplete = vi.fn();
    const { container, root } = mount(
      <SetLogger
        exerciseName="Plank"
        setLabel="1"
        setCount={3}
        initial={plankSet}
        hasLaterSameKind={false}
        timed
        equipment="bodyweight"
        onCancel={() => undefined}
        onComplete={onComplete}
      />,
    );
    nodes.push({ container, root });

    const complete = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === 'Complete set',
    );
    await act(async () => {
      complete?.click();
    });
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ weight_kg: 0, reps: 60 });
  });
});
