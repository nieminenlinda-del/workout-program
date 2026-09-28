import { act, type ReactElement } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createDraftSession } from '../domain/sessionFactory';
import { WorkoutScreen } from './WorkoutScreen';

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

describe('in-session jump hint', () => {
  let view: { container: HTMLDivElement; root: Root } | undefined;

  afterEach(() => {
    if (view) unmount(view.root, view.container);
    view = undefined;
  });

  it('shows a non-blocking hint after a work set under RPE 6 and stays quiet at RPE 6', () => {
    const draft = createDraftSession('D', '2026-10-09');
    const close = draft.lifts.find((lift) => lift.exercise_id === 'bench_close_grip');
    const first = close?.sets.find((set) => !set.warmup);
    if (!first) throw new Error('missing close-grip set');
    first.completed = true;
    first.rpe = 5;

    view = mount(
      <WorkoutScreen draft={draft} onChange={() => undefined} onBack={() => undefined} onInterval={() => undefined} onFinish={() => undefined} />,
    );
    expect(view.container.textContent).toContain('Under RPE 6. Try 42.5 kg on the remaining sets.');
    const hinted = [...view.container.querySelectorAll('button')].some((button) =>
      button.textContent?.includes('Under RPE 6'),
    );
    expect(hinted).toBe(false);

    first.rpe = 6;
    unmount(view.root, view.container);
    view = mount(
      <WorkoutScreen draft={draft} onChange={() => undefined} onBack={() => undefined} onInterval={() => undefined} onFinish={() => undefined} />,
    );
    expect(view.container.textContent).not.toContain('Under RPE 6');
  });
});
