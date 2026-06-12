import React from "react";
import "./InspectionIcon.css";

export default function InspectionIcon({ state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  
  return (
    <div 
      className={`insp-icon-container state-${state}`} 
      style={{ width: `${size * 1.5}px`, height: `${size}px` }}
      title={`Inspection Status: ${state.toUpperCase()}`}
    >
      <svg
        viewBox="0 0 100 60"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="insp-caliper-group">
          {/* Main Scale (Fixed Body) */}
          <rect x="15" y="15" width="75" height="10" rx="1" className="insp-body" />
          
          {/* Main Scale Marks */}
          <g className="insp-marks">
            <line x1="30" y1="20" x2="30" y2="25" />
            <line x1="40" y1="20" x2="40" y2="25" />
            <line x1="50" y1="20" x2="50" y2="25" />
            <line x1="60" y1="20" x2="60" y2="25" />
            <line x1="70" y1="20" x2="70" y2="25" />
            <line x1="80" y1="20" x2="80" y2="25" />
          </g>

          {/* Fixed Jaw (Left side) */}
          <path d="M 15 15 L 25 15 L 25 25 L 20 45 L 15 45 Z" className="insp-jaw" />
          <path d="M 15 15 L 25 15 L 22 5 L 15 5 Z" className="insp-jaw" /> {/* Inner upper jaw */}

          {/* The Workpiece being measured */}
          <circle cx="32" cy="35" r="7" className="insp-workpiece" />

          {/* Sliding Jaw & Digital Display */}
          <g className="insp-sliding-group">
            {/* Slider body surrounding main scale */}
            <rect x="40" y="12" width="22" height="16" rx="2" className="insp-slider" />
            
            {/* Sliding Lower Jaw */}
            <path d="M 40 28 L 45 28 L 45 45 L 40 45 Z" className="insp-jaw" />
            
            {/* Sliding Upper Jaw */}
            <path d="M 40 12 L 45 12 L 42 5 L 40 5 Z" className="insp-jaw" />
            
            {/* Digital Display Screen */}
            <rect x="43" y="15" width="16" height="8" rx="1" className="insp-screen" />
            <text x="46" y="22" className="insp-readout">0.00</text>
            
            {/* Thumb roller */}
            <circle cx="62" cy="28" r="3" className="insp-roller" />
          </g>
        </g>
      </svg>
    </div>
  );
}
