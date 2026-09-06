export const VOICE_THRESHOLDS_SEC = [30, 10, 0] as const;
export type VoiceThresholdSec = (typeof VOICE_THRESHOLDS_SEC)[number];
export type VoiceZeroKind = 'done' | 'work' | 'rest';
export type VoiceLang = 'sv' | 'en';

export const TIMER_VOICE_PREF_KEY = 'linda-lift-timer-voice';

let voicesListenerBound = false;

/** Default on — Linda trains with spoken cues unless she turns them off. */
export function loadTimerVoiceEnabled(): boolean {
  try {
    const raw = localStorage.getItem(TIMER_VOICE_PREF_KEY);
    if (raw == null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

export function saveTimerVoiceEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TIMER_VOICE_PREF_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode */
  }
}

/**
 * Which spoken threshold to fire this tick.
 *
 * Crossing only: `prev > T && next <= T`. Starting a 20s rest does **not**
 * say “30”. A lock-screen jump (45 → 8) marks every crossed T as spoken and
 * speaks only the lowest (avoid spam). Same countdown + already spoken → skip.
 */
export function nextVoiceThreshold(
  prevSec: number | null,
  nextSec: number,
  alreadySpoken: ReadonlySet<number>,
): { speak: VoiceThresholdSec | null; mark: VoiceThresholdSec[] } {
  if (prevSec == null) return { speak: null, mark: [] };
  const mark: VoiceThresholdSec[] = [];
  for (const t of VOICE_THRESHOLDS_SEC) {
    if (prevSec > t && nextSec <= t && !alreadySpoken.has(t)) mark.push(t);
  }
  if (mark.length === 0) return { speak: null, mark: [] };
  const speak = mark[mark.length - 1] ?? null;
  return { speak, mark };
}

export function pickTimerVoice(voices: readonly { lang: string; default?: boolean }[]): {
  index: number;
  lang: VoiceLang;
} | null {
  if (voices.length === 0) return null;
  const norm = (lang: string) => lang.toLowerCase().replace('_', '-');
  const svSE = voices.findIndex((v) => norm(v.lang) === 'sv-se');
  if (svSE >= 0) return { index: svSE, lang: 'sv' };
  const sv = voices.findIndex((v) => norm(v.lang).startsWith('sv'));
  if (sv >= 0) return { index: sv, lang: 'sv' };
  const en = voices.findIndex((v) => norm(v.lang).startsWith('en'));
  if (en >= 0) return { index: en, lang: 'en' };
  const def = voices.findIndex((v) => v.default);
  return { index: def >= 0 ? def : 0, lang: 'en' };
}

export function voiceLine(lang: VoiceLang, cue: VoiceThresholdSec, zeroKind: VoiceZeroKind = 'done'): string {
  if (cue === 30) return lang === 'sv' ? 'Trettio sekunder' : '30 seconds';
  if (cue === 10) return lang === 'sv' ? 'Tio sekunder' : '10 seconds';
  if (zeroKind === 'work') return lang === 'sv' ? 'Arbete' : 'Work';
  if (zeroKind === 'rest') return lang === 'sv' ? 'Vila' : 'Rest';
  return lang === 'sv' ? 'Klart' : 'Done';
}

export type SpeechVoiceLike = { lang: string; default?: boolean };

function resolveUtterance(
  voices: SpeechVoiceLike[],
): { voice: SpeechVoiceLike | null; lang: VoiceLang; bcp47: string } {
  const picked = pickTimerVoice(voices);
  if (picked) {
    const voice = voices[picked.index] ?? null;
    return {
      voice,
      lang: picked.lang,
      bcp47: picked.lang === 'sv' ? 'sv-SE' : voice?.lang || 'en-US',
    };
  }
  return { voice: null, lang: 'en', bcp47: 'en-US' };
}

export function speakTimerCue(cue: VoiceThresholdSec, zeroKind: VoiceZeroKind = 'done'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    const { voice, lang, bcp47 } = resolveUtterance(synth.getVoices());
    const utter = new SpeechSynthesisUtterance(voiceLine(lang, cue, zeroKind));
    utter.lang = bcp47;
    if (voice && 'voiceURI' in voice) {
      utter.voice = voice as SpeechSynthesisVoice;
    }
    utter.rate = 1;
    utter.volume = 1;
    synth.cancel();
    synth.speak(utter);
  } catch {
    /* no voices / autoplay block — buzz/beep still run */
  }
}

/** Empty utterance so iOS Safari/PWA will allow later speaks after a tap. */
export function unlockTimerVoice(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    const warm = new SpeechSynthesisUtterance(' ');
    warm.volume = 0;
    synth.speak(warm);
    synth.cancel();
    void synth.getVoices();
    if (!voicesListenerBound) {
      voicesListenerBound = true;
      synth.addEventListener('voiceschanged', () => {
        void synth.getVoices();
      });
    }
  } catch {
    /* ignore */
  }
}

export function cancelTimerVoice(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
