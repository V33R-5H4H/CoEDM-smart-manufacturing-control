import React, { useMemo } from 'react';

/**
 * TriacMachineView — High-fidelity SVG visualization of the TRIAC CNC Milling Machine.
 * Matches a 3-axis mill where the spindle moves vertically (Z) and the table moves
 * horizontally (X) and in depth (Y).
 */
const TriacMachineView = ({
  spindleRPM = 0,
  xAxisValue = 0,
  yAxisValue = 0,
  zAxisValue = 0,
  spindleRunning = false,
  toolEngaged = false,
  alarmActive = false,
  toolNumber = 4
}) => {
  // Map X axis (table left/right): 0 to 300 -> tx: -100 to 100
  const normalizedX = Math.min(1, Math.max(-1, xAxisValue / 150));
  const tx = normalizedX * 120;

  // Map Y axis (table depth/tilt): 0 to 300 -> ty: -20 to 20
  const normalizedY = Math.min(1, Math.max(-1, yAxisValue / 150));
  const ty = normalizedY * 30;

  // Map Z axis (spindle up/down): 0 to 200 -> tz: 0 to 150
  const normalizedZ = Math.min(1, Math.max(0, Math.abs(zAxisValue) / 200));
  const tz = 20 + normalizedZ * 100;

  // Calculate spin duration for CSS animation from RPM
  const spinDuration = useMemo(() => {
    if (!spindleRPM || spindleRPM <= 0) return '0s';
    const duration = Math.max(0.02, 10 / spindleRPM); // Much faster for mill
    return `${duration}s`;
  }, [spindleRPM]);

  const spindleAnimState = spindleRunning ? 'running' : 'paused';
  const alarmAnimState = alarmActive ? 'running' : 'paused';

  const formattedTool = useMemo(() => {
    const num = toolNumber ?? 4;
    return `T${String(num).padStart(2, '0')}`;
  }, [toolNumber]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        backgroundColor: '#0a0a0f',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 0 24px rgba(0, 0, 0, 0.95), 0 8px 32px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        aspectRatio: '900 / 500'
      }}
    >
      {/* Visual Overlay: Grid Lines */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />

      <style>{`
        @keyframes spinSpindle {
          0% { transform: scaleX(1); }
          50% { transform: scaleX(0.7); filter: brightness(1.2); }
          100% { transform: scaleX(1); }
        }

        @keyframes alarmPulse {
          0%, 100% { opacity: 0.03; }
          50% { opacity: 0.18; }
        }

        .asm-spindle-bit {
          animation: spinSpindle ${spinDuration} linear infinite;
          animation-play-state: ${spindleAnimState};
          transform-origin: center;
        }

        .asm-chip {
          animation: sparkFloat 0.6s ease-out forwards;
        }
        
        @keyframes sparkFloat {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--spark-dx, 0), var(--spark-dy, 0)) scale(0.5); }
        }
      `}</style>

      {/* Dynamic Alarm Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#ef4444',
          opacity: alarmActive ? 0.18 : 0,
          animation: alarmActive ? 'alarmPulse 1s ease-in-out infinite' : 'none',
          pointerEvents: 'none',
          zIndex: 2,
          transition: 'opacity 0.3s ease'
        }}
      />

      <svg
        viewBox="0 0 900 500"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          position: 'relative',
          zIndex: 3
        }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="mill-metal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#374151" />
            <stop offset="20%" stopColor="#6b7280" />
            <stop offset="50%" stopColor="#9ca3af" />
            <stop offset="80%" stopColor="#4b5563" />
            <stop offset="100%" stopColor="#1f2937" />
          </linearGradient>
          <linearGradient id="mill-dark-metal" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#111827" />
          </linearGradient>
          <linearGradient id="mill-brass" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
          <linearGradient id="mill-bit" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#9ca3af" />
            <stop offset="50%" stopColor="#f3f4f6" />
            <stop offset="100%" stopColor="#6b7280" />
          </linearGradient>

          <filter id="mill-glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* --- Background Machine Frame --- */}
        <g transform="translate(450, 250)">
          {/* Main Column */}
          <rect x="-100" y="-250" width="200" height="400" fill="url(#mill-dark-metal)" rx="4" />
          <rect x="-80" y="-200" width="160" height="300" fill="#111827" rx="2" />
          
          {/* Base */}
          <path d="M-200 150 L200 150 L250 250 L-250 250 Z" fill="url(#mill-dark-metal)" />
        </g>

        {/* --- Table Assembly (X/Y Axes) --- */}
        <g style={{ transform: `translate(450px, 350px) translate(${tx}px, ${ty}px)`, transition: 'transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {/* Saddle / Cross Slide (Y Axis representation) */}
          <rect x="-180" y="-30" width="360" height="40" fill="url(#mill-dark-metal)" rx="2" />
          
          {/* Mill Table (X Axis representation) */}
          <rect x="-220" y="-50" width="440" height="30" fill="url(#mill-metal)" rx="2" />
          
          {/* T-Slots */}
          <rect x="-220" y="-45" width="440" height="4" fill="#111827" />
          <rect x="-220" y="-35" width="440" height="4" fill="#111827" />
          <rect x="-220" y="-25" width="440" height="4" fill="#111827" />

          {/* Vice */}
          <g transform="translate(0, -65)">
            <rect x="-60" y="-20" width="120" height="35" fill="url(#mill-dark-metal)" />
            <rect x="-50" y="-40" width="20" height="20" fill="url(#mill-metal)" />
            <rect x="30" y="-40" width="20" height="20" fill="url(#mill-metal)" />
            
            {/* Workpiece */}
            <rect x="-30" y="-35" width="60" height="20" fill="url(#mill-brass)" rx="1" />
          </g>
        </g>

        {/* --- Spindle Head (Z Axis) --- */}
        <g style={{ transform: `translate(450px, ${tz}px)`, transition: 'transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {/* Spindle Housing */}
          <path d="M-70 -150 L70 -150 L70 50 L-70 50 Z" fill="url(#mill-metal)" />
          <rect x="-60" y="-140" width="120" height="180" fill="#1f2937" rx="2" />
          
          {/* Z-Axis Label */}
          <text x="0" y="-120" fill="#9ca3af" fontSize="14" fontFamily="Inter" fontWeight="bold" textAnchor="middle" letterSpacing="2">
            TRIAC VMC
          </text>

          {/* Motor / Top section */}
          <rect x="-40" y="-200" width="80" height="50" fill="url(#mill-dark-metal)" rx="4" />
          <rect x="-30" y="-220" width="60" height="20" fill="#111827" rx="2" />

          {/* Spindle Chuck/Collet */}
          <rect x="-30" y="50" width="60" height="40" fill="url(#mill-dark-metal)" />
          <rect x="-25" y="90" width="50" height="20" fill="url(#mill-metal)" />
          
          {/* Tool Assembly */}
          <g className="asm-spindle-bit" transform="translate(0, 110)">
            <rect x="-20" y="0" width="40" height="15" fill="url(#mill-dark-metal)" />
            {/* End Mill / Cutter */}
            <path d="M-6 15 L6 15 L3 60 L-3 60 Z" fill="url(#mill-bit)" />
            <rect x="-4" y="60" width="8" height="5" fill="#f3f4f6" />
          </g>

          {/* Tool Label Pill */}
          <g transform="translate(60, 20)">
            <rect x="0" y="0" width="60" height="24" rx="12" fill="#1f2937" stroke="#374151" />
            <circle cx="12" cy="12" r="4" fill={spindleRunning ? '#10b981' : '#6b7280'} filter="url(#mill-glow)" />
            <text x="24" y="16" fill="#f3f4f6" fontSize="12" fontFamily="JetBrains Mono" fontWeight="bold">
              {formattedTool}
            </text>
          </g>
        </g>

        {/* --- HUD Information --- */}
        <g transform="translate(30, 40)">
          <text x="0" y="0" fill="#f3f4f6" fontSize="16" fontFamily="Inter" fontWeight="bold" letterSpacing="1">
            MACHINE VIEW
          </text>
          <text x="0" y="24" fill={spindleRunning ? '#10b981' : '#9ca3af'} fontSize="13" fontFamily="Inter">
            STATUS: {spindleRunning ? (toolEngaged ? 'CUTTING' : 'RUNNING') : 'IDLE'}
          </text>
          <text x="0" y="44" fill="#9ca3af" fontSize="13" fontFamily="Inter">
            SPINDLE: {spindleRPM} RPM
          </text>
        </g>
        
        {/* --- Axes Labels Overlay --- */}
        <g transform="translate(780, 440)">
          <path d="M 0 0 L 0 -40 M 0 0 L -40 20 M 0 0 L 40 0" stroke="#9ca3af" strokeWidth="2" fill="none" />
          {/* Arrows */}
          <path d="M -5 -35 L 0 -45 L 5 -35 Z" fill="#9ca3af" />
          <path d="M 35 -5 L 45 0 L 35 5 Z" fill="#9ca3af" />
          <path d="M -32 20 L -45 25 L -38 12 Z" fill="#9ca3af" />
          {/* Text */}
          <text x="10" y="-35" fill="#9ca3af" fontSize="12" fontFamily="JetBrains Mono" fontWeight="bold">Z+</text>
          <text x="35" y="-10" fill="#9ca3af" fontSize="12" fontFamily="JetBrains Mono" fontWeight="bold">X+</text>
          <text x="-45" y="10" fill="#9ca3af" fontSize="12" fontFamily="JetBrains Mono" fontWeight="bold">Y+</text>
        </g>
      </svg>
    </div>
  );
};

export default TriacMachineView;
