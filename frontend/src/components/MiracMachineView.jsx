import React, { useMemo, useState, useEffect, useRef } from 'react';

/**
 * MiracMachineView — Detailed 2D front-facing SVG visualization of a MIRAC P.C. CNC lathe trainer.
 * 
 * Features:
 * - Animated 3-jaw chuck (rotation speed tied to spindleRPM)
 * - Dynamic bellows compression (inverse left/right as carriage moves)
 * - Carriage with tool post, cutting tool tip, and sensor LED
 * - Toolpath spark visualization when cutting
 * - Optional coolant flow line
 * - Alarm overlay with pulse animation
 * - All CSS variables for dashboard theming
 * - Demo mode with pendulum motion (Z-axis sweeps + X-axis plunges)
 *
 * Props:
 *   - spindleRPM: number (rotation RPM; pause animation if ≤0)
 *   - carriagePositionPct: 0-100 (0=far right, 100=close to headstock)
 *   - spindleRunning: boolean (controls chuck animation play state)
 *   - toolEngaged: boolean (orange tool tip + spark lines)
 *   - alarmActive: boolean (red overlay + pulse)
 *   - coolantOn: boolean (show coolant flow line)
 *   - demoMode: boolean (enable pendulum motion demo)
 */
const MiracMachineView = ({
  spindleRPM = 0,
  carriagePositionPct = 50,
  spindleRunning = false,
  toolEngaged = false,
  alarmActive = false,
  coolantOn = false,
  demoMode = false
}) => {
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(false);
  const [demoCarriageX, setDemoCarriageX] = useState(280);
  const [demoToolY, setDemoToolY] = useState(0);
  const animationFrameRef = useRef(null);

  // Linear interpolation helpers (use useRef to keep them stable across renders)
  const lerp = useRef((a, b, t) => a + (b - a) * t).current;
  const easeInOut = useRef((t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t).current;

  // Demo animation loop (pendulum motion: Z-axis sweeps + X-axis plunges)
  useEffect(() => {
    if (!demoMode) {
      if (animationFrameRef.current?.id) {
        cancelAnimationFrame(animationFrameRef.current.id);
      }
      return;
    }

    const phaseDurationMs = 1500; // 1.5 seconds per sweep/plunge
    const totalZAxisMs = phaseDurationMs * 3; // 3 sweeps
    const totalXAxisMs = phaseDurationMs * 3; // 3 plunges
    const fullCycleDurationMs = totalZAxisMs + totalXAxisMs;
    let startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsedMs = now - startTime;
      const elapsedInFullCycle = elapsedMs % fullCycleDurationMs;

      // Phase 1: Z-axis sweeps (3 sweeps, 1.5s each)
      if (elapsedInFullCycle < totalZAxisMs) {
        const zProgress = (elapsedInFullCycle / phaseDurationMs) % 3;
        const currentSweep = Math.floor(zProgress);
        const sweepProgress = zProgress - currentSweep;
        const easedProgress = easeInOut(sweepProgress);

        // Sweep left-to-right, then right-to-left, alternating
        let position;
        if (currentSweep % 2 === 0) {
          position = lerp(280, 620, easedProgress); // Sweep right
        } else {
          position = lerp(620, 280, easedProgress); // Sweep left
        }
        setDemoCarriageX(position);
        setDemoToolY(0);
      }
      // Phase 2: X-axis plunges (3 plunges, 1.5s each)
      else {
        const xProgress = ((elapsedInFullCycle - totalZAxisMs) / phaseDurationMs) % 3;
        const currentPlunge = Math.floor(xProgress);
        const plungeProgress = xProgress - currentPlunge;
        const easedProgress = easeInOut(plungeProgress);

        setDemoCarriageX(450); // Center position
        let toolOffset;
        if (currentPlunge % 2 === 0) {
          toolOffset = lerp(0, 20, easedProgress); // Plunge down
        } else {
          toolOffset = lerp(20, 0, easedProgress); // Plunge up
        }
        setDemoToolY(toolOffset);
      }

      animationFrameRef.current.id = requestAnimationFrame(animate);
    };

    animationFrameRef.current = { id: null };
    animationFrameRef.current.id = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current?.id) {
        cancelAnimationFrame(animationFrameRef.current.id);
      }
    };
  }, [demoMode]);

  // When demo mode is active, use demo values; when play button is active, use demo speed; otherwise use real data
  const effectiveRPM = isAnimationPlaying ? 1000 : spindleRPM;
  const effectiveSpindleRunning = isAnimationPlaying ? true : spindleRunning;
  const effectiveCarriagePos = demoMode ? ((demoCarriageX - 280) / 340) * 100 : carriagePositionPct;

  // Calculate chuck rotation duration from RPM: 60 / RPM = seconds per revolution
  const spinDuration = useMemo(() => {
    if (!effectiveRPM || effectiveRPM <= 0) return '0.1s';
    const seconds = 60 / Math.max(effectiveRPM, 1);
    return `${seconds}s`;
  }, [effectiveRPM]);

  // Clamp carriage position to 0–100
  const positionClamped = Math.max(0, Math.min(100, effectiveCarriagePos));

  // Carriage X position in viewBox coords (900x400)
  // Travels from ~280 (right limit) to ~620 (left limit, near headstock)
  const carriageX = 280 + (positionClamped / 100) * 340;

  // Bellows widths: inverse relationship
  // Left bellows shrink as carriage moves right
  const bellowsLeftWidth = Math.max(15, (100 - positionClamped) * 0.8); // 15–80px
  const bellowsRightWidth = Math.max(15, positionClamped * 0.8); // 15–80px

  // Tool contact point (left face of carriage, slightly forward)
  const toolContactX = carriageX - 5;
  const toolContactY = 280;

  // Animation play state
  const chuckAnimState = effectiveSpindleRunning ? 'running' : 'paused';
  const sensorLedAnimState = isAnimationPlaying ? 'running' : 'paused';
  const alarmAnimState = alarmActive ? 'running' : 'paused';

  // Generate bellows array (10 sections)
  const bellowsSections = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        backgroundColor: '#0f0f13',
        borderRadius: '6px',
        border: '1px solid var(--border, #333)',
        overflow: 'hidden',
        aspectRatio: '900 / 400'
      }}
    >
      {/* Play/Pause Button */}
      <button
        onClick={() => setIsAnimationPlaying(!isAnimationPlaying)}
        style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          zIndex: 10,
          width: '50px',
          height: '50px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: isAnimationPlaying ? '#4a9a5a' : '#6a4a4a',
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          fontWeight: 'bold',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          hover: { transform: 'scale(1.05)' }
        }}
        title={isAnimationPlaying ? 'Pause' : 'Play'}
      >
        {isAnimationPlaying ? '⏸' : '▶'}
      </button>
      <style>{`
        @keyframes spinChuck {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes pulseSensorLED {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes sparkFloat {
          0% {
            opacity: 1;
            transform: translate(0, 0);
          }
          100% {
            opacity: 0;
            transform: translate(var(--spark-dx, 0), var(--spark-dy, 0));
          }
        }

        @keyframes alarmPulse {
          0%, 100% {
            opacity: 0.15;
          }
          50% {
            opacity: 0.35;
          }
        }

        .mirac-chuck {
          transform-origin: 150px 130px;
          animation: spinChuck ${spinDuration} linear infinite;
          animation-play-state: ${chuckAnimState};
        }

        .mirac-sensor-led {
          animation: pulseSensorLED 1.5s ease-in-out infinite;
          animation-play-state: ${sensorLedAnimState};
        }

        .mirac-spark {
          animation: sparkFloat 0.5s ease-out forwards;
          animation-play-state: ${isAnimationPlaying ? 'running' : 'paused'};
        }

        .mirac-alarm-overlay {
          animation: alarmPulse 0.8s ease-in-out infinite;
          animation-play-state: ${alarmAnimState};
        }
      `}</style>

      <svg
        viewBox="0 0 900 400"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
      >
        {/* CSS Variables for theming */}
        <defs>
          <style>{`
            :root {
              --color-bg: #0f0f13;
              --color-bed: #2a2a2a;
              --color-headstock: #2d7a3a;
              --color-carriage: #8b1a1a;
              --color-toolpost: #4a4a4a;
              --color-tailstock: #b0a898;
              --color-bellows-dark: #333;
              --color-bellows-light: #555;
              --color-tool-idle: #8a7a5a;
              --color-tool-active: #ff9500;
              --color-spark: #ffcc00;
              --color-coolant: #1e90ff;
            }
          `}</style>
        </defs>

        {/* === BACKGROUND === */}
        <rect x="0" y="0" width="900" height="400" fill="#0f0f13" />

        {/* === MACHINE BED === */}
        <defs>
          <linearGradient id="bedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#1e1e1e" />
          </linearGradient>
        </defs>
        <rect x="0" y="310" width="900" height="60" fill="url(#bedGradient)" rx="2" />

        {/* === FASCIA BAND & LABEL === */}
        <rect x="0" y="365" width="900" height="35" fill="#0a0a0a" />
        <text
          x="450"
          y="388"
          fontSize="16"
          fontWeight="600"
          fill="#ffffff"
          textAnchor="middle"
          fontFamily="'Courier New', monospace"
          letterSpacing="0.15em"
        >
          MIRAC P.C.
        </text>

        {/* === HEADSTOCK === */}
        <g id="headstock">
          {/* Body */}
          <rect x="40" y="50" width="110" height="220" fill="#2d7a3a" rx="6" stroke="#1a4d2a" strokeWidth="2" />

          {/* Chuck Assembly — Rotating Group */}
          <g className="mirac-chuck" id="chuck">
            {/* Outer chuck body circle */}
            <circle cx="150" cy="130" r="45" fill="none" stroke="#1a4d2a" strokeWidth="3" />
            <circle cx="150" cy="130" r="40" fill="none" stroke="#2d7a3a" strokeWidth="2" />

            {/* Jaw 1 (top) */}
            <path
              d="M 150 95 L 170 85 L 175 120 L 155 125 Z"
              fill="#3a9a4a"
              stroke="#1a4d2a"
              strokeWidth="1.5"
            />

            {/* Jaw 2 (bottom-left) — rotated 120° */}
            <g transform="translate(150, 130) rotate(120) translate(-150, -130)">
              <path
                d="M 150 95 L 170 85 L 175 120 L 155 125 Z"
                fill="#3a9a4a"
                stroke="#1a4d2a"
                strokeWidth="1.5"
              />
            </g>

            {/* Jaw 3 (bottom-right) — rotated 240° */}
            <g transform="translate(150, 130) rotate(240) translate(-150, -130)">
              <path
                d="M 150 95 L 170 85 L 175 120 L 155 125 Z"
                fill="#3a9a4a"
                stroke="#1a4d2a"
                strokeWidth="1.5"
              />
            </g>

            {/* Center bore hole */}
            <circle cx="150" cy="130" r="8" fill="#0a0a0a" stroke="#1a4d2a" strokeWidth="1" />
          </g>
        </g>

        {/* === GUIDE RAILS === */}
        <g id="guideRails">
          {/* Top guide rail - continuous horizontal bar */}
          <rect
            x="190"
            y="237"
            width="530"
            height="3"
            fill="#5a5a5a"
            stroke="#3a3a3a"
            strokeWidth="0.5"
          />
          {/* Bottom guide rail - continuous horizontal bar */}
          <rect
            x="190"
            y="372"
            width="530"
            height="3"
            fill="#5a5a5a"
            stroke="#3a3a3a"
            strokeWidth="0.5"
          />
        </g>

        {/* === LEFT BELLOWS === */}
        <g id="leftBellows">
          {bellowsSections.map((i) => (
            <rect
              key={`left-bellows-${i}`}
              x={160}
              y={100 + i * 15}
              width={bellowsLeftWidth}
              height="8"
              fill={i % 2 === 0 ? '#333' : '#555'}
              opacity="0.8"
            />
          ))}
        </g>

        {/* === CARRIAGE / TOOL POST === */}
        <g id="carriage" transform={`translate(${carriageX - 450}, 0)`}>
          {/* Carriage body - dark red */}
          <rect
            x="410"
            y="245"
            width="80"
            height="130"
            fill="#8b1a1a"
            rx="3"
            stroke="#5a0a0a"
            strokeWidth="1.5"
          />

          {/* Tool post - grey block on top, controlled by demoToolY offset */}
          <rect
            x="435"
            y={215 + demoToolY}
            width="30"
            height="35"
            fill="#4a4a4a"
            rx="2"
            stroke="#2a2a2a"
            strokeWidth="1"
          />

          {/* Tool tip - cutting insert (triangle pointing left) */}
          <polygon
            points={`432,${260 + demoToolY} 415,${275 + demoToolY} 432,${290 + demoToolY}`}
            fill={toolEngaged ? '#ff9500' : '#8a7a5a'}
            stroke={toolEngaged ? '#ffb84d' : '#6a5a3a'}
            strokeWidth="1.5"
          />

          {/* Spark lines when tool engaged */}
          {toolEngaged && (
            <>
              <line
                x1="445"
                y1={280 + demoToolY}
                x2="433"
                y2={298 + demoToolY}
                stroke="#ffcc00"
                strokeWidth="2"
                opacity="0.8"
                className="mirac-spark"
                style={{ '--spark-dx': '-8px', '--spark-dy': '16px' }}
              />
              <line
                x1="445"
                y1={280 + demoToolY}
                x2="437"
                y2={302 + demoToolY}
                stroke="#ffcc00"
                strokeWidth="1.5"
                opacity="0.7"
                className="mirac-spark"
                style={{ '--spark-dx': '-4px', '--spark-dy': '20px', animationDelay: '0.1s' }}
              />
              <line
                x1="445"
                y1={280 + demoToolY}
                x2="429"
                y2={294 + demoToolY}
                stroke="#ffcc00"
                strokeWidth="1"
                opacity="0.6"
                className="mirac-spark"
                style={{ '--spark-dx': '-12px', '--spark-dy': '12px', animationDelay: '0.15s' }}
              />
            </>
          )}

          {/* Coolant flow line */}
          {coolantOn && (
            <line
              x1="445"
              y1={280 + demoToolY}
              x2="433"
              y2={320 + demoToolY}
              stroke="#1e90ff"
              strokeWidth="1.5"
              opacity="0.6"
              strokeDasharray="3,2"
            />
          )}

          {/* Sensor LED - small pulsing circle */}
          <circle
            cx="480"
            cy="290"
            r="4"
            fill="#0099ff"
            className="mirac-sensor-led"
            stroke="#006699"
            strokeWidth="1"
          />
        </g>

        {/* === RIGHT BELLOWS === */}
        <g id="rightBellows">
          {bellowsSections.map((i) => (
            <rect
              key={`right-bellows-${i}`}
              x={carriageX + 40}
              y={100 + i * 15}
              width={bellowsRightWidth}
              height="8"
              fill={i % 2 === 0 ? '#333' : '#555'}
              opacity="0.8"
            />
          ))}
        </g>

        {/* === TAILSTOCK === */}
        <g id="tailstock">
          {/* Body */}
          <rect x="750" y="65" width="100" height="210" fill="#b0a898" rx="4" stroke="#8a7a68" strokeWidth="2" />

          {/* Quill (barrel protruding from left face) */}
          <rect
            x={carriageX + 40 + bellowsRightWidth + 15}
            y="155"
            width="35"
            height="30"
            fill="#9a8a78"
            stroke="#6a5a48"
            strokeWidth="1.5"
          />

          {/* Center point - concentric circles */}
          <circle cx="790" cy="160" r="10" fill="none" stroke="#6a5a48" strokeWidth="1.5" />
          <circle cx="790" cy="160" r="6" fill="none" stroke="#6a5a48" strokeWidth="1" />
          <circle cx="790" cy="160" r="2" fill="#4a3a28" />
        </g>

        {/* === ALARM OVERLAY === */}
        {alarmActive && (
          <rect
            x="0"
            y="0"
            width="900"
            height="400"
            fill="#ff0000"
            className="mirac-alarm-overlay"
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
};

export default MiracMachineView;
