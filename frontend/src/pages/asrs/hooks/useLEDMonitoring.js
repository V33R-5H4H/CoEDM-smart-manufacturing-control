import { useEffect, useRef, useState } from 'react';

export function useLEDMonitoring() {
  const [ledStates, setLedStates] = useState({});
  const [shuttleState, setShuttleState] = useState({ col: 'A', row: 7, state: 'idle', command: null });
  const [connected, setConnected] = useState(false);
  const [safetyCurtainActive, setSafetyCurtainActive] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const httpBase = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`;
    const wsBase = import.meta.env.VITE_WS_URL || httpBase.replace(/^http/, 'ws');

    const wsUrl = `${wsBase}/control/asrs/ws/led-status`;
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
              setShuttleState(prev => ({
                ...prev,
                col: data.column, // API uses 'column'
                row: data.row,
                state: data.state,
                command: data.command
              }));
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
            setLedStates(data.states);
            if (data.safety !== undefined) {
              setSafetyCurtainActive(data.safety);
            }
            break;

          case 'led':
            // LED update
            console.log('LED update:', data.payload.box_id, data.payload.active);
            setLedStates(prev => ({
              ...prev,
              [data.payload.box_id]: data.payload.active
            }));
            break;

          case 'shuttle':
            // Shuttle state update
            console.log('Shuttle update:', data.payload);
            setShuttleState(prev => ({
              ...prev,
              col: data.payload.column,
              row: data.payload.row,
              state: data.payload.state,
              command: data.payload.command
            }));
            break;

          case 'safety':
            console.log('Safety curtain update:', data.payload.active);
            setSafetyCurtainActive(data.payload.active);
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

  return { ledStates, shuttleState, connected, safetyCurtainActive };
}
