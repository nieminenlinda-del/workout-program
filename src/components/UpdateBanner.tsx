import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * The new worker calls skipWaiting and clientsClaim, then this banner asks
 * for a reload. The open page keeps the previous JavaScript until that tap.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    registerSW({
      immediate: true,
      onNeedReload() {
        setReady(true);
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        void registration.update().catch(() => undefined);
      },
    });
  }, []);

  if (!ready) return null;

  return (
    <button type="button" className="update-banner" onClick={() => window.location.reload()}>
      Update available, tap to reload
    </button>
  );
}
