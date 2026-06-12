import React from "react";
import "./AmrIcon.css";

export default function AmrIcon({ state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  
  return (
    <div 
      className={`amr-icon-container state-${state}`} 
      style={{ width: `${size * 1.5}px`, height: `${size}px` }}
      title={`AMR Status: ${state.toUpperCase()}`}
    >
      <svg
        viewBox="0 0 100 60"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="amr-scanner-grad" x1="100%" y1="50%" x2="0%" y2="50%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="amr-robot-group">
          {/* Lidar Beam / Scanner (Only visible when running) */}
          <path 
            d="M 24 25 L -5 5 L -5 45 Z" 
            className="amr-scanner-beam" 
            fill="url(#amr-scanner-grad)" 
          />

          {/* Optional Payload (Crate) */}
          <rect x="35" y="15" width="30" height="15" rx="1" className="amr-payload" />
          <line x1="40" y1="20" x2="60" y2="20" className="amr-payload-line" />
          <line x1="40" y1="25" x2="60" y2="25" className="amr-payload-line" />

          {/* Top Lifting Plate */}
          <rect x="20" y="30" width="60" height="5" rx="1" className="amr-plate" />
          
          {/* LIDAR / Sensor Array */}
          <rect x="20" y="22" width="8" height="8" rx="1" className="amr-lidar" />
          <rect x="22" y="24" width="4" height="4" className="amr-lidar-spinner" />

          {/* Chassis Base */}
          <rect x="15" y="35" width="70" height="15" rx="3" className="amr-chassis" />

          {/* Front LED Status Strip */}
          <rect x="15" y="40" width="4" height="6" className="amr-led-strip" />

          {/* Wheels (Two main drive wheels) */}
          <g className="amr-wheels">
             <circle cx="30" cy="50" r="5" className="amr-wheel" />
             <circle cx="70" cy="50" r="5" className="amr-wheel" />
          </g>
        </g>
      </svg>
    </div>
  );
}
