/**
 * Workbox precache prefix. Bump when a Home Screen install must drop the
 * previous cache — iOS often keeps a stale service worker until the cache
 * name changes. File hashes alone are not enough on an installed PWA.
 */
export const PWA_CACHE_ID = 'linda-lift-v6';
