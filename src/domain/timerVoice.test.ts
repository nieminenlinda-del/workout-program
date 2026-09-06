import { describe, expect, it } from 'vitest';
import {
  nextVoiceThreshold,
  pickTimerVoice,
  voiceLine,
} from './timerVoice';

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
