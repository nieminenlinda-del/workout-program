import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntervalConfig, IntervalState } from '../domain/intervalTimer';
import {
  DEFAULT_INTERVAL_CONFIG,
  extendInterval,
  idleInterval,
  pauseInterval,
  resumeInterval,
  skipIntervalPhase,
  startInterval,
  stopInterval,
  syncInterval,
} from '../domain/intervalTimer';
import { signalTimerCue, unlockTimerAudio } from '../domain/timerCue';
import { useWakeLock } from './useWakeLock';

export function useIntervalTimer(initial: IntervalConfig = DEFAULT_INTERVAL_CONFIG) {
  const [config, setConfig] = useState<IntervalConfig>(initial);
  const [state, setState] = useState<IntervalState>(() => idleInterval(initial));
  const lastCueKey = useRef<string>('idle');

  const active = state.phase === 'work' || state.phase === 'rest';
  useWakeLock(active && state.countdown.running);

  useEffect(() => {
    if (!state.countdown.running) return;
    const id = window.setInterval(() => {
      setState((current) => syncInterval(current, Date.now()));
    }, 200);
    return () => window.clearInterval(id);
  }, [state.countdown.running, state.countdown.endsAtMs, state.phase]);

  useEffect(() => {
    const recover = () => setState((current) => syncInterval(current, Date.now()));
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
    if (!state.justTransitioned) return;
    const key = `${state.phase}-${state.round}`;
    if (lastCueKey.current === key) return;
    lastCueKey.current = key;
    if (state.phase === 'work') signalTimerCue('work');
    else if (state.phase === 'rest') signalTimerCue('rest');
    else if (state.phase === 'done') signalTimerCue('end');
  }, [state.justTransitioned, state.phase, state.round]);

  const start = useCallback(() => {
    unlockTimerAudio();
    lastCueKey.current = 'start';
    setState(startInterval(config, Date.now()));
  }, [config]);

  const pause = useCallback(() => {
    setState((current) => pauseInterval(current, Date.now()));
  }, []);

  const resume = useCallback(() => {
    unlockTimerAudio();
    setState((current) => resumeInterval(current, Date.now()));
  }, []);

  const extend = useCallback((extraSec: number) => {
    setState((current) => extendInterval(current, extraSec, Date.now()));
  }, []);

  const skipPhase = useCallback(() => {
    setState((current) => skipIntervalPhase(current, Date.now()));
  }, []);

  const stop = useCallback(() => {
    lastCueKey.current = 'idle';
    setState(stopInterval(config));
  }, [config]);

  return { config, setConfig, state, start, pause, resume, extend, skipPhase, stop };
}
