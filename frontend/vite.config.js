import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    proxy: {
      // ── REST API calls ─────────────────────────────────────────────────────
      // Forwards any request starting with /api to the FastAPI backend.
      // e.g. GET /api/asrs-data/boxes  →  http://localhost:8000/api/asrs-data/boxes
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },

      // ── WebSocket connections ──────────────────────────────────────────────
      // Forwards ws:// connections starting with /api to the backend WS endpoints.
      // e.g. ws://localhost:5173/api/control/assembly/ws/hydraulic-data
      //   →  ws://localhost:8000/api/control/assembly/ws/hydraulic-data
      '/api/control/assembly/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      '/api/control/asrs/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      '/api/control/mirac/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      '/api/control/triac/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      '/api/control/amr/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
