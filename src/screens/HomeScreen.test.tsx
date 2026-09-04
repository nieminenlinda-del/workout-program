import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';
import { DAY_TEMPLATES } from '../data/templates';

const handlers = () => ({
  onTemplateDay: vi.fn(),
  onStart: vi.fn(),
  onResume: vi.fn(),
  onHistory: vi.fn(),
  onInterval: vi.fn(),
  onHealth: vi.fn(),
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderHome(overrides: Partial<Parameters<typeof HomeScreen>[0]> = {}) {
  const props = handlers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <HomeScreen
        date="2026-09-04"
        templateDay="A"
        draft={null}
        historyCount={0}
        {...props}
        {...overrides}
      />,
    );
  });
  return { ...props, container: container! };
}

function buttonByName(containerEl: HTMLElement, name: string | RegExp) {
  const match =
    typeof name === 'string'
      ? (text: string) => text === name
      : (text: string) => name.test(text);
  const btn = [...containerEl.querySelectorAll('button')].find((el) => match(el.textContent?.trim() ?? ''));
  if (!btn) throw new Error(`No button matching ${name}`);
  return btn;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('Today planned session preview', () => {
  it('shows today’s template summary (sets × reps and rest) without logging controls', () => {
    const { container: el, onStart } = renderHome();
    expect(el.textContent).toContain(DAY_TEMPLATES.A.title);
    expect(el.textContent).toContain('Low-bar squat');
    expect(el.textContent).toContain('4 × 5');
    expect(el.textContent).toContain('rest 3:00');
    expect(el.textContent).toContain('Start session');
    expect(el.textContent).toContain('Preview session');
    expect(el.querySelector('[aria-label="Rest timer"]')).toBeNull();
    expect(el.querySelector('[aria-label="Log set"]')).toBeNull();
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'Log')).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('Preview browse does not start a session, rest timer, or interval timer', () => {
    const { container: el, onStart, onInterval } = renderHome();
    act(() => {
      buttonByName(el, 'Preview session').click();
    });
    expect(el.textContent).toContain('Browse only — does not start a session or timers.');
    expect(el.textContent).toContain('45 kg × 5');
    expect(el.textContent).toContain('@ 6.5 RPE');
    expect(el.querySelectorAll('.preview-set').length).toBeGreaterThan(8);
    expect(el.querySelector('[aria-label="Rest timer"]')).toBeNull();
    expect(el.querySelector('[aria-label="Log set"]')).toBeNull();
    expect(el.textContent).not.toContain('Conditioning / circuits');
    expect(onStart).not.toHaveBeenCalled();
    expect(onInterval).not.toHaveBeenCalled();
  });

  it('keeps Start as the explicit session action', () => {
    const { container: el, onStart } = renderHome();
    act(() => {
      buttonByName(el, 'Preview session').click();
    });
    expect(onStart).not.toHaveBeenCalled();
    act(() => {
      buttonByName(el, 'Start session').click();
    });
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
