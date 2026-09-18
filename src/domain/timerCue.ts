import type { VoiceThresholdSec, VoiceZeroKind } from './timerVoice';

/**
 * WebKit maps `transient` to a mixable Ambient AVAudioSession: short cues
 * duck/mix with Apple Music / Spotify instead of taking exclusive playback.
 * `speechSynthesis` cannot do this on iOS — it uses a spoken-audio session
 * that stops other audio for the rest of the rest timer.
 */
export const MIXABLE_AUDIO_SESSION_TYPE = 'transient' as const;

/** Pulse AudioContext.resume so iOS does not suspend the graph mid-rest. */
export const TIMER_AUDIO_KEEP_ALIVE_MS = 8000;

export type CueNote = {
  frequency: number;
  startSec: number;
  durationSec: number;
};

let audioCtx: AudioContext | null = null;
let keepAliveId: ReturnType<typeof setInterval> | null = null;
let keepAliveRefs = 0;
const activeOscillators = new Set<OscillatorNode>();

type AudioSessionLike = { type: string };

function audioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  return session ?? null;
}

/** Prefer ducking/mixing over an exclusive session. Safe no-op off iOS Safari. */
export function preferMixableTimerAudio(): boolean {
  const session = audioSession();
  if (!session) return false;
  try {
    session.type = MIXABLE_AUDIO_SESSION_TYPE;
    return true;
  } catch {
    return false;
  }
}

function audioContext(): AudioContext | null {
  preferMixableTimerAudio();
  const Ctor =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

function resumeContext(ctx: AudioContext): void {
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Call from a tap so iOS/Chrome will allow later beeps. Does not touch TTS. */
export function unlockTimerAudio(): void {
  const ctx = audioContext();
  if (ctx) resumeContext(ctx);
}

function vibratePattern(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration unsupported or blocked — audio may still play */
  }
}

function trackOscillator(osc: OscillatorNode): void {
  activeOscillators.add(osc);
  const drop = () => activeOscillators.delete(osc);
  osc.addEventListener('ended', drop);
}

function beepAt(ctx: AudioContext, frequency: number, startTime: number, durationSec: number, peak = 0.14): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  trackOscillator(osc);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.02);
}

function beep(frequency: number, durationSec: number): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    resumeContext(ctx);
    beepAt(ctx, frequency, ctx.currentTime, durationSec);
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

/**
 * Distinct pocket-audible phrases that stand in for TTS:
 * 30s = two mid pulses, 10s = three higher, 0 = delayed work/rest/done contour
 * so it follows the always-on phase beep instead of stacking on it.
 */
export function voiceCueNotes(cue: VoiceThresholdSec, zeroKind: VoiceZeroKind = 'done'): CueNote[] {
  if (cue === 30) {
    return [
      { frequency: 587, startSec: 0, durationSec: 0.18 },
      { frequency: 587, startSec: 0.26, durationSec: 0.18 },
    ];
  }
  if (cue === 10) {
    return [
      { frequency: 784, startSec: 0, durationSec: 0.11 },
      { frequency: 784, startSec: 0.16, durationSec: 0.11 },
      { frequency: 784, startSec: 0.32, durationSec: 0.14 },
    ];
  }
  const delay = 0.32;
  if (zeroKind === 'work') {
    return [
      { frequency: 740, startSec: delay, durationSec: 0.14 },
      { frequency: 880, startSec: delay + 0.18, durationSec: 0.18 },
    ];
  }
  if (zeroKind === 'rest') {
    return [
      { frequency: 494, startSec: delay, durationSec: 0.2 },
      { frequency: 392, startSec: delay + 0.26, durationSec: 0.24 },
    ];
  }
  return [
    { frequency: 659, startSec: delay, durationSec: 0.12 },
    { frequency: 784, startSec: delay + 0.14, durationSec: 0.12 },
    { frequency: 988, startSec: delay + 0.28, durationSec: 0.2 },
  ];
}

/** Mixable Web Audio stand-in for speechSynthesis timer lines. */
export function playTimerVoiceCue(cue: VoiceThresholdSec, zeroKind: VoiceZeroKind = 'done'): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    resumeContext(ctx);
    const now = ctx.currentTime;
    for (const note of voiceCueNotes(cue, zeroKind)) {
      beepAt(ctx, note.frequency, now + note.startSec, note.durationSec, 0.16);
    }
  } catch {
    /* muted output or missing AudioContext */
  }
}

export function cancelTimerVoiceCues(): void {
  for (const osc of activeOscillators) {
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
  }
  activeOscillators.clear();
}

/**
 * Resume the (already unlocked) AudioContext on an interval.
 * Do **not** play silence here — that would duck gym music every few seconds.
 */
export function startTimerAudioKeepAlive(): void {
  if (typeof window === 'undefined') return;
  keepAliveRefs += 1;
  if (keepAliveId != null) return;
  const pulse = () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!audioCtx || audioCtx.state !== 'suspended') return;
    preferMixableTimerAudio();
    void audioCtx.resume();
  };
  keepAliveId = window.setInterval(pulse, TIMER_AUDIO_KEEP_ALIVE_MS);
}

export function stopTimerAudioKeepAlive(): void {
  keepAliveRefs = Math.max(0, keepAliveRefs - 1);
  if (keepAliveRefs > 0) return;
  if (keepAliveId != null) {
    window.clearInterval(keepAliveId);
    keepAliveId = null;
  }
}

export function timerAudioKeepAliveRunning(): boolean {
  return keepAliveId != null;
}

/** Test-only: drop the cached context and keep-alive so suites stay isolated. */
export function resetTimerAudioForTests(): void {
  cancelTimerVoiceCues();
  keepAliveRefs = 0;
  if (keepAliveId != null) {
    window.clearInterval(keepAliveId);
    keepAliveId = null;
  }
  audioCtx = null;
}
