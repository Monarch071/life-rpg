/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

export default defineConfig({
  base: '/life-rpg/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon-180x180.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,woff2}'] },
      manifest: {
        name: 'Life RPG',
        short_name: 'Life RPG',
        lang: 'ru',
        display: 'standalone',
        background_color: '#0c0c0f',
        theme_color: '#0c0c0f',
        start_url: '/life-rpg/',
        scope: '/life-rpg/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node', passWithNoTests: true, testTimeout: 30_000 },
})
