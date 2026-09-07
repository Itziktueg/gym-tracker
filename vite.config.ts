import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Stamped into the app so the running build is identifiable on screen, rather
// than inferred from behaviour. Vercel sets VERCEL_GIT_COMMIT_SHA; git is the
// local fallback.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  ?? (() => {
    try { return execSync('git rev-parse --short HEAD').toString().trim() }
    catch { return 'dev' }
  })()

const BUILD_TIME = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  define: {
    __BUILD_ID__:   JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'autoUpdate', not 'prompt'. With 'prompt' a device that never sees the
      // banner keeps its old service worker indefinitely; if that worker's
      // cached index.html points at asset filenames Vercel has since deleted,
      // the app loads a dead shell and shows a blank screen with no way out.
      // Auto-applying costs a silent refresh and removes that trap.
      registerType: 'autoUpdate',
      includeAssets: ['icon-192-v2.png', 'icon-512-v2.png', 'apple-touch-icon-v2.png'],
      manifest: {
        name: 'מעקב אימונים',
        short_name: 'אימונים',
        description: 'מעקב אימוני כושר יומי',
        theme_color: '#16a34a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'he',
        dir: 'rtl',
        start_url: '/',
        icons: [
          {
            src: 'icon-192-v2.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512-v2.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Purge precaches from previous builds — a leftover partial cache is
        // what leaves a shell referencing assets that no longer exist.
        cleanupOutdatedCaches: true,
        // Take over open pages as soon as the new worker activates, instead of
        // waiting for every tab to close.
        skipWaiting: true,
        clientsClaim: true,
        // Serve the app shell for any navigation, so a missing precache entry
        // falls back to the current index rather than a blank page.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' },
          },
        ],
      },
    }),
  ],
})
