import React from "react";
import "./AssemblyIcon.css";

export default function AssemblyIcon({ state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  
  return (
    <div 
      className={`asm-icon-container state-${state}`} 
      style={{ width: `${size * 1.5}px`, height: `${size}px` }}
      title={`Assembly Status: ${state.toUpperCase()}`}
    >
      <svg
        viewBox="0 0 100 60"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Base */}
        <rect x="20" y="55" width="60" height="5" rx="1" className="asm-icon-base" />
        
        {/* Vice Jaws */}
        <rect x="25" y="45" width="15" height="10" rx="1" className="asm-icon-jaw" />
        <rect x="60" y="45" width="15" height="10" rx="1" className="asm-icon-jaw" />
        
        {/* Workpiece */}
        <rect x="42" y="47" width="16" height="8" rx="2" className="asm-icon-workpiece" />

        {/* Animated Assembly Group (Rod + Head) */}
        <g className="asm-icon-press-group">
          <rect x="46" y="10" width="8" height="25" className="asm-icon-rod" />
          <rect x="35" y="35" width="30" height="6" rx="1" className="asm-icon-head" />
          
          {/* Glowing contact strip on head when running */}
          <rect x="38" y="40" width="24" height="1" className="asm-icon-head-glow" />
        </g>

        {/* Cylinder Frame (Drawn last to cover the top of the rod) */}
        <rect x="35" y="5" width="30" height="15" rx="2" className="asm-icon-cylinder" />
        
      </svg>
    </div>
  );
}
