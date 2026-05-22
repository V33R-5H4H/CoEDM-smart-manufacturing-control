import { useEffect, useRef, useState } from 'react';

export function useLEDMonitoring() {
  const [ledStates, setLedStates] = useState({});
  const [shuttleState, setShuttleState] = useState({ col: 'A', row: 7, state: 'idle', command: null });
  const [connected, setConnected] = useState(false);
<<<<<<< HEAD
<<<<<<< HEAD
  const [safetyCurtain, setSafetyCurtain] = useState(false);
=======
  const [safetyCurtainActive, setSafetyCurtainActive] = useState(false);
>>>>>>> ad0b676e499a57d5639863fde203e68cf7b7b849
=======
>>>>>>> parent of 2ea1e21 (feat: implement backend web-socket broadcasters and sensor monitoring for ASRS and MIRAC stations)
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
<<<<<<< HEAD
<<<<<<< HEAD
            if (data.safety) {
              setSafetyCurtain(!!data.safety.curtain);
=======
            if (data.safety !== undefined) {
              setSafetyCurtainActive(data.safety);
>>>>>>> ad0b676e499a57d5639863fde203e68cf7b7b849
            }
=======
>>>>>>> parent of 2ea1e21 (feat: implement backend web-socket broadcasters and sensor monitoring for ASRS and MIRAC stations)
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

<<<<<<< HEAD
          case 'safety':
<<<<<<< HEAD
            // Safety curtain update
            console.log('Safety update:', data.payload.curtain);
            setSafetyCurtain(!!data.payload.curtain);
=======
            console.log('Safety curtain update:', data.payload.active);
            setSafetyCurtainActive(data.payload.active);
>>>>>>> ad0b676e499a57d5639863fde203e68cf7b7b849
            break;

=======
>>>>>>> parent of 2ea1e21 (feat: implement backend web-socket broadcasters and sensor monitoring for ASRS and MIRAC stations)
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

<<<<<<< HEAD
<<<<<<< HEAD
  return { ledStates, shuttleState, connected, safetyCurtain };
=======
  return { ledStates, shuttleState, connected, safetyCurtainActive };
>>>>>>> ad0b676e499a57d5639863fde203e68cf7b7b849
=======
  return { ledStates, shuttleState, connected };
>>>>>>> parent of 2ea1e21 (feat: implement backend web-socket broadcasters and sensor monitoring for ASRS and MIRAC stations)
}
