/**
 * wsCache.js — Module-level WebSocket data cache
 *
 * Persists the last known state for each machine across React navigation.
 * When a page component mounts, it reads from this cache immediately so
 * data shows instantly without waiting for the WebSocket to reconnect.
 *
 * Usage:
 *   import { wsCache } from '../utils/wsCache';
 *   const [data, setData] = useState(wsCache.mirac);
 *   // On WS message:
 *   wsCache.mirac = newData;
 *   setData(newData);
 */

export const wsCache = {
  mirac: null,
  triac: null,
  assembly: null,
  asrs: {
    ledStates: {},
    shuttleState: { col: 'A', row: 7, state: 'idle', command: null },
    safetyCurtain: false,
  },
  dashboard: {
    asrsShuttle: { col: 'A', row: 7, state: 'idle' },
    assemblyPosition: null,
    assemblySafety: 'OK',
    miracSpindle: null,
    miracTemp: null,
    triacSpindle: null,
    triacFeed: null,
    transactions: [],
    lastUpdated: {},
  },
};
