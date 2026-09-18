import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  MIXABLE_AUDIO_SESSION_TYPE,
  TIMER_AUDIO_KEEP_ALIVE_MS,
  cancelTimerVoiceCues,
  playTimerVoiceCue,
  preferMixableTimerAudio,
  resetTimerAudioForTests,
  signalTimerCue,
  startTimerAudioKeepAlive,
  stopTimerAudioKeepAlive,
  timerAudioKeepAliveRunning,
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
});
