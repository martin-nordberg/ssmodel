import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The P0 spike's own dev server: serves spike/index.html with the cross-origin isolation headers the plain
// `opfs` VFS needs (SharedArrayBuffer), so both OPFS VFSes can be measured. Not part of the app build.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    port: 5199,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
})
