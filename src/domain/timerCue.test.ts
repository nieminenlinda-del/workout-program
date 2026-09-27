import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  MIXABLE_AUDIO_SESSION_TYPE,
  TIMER_AUDIO_KEEP_ALIVE_MS,
  cancelTimerVoiceCues,
  playTimerVoiceCue,
  preferMixableTimerAudio,
  resetTimerAudioForTests,
  CUE_LEAD_SEC,
  contextNeedsResume,
  noteStartTimes,
  phaseCueNotes,
  signalTimerCue,
  startTimerAudioKeepAlive,
  stopTimerAudioKeepAlive,
  subscribeTimerCueVisual,
  timerAudioKeepAliveRunning,
  timerVibrationSupported,
  unlockTimerAudio,
  voiceCueNotes,
} from './timerCue';

type OscStub = {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};

class FakeAudioContext {
  state = 'running';
  currentTime = 1;
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  oscillators: OscStub[] = [];
  createOscillator = vi.fn(() => {
    const osc: OscStub = {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
    };
    this.oscillators.push(osc);
    return osc;
  });
  createGain = vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }));
}

describe('mixable timer cues', () => {
  let lastCtx: FakeAudioContext | null;
  let session: { type: string };

  beforeEach(() => {
    vi.useFakeTimers();
    lastCtx = null;
    session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        constructor() {
          super();
          lastCtx = this;
        }
      },
    );
    resetTimerAudioForTests();
  });

  afterEach(() => {
    while (timerAudioKeepAliveRunning()) stopTimerAudioKeepAlive();
    resetTimerAudioForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('sets the iOS audio session to transient so cues mix/duck instead of exclusive playback', () => {
    expect(preferMixableTimerAudio()).toBe(true);
    expect(session.type).toBe(MIXABLE_AUDIO_SESSION_TYPE);
    expect(MIXABLE_AUDIO_SESSION_TYPE).toBe('transient');
  });

  it('unlocks by setting a mixable session and resuming AudioContext, never speechSynthesis', () => {
    const speak = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() },
    });
    session.type = 'playback';
    unlockTimerAudio();
    expect(session.type).toBe('transient');
    expect(lastCtx).not.toBeNull();
    expect(speak).not.toHaveBeenCalled();
  });

  it('uses two mid pulses for 30s and three higher pulses for 10s', () => {
    expect(voiceCueNotes(30).map((n) => n.frequency)).toEqual([587, 587]);
    expect(voiceCueNotes(10).map((n) => n.frequency)).toEqual([784, 784, 784]);
    expect(voiceCueNotes(10).length).toBeGreaterThan(voiceCueNotes(30).length);
  });

  it('delays 0s work/rest/done so they follow the always-on phase beep', () => {
    for (const kind of ['work', 'rest', 'done'] as const) {
      expect(voiceCueNotes(0, kind).every((n) => n.startSec >= 0.3)).toBe(true);
    }
    expect(voiceCueNotes(0, 'work')[0]?.frequency).toBeGreaterThan(voiceCueNotes(0, 'rest')[0]?.frequency ?? 0);
  });

  it('plays 30s as Web Audio oscillators and does not call speechSynthesis', () => {
    const speak = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel: vi.fn() },
    });
    playTimerVoiceCue(30);
    expect(speak).not.toHaveBeenCalled();
    expect(lastCtx?.oscillators).toHaveLength(2);
    expect(lastCtx?.oscillators.map((osc) => osc.frequency.value)).toEqual([587, 587]);
    expect(session.type).toBe('transient');
  });

  it('phase beeps also claim a mixable session so Voice-off still leaves music playing', () => {
    signalTimerCue('rest');
    expect(session.type).toBe('transient');
    expect(lastCtx?.oscillators).toHaveLength(1);
    expect(lastCtx?.oscillators[0]?.frequency.value).toBe(520);
  });

  it('resumes a suspended AudioContext while a rest is running, without playing silence', () => {
    unlockTimerAudio();
    expect(lastCtx).not.toBeNull();
    lastCtx!.state = 'suspended';
    lastCtx!.createOscillator.mockClear();
    startTimerAudioKeepAlive();
    vi.advanceTimersByTime(TIMER_AUDIO_KEEP_ALIVE_MS);
    expect(lastCtx!.resume).toHaveBeenCalled();
    expect(lastCtx!.createOscillator).not.toHaveBeenCalled();
    stopTimerAudioKeepAlive();
    expect(timerAudioKeepAliveRunning()).toBe(false);
  });

  it('does not pulse keep-alive while the page is backgrounded', () => {
    unlockTimerAudio();
    lastCtx!.state = 'suspended';
    lastCtx!.resume.mockClear();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    startTimerAudioKeepAlive();
    vi.advanceTimersByTime(TIMER_AUDIO_KEEP_ALIVE_MS);
    expect(lastCtx!.resume).not.toHaveBeenCalled();
    stopTimerAudioKeepAlive();
  });

  it('stops in-flight oscillators on cancel', () => {
    playTimerVoiceCue(10);
    const osc = lastCtx!.oscillators[0];
    cancelTimerVoiceCues();
    expect(osc?.stop).toHaveBeenCalled();
  });

  it('treats interrupted like suspended, and places notes ahead of the audio clock', () => {
    expect(contextNeedsResume('interrupted')).toBe(true);
    expect(contextNeedsResume('suspended')).toBe(true);
    expect(contextNeedsResume('running')).toBe(false);
    expect(contextNeedsResume('closed')).toBe(false);
    expect(noteStartTimes(4, phaseCueNotes('end'))).toEqual([4 + CUE_LEAD_SEC, 4 + CUE_LEAD_SEC + 0.16]);
    expect(phaseCueNotes('end')).toHaveLength(2);
  });

  it('schedules both end tones on the audio clock without a 160ms setTimeout', () => {
    const timeout = vi.spyOn(window, 'setTimeout');
    signalTimerCue('end');
    expect(lastCtx?.oscillators).toHaveLength(2);
    expect(lastCtx?.oscillators.map((osc) => osc.frequency.value)).toEqual([880, 988]);
    const starts = lastCtx!.oscillators.map((osc) => osc.start.mock.calls[0]?.[0] as number);
    expect(starts[1]! - starts[0]!).toBeCloseTo(0.16);
    expect(timeout.mock.calls.filter((call) => call[1] === 160)).toHaveLength(0);
    timeout.mockRestore();
  });

  it('does not start oscillators until an interrupted context has resumed', async () => {
    unlockTimerAudio();
    lastCtx!.state = 'interrupted';
    lastCtx!.currentTime = 4;
    lastCtx!.resume.mockClear();
    let release: () => void = () => {};
    lastCtx!.resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            lastCtx!.state = 'running';
            resolve();
          };
        }),
    );
    const played = signalTimerCue('end');
    expect(lastCtx!.oscillators).toHaveLength(0);
    expect(lastCtx!.resume).toHaveBeenCalled();
    release();
    await played;
    expect(lastCtx!.oscillators).toHaveLength(2);
    const starts = lastCtx!.oscillators.map((osc) => osc.start.mock.calls[0]?.[0] as number);
    expect(starts[0]).toBeCloseTo(4 + CUE_LEAD_SEC);
    expect(starts[1]! - starts[0]!).toBeCloseTo(0.16);
    expect(session.type).toBe('transient');
  });

  it('keeps the cue queued when resume stays interrupted, then plays it on the next tap', async () => {
    const kinds: string[] = [];
    const unsubscribe = subscribeTimerCueVisual((kind) => kinds.push(kind));
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    unlockTimerAudio();
    lastCtx!.state = 'interrupted';
    lastCtx!.resume = vi.fn(async () => {
      /* iOS left the session interrupted */
    });
    await signalTimerCue('rest');
    expect(kinds).toEqual(['rest']);
    expect(vibrate).toHaveBeenCalledWith([220]);
    expect(timerVibrationSupported()).toBe(true);
    expect(lastCtx!.oscillators).toHaveLength(0);

    lastCtx!.resume = vi.fn(async () => {
      lastCtx!.state = 'running';
    });
    unlockTimerAudio();
    await Promise.resolve();
    await Promise.resolve();
    expect(lastCtx!.oscillators).toHaveLength(1);
    expect(lastCtx!.oscillators[0]?.frequency.value).toBe(520);
    unsubscribe();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
  });

  it('does not throw when vibration is missing (iOS Safari)', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    expect(timerVibrationSupported()).toBe(false);
    expect(() => signalTimerCue('work')).not.toThrow();
    expect(lastCtx?.oscillators).toHaveLength(1);
  });

  it('queues a cue while the page is hidden and plays it once when visible again', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    signalTimerCue('rest');
    expect(lastCtx).toBeNull();

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(lastCtx?.oscillators).toHaveLength(1);
    expect(lastCtx?.oscillators[0]?.frequency.value).toBe(520);
    expect(session.type).toBe('transient');
  });

  it('replaces a closed AudioContext instead of staying silent', () => {
    unlockTimerAudio();
    const first = lastCtx;
    first!.state = 'closed';
    signalTimerCue('work');
    expect(lastCtx).not.toBe(first);
    expect(lastCtx?.oscillators).toHaveLength(1);
    expect(lastCtx?.oscillators[0]?.frequency.value).toBe(740);
  });

  it('resumes an interrupted AudioContext from keep-alive without playing silence', () => {
    unlockTimerAudio();
    lastCtx!.state = 'interrupted';
    lastCtx!.createOscillator.mockClear();
    lastCtx!.resume.mockClear();
    startTimerAudioKeepAlive();
    vi.advanceTimersByTime(TIMER_AUDIO_KEEP_ALIVE_MS);
    expect(lastCtx!.resume).toHaveBeenCalled();
    expect(lastCtx!.createOscillator).not.toHaveBeenCalled();
    expect(session.type).toBe('transient');
    stopTimerAudioKeepAlive();
  });
});
