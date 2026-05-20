import { useState, useEffect, useRef } from 'react';

/**
 * Frontend Operation Shadow State
 * 
 * Architecture: Two-Layer State Management
 * =========================================
 * 
 * Problem:
 * --------
 * PLC LED array is BOOLEAN and IMMEDIATE - when destination is accepted,
 * LED turns ON instantly. This creates visual "teleporting" where:
 * - Source LED doesn't acknowledge departure
 * - Shuttle jumps to destination
 * - No sense of causality or motion
 * 
 * Solution:
 * ---------
 * Decouple physical truth (WebSocket) from visual storytelling (Frontend)
 * 
 * Layer 1 - Physical Truth (Input, Read-Only):
 * - Boolean LED array from PLC via WebSocket
 * - Already decided, absolute, untimed
 * - Ground truth but NOT UX truth
 * 
 * Layer 2 - Visual Interpretation (Output, Derived):
 * - Adds time, causality, motion narrative
 * - Never sent back to backend
 * - Reconciles with physical truth on completion
 * 
 * Visual Timeline (Frontend-Only Sequence):
 * ------------------------------------------
 * 1. ACKNOWLEDGEMENT (200ms)
 *    - Destination LED physically ON but visually hidden
 *    - Brief pause establishes operation start
 * 
 * 2. SOURCE_DEPARTURE (400ms)
 *    - Source cell blinks (frontend-only, NOT real LED)
 *    - Operator sees: "Machine is leaving this location"
 *    - Fixes: "LED should blink and go away from source"
 * 
 * 3. TRANSIT (stepwise)
 *    - Shuttle animates row-then-column movement
 *    - Destination LED STILL hidden even though physically ON
 *    - Creates illusion: "Moving towards already-decided target"
 * 
 * 4. ARRIVAL (300ms)
 *    - Shuttle reaches destination
 *    - NOW reveal destination LED (was always ON)
 *    - Perfect sync: LED appears exactly when shuttle arrives
 * 
 * Why This is Correct:
 * --------------------
 * - Not falsifying state - presenting ground truth with human context
 * - Operators care about WHERE and WHAT NOW, not when PLC flipped bit
 * - Prevents visual confusion (two LEDs ON = usually means error in AS/RS)
 * - Proper HMI architecture: buffer → sequence → animate → reconcile
 * 
 * Constraint Respected:
 * ---------------------
 * - Backend LED array unchanged (boolean, immediate)
 * - No new PLC states required
 * - No timing dependencies on backend
 * - Frontend-only enhancement
 */

const PHASE_DURATIONS = {
  ACKNOWLEDGEMENT: 200,      // Brief delay before visual sequence starts
  SOURCE_BLINK: 400,         // Source cell blinks (frontend-only visual)
  PICKUP_TRANSIT: 20000,     // Shuttle going to drop-off station (20 seconds)
  TRANSIT_STEP: 2500,        // Per-step during shuttle movement (25 seconds total for ~10 steps)
  ARRIVAL_HOLD: 300          // Pause at destination before revealing LED
};

export function useOperationShadowState(ledStates, shuttleState) {
  // Always-fresh physical truth for LEDs
  const latestLEDsRef = useRef(ledStates);
  useEffect(() => {
    latestLEDsRef.current = ledStates;
  }, [ledStates]);
  // On first mount, initialize refs if shuttleState is available and refs are unset
  useEffect(() => {
    if (
      shuttleState?.col !== undefined &&
      shuttleState?.row !== undefined &&
      !lastKnownPositionRef.current &&
      !prevShuttlePositionRef.current
    ) {
      const position = shuttleState.row === 0 ? 'DROP_OFF' : `${shuttleState.col}${shuttleState.row}`;
      lastKnownPositionRef.current = position;
      prevShuttlePositionRef.current = position;
      console.log('[ShadowState] (Init) Set both refs to:', position);
    }
  }, [shuttleState]);
  // Current visual state (may differ from physical truth temporarily)
  const [visualLEDs, setVisualLEDs] = useState({});
  const [visualShuttle, setVisualShuttle] = useState(null);
  const [sourceBlink, setSourceBlink] = useState(null);

  // Operation tracking
  const [operationPhase, setOperationPhase] = useState('IDLE');
  const pendingOperationRef = useRef(null);
  const lastKnownPositionRef = useRef(null); // Last known position for operation detection
  const prevShuttlePositionRef = useRef(null); // NEW: Track previous shuttle position

  // Track which LEDs are physically ON (ground truth)
  const previousLEDsRef = useRef({});

  useEffect(() => {
    if (shuttleState?.col === undefined || shuttleState?.row === undefined) {
      return;
    }
    const position =
      shuttleState.row === 0
        ? 'DROP_OFF'
        : `${shuttleState.col}${shuttleState.row}`;
    if (lastKnownPositionRef.current !== position) {
      prevShuttlePositionRef.current = lastKnownPositionRef.current;
      lastKnownPositionRef.current = position;
      console.log(
        '[ShadowState] Shuttle position update:',
        'current =', position,
        'previous =', prevShuttlePositionRef.current
      );
    }
  }, [shuttleState]);

  useEffect(() => {
    // 🚨 CRITICAL GUARD: Don't detect operation until shuttle position is known
    if (!lastKnownPositionRef.current) {
      previousLEDsRef.current = { ...ledStates };
      return;
    }

    // Guard against re-entry during operation
    if (operationPhase !== 'IDLE') {
      previousLEDsRef.current = { ...ledStates };
      return;
    }

    // Detect new LED turning ON (this is our operation trigger)
    const newLEDOn = Object.entries(ledStates).find(
      ([cell, isOn]) => isOn && !previousLEDsRef.current[cell]
    );

    if (newLEDOn) {
      const [targetCell] = newLEDOn;
      let sourceCell = prevShuttlePositionRef.current || lastKnownPositionRef.current;
      if (sourceCell !== targetCell) {
        startOperation(sourceCell, targetCell);
      }
    } else {
      setVisualLEDs(ledStates);
    }

    previousLEDsRef.current = { ...ledStates };
  }, [ledStates, operationPhase]);

  const startOperation = async (sourceCell, targetCell) => {
    console.log('[ShadowState] ========== OPERATION START ==========');
    console.log('[ShadowState] Source:', sourceCell);
    console.log('[ShadowState] Target:', targetCell);

    if (!sourceCell || !targetCell) {
      console.log('[ShadowState] ERROR: Missing source or target');
      return;
    }

    pendingOperationRef.current = { sourceCell, targetCell };

    // PHASE 1: Acknowledgement
    // Don't show destination LED yet, even though it's physically ON
    console.log('[ShadowState] PHASE 1: Acknowledgement');
    setOperationPhase('ACKNOWLEDGEMENT');
    await sleep(PHASE_DURATIONS.ACKNOWLEDGEMENT);

    // PHASE 2: Source Departure
    // Visual-only source blink (NOT the physical LED)
    setOperationPhase('SOURCE_DEPARTURE');
    setSourceBlink(sourceCell);
    await sleep(PHASE_DURATIONS.SOURCE_BLINK);
    setSourceBlink(null);

    // PHASE 2.5: Go to Drop-off (for STORE operations)
    // Determine operation type from shuttle command, NOT from position.
    // Store commands end with 'S' (e.g. "A1S"), retrieve commands don't (e.g. "A1").
    const currentCommand = shuttleState?.command || '';
    const isStoreOperation = currentCommand.endsWith('S');

    console.log('[ShadowState] Checking operation type...');
    console.log('[ShadowState]   command:', currentCommand);
    console.log('[ShadowState]   isStoreOperation:', isStoreOperation);

    if (isStoreOperation) {
      console.log('[ShadowState] PHASE 2.5: STORE - Going to drop-off station');
      setOperationPhase('PICKUP_TRANSIT');

      // Animate shuttle from source to DROP_OFF
      console.log('[ShadowState] Starting animation from', sourceCell, 'to DROP_OFF');
      await animateToDropOff(sourceCell);

      // Wait at drop-off for pickup (simulating item being loaded)
      console.log('[ShadowState] Waiting at drop-off for', PHASE_DURATIONS.PICKUP_TRANSIT, 'ms');
      await sleep(PHASE_DURATIONS.PICKUP_TRANSIT);

      console.log('[ShadowState] Finished waiting at drop-off, now heading to destination');
    } else {
      console.log('[ShadowState] RETRIEVE operation - skipping drop-off phase');
    }

    // PHASE 3: Transit
    // Move shuttle from drop-off (or current position) to destination
    console.log('[ShadowState] PHASE 3: Transit to destination');
    setOperationPhase('TRANSIT');
    const startPoint = isStoreOperation ? 'DROP_OFF' : sourceCell;
    console.log('[ShadowState] Transit from', startPoint, 'to', targetCell);
    await animateShuttleTransit(startPoint, targetCell);

    // PHASE 4: Arrival Sync
    // NOW reveal the destination LED (it was always ON, we just hid it)
    setOperationPhase('ARRIVAL');
    await sleep(PHASE_DURATIONS.ARRIVAL_HOLD);

    // Sync complete - show physical truth (always use latest)
    setVisualLEDs(latestLEDsRef.current);
    previousLEDsRef.current = { ...latestLEDsRef.current };

    // Release visual shuttle override so backend state (e.g. A0 after retrieve)
    // becomes the single source of truth once animation sequence completes.
    setVisualShuttle(null);

    setOperationPhase('IDLE');
    pendingOperationRef.current = null;

    console.log('[ShadowState] Operation complete');
  };

  const animateToDropOff = async (fromCell) => {
    console.log('[animateToDropOff] Starting from:', fromCell);
    const fromCol = fromCell[0];
    const fromRow = parseInt(fromCell.slice(1));

    console.log('[animateToDropOff] Parsed - Col:', fromCol, 'Row:', fromRow);
    console.log('[animateToDropOff] Starting multi-axis visual travel to DROP_OFF...');

    // Step 1: Move vertically to Row 1
    if (fromRow !== 1) {
      console.log('[animateToDropOff] Step 1: Move vertically to Row 1');
      setVisualShuttle({
        row: 1,
        col: fromCol,
        moving: true
      });
      await sleep(PHASE_DURATIONS.TRANSIT_STEP);
    }

    // Step 2: Move horizontally to Column A (where the DROP_OFF visual is adjacent)
    if (fromCol !== 'A') {
      console.log('[animateToDropOff] Step 2: Move horizontally to Column A');
      setVisualShuttle({
        row: 1,
        col: 'A',
        moving: true
      });
      await sleep(PHASE_DURATIONS.TRANSIT_STEP);
    }

    // Step 3: Transition out of the grid to DROP_OFF handoff station (Row 0)
    console.log('[animateToDropOff] Step 3: Entering DROP_OFF handoff station');
    setVisualShuttle({
      row: 0,
      col: 'DROP_OFF',
      moving: true
    });
    await sleep(PHASE_DURATIONS.TRANSIT_STEP);

    // Final arrival at drop-off position
    setVisualShuttle({
      row: 0,
      col: 'DROP_OFF',
      moving: false
    });
    console.log('[animateToDropOff] Completed - shuttle at drop-off');
  };

  const animateShuttleTransit = async (source, target) => {
    console.log('[animateShuttleTransit] Starting transit from', source, 'to', target);
    if (!source || !target) {
      console.log('[animateShuttleTransit] ERROR: Missing source or target');
      return;
    }
    // Handle DROP_OFF as special case
    let sourceCol, sourceRow;
    if (source === 'DROP_OFF') {
      console.log('[animateShuttleTransit] Starting from DROP_OFF position');
      // Start from drop-off station position (conceptually at A1 entry first)
      sourceCol = 'A';
      sourceRow = 1;
      console.log('[animateShuttleTransit] Moving from DROP_OFF to grid entry:', sourceCol, sourceRow);
      setVisualShuttle({
        row: sourceRow,
        col: sourceCol,
        moving: true
      });
      await sleep(PHASE_DURATIONS.TRANSIT_STEP);
    } else {
      console.log('[animateShuttleTransit] Starting from grid position:', source);
      sourceCol = source[0];
      sourceRow = parseInt(source.slice(1));
    }
    const targetCol = target[0];
    const targetRow = parseInt(target.slice(1));
    console.log('[animateShuttleTransit] Parsed positions - From:', `${sourceCol}${sourceRow}`, 'To:', `${targetCol}${targetRow}`);

    // Orthogonal 2-Step Motion Narrative (Translating the motion axis by axis)
    
    // Step 1: Vertical Movement (Row travel along source column)
    if (sourceRow !== targetRow) {
      console.log(`[animateShuttleTransit] Step 1: Moving vertically from row ${sourceRow} to row ${targetRow}`);
      setVisualShuttle({
        row: targetRow,
        col: sourceCol,
        moving: true
      });
      await sleep(PHASE_DURATIONS.TRANSIT_STEP);
    }

    // Step 2: Horizontal Movement (Column travel along target row)
    if (sourceCol !== targetCol) {
      console.log(`[animateShuttleTransit] Step 2: Moving horizontally from column ${sourceCol} to column ${targetCol}`);
      setVisualShuttle({
        row: targetRow,
        col: targetCol,
        moving: true
      });
      await sleep(PHASE_DURATIONS.TRANSIT_STEP);
    }

    // Final position sync
    console.log('[animateShuttleTransit] Setting final position:', `${targetCol}${targetRow}`);
    setVisualShuttle({
      row: targetRow,
      col: targetCol,
      moving: false
    });
    console.log('[animateShuttleTransit] Transit complete');
  };

  const getEffectiveLEDState = (cellId) => {
    // During operation, hide destination LED until arrival
    if (operationPhase !== 'IDLE' && pendingOperationRef.current) {
      const { targetCell } = pendingOperationRef.current;

      // Hide destination LED during acknowledgement, departure, dropoff/pickup, and transit phases
      if (cellId === targetCell &&
        (operationPhase === 'ACKNOWLEDGEMENT' ||
          operationPhase === 'SOURCE_DEPARTURE' ||
          operationPhase === 'PICKUP_TRANSIT' ||
          operationPhase === 'TRANSIT')) {
        return false;
      }
    }

    // Show physical truth for all other cases
    return visualLEDs[cellId] || false;
  };

  const isSourceBlinking = (cellId) => {
    return sourceBlink === cellId;
  };

  // Normalize shuttle state for consuming components
  // Always trust backend when it reports handoff (A0) to avoid visual lag/stickiness.
  const backendAtDropOff = shuttleState?.col === 'A' && shuttleState?.row === 0;

  const normalizedShuttle = (!backendAtDropOff && visualShuttle) ? {
    row: visualShuttle.row,
    col: visualShuttle.col,
    state: visualShuttle.moving ? 'moving' : 'idle',
    command: shuttleState?.command
  } : {
    row: shuttleState?.row,
    col: shuttleState?.col,
    state: shuttleState?.state,
    command: shuttleState?.command
  };

  return {
    // Visual state (may differ from physical during operations)
    getEffectiveLEDState,
    isSourceBlinking,
    visualShuttle: normalizedShuttle,

    // Diagnostic info
    operationPhase,
    pendingOperation: pendingOperationRef.current
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
