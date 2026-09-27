import type { VoiceThresholdSec, VoiceZeroKind } from './timerVoice';

/**
 * Mixable session. WebKit maps both `ambient` and `transient` to
 * AVAudioSessionCategoryAmbient (mix with other audio, do not take it over).
 * `transient` is the short-lived kind: once the unlock beep ends, iOS
 * deactivates that session. With gym music playing, the AudioContext then
 * sits in `interrupted` **while Linda Lift is still in the foreground**.
 * The rest-end beep is a timer, not a tap, and `resume()` from a timer does
 * not leave `interrupted`. `ambient` is the same mixable category but is
 * allowed to stay active for the whole rest.
 *
 * Do not switch this to `playback` or `transient-solo`. Those interrupt
 * gym music. `speechSynthesis` is also exclusive and stops music.
 */
export const MIXABLE_AUDIO_SESSION_TYPE = 'ambient' as const;

/** Let the end beep finish before dropping the silent keep-alive. */
const SILENT_KEEP_ALIVE_RELEASE_MS = 1200;

/** Pulse AudioContext.resume so iOS does not leave the graph suspended mid-rest. */
export const TIMER_AUDIO_KEEP_ALIVE_MS = 8000;

/**
 * Schedule a hair ahead of `currentTime`. A start time of "now" on a context
 * that just left `suspended` / `interrupted` is already in the past by the
 * time iOS starts the audio device, so the short envelope is skipped.
 */
export const CUE_LEAD_SEC = 0.05;

/** Give up waiting on resume() so a backgrounded page cannot hang the cue. */
const RESUME_TIMEOUT_MS = 400;

export type CueNote = {
  frequency: number;
  startSec: number;
  durationSec: number;
};

export type TimerCueKind = 'end' | 'work' | 'rest';

let audioCtx: AudioContext | null = null;
let keepAliveId: ReturnType<typeof setInterval> | null = null;
let keepAliveRefs = 0;
let silentKeepAlive: AudioBufferSourceNode | null = null;
let silentReleaseId: ReturnType<typeof setTimeout> | null = null;
const activeOscillators = new Set<OscillatorNode>();

type AudioSessionLike = { type: string };

type PendingCue = {
  notes: CueNote[];
  peak: number;
  source: 'phase' | 'voice';
};

let pending: PendingCue[] = [];
let removeLifecycle: (() => void) | null = null;

type VisualListener = (kind: TimerCueKind) => void;
const visualListeners = new Set<VisualListener>();

function audioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  return session ?? null;
}

/**
 * Prefer mixing over an exclusive session. Safe no-op off iOS Safari.
 * Do not write the type again once it is already mixable — WebKit
 * reconfigures the AVAudioSession on every assignment and that interrupts
 * a context that was about to beep.
 */
export function preferMixableTimerAudio(): boolean {
  const session = audioSession();
  if (!session) return false;
  try {
    if (session.type === MIXABLE_AUDIO_SESSION_TYPE) return true;
    session.type = MIXABLE_AUDIO_SESSION_TYPE;
    return true;
  } catch {
    return false;
  }
}

/**
 * iOS Safari reports `interrupted` (not only `suspended`) when another app
 * owns the audio session — the usual case with gym music — and after the
 * PWA has been backgrounded. `resume()` is required for both.
 */
export function contextNeedsResume(state: string): boolean {
  return state === 'suspended' || state === 'interrupted';
}

/** Absolute audio-clock times for a phrase, placed just ahead of `currentTime`. */
export function noteStartTimes(
  currentTime: number,
  notes: readonly CueNote[],
  leadSec = CUE_LEAD_SEC,
): number[] {
  const t0 = currentTime + leadSec;
  return notes.map((note) => t0 + note.startSec);
}

/** Phase beeps. Both end tones share one audio-clock schedule (no setTimeout). */
export function phaseCueNotes(kind: TimerCueKind): CueNote[] {
  if (kind === 'work') return [{ frequency: 740, startSec: 0, durationSec: 0.16 }];
  if (kind === 'rest') return [{ frequency: 520, startSec: 0, durationSec: 0.18 }];
  return [
    { frequency: 880, startSec: 0, durationSec: 0.14 },
    { frequency: 988, startSec: 0.16, durationSec: 0.2 },
  ];
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

function enqueue(item: PendingCue): void {
  pending = pending.filter((queued) => queued.source !== item.source);
  pending.push(item);
}

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

function bindContext(ctx: AudioContext): void {
  // Test doubles and very old WebKit builds may omit EventTarget methods.
  // Missing the listener must not cancel the beep.
  ctx.addEventListener?.('statechange', () => {
    if (pageHidden()) return;
    if (ctx.state === 'running') flushPending(ctx);
  });
}

function audioContext(): AudioContext | null {
  installLifecycle();
  preferMixableTimerAudio();
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  if (audioCtx && (audioCtx.state as string) === 'closed') {
    dropSilentKeepAlive();
    audioCtx = null;
  }
  if (!audioCtx) {
    audioCtx = new Ctor();
    bindContext(audioCtx);
  }
  return audioCtx;
}

function scheduleNow(ctx: AudioContext, notes: readonly CueNote[], peak: number): void {
  const starts = noteStartTimes(ctx.currentTime, notes);
  notes.forEach((note, index) => {
    beepAt(ctx, note.frequency, starts[index] ?? ctx.currentTime, note.durationSec, peak);
  });
}

function flushPending(ctx: AudioContext): void {
  if (ctx.state !== 'running' || pending.length === 0) return;
  const batch = pending;
  pending = [];
  for (const item of batch) {
    try {
      scheduleNow(ctx, item.notes, item.peak);
    } catch {
      /* muted output */
    }
  }
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = window.setTimeout(finish, ms);
    promise.then(
      () => {
        window.clearTimeout(timer);
        finish();
      },
      () => {
        window.clearTimeout(timer);
        finish();
      },
    );
  });
}

/**
 * Invoke `resume()` in this turn. Awaiting something else first drops the
 * iOS user-gesture token, and resume() from `interrupted` is what reclaims
 * the mixable session from Apple Music / Spotify.
 */
function resumeContext(ctx: AudioContext): Promise<void> {
  if (!contextNeedsResume(ctx.state as string)) return Promise.resolve();
  preferMixableTimerAudio();
  let pendingResume: Promise<unknown>;
  try {
    pendingResume = Promise.resolve(ctx.resume());
  } catch {
    return Promise.resolve();
  }
  return withTimeout(pendingResume, RESUME_TIMEOUT_MS);
}

function onVisible(): void {
  if (pageHidden()) return;
  preferMixableTimerAudio();
  const ctx = audioCtx ?? (pending.length > 0 ? audioContext() : null);
  if (!ctx) return;
  if (ctx.state === 'running') {
    ensureSilentKeepAlive(ctx);
    flushPending(ctx);
    return;
  }
  if (!contextNeedsResume(ctx.state as string)) return;
  void resumeContext(ctx).then(() => {
    if (ctx.state !== 'running') return;
    ensureSilentKeepAlive(ctx);
    flushPending(ctx);
  });
}

function installLifecycle(): void {
  if (removeLifecycle || typeof document === 'undefined' || typeof window === 'undefined') return;
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  document.addEventListener('pointerdown', unlockTimerAudio, true);
  window.addEventListener('touchend', unlockTimerAudio, true);
  const session = audioSession() as (AudioSessionLike & EventTarget) | null;
  const sessionEvents = Boolean(session && typeof session.addEventListener === 'function');
  if (session && sessionEvents) session.addEventListener('statechange', onVisible);
  removeLifecycle = () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
    document.removeEventListener('pointerdown', unlockTimerAudio, true);
    window.removeEventListener('touchend', unlockTimerAudio, true);
    if (session && sessionEvents) session.removeEventListener('statechange', onVisible);
    removeLifecycle = null;
  };
}

function dropSilentKeepAlive(): void {
  if (silentReleaseId != null) {
    window.clearTimeout(silentReleaseId);
    silentReleaseId = null;
  }
  if (!silentKeepAlive) return;
  try {
    silentKeepAlive.stop();
  } catch {
    /* already stopped */
  }
  silentKeepAlive = null;
}

/**
 * One looping zero-gain buffer, started inside the unlock tap.
 *
 * iOS only renders Web Audio that was primed during a user gesture, and it
 * suspends an idle graph a few seconds later even while the page is visible.
 * The rest ends long after that gesture. Holding a silent loop from the tap
 * keeps this same AudioContext `running`, so the end beep does not need a
 * second tap. Gain stays at 0 and the session stays `ambient`, so the loop
 * does not duck or stop gym music (a `transient` pulse would).
 */
function ensureSilentKeepAlive(ctx: AudioContext): void {
  if (silentKeepAlive) return;
  try {
    const sampleRate = ctx.sampleRate || 44100;
    const buffer = ctx.createBuffer(1, sampleRate, sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    silentKeepAlive = source;
  } catch {
    /* no buffer API; the audible cue is still attempted */
  }
}

function holdSilentKeepAlive(): void {
  if (silentReleaseId != null) {
    window.clearTimeout(silentReleaseId);
    silentReleaseId = null;
  }
  if (pageHidden()) return;
  const ctx = audioCtx;
  if (!ctx || (ctx.state as string) === 'closed') return;
  ensureSilentKeepAlive(ctx);
}

function releaseSilentKeepAliveSoon(): void {
  if (typeof window === 'undefined') {
    dropSilentKeepAlive();
    return;
  }
  if (silentReleaseId != null) window.clearTimeout(silentReleaseId);
  silentReleaseId = window.setTimeout(() => {
    silentReleaseId = null;
    if (keepAliveRefs > 0) return;
    dropSilentKeepAlive();
  }, SILENT_KEEP_ALIVE_RELEASE_MS);
}

/** Call from a tap so iOS/Chrome will allow later beeps. Does not touch TTS. */
export function unlockTimerAudio(): void {
  const ctx = audioContext();
  if (!ctx) return;
  // resume() and the silent loop must both start in this turn. Awaiting
  // first drops the iOS user-gesture token, and a later timer cannot get it back.
  if (contextNeedsResume(ctx.state as string)) {
    try {
      void ctx.resume();
    } catch {
      /* resume can throw if the context is closing */
    }
  }
  holdSilentKeepAlive();
  if (ctx.state === 'running') flushPending(ctx);
}

export function timerSilentKeepAliveRunning(): boolean {
  return silentKeepAlive != null;
}

function vibratePattern(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS Safari has no vibrate(); the visual cue still runs */
  }
}

/** True when this browser exposes the Vibration API. iOS Safari returns false. */
export function timerVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function trackOscillator(osc: OscillatorNode): void {
  activeOscillators.add(osc);
  const drop = () => activeOscillators.delete(osc);
  osc.addEventListener('ended', drop);
}

function beepAt(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  durationSec: number,
  peak = 0.14,
): void {
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

function notifyVisual(kind: TimerCueKind): void {
  for (const listener of visualListeners) {
    try {
      listener(kind);
    } catch {
      /* a UI listener must not swallow the beep */
    }
  }
}

/** Rest / interval screens subscribe to flash a banner even when audio is silent. */
export function subscribeTimerCueVisual(listener: VisualListener): () => void {
  visualListeners.add(listener);
  return () => visualListeners.delete(listener);
}

/**
 * Play notes only after the context is `running`.
 *
 * The whole rest is not armed on the audio clock: iOS suspends that clock
 * whenever the graph is idle (and gym music keeps the session interrupted),
 * so a beep scheduled 90s ahead would drift from the wall-clock end. The
 * countdown already ends on `endsAtMs`; this function plays at that moment.
 */
function playCueNotes(notes: CueNote[], peak: number, source: PendingCue['source']): Promise<boolean> {
  try {
    installLifecycle();
    if (pageHidden()) {
      enqueue({ notes, peak, source });
      return Promise.resolve(false);
    }
    const ctx = audioContext();
    if (!ctx) return Promise.resolve(false);
    if (ctx.state === 'running') {
      ensureSilentKeepAlive(ctx);
      pending = pending.filter((queued) => queued.source !== source);
      scheduleNow(ctx, notes, peak);
      return Promise.resolve(true);
    }
    if (!contextNeedsResume(ctx.state as string)) return Promise.resolve(false);
    enqueue({ notes, peak, source });
    return resumeContext(ctx).then(() => {
      if (ctx.state !== 'running') return false;
      ensureSilentKeepAlive(ctx);
      flushPending(ctx);
      return true;
    });
  } catch {
    return Promise.resolve(false);
  }
}

/** Vibration where it exists, then a mixable beep. Always notifies the visual cue. */
export function signalTimerCue(kind: TimerCueKind = 'end'): Promise<boolean> {
  if (kind === 'work') vibratePattern([160, 60, 160]);
  else if (kind === 'rest') vibratePattern([220]);
  else vibratePattern([200, 80, 200, 80, 280]);
  notifyVisual(kind);
  return playCueNotes(phaseCueNotes(kind), 0.14, 'phase');
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
export function playTimerVoiceCue(cue: VoiceThresholdSec, zeroKind: VoiceZeroKind = 'done'): Promise<boolean> {
  return playCueNotes(voiceCueNotes(cue, zeroKind), 0.16, 'voice');
}

export function cancelTimerVoiceCues(): void {
  pending = pending.filter((queued) => queued.source !== 'voice');
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
 * Keep the primed AudioContext alive for the whole countdown.
 * The audible cue is not a silence pulse — those would be useless here and,
 * on a `transient` session, would duck gym music. The zero-gain loop started
 * from the unlock tap is what stops iOS from interrupting an idle graph
 * while this page is still visible.
 */
export function startTimerAudioKeepAlive(): void {
  if (typeof window === 'undefined') return;
  installLifecycle();
  keepAliveRefs += 1;
  holdSilentKeepAlive();
  if (keepAliveId != null) return;
  const pulse = () => {
    if (pageHidden()) return;
    if (!audioCtx) return;
    if ((audioCtx.state as string) === 'closed') {
      dropSilentKeepAlive();
      audioCtx = null;
      return;
    }
    holdSilentKeepAlive();
    if (!contextNeedsResume(audioCtx.state as string)) return;
    preferMixableTimerAudio();
    const ctx = audioCtx;
    void ctx.resume().then(
      () => {
        if (ctx.state !== 'running') return;
        ensureSilentKeepAlive(ctx);
        flushPending(ctx);
      },
      () => {
        /* resume rejected; the next tap or visibility change tries again */
      },
    );
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
  releaseSilentKeepAliveSoon();
}

export function timerAudioKeepAliveRunning(): boolean {
  return keepAliveId != null;
}

/** Test-only: drop the cached context and keep-alive so suites stay isolated. */
export function resetTimerAudioForTests(): void {
  cancelTimerVoiceCues();
  pending = [];
  visualListeners.clear();
  keepAliveRefs = 0;
  if (keepAliveId != null) {
    window.clearInterval(keepAliveId);
    keepAliveId = null;
  }
  dropSilentKeepAlive();
  removeLifecycle?.();
  audioCtx = null;
}
