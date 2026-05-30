import { useEffect, useRef, useState } from 'react';
import { wsCache } from '../../../utils/wsCache';

export function useLEDMonitoring() {
  const [ledStates, setLedStates] = useState(wsCache.asrs.ledStates);
  const [shuttleState, setShuttleState] = useState(wsCache.asrs.shuttleState);
  const [connected, setConnected] = useState(false);
  const [safetyCurtain, setSafetyCurtain] = useState(wsCache.asrs.safetyCurtain);
  const wsRef = useRef(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
    const wsUrl = `${wsBase}/api/control/asrs/ws/led-status`;
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const httpBase = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`;
    // const wsBase = import.meta.env.VITE_WS_URL || httpBase.replace(/^http/, 'ws');

    // const wsUrl = `${wsBase}/control/asrs/ws/led-status`;
    const shuttleStateUrl = `${httpBase}/control/asrs/shuttle_state`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('ASRS WebSocket connected');
        setConnected(true);

        // Fetch latest shuttle state immediately on connection (fire and forget)
        (async () => {
          try {
            const res = await fetch(shuttleStateUrl);
            if (res.ok) {
              const data = await res.json();
              console.log('Initial shuttle state fetched:', data);
              const next = {
                col: data.column,
                row: data.row,
                state: data.state,
                command: data.command
              };
              wsCache.asrs.shuttleState = next;
              setShuttleState(next);
            }
          } catch (e) {
            console.error('Failed to fetch initial shuttle state:', e);
          }
        })();
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);

        // Handle typed messages
        switch (data.type) {
          case 'snapshot':
            // Initial state snapshot
            console.log('LED snapshot received:', data.states);
            wsCache.asrs.ledStates = data.states || {};
            setLedStates(data.states);
            if (data.safety) {
              wsCache.asrs.safetyCurtain = !!data.safety.curtain;
              setSafetyCurtain(!!data.safety.curtain);
            }
            break;

          case 'led':
            // LED update
            console.log('LED update:', data.payload.box_id, data.payload.active);
            setLedStates(prev => {
              const next = { ...prev, [data.payload.box_id]: data.payload.active };
              wsCache.asrs.ledStates = next;
              return next;
            });
            break;

          case 'shuttle':
            // Shuttle state update
            console.log('Shuttle update:', data.payload);
            setShuttleState(prev => {
              const next = {
                ...prev,
                col: data.payload.column,
                row: data.payload.row,
                state: data.payload.state,
                command: data.payload.command
              };
              wsCache.asrs.shuttleState = next;
              return next;
            });
            break;

          case 'safety':
            // Safety curtain update
            console.log('Safety update:', data.payload.curtain);
            wsCache.asrs.safetyCurtain = !!data.payload.curtain;
            setSafetyCurtain(!!data.payload.curtain);
            break;

          default:
            console.warn('Unknown message type:', data.type);
        }
      };

      ws.onclose = () => {
        console.log('ASRS WebSocket disconnected, reconnecting in 3s...');
        setConnected(false);
        setTimeout(connect, 3000); // auto reconnect
      };

      ws.onerror = (err) => {
        console.error('ASRS WebSocket error:', err);
        ws.close();
      };
    }

    connect();
    return () => {
      console.log('ASRS WebSocket cleanup');
      wsRef.current?.close();
    };
  }, []);

  return { ledStates, shuttleState, connected, safetyCurtain };
}
