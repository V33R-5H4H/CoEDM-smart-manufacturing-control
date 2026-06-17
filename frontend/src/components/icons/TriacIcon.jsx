import React from "react";
import "./TriacIcon.css";

export default function TriacIcon({ state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  
  return (
    <div 
      className={`triac-icon-container state-${state}`} 
      style={{ width: `${size * 1.5}px`, height: `${size}px` }}
      title={`TRIAC Status: ${state.toUpperCase()}`}
    >
      <svg
        viewBox="0 0 100 60"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="triac-stripes" width="4" height="10" patternUnits="userSpaceOnUse">
            <rect width="2" height="10" fill="var(--primary-dark)" />
            <rect x="2" width="2" height="10" fill="var(--primary)" />
          </pattern>
        </defs>

        {/* Frame / Column */}
        <rect x="20" y="5" width="20" height="50" rx="2" className="triac-frame" />
        
        {/* Base */}
        <rect x="15" y="50" width="70" height="8" rx="1" className="triac-base" />

        {/* Spindle Arm */}
        <rect x="20" y="10" width="35" height="15" rx="1" className="triac-spindle-arm" />
        
        {/* Table Group */}
        <g className="triac-table-group">
          {/* Table */}
          <rect x="35" y="42" width="30" height="8" rx="1" className="triac-table" />
          {/* Workpiece */}
          <rect x="45" y="36" width="10" height="6" className="triac-workpiece" fill="url(#triac-stripes)" />
        </g>

        {/* Spindle Head Group */}
        <g className="triac-spindle-group">
          <rect x="45" y="10" width="10" height="20" rx="1" className="triac-spindle-head" />
          <rect x="48" y="30" width="4" height="6" className="triac-tool-bit" />
          
          {/* Sparks (attached to spindle head so they move down with the tool) */}
          <g className="triac-sparks">
            <circle cx="50" cy="36" r="1" fill="var(--status-warn)" className="spark spark-1" />
            <circle cx="48" cy="35" r="1.5" fill="var(--primary)" className="spark spark-2" />
            <circle cx="52" cy="36" r="1" fill="var(--primary-light)" className="spark spark-3" />
          </g>
        </g>
      </svg>
    </div>
  );
}
