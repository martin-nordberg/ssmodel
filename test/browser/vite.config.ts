import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Dev server for the browser harness: store code that only runs in a browser (SQLite WASM, OPFS, Web Crypto in a
// worker) is tested here by test/browser/*.browser.ts. No cross-origin isolation headers, like the real hosting.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  server: { port: 5198, strictPort: true },
  // Pre-bundle everything up front: a dependency discovered mid-test makes Vite reload the page.
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
    include: ['zod', '@paralleldrive/cuid2', '@noble/hashes/scrypt.js', 'react'],
    entries: ['index.html', 'harness.worker.ts', '../../src/worker/store.worker.ts'],
  },
  worker: { format: 'es' },
})
