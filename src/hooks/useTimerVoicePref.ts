import { useCallback, useState } from 'react';
import {
  cancelTimerVoice,
  loadTimerVoiceEnabled,
  saveTimerVoiceEnabled,
  unlockTimerVoice,
} from '../domain/timerVoice';
import { unlockTimerAudio } from '../domain/timerCue';

export function useTimerVoicePref() {
  const [enabled, setEnabled] = useState(loadTimerVoiceEnabled);

  const setVoiceEnabled = useCallback((next: boolean) => {
    saveTimerVoiceEnabled(next);
    setEnabled(next);
    if (next) {
      unlockTimerAudio();
      unlockTimerVoice();
    } else {
      cancelTimerVoice();
    }
  }, []);

  return { voiceEnabled: enabled, setVoiceEnabled };
}
