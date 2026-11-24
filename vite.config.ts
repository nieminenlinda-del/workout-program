/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import {
  PWA_CACHE_ID,
  PWA_CLIENTS_CLAIM,
  PWA_HTML_STRATEGY,
  PWA_SKIP_WAITING,
} from './src/pwaCache';

const BASE = '/workout-program/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The app registers the worker itself so it can show a reload banner.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Linda Lift',
        short_name: 'Lift',
        description: "Personal powerlifting companion — today's session, logged.",
        theme_color: '#0c0d10',
        background_color: '#0c0d10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Versioned precache id so an installed Home Screen app drops the
        // previous cache when this build's service worker activates.
        cacheId: PWA_CACHE_ID,
        cleanupOutdatedCaches: true,
        skipWaiting: PWA_SKIP_WAITING,
        clientsClaim: PWA_CLIENTS_CLAIM,
        // Leave index.html out of the precache. A cache-first shell is what
        // kept the previous Home Screen bundle on screen after a deploy.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2,webmanifest}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /\/workout-program\/(?:index\.html)?(?:\?.*)?$/,
            handler: PWA_HTML_STRATEGY,
            options: {
              cacheName: `${PWA_CACHE_ID}-pages`,
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 4, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
