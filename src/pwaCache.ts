/**
 * Workbox precache prefix. Bump when a Home Screen install must drop the
 * previous cache — iOS often keeps a stale service worker until the cache
 * name changes. File hashes alone are not enough on an installed PWA.
 */
export const PWA_CACHE_ID = 'linda-lift-v11';

/** Visible on every screen so a Home Screen install can be told from the last one. */
export const APP_BUILD_LABEL = 'Build v11 · 24 Nov';

/**
 * index.html is not precached. Navigations use NetworkFirst so an installed
 * PWA can pick up a new shell instead of the previous cache-first app shell.
 */
export const PWA_HTML_STRATEGY = 'NetworkFirst' as const;

export const PWA_SKIP_WAITING = true;
export const PWA_CLIENTS_CLAIM = true;
