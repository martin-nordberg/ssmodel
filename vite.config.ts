import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable, offline-capable app [NFR-ARCH-7]. The service worker precaches the whole build (rule tables are
    // bundled into the JS), and a new build waits for the user to reload rather than swapping silently.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'Social Security Claiming Model',
        short_name: 'SS Model',
        description: 'Models when to claim Social Security retirement benefits for one household.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#1c4f94',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        // Double-clicking a household file opens it in the installed app [FR-FILE-9, FR-STO-1].
        file_handlers: [
          { action: '/', accept: { 'application/yaml': ['.yaml', '.yml'] } },
          { action: '/', accept: { 'application/x-provisionlens': ['.plens'] } },
        ],
        launch_handler: { client_mode: 'focus-existing' },
      },
      workbox: {
        // .wasm: SQLite for the store worker, needed offline like everything else.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        // The main chunk (engine, rule tables, charts) is ~1.4 MB; leave headroom above Workbox's 2 MiB default,
        // which would silently drop it from the precache.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // SQLite WASM loads its .wasm file relative to its own module, which Vite's dependency pre-bundling would break.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 2000 },
})
