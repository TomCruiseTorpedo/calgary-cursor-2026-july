import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// COOP/COEP help SharedArrayBuffer for on-device models (Kokoro / transformers.js).
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['kokoro-js'],
  },
})
