let audioCtx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  const Ctor =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** Call from a tap so iOS/Chrome will allow later beeps. */
export function unlockTimerAudio(): void {
  const ctx = audioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
}

function vibratePattern(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration unsupported or blocked — audio may still play */
  }
}

function beep(frequency: number, durationSec: number): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  } catch {
    /* muted output or missing AudioContext */
  }
}

/** Vibration first (no audio permission). Beep may be silent if the phone is muted. */
export function signalTimerCue(kind: 'end' | 'work' | 'rest' = 'end'): void {
  if (kind === 'work') {
    vibratePattern([160, 60, 160]);
    beep(740, 0.16);
    return;
  }
  if (kind === 'rest') {
    vibratePattern([220]);
    beep(520, 0.18);
    return;
  }
  vibratePattern([200, 80, 200, 80, 280]);
  beep(880, 0.14);
  window.setTimeout(() => beep(988, 0.2), 160);
}
