import React from "react";
import "./MiracIcon.css";

export default function MiracIcon({ state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  
  return (
    <div 
      className={`mirac-icon-container state-${state}`} 
      style={{ width: `${size * 1.5}px`, height: `${size}px` }}
      title={`MIRAC Status: ${state.toUpperCase()}`}
    >
      <svg
        viewBox="0 0 100 60"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="mirac-stripes" width="4" height="20" patternUnits="userSpaceOnUse">
            <rect width="2" height="20" fill="var(--bg-elevated)" />
            <rect x="2" width="2" height="20" fill="var(--text-disabled)" />
          </pattern>
        </defs>

        {/* Headstock */}
        <rect x="5" y="10" width="15" height="40" rx="2" className="mirac-headstock" />
        
        {/* Chuck */}
        <rect x="20" y="20" width="8" height="20" rx="1" className="mirac-chuck" />
        
        {/* Workpiece */}
        <rect x="28" y="25" width="25" height="10" className="mirac-workpiece" fill="url(#mirac-stripes)" />
        
        {/* Carriage Assembly */}
        <g className="mirac-carriage-group">
          {/* Carriage Base */}
          <rect x="75" y="35" width="20" height="10" rx="1" className="mirac-carriage-base" />
          
          {/* Cross Slide */}
          <rect x="80" y="20" width="10" height="15" rx="1" className="mirac-cross-slide" />
          
          {/* Tool */}
          <polygon points="70,25 80,25 80,30" className="mirac-tool" />
          
          {/* Sparks (attached to tool tip) */}
          <g className="mirac-sparks">
              <circle cx="68" cy="27" r="1" fill="var(--status-warn)" className="spark spark-1" />
              <circle cx="67" cy="24" r="1.5" fill="var(--primary)" className="spark spark-2" />
              <circle cx="69" cy="22" r="1" fill="var(--primary-light)" className="spark spark-3" />
          </g>
        </g>
      </svg>
    </div>
  );
}
