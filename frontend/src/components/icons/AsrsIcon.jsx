import React from "react";
import "./AsrsIcon.css";

export default function AsrsIcon({ state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  // ASRS rack is 7 cols x 5 rows
  const cols = 7;
  const rows = 5;
  const cellSize = 12;
  const gap = 3;
  
  const totalWidth = cols * cellSize + (cols - 1) * gap;
  const totalHeight = rows * cellSize + (rows - 1) * gap;

  // Add padding for the glass effect container
  const paddingX = 16;
  const paddingY = 16;

  const viewBoxWidth = totalWidth + paddingX * 2;
  const viewBoxHeight = totalHeight + paddingY * 2;

  // Render the 7x5 rack grid
  const racks = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      racks.push(
        <rect
          key={`rack-${c}-${r}`}
          className="asrs-rack"
          x={paddingX + c * (cellSize + gap)}
          y={paddingY + r * (cellSize + gap)}
          width={cellSize}
          height={cellSize}
          rx={1}
          ry={1}
        />
      );
    }
  }

  // Shuttle starts at col 0, row 4 (bottom left)
  const homeCol = 0;
  const homeRow = 4;
  const startX = paddingX + homeCol * (cellSize + gap);
  const startY = paddingY + homeRow * (cellSize + gap);

  return (
    <div 
      className={`asrs-icon-container state-${state}`} 
      style={{ width: `${size * 1.5}px`, height: `${size}px` }}
      title={`AS/RS Status: ${state.toUpperCase()}`}
    >
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background Racks */}
        <g>{racks}</g>

        {/* The Shuttle */}
        <rect
          className="asrs-shuttle"
          x={startX}
          y={startY}
          width={cellSize}
          height={cellSize}
          rx={2}
          ry={2}
        />
      </svg>
    </div>
  );
}
