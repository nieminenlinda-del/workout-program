import { useCallback, useEffect, useRef, useState } from 'react';
import {
  displaySeconds,
  extendCountdown,
  msUntilDeadline,
  pauseCountdown,
  resumeCountdown,
  skipCountdown,
  startCountdown,
  syncCountdown,
  type CountdownState,
} from '../domain/countdown';
import { signalTimerCue, startTimerAudioKeepAlive, stopTimerAudioKeepAlive, unlockTimerAudio } from '../domain/timerCue';
import { speakZeroIfEnabled, useSpokenCountdown } from './useSpokenCountdown';
import { useWakeLock } from './useWakeLock';

export function useCountdown(
  durationSec: number,
  onFinished?: () => void,
  voiceEnabled = true,
) {
  const [state, setState] = useState<CountdownState>(() =>
    startCountdown(durationSec, Date.now()),
  );
  const finishedRef = useRef(false);
  const [voiceCycle, setVoiceCycle] = useState(0);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useWakeLock(state.running && !state.finished);
  useSpokenCountdown(displaySeconds(state), `rest-${voiceCycle}`, voiceEnabled);

  // Voice-off still needs the graph held open. The spoken hook only does this
  // while cues are enabled, and the end beep is not a user gesture.
  useEffect(() => {
    if (!state.running) return;
    startTimerAudioKeepAlive();
    return () => stopTimerAudioKeepAlive();
  }, [state.running]);

  useEffect(() => {
    if (!state.running || state.endsAtMs == null) return;
    const tick = () => setState((current) => syncCountdown(current, Date.now()));
    // Exact wall-clock deadline plus a short poll. iOS may delay either one;
    // `syncCountdown` still finishes from `endsAtMs`, not from tick count.
    const delay = msUntilDeadline(state.endsAtMs, Date.now());
    const timeoutId = window.setTimeout(tick, delay ?? 0);
    const intervalId = window.setInterval(tick, 200);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [state.running, state.endsAtMs]);

  useEffect(() => {
    const recover = () => setState((current) => syncCountdown(current, Date.now()));
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('focus', recover);
    window.addEventListener('pageshow', recover);
    return () => {
      document.removeEventListener('visibilitychange', recover);
      window.removeEventListener('focus', recover);
      window.removeEventListener('pageshow', recover);
    };
  }, []);

  useEffect(() => {
    if (!state.finished || finishedRef.current) return;
    finishedRef.current = true;
    signalTimerCue('end');
    speakZeroIfEnabled(voiceEnabled, 'done');
    onFinishedRef.current?.();
  }, [state.finished, voiceEnabled]);

  const pause = useCallback(() => {
    setState((current) => pauseCountdown(current, Date.now()));
  }, []);

  const resume = useCallback(() => {
    unlockTimerAudio();
    setState((current) => resumeCountdown(current, Date.now()));
  }, []);

  const extend = useCallback((extraSec: number) => {
    unlockTimerAudio();
    if (finishedRef.current) setVoiceCycle((n) => n + 1);
    finishedRef.current = false;
    setState((current) => extendCountdown(current, extraSec, Date.now()));
  }, []);

  const skip = useCallback(() => {
    finishedRef.current = true;
    setState((current) => skipCountdown(current));
  }, []);

  return { state, pause, resume, extend, skip };
}
