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
      className="shuttle-overlay"
      style={{
        left: pos.x,
        top: pos.y,
        width: pos.w,
        height: pos.h,
      }}
    >
      Shuttle
    </div>
  );
}

export default ShuttleOverlay;
