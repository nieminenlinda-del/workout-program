/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record';

interface AudioSession {
  type: AudioSessionType;
  readonly state: 'active' | 'interrupted' | 'inactive';
}

interface Navigator {
  readonly audioSession?: AudioSession;
}
