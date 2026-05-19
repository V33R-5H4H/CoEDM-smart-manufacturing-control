import { useState, useEffect } from 'react';

function ShuttleOverlay({ row, col }) {
  const [pos, setPos] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    const cell = document.getElementById(`cell-${col}${row}`);
    const grid = document.getElementById('rack-grid');

    if (cell && grid) {
      const cellRect = cell.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();

      setPos({
        x: cellRect.left - gridRect.left,
        y: cellRect.top - gridRect.top,
        w: cellRect.width,
        h: cellRect.height,
      });
    }
  }, [row, col]);

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: pos.w,
        height: pos.h,
        background: 'linear-gradient(135deg, #00e5ff, #00bcd4)',
        borderRadius: '10px',
        boxShadow: '0 0 20px rgba(0,229,255,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        color: '#00363a',
        transition: 'all 0.5s ease',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      Shuttle
    </div>
  );
}

export default ShuttleOverlay;
