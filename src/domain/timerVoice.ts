import {
  TIMER_AUDIO_KEEP_ALIVE_MS,
  cancelTimerVoiceCues,
  playTimerVoiceCue,
  startTimerAudioKeepAlive,
  stopTimerAudioKeepAlive,
  timerAudioKeepAliveRunning,
  unlockTimerAudio,
} from './timerCue';

export const VOICE_THRESHOLDS_SEC = [30, 10, 0] as const;
export type VoiceThresholdSec = (typeof VOICE_THRESHOLDS_SEC)[number];
export type VoiceZeroKind = 'done' | 'work' | 'rest';
export type VoiceLang = 'sv' | 'en';

export const TIMER_VOICE_PREF_KEY = 'linda-lift-timer-voice';

/** @deprecated AudioContext keep-alive; name kept so rest/interval hooks stay stable. */
export const SPEECH_KEEP_ALIVE_MS = TIMER_AUDIO_KEEP_ALIVE_MS;

/** Default on — Linda trains with spoken-style cues unless she turns them off. */
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

function normLang(lang: string): string {
  return lang.toLowerCase().replace('_', '-');
}

function isFinnishLang(lang: string): boolean {
  return normLang(lang).startsWith('fi');
}

export function pickTimerVoice(voices: readonly { lang: string; default?: boolean }[]): {
  index: number;
  lang: VoiceLang;
} | null {
  if (voices.length === 0) return null;
  const usable = voices
    .map((voice, index) => ({ voice, index }))
    .filter(({ voice }) => !isFinnishLang(voice.lang));
  if (usable.length === 0) return null;

  const svSE = usable.find(({ voice }) => normLang(voice.lang) === 'sv-se');
  if (svSE) return { index: svSE.index, lang: 'sv' };
  const sv = usable.find(({ voice }) => normLang(voice.lang).startsWith('sv'));
  if (sv) return { index: sv.index, lang: 'sv' };
  const en = usable.find(({ voice }) => normLang(voice.lang).startsWith('en'));
  if (en) return { index: en.index, lang: 'en' };
  const def = usable.find(({ voice }) => voice.default);
  return { index: (def ?? usable[0]).index, lang: 'en' };
}

export function voiceLine(lang: VoiceLang, cue: VoiceThresholdSec, zeroKind: VoiceZeroKind = 'done'): string {
  if (cue === 30) return lang === 'sv' ? 'Trettio sekunder' : '30 seconds';
  if (cue === 10) return lang === 'sv' ? 'Tio sekunder' : '10 seconds';
  if (zeroKind === 'work') return lang === 'sv' ? 'Arbete' : 'Work';
  if (zeroKind === 'rest') return lang === 'sv' ? 'Vila' : 'Rest';
  return lang === 'sv' ? 'Klart' : 'Done';
}

export type SpeechVoiceLike = { lang: string; default?: boolean };

function pageIsHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

/**
 * Fire the 30 / 10 / 0 cue. On iOS this is mixable Web Audio, not TTS:
 * `window.speechSynthesis` takes an exclusive session and stops gym music.
 */
export function speakTimerCue(cue: VoiceThresholdSec, zeroKind: VoiceZeroKind = 'done'): void {
  if (pageIsHidden()) return;
  playTimerVoiceCue(cue, zeroKind);
}

/** Call from a tap (Complete set / Start intervals / Voice on). Unlocks Web Audio only. */
export function unlockTimerVoice(): void {
  unlockTimerAudio();
}

export function startSpeechKeepAlive(): void {
  startTimerAudioKeepAlive();
}

export function stopSpeechKeepAlive(): void {
  stopTimerAudioKeepAlive();
}

export function speechKeepAliveRunning(): boolean {
  return timerAudioKeepAliveRunning();
}

export function cancelTimerVoice(): void {
  cancelTimerVoiceCues();
}
