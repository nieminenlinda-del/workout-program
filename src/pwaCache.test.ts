import { describe, expect, it } from 'vitest';
import { PWA_CACHE_ID } from './pwaCache';

describe('PWA cache id', () => {
  it('bumps the Workbox precache name so an installed Home Screen app can drop the old cache', () => {
    expect(PWA_CACHE_ID).toBe('linda-lift-v6');
    expect(PWA_CACHE_ID.startsWith('linda-lift-')).toBe(true);
  });
});