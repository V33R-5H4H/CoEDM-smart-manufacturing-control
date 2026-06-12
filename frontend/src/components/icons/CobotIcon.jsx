import React from "react";
import "./CobotIcon.css";

export default function CobotIcon({ state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  
  return (
    <div 
      className={`cobot-icon-container state-${state}`} 
      style={{ width: `${size * 1.5}px`, height: `${size}px` }}
      title={`Cobot Status: ${state.toUpperCase()}`}
    >
      <svg
        viewBox="0 0 100 60"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Base */}
        <rect x="35" y="50" width="30" height="5" rx="1" className="cobot-base" />
        <path d="M 42 50 L 46 42 L 54 42 L 58 50 Z" className="cobot-shoulder-mount" />

        {/* Shoulder Group */}
        <g className="cobot-shoulder-group" style={{ transformOrigin: "50px 42px" }}>
          {/* Upper Arm */}
          <rect x="47" y="25" width="6" height="17" rx="3" className="cobot-arm" />
          <circle cx="50" cy="42" r="5" className="cobot-joint" />
          
          {/* Elbow Group */}
          <g className="cobot-elbow-group" style={{ transformOrigin: "50px 25px" }}>
            {/* Forearm */}
            <rect x="47.5" y="12" width="5" height="13" rx="2.5" className="cobot-arm" />
            <circle cx="50" cy="25" r="4" className="cobot-joint" />

            {/* Wrist Group */}
            <g className="cobot-wrist-group" style={{ transformOrigin: "50px 12px" }}>
              <circle cx="50" cy="12" r="3" className="cobot-joint-secondary" />
              
              {/* End Effector */}
              <rect x="47" y="6" width="6" height="6" rx="1" className="cobot-effector-base" />
              
              <rect x="45" y="0" width="2" height="6" rx="1" className="cobot-jaw cobot-jaw-left" />
              <rect x="53" y="0" width="2" height="6" rx="1" className="cobot-jaw cobot-jaw-right" />
              
              {/* Workpiece (Only visible when picking up) */}
              <circle cx="50" cy="3" r="2.5" className="cobot-workpiece" />
              
              {/* Status Light */}
              <circle cx="50" cy="9" r="1" className="cobot-status-light" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
