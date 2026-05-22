import React, { useMemo, useState, useEffect, useRef } from 'react';

/**
 * MiracMachineView — Re-designed high-fidelity SVG visualization of the MIRAC CNC Lathe.
 * Matches the user's reference layout with premium grid, boxy headstock, knurled workpiece,
 * and multi-axis carriage assembly with a dynamic tool label.
 */
const MiracMachineView = ({
  spindleRPM = 0,
  xAxisValue = 0, // tool position (transverse X axis, vertical in 2D view)
  zAxisValue = 0, // carriage position (longitudinal Z axis, horizontal in 2D view)
  spindleRunning = false,
  toolEngaged = false,
  alarmActive = false,
  coolantOn = false,
  toolNumber = 4
}) => {
  // zAxisValue: 0 (retracted, right) to 300 (close, left) -> map to tx: 170 to -360
  const normalizedZ = Math.min(1, Math.max(0, Math.abs(zAxisValue) / 300));
  const tx = 170 - normalizedZ * 530;

  // xAxisValue: 0 (retracted, up) to 100 (plunged, centerline) -> map to ty: 10 to 100
  const normalizedX = Math.min(1, Math.max(0, Math.abs(xAxisValue) / 100));
  const ty = 10 + normalizedX * 90;

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
        aspectRatio: '900 / 400'
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
        viewBox="0 0 900 400"
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

        {/* ========================================
            STATIONARY COMPONENTS (LEFT)
            ======================================== */}

        {/* Headstock */}
        <g id="headstock">
          <rect x="10" y="70" width="110" height="260" fill="#1b1c23" rx="4" stroke="#121318" strokeWidth="2.5" />
          {/* Ventilation slots */}
          <rect x="30" y="110" width="60" height="8" rx="2" fill="#0f1015" />
          <rect x="30" y="196" width="60" height="8" rx="2" fill="#0f1015" />
          <rect x="30" y="282" width="60" height="8" rx="2" fill="#0f1015" />
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
        <g id="carriage-assembly" transform={`translate(${tx}, 0)`}>
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
          <g id="cross-slide" transform={`translate(0, ${ty})`}>
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

            {/* Mounting sensor */}
            <rect
              x="625"
              y="180"
              width="50"
              height="50"
              rx="10"
              fill="#1b1c23"
              stroke="#3c3f4a"
              strokeWidth="2"
            />
            {/* Glowing sensor LED */}
            <circle
              cx="650"
              cy="205"
              r="5.5"
              fill={toolEngaged ? '#f59e0b' : '#3c2500'}
              className="asm-sensor-led"
              stroke="#1b1c23"
              strokeWidth="1"
            />

            {/* Digital tool name text */}
            <text
              x="650"
              y="272"
              fontFamily="var(--font-mono)"
              fontSize="20"
              fontWeight="700"
              fill="#e2e8f0"
              textAnchor="middle"
              letterSpacing="0.05em"
            >
              {formattedTool}
            </text>

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

        {/* ========================================
            ALARM OVERLAY
            ======================================== */}
        {alarmActive && (
          <rect
            x="5"
            y="5"
            width="890"
            height="390"
            fill="red"
            className="asm-alarm-overlay"
            pointerEvents="none"
            style={{ mixBlendMode: 'color-dodge', rx: '10px' }}
          />
        )}
      </svg>
    </div>
  );
};

export default MiracMachineView;
