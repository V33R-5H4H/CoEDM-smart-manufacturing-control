import React, { useMemo, useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

/**
 * MiracMachineView — Re-designed high-fidelity SVG visualization of the MIRAC CNC Lathe.
 * Matches the user's reference layout with premium grid, boxy headstock, knurled workpiece,
 * and multi-axis carriage assembly with a dynamic tool label.
 */
const MiracMachineView = forwardRef(function MiracMachineView({
  spindleRPM = 0,
  spindleRunning = false,
  toolEngaged = false,
  alarmActive = false,
  coolantOn = false,
  toolNumber = 4,
  vibit1Online = false,
  vibit1Data = null,
  vibit2Online = false,
  vibit2Data = null
}, ref) {
  // Direct DOM refs for the two animated SVG groups — driven imperatively at 60fps
  const carriageRef = useRef(null);
  const crossSlideRef = useRef(null);

  // Expose setPosition() so Mirac.jsx RAF loop can update transforms without setState
  useImperativeHandle(ref, () => ({
    setPosition(tx, ty) {
      if (carriageRef.current) {
        carriageRef.current.setAttribute('transform', `translate(${tx}, 0)`);
      }
      if (crossSlideRef.current) {
        crossSlideRef.current.setAttribute('transform', `translate(0, ${ty})`);
      }
    }
  }), []);

  // Calculate spin duration for CSS animation from RPM
  const spinDuration = useMemo(() => {
    if (!spindleRPM || spindleRPM <= 0) return '0s';
    const duration = Math.max(0.08, 20 / spindleRPM);
    return `${duration}s`;
  }, [spindleRPM]);

  const chuckAnimState = spindleRunning ? 'running' : 'paused';
  const sensorLedAnimState = spindleRunning ? 'running' : 'paused';
  const alarmAnimState = alarmActive ? 'running' : 'paused';

  // Format dynamic tool number display
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
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />

      <style>{`
        @keyframes spinWorkpiece {
          0% { transform: translateX(0); }
          100% { transform: translateX(-20px); }
        }

        @keyframes pulseSensorLED {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; filter: drop-shadow(0 0 8px #f59e0b); }
        }

        @keyframes sparkFloat {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--spark-dx, 0), var(--spark-dy, 0)) scale(0.5); }
        }

        @keyframes alarmPulse {
          0%, 100% { opacity: 0.03; }
          50% { opacity: 0.18; }
        }

        .asm-workpiece-surface {
          animation: spinWorkpiece ${spinDuration} linear infinite;
          animation-play-state: ${chuckAnimState};
        }

        .asm-sensor-led {
          animation: pulseSensorLED 1.2s ease-in-out infinite;
          animation-play-state: ${sensorLedAnimState};
        }

        .asm-spark {
          animation: sparkFloat 0.4s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
          transform-origin: center;
        }

        .asm-alarm-overlay {
          animation: alarmPulse 1.0s ease-in-out infinite;
          animation-play-state: ${alarmAnimState};
        }
      `}</style>

      <svg
        viewBox="0 0 900 500"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', zIndex: 2, position: 'relative' }}
      >
        <defs>
          {/* Workpiece stripes pattern */}
          <pattern id="workpiece-stripes" width="20" height="100" patternUnits="userSpaceOnUse">
            <rect width="10" height="100" fill="#363946" />
            <rect x="10" width="10" height="100" fill="#20222a" />
          </pattern>

          {/* Workpiece clipping path */}
          <clipPath id="workpiece-clip">
            <rect x="160" y="150" width="260" height="100" rx="3" />
          </clipPath>

          {/* Glowing filters */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ALARM OVERLAY */}
        {alarmActive && (
          <rect
            x="5"
            y="5"
            width="890"
            height="490"
            fill="red"
            className="asm-alarm-overlay"
            pointerEvents="none"
            style={{ mixBlendMode: 'color-dodge', rx: '10px' }}
          />
        )}

        <g transform="translate(0, 50)">
        {/* ========================================
            STATIONARY COMPONENTS (LEFT)
            ======================================== */}

        {/* Headstock Casing */}
        <g id="headstock">
          <rect x="10" y="70" width="110" height="260" fill="#1b1c23" rx="4" stroke="#121318" strokeWidth="2.5" />
          



        </g>

        {/* Chuck Adapter */}
        <rect x="120" y="110" width="40" height="180" fill="#252731" stroke="#17181f" strokeWidth="2" />

        {/* Clamping Jaws */}
        <rect x="160" y="110" width="20" height="40" fill="#383b48" stroke="#1c1d24" strokeWidth="1.5" rx="1" />
        <rect x="160" y="250" width="20" height="40" fill="#383b48" stroke="#1c1d24" strokeWidth="1.5" rx="1" />

        {/* Workpiece with Vertical Ridges & Rotation Animation */}
        <g id="workpiece" clipPath="url(#workpiece-clip)">
          <rect
            className="asm-workpiece-surface"
            x="140"
            y="150"
            width="300"
            height="100"
            fill="url(#workpiece-stripes)"
          />
          {/* Highlight/shading overlay for metallic depth */}
          <rect x="160" y="150" width="260" height="100" fill="none" rx="3" pointerEvents="none" />
          {/* Top highlight */}
          <rect x="160" y="150" width="260" height="12" fill="rgba(255, 255, 255, 0.08)" />
          {/* Bottom shadow */}
          <rect x="160" y="238" width="260" height="12" fill="rgba(0, 0, 0, 0.25)" />
        </g>

        {/* Centerline indicator (subtle dashed line) */}
        <line x1="160" y1="200" x2="880" y2="200" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="5,8" strokeWidth="1" />

        {/* ========================================
            DYNAMIC TOOL CARRIAGE (RIGHT)
            ======================================== */}
        <g id="carriage-assembly" ref={carriageRef} transform="translate(170, 0)">
          {/* Carriage base/slide block */}
          <rect
            x="550"
            y="310"
            width="200"
            height="30"
            fill="#20222a"
            stroke="#121317"
            strokeWidth="2.5"
            rx="3"
          />

          {/* Cross-slide assembly (translates vertically relative to base) */}
          <g id="cross-slide" ref={crossSlideRef} transform="translate(0, 10)">
            {/* Vertical block */}
            <rect
              x="590"
              y="150"
              width="120"
              height="160"
              fill="#2d3039"
              stroke="#181a20"
              strokeWidth="2.5"
              rx="4"
            />



            {/* Tool post block */}
            <rect
              x="610"
              y="100"
              width="80"
              height="50"
              fill="#3a3d48"
              stroke="#1f2129"
              strokeWidth="2"
              rx="2"
            />
            {/* Tool Number Display */}
            <text x="650" y="130" fill="#94a3b8" fontSize="14" fontFamily="JetBrains Mono" fontWeight="bold" textAnchor="middle">
              {formattedTool}
            </text>

            {/* Yellow cutter triangle (pointing up-left) */}
            <polygon
              points="580,100 615,100 615,125"
              fill="#f59e0b"
              stroke="#ffd54f"
              strokeWidth="1.5"
              filter={toolEngaged ? 'url(#glow)' : ''}
              style={{ transition: 'fill 0.2s, stroke 0.2s' }}
            />

            {/* Cutting sparks when active */}
            {toolEngaged && (
              <g>
                <line
                  x1="580"
                  y1="100"
                  x2="560"
                  y2="90"
                  stroke="#ffe600"
                  strokeWidth="2"
                  className="asm-spark"
                  filter="url(#glow)"
                  style={{ '--spark-dx': '-20px', '--spark-dy': '-10px' }}
                />
                <line
                  x1="580"
                  y1="100"
                  x2="558"
                  y2="110"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  className="asm-spark"
                  filter="url(#glow)"
                  style={{ '--spark-dx': '-22px', '--spark-dy': '10px', animationDelay: '0.06s' }}
                />
                <line
                  x1="580"
                  y1="100"
                  x2="565"
                  y2="98"
                  stroke="#ffd54f"
                  strokeWidth="1"
                  className="asm-spark"
                  filter="url(#glow)"
                  style={{ '--spark-dx': '-15px', '--spark-dy': '-2px', animationDelay: '0.12s' }}
                />
              </g>
            )}

            {/* Coolant flow */}
            {coolantOn && (
              <path
                d="M 610,120 Q 570,115 540,140"
                fill="none"
                stroke="#00a2ff"
                strokeWidth="2.5"
                strokeDasharray="4,3"
                opacity="0.8"
                filter="url(#glow)"
              />
            )}
          </g>
        </g>
        </g>
      </svg>

    </div>
  );
});

export default MiracMachineView;
