import { useEffect, useRef, useState } from 'react';

export function useLEDMonitoring() {
  const [ledStates, setLedStates] = useState({});
  const [shuttleState, setShuttleState] = useState({ col: 'A', row: 7, state: 'idle', command: null });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket('ws://100.97.200.68:8000/api/control/asrs/ws/led-status');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('ASRS WebSocket connected');
        setConnected(true);

        // Fetch latest shuttle state immediately on connection (fire and forget)
        (async () => {
          try {
            const res = await fetch('http://100.97.200.68:8000/api/control/asrs/shuttle_state');
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

  return { ledStates, shuttleState, connected };
}
