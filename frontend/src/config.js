/**
 * frontend/src/config.js — Central Backend Connection Config
 * ===========================================================
 * All API / WebSocket URLs are built from two env vars:
 *
 *   VITE_API_HOST  – hostname or IP of the backend machine
 *   VITE_API_PORT  – port (default 8000)
 *
 * To switch environments, edit frontend/.env and restart `npm run dev`:
 *
 *   Local:  VITE_API_HOST=localhost
 *   Lab:    VITE_API_HOST=10.10.14.100   (or Tailscale IP)
 *
 * NOTHING ELSE needs to change.
 */

const HOST = import.meta.env.VITE_API_HOST || 'localhost';
const PORT = import.meta.env.VITE_API_PORT || '8000';

/** Base URL for REST calls  →  http://localhost:8000/api */
export const API_BASE_URL = `http://${HOST}:${PORT}/api`;

/** Base URL for WebSocket  →  ws://localhost:8000/api */
export const WS_BASE_URL = `ws://${HOST}:${PORT}/api`;
