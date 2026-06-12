import React from "react";
import "./TestingIcon.css";

export default function TestingIcon({ state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  
  return (
    <div 
      className={`testing-icon-container state-${state}`} 
      style={{ width: `${size * 1.5}px`, height: `${size}px` }}
      title={`Testing Status: ${state.toUpperCase()}`}
    >
      <svg
        viewBox="0 0 100 60"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="testing-cmm-group">
          {/* Granite Base Plate */}
          <rect x="15" y="45" width="70" height="8" rx="1" className="testing-base" />
          
          {/* Workpiece (Machined Block) */}
          <path d="M 35 45 L 35 30 L 50 30 L 50 38 L 65 38 L 65 45 Z" className="testing-workpiece" />
          {/* Bore hole in workpiece */}
          <circle cx="42.5" cy="37" r="3" className="testing-bore" />

          {/* CMM Gantry Bridge */}
          <rect x="20" y="10" width="60" height="5" rx="1" className="testing-gantry-top" />
          <rect x="20" y="10" width="5" height="35" className="testing-gantry-leg" />
          <rect x="75" y="10" width="5" height="35" className="testing-gantry-leg" />

          {/* Moving Carriage & Probe */}
          <g className="testing-probe-assembly">
            {/* X-axis carriage slider */}
            <rect x="35" y="8" width="10" height="9" rx="1" className="testing-carriage" />
            
            {/* Z-axis probe shaft (Animates up/down) */}
            <g className="testing-probe-shaft-group">
              <rect x="39" y="15" width="2" height="10" className="testing-probe-shaft" />
              {/* Ruby Stylus Tip */}
              <circle cx="40" cy="25" r="1.5" className="testing-probe-tip" />
            </g>
          </g>

          {/* Status Indicator LED on Gantry */}
          <circle cx="22.5" cy="12.5" r="1" className="testing-led" />
        </g>
      </svg>
    </div>
  );
}
