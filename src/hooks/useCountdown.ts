import { useCallback, useEffect, useRef, useState } from 'react';
import {
  extendCountdown,
  pauseCountdown,
  resumeCountdown,
  skipCountdown,
  startCountdown,
  syncCountdown,
  type CountdownState,
} from '../domain/countdown';
import { signalTimerCue, unlockTimerAudio } from '../domain/timerCue';
import { useWakeLock } from './useWakeLock';

export function useCountdown(durationSec: number, onFinished?: () => void) {
  const [state, setState] = useState<CountdownState>(() =>
    startCountdown(durationSec, Date.now()),
  );
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useWakeLock(state.running && !state.finished);

  useEffect(() => {
    unlockTimerAudio();
  }, []);

  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => {
      setState((current) => syncCountdown(current, Date.now()));
    }, 200);
    return () => window.clearInterval(id);
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
    onFinishedRef.current?.();
  }, [state.finished]);

  const pause = useCallback(() => {
    setState((current) => pauseCountdown(current, Date.now()));
  }, []);

  const resume = useCallback(() => {
    unlockTimerAudio();
    setState((current) => resumeCountdown(current, Date.now()));
  }, []);

  const extend = useCallback((extraSec: number) => {
    finishedRef.current = false;
    setState((current) => extendCountdown(current, extraSec, Date.now()));
  }, []);

  const skip = useCallback(() => {
    finishedRef.current = true;
    setState((current) => skipCountdown(current));
  }, []);

  return { state, pause, resume, extend, skip };
}
