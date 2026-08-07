import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' rather than 'autoUpdate': a backgrounded PWA can serve a stale
      // bundle for days without ever reloading. UpdatePrompt makes that visible
      // and lets the user apply it.
      registerType: 'prompt',
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
