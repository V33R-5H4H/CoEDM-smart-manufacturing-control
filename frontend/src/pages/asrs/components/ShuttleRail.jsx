import React, { useState, useEffect } from 'react';

const COLUMNS = ['A', 'B', 'C', 'D', 'E'];

const ShuttleRail = ({ shuttle }) => {
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

  // Since TRANSIT_STEP in hook is 2500ms, use 2.4s to smoothly glide and settle
  const transitionDuration = isActive ? '2.4s' : '0.6s';
  const transitionTiming = isActive ? 'cubic-bezier(0.25, 0.1, 0.25, 1)' : 'cubic-bezier(0.4, 0, 0.2, 1)';

  const shuttleColor = {
    idle: '#475569',
    moving: '#00bcd4',
    busy: '#00e5ff',
    error: '#ef4444',
  }[shuttleState] || '#475569';

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
      <style>{`
        @keyframes roller-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* CARRIAGE - Industrial trolley */}
      <div
        style={{
          position: 'absolute',
          left: `${coords.left}px`,
          top: `${coords.top}px`,
          width: `${CARRIAGE_W}px`,
          height: `${CARRIAGE_H}px`,
          background: `linear-gradient(135deg, ${shuttleColor} 0%, ${shuttleColor}ee 40%, ${shuttleColor}cc 60%, ${shuttleColor}aa 100%)`,
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
          background: 'conic-gradient(from 0deg, #475569, #1e293b, #475569, #0f172a, #475569)',
          border: '1.5px solid rgba(0,0,0,0.8)',
          boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.5)',
          animation: isActive ? 'roller-spin 0.4s linear infinite' : 'none',
        }} />
        <div style={{
          position: 'absolute',
          top: '-4px',
          right: '8px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, #475569, #1e293b, #475569, #0f172a, #475569)',
          border: '1.5px solid rgba(0,0,0,0.8)',
          boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.5)',
          animation: isActive ? 'roller-spin 0.4s linear infinite' : 'none',
        }} />

        {/* Bottom rollers */}
        <div style={{
          position: 'absolute',
          bottom: '-4px',
          left: '8px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, #475569, #1e293b, #475569, #0f172a, #475569)',
          border: '1.5px solid rgba(0,0,0,0.8)',
          boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.5)',
          animation: isActive ? 'roller-spin 0.4s linear infinite' : 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-4px',
          right: '8px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, #475569, #1e293b, #475569, #0f172a, #475569)',
          border: '1.5px solid rgba(0,0,0,0.8)',
          boxShadow: 'inset -1px -1px 2px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.5)',
          animation: isActive ? 'roller-spin 0.4s linear infinite' : 'none',
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
            transition: `left ${transitionDuration} ${transitionTiming}, top ${transitionDuration} ${transitionTiming}, text-shadow 0.6s ease, border-color 0.6s ease`,
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

