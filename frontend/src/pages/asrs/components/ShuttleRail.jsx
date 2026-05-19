import React, { useState, useEffect } from 'react';

// Grid Constants matching BoxesTab.jsx
// const COL_WIDTH = 120; // Replaced by dynamic prop
const ROW_HEIGHT = 80;
const GAP = 12;
const HEADER_HEIGHT = 40; // Row headers
const SIDEBAR_WIDTH = 60; // Column headers (A, B...)

const COLUMNS = ['A', 'B', 'C', 'D', 'E'];

const ShuttleRail = ({ shuttle, colWidth = 120 }) => {
  const targetRow = shuttle?.row ?? 1;
  const targetCol = shuttle?.col ?? 'A';
  const shuttleState = shuttle?.state ?? 'idle';

  const [currentRow, setCurrentRow] = useState(targetRow);
  const [currentCol, setCurrentCol] = useState(targetCol);

  // Update position when backend changes
  useEffect(() => {
    setCurrentRow(targetRow);
    setCurrentCol(targetCol);
  }, [targetRow, targetCol]);

  // Handle DROP_OFF position
  const isAtDropOff = currentRow === 0 || currentCol === 'DROP_OFF';

  // Calculate exact pixel position based on grid
  let top, left;

  if (isAtDropOff) {
    // Drop-off is roughly aligned with the handoff station visual
    // Positioned to the left of the grid
    top = 92; // Align with Row 1 Center (40 Header + 12 Gap + 40 Half-Row)
    left = -100; // Left of the sidebar
  } else {
    // Grid Position
    // Row 1 is at index 0 for calculation
    const rowIndex = currentRow - 1;
    const colIndex = COLUMNS.indexOf(currentCol);

    // Vertical: Header + GAP + (Row * (Height + Gap)) + Half Height
    // We add GAP after header because grid-gap applies between header row and first content row
    top = HEADER_HEIGHT + GAP + (rowIndex * (ROW_HEIGHT + GAP)) + (ROW_HEIGHT / 2);

    // Horizontal: Sidebar + GAP + (Col * (Width + Gap)) + Half Width
    // Grid has gap between Sidebar (Label Col) and Col A
    left = SIDEBAR_WIDTH + GAP + (colIndex * (colWidth + GAP)) + (colWidth / 2);

    // If invalid column, default to A
    if (colIndex < 0) left = SIDEBAR_WIDTH + GAP + (colWidth / 2);
  }

  // Adjust for carriage center anchor
  // Carriage size is 48px x 32px
  const CARRIAGE_W = 48;
  const CARRIAGE_H = 32;

  const finalTop = top - (CARRIAGE_H / 2);
  const finalLeft = left - (CARRIAGE_W / 2);

  const isActive = shuttleState === 'moving' || shuttleState === 'busy';

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
        zIndex: 20, // Check that it is above grid background but below modals
        overflow: 'visible' // Allow carriage to go to dropoff outside grid
      }}
    >
      {/* CARRIAGE - Industrial trolley */}
      <div
        style={{
          position: 'absolute',
          left: `${finalLeft}px`,
          top: `${finalTop}px`,
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
          background: 'radial-gradient(circle at 30% 30%, #374151, #1a202c)',
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
          background: 'radial-gradient(circle at 30% 30%, #374151, #1a202c)',
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
          background: 'radial-gradient(circle at 30% 30%, #374151, #1a202c)',
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
          background: 'radial-gradient(circle at 30% 30%, #374151, #1a202c)',
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

        <span
          style={{
            position: 'absolute',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.8)',
            fontWeight: 900
          }}
        >
        </span>
      </div>

      {/* POSITION LABEL */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            left: `${finalLeft + CARRIAGE_W + 8}px`,
            top: `${finalTop + (CARRIAGE_H / 2) - 10}px`,
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
            whiteSpace: 'nowrap'
          }}
        >
          {currentCol}{currentRow}
        </div>
      )}
    </div>
  );
};

export default ShuttleRail;
