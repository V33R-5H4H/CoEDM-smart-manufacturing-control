import { useState, useEffect } from 'react';

/**
 * Hook to manage shuttle visualization with drop-off logic
 * 
 * When idle: Show shuttle at drop-off point
 * When busy/moving: Show shuttle at actual backend position
 * 
 * This creates the visual effect of:
 * - STORE: Shuttle appears to go from drop-off → destination
 * - RETRIEVE: Shuttle appears to go from destination → drop-off
 */
export function useShuttleMovement(webSocketShuttle, operationMode) {
  const [visualShuttle, setVisualShuttle] = useState({
    col: 'DROP_OFF',
    row: 0,
    state: 'idle',
    atDropOff: true
  });

  useEffect(() => {
    if (!webSocketShuttle) {
      return;
    }

    const wsState = webSocketShuttle.state || 'idle';
    const wsCol = webSocketShuttle.col;
    const wsRow = webSocketShuttle.row;

    console.log('[useShuttleMovement] WebSocket update:', { wsState, wsCol, wsRow });

    // When shuttle is moving or busy, show actual position
    if (wsState === 'moving' || wsState === 'busy') {
      setVisualShuttle({
        col: wsCol,
        row: wsRow,
        state: wsState,
        atDropOff: false
      });
    } 
    // When idle, always return to drop-off
    else if (wsState === 'idle') {
      setVisualShuttle({
        col: 'DROP_OFF',
        row: 0,
        state: 'idle',
        atDropOff: true
      });
    }
    // Error state - show at actual position
    else if (wsState === 'error') {
      setVisualShuttle({
        col: wsCol || 'DROP_OFF',
        row: wsRow || 0,
        state: 'error',
        atDropOff: !wsCol
      });
    }
  }, [webSocketShuttle]);

  // Simplified - no explicit operation tracking needed
  const startOperation = (type, targetBox) => {
    // This is just for future use if needed
    console.log(`[Shuttle] Starting ${type} operation to`, targetBox);
  };

  return {
    shuttlePosition: visualShuttle,
    startOperation,
    isAtDropOff: visualShuttle.atDropOff
  };
}
