export const VOICE_THRESHOLDS_SEC = [30, 10, 0] as const;
export type VoiceThresholdSec = (typeof VOICE_THRESHOLDS_SEC)[number];
export type VoiceZeroKind = 'done' | 'work' | 'rest';
export type VoiceLang = 'sv' | 'en';

export const TIMER_VOICE_PREF_KEY = 'linda-lift-timer-voice';

/** iOS Safari drops later `speak()` after ~15s of silence unless the synth is pulsed. */
export const SPEECH_KEEP_ALIVE_MS = 8000;

let voicesListenerBound = false;
let keepAliveId: ReturnType<typeof setInterval> | null = null;
let keepAliveRefs = 0;
let pendingSpeakTimer: ReturnType<typeof setTimeout> | null = null;

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

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

function bindVoicesListener(synth: SpeechSynthesis): void {
  if (voicesListenerBound) return;
  voicesListenerBound = true;
  synth.addEventListener('voiceschanged', () => {
    void synth.getVoices();
  });
  void synth.getVoices();
}

function resumeSynth(synth: SpeechSynthesis): void {
  try {
    if (synth.paused) synth.resume();
  } catch {
    /* ignore */
  }
}

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

function enqueueUtterance(synth: SpeechSynthesis, utter: SpeechSynthesisUtterance): void {
  const speakNow = () => {
    resumeSynth(synth);
    synth.speak(utter);
  };
  // iOS: cancel() then speak() in the same turn often no-ops.
  if (synth.speaking || synth.pending) {
    synth.cancel();
    if (pendingSpeakTimer != null) window.clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = window.setTimeout(() => {
      pendingSpeakTimer = null;
      speakNow();
    }, 50);
    return;
  }
  speakNow();
}

export function speakTimerCue(cue: VoiceThresholdSec, zeroKind: VoiceZeroKind = 'done'): void {
  const synth = getSynth();
  if (!synth) return;
  try {
    bindVoicesListener(synth);
    resumeSynth(synth);
    const { voice, lang, bcp47 } = resolveUtterance(synth.getVoices());
    const utter = new SpeechSynthesisUtterance(voiceLine(lang, cue, zeroKind));
    utter.lang = bcp47;
    if (voice && 'voiceURI' in voice) {
      utter.voice = voice as SpeechSynthesisVoice;
    }
    utter.rate = 1;
    utter.volume = 1;
    enqueueUtterance(synth, utter);
  } catch {
    /* no voices / autoplay block — buzz/beep still run */
  }
}

/**
 * Call from a tap (Complete set / Start intervals / Voice on). iOS Safari
 * only allows later `speak()` after a gesture. Do **not** cancel the warmup
 * utterance — that is what used to leave the engine dead for the rest overlay.
 */
export function unlockTimerVoice(): void {
  const synth = getSynth();
  if (!synth) return;
  try {
    bindVoicesListener(synth);
    resumeSynth(synth);
    const warm = new SpeechSynthesisUtterance('\u00a0');
    warm.lang = 'en-US';
    warm.volume = 1;
    warm.rate = 10;
    synth.speak(warm);
  } catch {
    /* ignore */
  }
}

/**
 * Pulse pause/resume so iOS does not silently drop `speak()` after ~15s idle.
 * Rest is 90–180s; the first cue is often a minute after Complete set.
 */
export function startSpeechKeepAlive(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  keepAliveRefs += 1;
  if (keepAliveId != null) return;
  const pulse = () => {
    const synth = getSynth();
    if (!synth || synth.speaking || synth.pending) return;
    try {
      synth.pause();
      synth.resume();
    } catch {
      /* ignore */
    }
  };
  keepAliveId = window.setInterval(pulse, SPEECH_KEEP_ALIVE_MS);
}

export function stopSpeechKeepAlive(): void {
  keepAliveRefs = Math.max(0, keepAliveRefs - 1);
  if (keepAliveRefs > 0) return;
  if (keepAliveId != null) {
    window.clearInterval(keepAliveId);
    keepAliveId = null;
  }
}

export function speechKeepAliveRunning(): boolean {
  return keepAliveId != null;
}

export function cancelTimerVoice(): void {
  const synth = getSynth();
  if (!synth) return;
  try {
    if (pendingSpeakTimer != null) {
      window.clearTimeout(pendingSpeakTimer);
      pendingSpeakTimer = null;
    }
    synth.cancel();
  } catch {
    /* ignore */
  }
}
