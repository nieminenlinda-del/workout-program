import { useEffect, useRef } from 'react';
import {
  nextVoiceThreshold,
  speakTimerCue,
  startSpeechKeepAlive,
  stopSpeechKeepAlive,
  type VoiceZeroKind,
} from '../domain/timerVoice';

/**
 * Speaks 30s / 10s once per `cycleKey`. 0s is spoken by the caller (natural
 * finish / phase change) so Skip stays silent.
 */
export function useSpokenCountdown(
  remainingSec: number,
  cycleKey: string,
  enabled: boolean,
): void {
  const prevRef = useRef<number | null>(null);
  const spokenRef = useRef(new Set<number>());
  const keyRef = useRef(cycleKey);

  if (keyRef.current !== cycleKey) {
    keyRef.current = cycleKey;
    prevRef.current = null;
    spokenRef.current = new Set();
  }

  useEffect(() => {
    if (!enabled) return;
    startSpeechKeepAlive();
    return () => stopSpeechKeepAlive();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      prevRef.current = remainingSec;
      return;
    }
    const { speak, mark } = nextVoiceThreshold(prevRef.current, remainingSec, spokenRef.current);
    prevRef.current = remainingSec;
    for (const t of mark) spokenRef.current.add(t);
    if (speak === 30 || speak === 10) speakTimerCue(speak);
  }, [remainingSec, enabled, cycleKey]);
}

export function speakZeroIfEnabled(enabled: boolean, kind: VoiceZeroKind): void {
  if (enabled) speakTimerCue(0, kind);
}
