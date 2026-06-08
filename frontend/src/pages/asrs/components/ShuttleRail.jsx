import React, { useState, useEffect } from 'react';

const COLUMNS = ['A', 'B', 'C', 'D', 'E'];

const ShuttleRail = ({ shuttle, operationPhase, operationType, activeOperationData }) => {
  const targetRow = shuttle?.row ?? 1;
  const targetCol = shuttle?.col ?? 'A';
  const shuttleState = shuttle?.state ?? 'idle';

  const [currentRow, setCurrentRow] = useState(targetRow);
  const [currentCol, setCurrentCol] = useState(targetCol);

  // Carriage size is 48px x 32px
  const CARRIAGE_W = 48;
  const CARRIAGE_H = 32;

  const [coords, setCoords] = useState({ left: 0, top: 0, visible: false });

  // Update position when backend changes
  useEffect(() => {
    setCurrentRow(targetRow);
    setCurrentCol(targetCol);
  }, [targetRow, targetCol]);

  // Recalculate pixel coordinates relative to the grid container
  const updateCoordinates = () => {
    const isAtDropOff = currentRow === 0 || currentCol === 'DROP_OFF' || (currentCol === 'A' && currentRow === 0);
    const cellId = isAtDropOff ? 'asrs-cell-DROP_OFF' : `asrs-cell-${currentCol}${currentRow}`;

    const cell = document.getElementById(cellId);
    const grid = document.getElementById('asrs-rack-grid');

    if (cell && grid) {
      const cellRect = cell.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const left = cellRect.left - gridRect.left;
      const top = cellRect.top - gridRect.top;
      const width = cellRect.width;
      const height = cellRect.height;

      // Anchor the CARRIAGE center exactly at the center of the cell
      const finalLeft = left + (width / 2) - (CARRIAGE_W / 2);
      const finalTop = top + (height / 2) - (CARRIAGE_H / 2);

      setCoords({ left: finalLeft, top: finalTop, visible: true });
    }
  };

  useEffect(() => {
    // Run initial update after a short timeout to ensure the grid is fully rendered
    const timer = setTimeout(updateCoordinates, 50);

    // Set up window resize listener
    window.addEventListener('resize', updateCoordinates);

    // Set up ResizeObserver to trigger on grid size changes (like opening side panels)
    let observer;
    const gridEl = document.getElementById('asrs-rack-grid');
    if (gridEl && window.ResizeObserver) {
      observer = new ResizeObserver(() => {
        updateCoordinates();
      });
      observer.observe(gridEl);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateCoordinates);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [currentRow, currentCol]);

  const isActive = shuttleState === 'moving' || shuttleState === 'busy';

  const shuttleColor = {
    idle: 'var(--rail-idle)',
    moving: 'var(--rail-moving)',
    busy: 'var(--rail-busy)',
    error: 'var(--matrix-red)',
  }[shuttleState] || 'var(--rail-idle)';

  // --- ITEM ANIMATION LOGIC ---
  
  // Calculate relative sub-compartment offsets within the 48x32 carriage
  const getSubSlotOffset = (subId) => {
    // 3x2 grid of slots A-F. Carriage is 48px wide, 32px high
    const colIndex = ['a', 'c', 'e'].includes(subId?.toLowerCase()) ? 0 : 1;
    const rowIndex = ['a', 'b'].includes(subId?.toLowerCase()) ? 0 : ['c', 'd'].includes(subId?.toLowerCase()) ? 1 : 2;
    // Base box size is usually bigger, but we estimate pixel distance from center
    const x = colIndex === 0 ? -12 : 12;
    const y = rowIndex === 0 ? -10 : rowIndex === 1 ? 0 : 10;
    return { x, y };
  };

  const getSpriteState = () => {
    if (!activeOperationData || !activeOperationData.itemId) return { show: false };
    
    const { type, subId } = activeOperationData;
    const offset = getSubSlotOffset(subId);

    // Default hidden
    let show = false;
    let translateX = 0;
    let translateY = 0;
    let scale = 1;
    let opacity = 1;

    if (type === 'retrieve') {
      if (operationPhase === 'TRANSIT') {
        // Shuttle moving towards box, empty.
        show = false;
      } else if (operationPhase === 'ARRIVAL') {
        // Arrived at box. Animate item from subcompartment into shuttle.
        show = true;
        // Start from slot offset, animate to 0,0 (center of carriage)
        // By relying on CSS transition, we just set it to 0,0 and let it slide in.
        translateX = 0;
        translateY = 0;
      } else if (operationPhase === 'IDLE' && shuttleState === 'idle') {
        // Not active, hide.
        show = false;
      } else {
        // During return trip to dropoff (implied by moving state after arrival)
        show = true;
        translateX = 0;
        translateY = 0;
      }
    } else if (type === 'store') {
      if (operationPhase === 'PICKUP_TRANSIT' || operationPhase === 'TRANSIT') {
        // Shuttle has item, carrying it.
        show = true;
        translateX = 0;
        translateY = 0;
      } else if (operationPhase === 'ARRIVAL') {
        // Arrived at box. Animate item from shuttle to subcompartment.
        show = true;
        translateX = offset.x;
        translateY = offset.y;
        scale = 0.5; // Shrink as it goes "into" the slot
        opacity = 0; // Fade out as it enters slot
      }
    }

    // Special initialization for retrieve animation start
    // If we just entered ARRIVAL on retrieve, we need to snap it to the offset first, 
    // then let the transition pull it to 0,0. This requires a double render, 
    // but a simplified approach is to use a CSS animation or just accept snap.
    // For simplicity, we just bind it to center, but we'll use a hack to start at offset.

    return { show, translateX, translateY, scale, opacity, itemId: activeOperationData.itemId };
  };

  const sprite = getSpriteState();

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20, // Above grid background, below modals
        overflow: 'visible' // Allow carriage to go to dropoff outside grid
      }}
    >
      {/* CARRIAGE - Industrial trolley */}
      <div
        style={{
          position: 'absolute',
          left: `${coords.left}px`,
          top: `${coords.top}px`,
          width: `${CARRIAGE_W}px`,
          height: `${CARRIAGE_H}px`,
          background: `linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 40%, rgba(0,0,0,0.15) 100%), ${shuttleColor}`,
          borderRadius: '5px',
          border: '2px solid rgba(0,0,0,0.7)',
          boxShadow: isActive
            ? `0 0 16px ${shuttleColor}bb, inset 0 2px 3px rgba(255, 255, 255, 0.25), inset 0 -2px 3px rgba(0, 0, 0, 0.4), 0 6px 12px rgba(0, 0, 0, 0.6)`
            : 'inset 0 2px 3px rgba(255,255,255,0.2), inset 0 -2px 3px rgba(0,0,0,0.4), 0 6px 12px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)', // Smooth movement
          opacity: coords.visible ? 1 : 0,
        }}
      >
        {/* Top rollers */}
        <div style={{
          position: 'absolute',
          top: '-4px',
          left: '8px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'var(--rail-bg)',
          border: '1.5px solid rgba(0,0,0,0.8)',
          boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.5)',
        }} />
        <div style={{
          position: 'absolute',
          top: '-4px',
          right: '8px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'var(--rail-bg)',
          border: '1.5px solid rgba(0,0,0,0.8)',
          boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.5)',
        }} />

        {/* Bottom rollers */}
        <div style={{
          position: 'absolute',
          bottom: '-4px',
          left: '8px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'var(--rail-bg)',
          border: '1.5px solid rgba(0,0,0,0.8)',
          boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.5)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-4px',
          right: '8px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'var(--rail-bg)',
          border: '1.5px solid rgba(0,0,0,0.8)',
          boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.5)',
        }} />

        {/* Center grip lines */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
        }}>
          <div style={{ width: '20px', height: '1px', background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ width: '20px', height: '1px', background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ width: '20px', height: '1px', background: 'rgba(0,0,0,0.4)' }} />
        </div>

        {/* Floating Item Sprite (Animated Transfer) */}
        <div style={{
          position: 'absolute',
          width: '16px',
          height: '16px',
          background: 'var(--bg-card)',
          border: '1.5px solid var(--matrix-green)',
          borderRadius: '2px',
          boxShadow: '0 2px 6px rgba(16,185,129,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: sprite.show ? sprite.opacity : 0,
          transform: `translate(${sprite.translateX}px, ${sprite.translateY}px) scale(${sprite.show ? sprite.scale : 0.1})`,
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 30
        }}>
          <span style={{ fontSize: '8px', fontWeight: 800, color: 'var(--matrix-green)', fontFamily: 'var(--font-mono)' }}>
            #{sprite.itemId}
          </span>
        </div>
      </div>

      {/* POSITION LABEL */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            left: `${coords.left + CARRIAGE_W + 8}px`,
            top: `${coords.top + (CARRIAGE_H / 2) - 10}px`,
            fontSize: '0.6875rem',
            color: shuttleColor,
            fontWeight: 800,
            letterSpacing: '0.075em',
            transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            textShadow: `0 0 8px ${shuttleColor}, 0 0 4px ${shuttleColor}`,
            background: 'rgba(15, 23, 42, 0.9)',
            padding: '2px 6px',
            borderRadius: '3px',
            border: `1px solid ${shuttleColor}44`,
            zIndex: 21,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            opacity: coords.visible ? 1 : 0
          }}
        >
          {currentCol === 'DROP_OFF' ? 'DROP_OFF' : `${currentCol}${currentRow}`}
        </div>
      )}
    </div>
  );
};

export default ShuttleRail;
