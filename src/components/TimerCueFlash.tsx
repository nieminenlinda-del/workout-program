import { useEffect, useState } from 'react';
import { subscribeTimerCueVisual, type TimerCueKind } from '../domain/timerCue';

const FLASH_MS = 1400;

function cueLabel(kind: TimerCueKind): string {
  if (kind === 'work') return 'Work';
  if (kind === 'rest') return 'Rest';
  return 'Go';
}

/**
 * Full-screen flash + banner when a phase cue fires.
 * If the PWA is hidden, hold the banner until it is visible again — a 1s
 * animation that runs under the lock screen is gone before Linda looks.
 */
export function TimerCueFlash() {
  const [kind, setKind] = useState<TimerCueKind | null>(null);

  useEffect(() => {
    let timer = 0;
    let held: TimerCueKind | null = null;

    const show = (next: TimerCueKind) => {
      setKind(next);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setKind(null), FLASH_MS);
    };

    const unsubscribe = subscribeTimerCueVisual((next) => {
      if (document.hidden) {
        held = next;
        return;
      }
      show(next);
    });

    const onVisible = () => {
      if (document.hidden || !held) return;
      const next = held;
      held = null;
      show(next);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.clearTimeout(timer);
    };
  }, []);

  if (!kind) return null;

  return (
    <div className="timer-cue-layer" role="status" aria-live="assertive">
      <p className="timer-cue-banner">{cueLabel(kind)}</p>
    </div>
  );
}
