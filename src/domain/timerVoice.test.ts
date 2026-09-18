import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  nextVoiceThreshold,
  pickTimerVoice,
  voiceLine,
  unlockTimerVoice,
  speakTimerCue,
  startSpeechKeepAlive,
  stopSpeechKeepAlive,
  speechKeepAliveRunning,
  cancelTimerVoice,
  SPEECH_KEEP_ALIVE_MS,
} from './timerVoice';
import { resetTimerAudioForTests, timerAudioKeepAliveRunning } from './timerCue';

describe('timer voice thresholds', () => {
  it('announces 30 then 10 then 0 once on a long rest', () => {
    const spoken = new Set<number>();
    const at30 = nextVoiceThreshold(31, 30, spoken);
    expect(at30.speak).toBe(30);
    at30.mark.forEach((t) => spoken.add(t));
    expect(nextVoiceThreshold(30, 29, spoken).speak).toBeNull();

    const at10 = nextVoiceThreshold(11, 10, spoken);
    expect(at10.speak).toBe(10);
    at10.mark.forEach((t) => spoken.add(t));
    expect(nextVoiceThreshold(10, 9, spoken).speak).toBeNull();

    const at0 = nextVoiceThreshold(1, 0, spoken);
    expect(at0.speak).toBe(0);
    at0.mark.forEach((t) => spoken.add(t));
    expect(nextVoiceThreshold(0, 0, spoken).speak).toBeNull();
  });

  it('does not say 30 when the countdown starts at or below 30', () => {
    expect(nextVoiceThreshold(null, 20, new Set()).speak).toBeNull();
    expect(nextVoiceThreshold(20, 20, new Set()).speak).toBeNull();
    expect(nextVoiceThreshold(20, 10, new Set()).speak).toBe(10);
  });

  it('on a lock-screen jump speaks only the lowest crossed threshold', () => {
    const jumped = nextVoiceThreshold(45, 8, new Set());
    expect(jumped.speak).toBe(10);
    expect(jumped.mark).toEqual([30, 10]);

    const toDone = nextVoiceThreshold(40, 0, new Set());
    expect(toDone.speak).toBe(0);
    expect(toDone.mark).toEqual([30, 10, 0]);
  });

  it('does not re-speak a threshold after +30s extend on the same countdown', () => {
    const spoken = new Set<number>([30, 10]);
    expect(nextVoiceThreshold(8, 38, spoken).speak).toBeNull();
    expect(nextVoiceThreshold(31, 30, spoken).speak).toBeNull();
    expect(nextVoiceThreshold(11, 10, spoken).speak).toBeNull();
  });

  it('can still say 30 later if that threshold was never crossed', () => {
    const spoken = new Set<number>([10]);
    const afterExtend = nextVoiceThreshold(8, 40, spoken);
    expect(afterExtend.speak).toBeNull();
    expect(nextVoiceThreshold(31, 30, spoken).speak).toBe(30);
  });
});

describe('timer voice language', () => {
  it('prefers sv-SE over English or Finnish', () => {
    expect(
      pickTimerVoice([
        { lang: 'en-US', default: true },
        { lang: 'fi-FI' },
        { lang: 'sv-SE' },
      ]),
    ).toEqual({ index: 2, lang: 'sv' });
  });

  it('accepts any sv* voice, then English — never Finnish', () => {
    expect(pickTimerVoice([{ lang: 'sv-FI' }, { lang: 'en-US' }])).toEqual({
      index: 0,
      lang: 'sv',
    });
    expect(pickTimerVoice([{ lang: 'fi-FI', default: true }, { lang: 'en-GB' }])).toEqual({
      index: 1,
      lang: 'en',
    });
    expect(pickTimerVoice([{ lang: 'en-GB', default: true }, { lang: 'de-DE' }])).toEqual({
      index: 0,
      lang: 'en',
    });
    expect(pickTimerVoice([{ lang: 'fi-FI', default: true }])).toBeNull();
    expect(pickTimerVoice([])).toBeNull();
  });

  it('uses short gym lines in SV or EN', () => {
    expect(voiceLine('sv', 30)).toBe('Trettio sekunder');
    expect(voiceLine('en', 10)).toBe('10 seconds');
    expect(voiceLine('sv', 0, 'done')).toBe('Klart');
    expect(voiceLine('en', 0, 'work')).toBe('Work');
    expect(voiceLine('sv', 0, 'rest')).toBe('Vila');
  });
});

describe('iOS mixable voice path (no speechSynthesis)', () => {
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      this.state = 'running';
    });
    createOscillator = vi.fn(() => ({
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
    }));
    createGain = vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }));
  }

  let synth: {
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    synth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    vi.stubGlobal('AudioContext', FakeAudioContext);
    resetTimerAudioForTests();
    while (speechKeepAliveRunning()) stopSpeechKeepAlive();
  });

  afterEach(() => {
    cancelTimerVoice();
    while (speechKeepAliveRunning()) stopSpeechKeepAlive();
    resetTimerAudioForTests();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('unlocks audio on a tap without speaking a warmup utterance', () => {
    unlockTimerVoice();
    expect(synth.speak).not.toHaveBeenCalled();
    expect(synth.cancel).not.toHaveBeenCalled();
  });

  it('plays a mixable cue instead of enqueueing SpeechSynthesisUtterance', () => {
    speakTimerCue(30);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(synth.cancel).not.toHaveBeenCalled();
  });

  it('does not pulse speechSynthesis keep-alive (that session stops gym music)', () => {
    startSpeechKeepAlive();
    expect(speechKeepAliveRunning()).toBe(true);
    expect(timerAudioKeepAliveRunning()).toBe(true);
    vi.advanceTimersByTime(SPEECH_KEEP_ALIVE_MS);
    expect(synth.pause).not.toHaveBeenCalled();
    expect(synth.resume).not.toHaveBeenCalled();
    stopSpeechKeepAlive();
    expect(speechKeepAliveRunning()).toBe(false);
  });

  it('does not speak while the page is backgrounded', () => {
    let constructed = 0;
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        constructor() {
          super();
          constructed += 1;
        }
      },
    );
    resetTimerAudioForTests();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    speakTimerCue(30);
    expect(constructed).toBe(0);
    expect(synth.speak).not.toHaveBeenCalled();
  });
});
