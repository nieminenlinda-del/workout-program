import { describe, expect, it } from 'vitest';
import {
  APP_BUILD_LABEL,
  PWA_CACHE_ID,
  PWA_CLIENTS_CLAIM,
  PWA_HTML_STRATEGY,
  PWA_SKIP_WAITING,
} from './pwaCache';

describe('PWA cache id', () => {
  it('bumps the Workbox precache name and serves the app shell network-first', () => {
    expect(PWA_CACHE_ID).toBe('linda-lift-v9');
    expect(PWA_CACHE_ID.startsWith('linda-lift-')).toBe(true);
    expect(PWA_SKIP_WAITING).toBe(true);
    expect(PWA_CLIENTS_CLAIM).toBe(true);
    expect(PWA_HTML_STRATEGY).toBe('NetworkFirst');
    expect(APP_BUILD_LABEL).toMatch(/v9/);
  });
});