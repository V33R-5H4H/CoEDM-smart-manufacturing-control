import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import PageHeader from "../components/PageHeader";
import TriacStatusRibbon from "./asrs/components/TriacStatusRibbon";
import TriacControlService from "../services/TriacControl";
import SensorDot from "../components/SensorDot";
import { deepMerge } from "../utils/deepMerge";
import "./Assembly.css";
import "./Triac.css";

/**
 * Helper: render a sensor value or "---" if null/undefined (sensor offline).
 * This ensures the user can distinguish "sensor reads zero" from "sensor disconnected".
 */
const sensorVal = (value, decimals = 2, fallback = "---") => {
  if (value === null || value === undefined) return fallback;
  return Number(value).toFixed(decimals);
};

/**
 * Helper to convert Float32 to two 16-bit registers (Modbus registers representation)
 * For TRIAC, we word-swap by default to match big-endian word-swapping.
 */
const floatToRegs = (val, swap = true) => {
  if (val === null || val === undefined) return [0, 0];
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, val, false); // big endian
  const reg0 = view.getUint16(0, false);
  const reg1 = view.getUint16(2, false);
  return swap ? [reg1, reg0] : [reg0, reg1];
};

/**
 * Helper to compute register address range dynamically based on base address and offset.
 */
const getRegRange = (baseAddress, offset) => {
  const base = baseAddress !== undefined && baseAddress !== null ? Math.round(baseAddress) : 4001;
  const start = base + offset;
  return `${start}-${start + 1}`;
};

/**
 * High-Fidelity SVG milling machine viewer
 */
const TriacMachineView = ({
  spindleRPM = 0,
  xAxisValue = 0,
  yAxisValue = 0,
  zAxisValue = 0,
  spindleRunning = false,
  toolEngaged = false,
  alarmActive = false,
  toolNumber = 4,
  vibit1Online = false,
  vibit1Data = null,
  vibit2Online = false,
  vibit2Data = null
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

  const containerRef = useRef(null);

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

  // Dynamic Neon HUD Glows
  const spindleGlow = useMemo(() => {
    if (!vibit1Online) return {
      border: '1px solid rgba(239, 68, 68, 0.25)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 12px rgba(239, 68, 68, 0.1)',
      background: 'rgba(239, 68, 68, 0.02)'
    };
    if (spindleRPM > 0) return {
      border: '1px solid rgba(56, 189, 248, 0.45)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65), 0 0 18px rgba(56, 189, 248, 0.25)',
      background: 'rgba(10, 15, 25, 0.75)'
    };
    return {
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)'
    };
  }, [vibit1Online, spindleRPM]);

  const toolGlow = useMemo(() => {
    if (!vibit2Online) return {
      border: '1px solid rgba(239, 68, 68, 0.25)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 12px rgba(239, 68, 68, 0.1)',
      background: 'rgba(239, 68, 68, 0.02)'
    };
    if (spindleRunning) return {
      border: '1px solid rgba(249, 115, 22, 0.45)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65), 0 0 18px rgba(249, 115, 22, 0.25)',
      background: 'rgba(10, 15, 25, 0.75)'
    };
    return {
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)'
    };
  }, [vibit2Online, spindleRunning]);

  return (
    <div
      ref={containerRef}
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

      {/* Premium HTML Glassmorphism HUD for VibIT 1 */}
      <div style={{
        position: 'absolute',
        top: '24px',
        right: '24px',
        zIndex: 10,
        width: '200px',
        background: 'rgba(10, 15, 25, 0.65)',
        backdropFilter: 'blur(16px)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'border 0.3s, box-shadow 0.3s',
        ...spindleGlow
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
          <span style={{ color: '#f8fafc', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.5px' }}>SPINDLE VIBIT</span>
          <div style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: vibit1Online ? '#10b981' : '#ef4444',
            boxShadow: vibit1Online ? '0 0 8px rgba(16, 185, 129, 0.6)' : '0 0 8px rgba(239, 68, 68, 0.6)'
          }} />
        </div>

        {/* Data Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', fontFamily: 'JetBrains Mono', color: '#94a3b8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>X RMS</span>
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{vibit1Online && vibit1Data?.x_rms_vel != null ? vibit1Data.x_rms_vel.toFixed(2) : "0.00"} <span style={{ color: '#64748b' }}>mm/s</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Y RMS</span>
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{vibit1Online && vibit1Data?.y_rms_vel != null ? vibit1Data.y_rms_vel.toFixed(2) : "0.00"} <span style={{ color: '#64748b' }}>mm/s</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Z RMS</span>
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{vibit1Online && vibit1Data?.z_rms_vel != null ? vibit1Data.z_rms_vel.toFixed(2) : "0.00"} <span style={{ color: '#64748b' }}>mm/s</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.05)' }}>
            <span>TEMP</span>
            <span style={{ color: '#fbbf24', fontWeight: 500 }}>{vibit1Online && vibit1Data?.temperature != null ? vibit1Data.temperature.toFixed(1) : "0.0"} <span style={{ color: '#64748b' }}>°C</span></span>
          </div>
        </div>
      </div>

      {/* Premium HTML Glassmorphism HUD for VibIT 2 (Bed Vibit) */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '24px',
        zIndex: 10,
        width: '200px',
        background: 'rgba(10, 15, 25, 0.65)',
        backdropFilter: 'blur(16px)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'border 0.3s, box-shadow 0.3s',
        ...toolGlow
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
          <span style={{ color: '#f8fafc', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.5px' }}>BED VIBIT</span>
          <div style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: vibit2Online ? '#10b981' : '#ef4444',
            boxShadow: vibit2Online ? '0 0 8px rgba(16, 185, 129, 0.6)' : '0 0 8px rgba(239, 68, 68, 0.6)'
          }} />
        </div>

        {/* Data Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', fontFamily: 'JetBrains Mono', color: '#94a3b8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>X PEAK</span>
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{vibit2Online && vibit2Data?.x_peak_vel != null ? vibit2Data.x_peak_vel.toFixed(2) : "0.00"} <span style={{ color: '#64748b' }}>mm/s</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Y PEAK</span>
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{vibit2Online && vibit2Data?.y_peak_vel != null ? vibit2Data.y_peak_vel.toFixed(2) : "0.00"} <span style={{ color: '#64748b' }}>mm/s</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Z PEAK</span>
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{vibit2Online && vibit2Data?.z_peak_vel != null ? vibit2Data.z_peak_vel.toFixed(2) : "0.00"} <span style={{ color: '#64748b' }}>mm/s</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.05)' }}>
            <span>TEMP</span>
            <span style={{ color: '#fbbf24', fontWeight: 500 }}>{vibit2Online && vibit2Data?.temperature != null ? vibit2Data.temperature.toFixed(1) : "0.0"} <span style={{ color: '#64748b' }}>°C</span></span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Triac() {
  const [data, setData] = useState(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState("disconnected"); // 'connected', 'connecting', 'disconnected'
  const [isConnected, setIsConnected] = useState(false); // OPC-UA connectivity
  const [statusLoading, setStatusLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("monitoring");
  const [activeModal, setActiveModal] = useState(null); // 'spindle' | 'tool' | 'energy' | null

  // Smooth position state for axis coordinate interpolation
  const [smoothedX, setSmoothedX] = useState(0);
  const [smoothedY, setSmoothedY] = useState(0);
  const [smoothedZ, setSmoothedZ] = useState(50); // Starts high

  // Refs for tracking target coordinates and physics state
  const targetXRef = useRef(0);
  const targetYRef = useRef(0);
  const targetZRef = useRef(50);
  const smoothedXRef = useRef(0);
  const smoothedYRef = useRef(0);
  const smoothedZRef = useRef(50);
  const velocityXRef = useRef(0);
  const velocityYRef = useRef(0);
  const velocityZRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());

  // WebSocket references
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  // Ref that always holds the latest merged data (avoids stale closure in onmessage)
  const dataRef = useRef(null);

  // Data source connectivity flags from backend
  const dataSources = data?.data_sources || {};
  const plcOnline = dataSources.plc ?? false;
  const vibit1Online = dataSources.vibit1 ?? false;
  const vibit2Online = dataSources.vibit2 ?? false;
  const vibit3Online = dataSources.vibit3 ?? false;

  const b1 = data?.raw?.vibit1?.base_address ?? 4001;
  const b2 = data?.raw?.vibit2?.base_address ?? 4050; // TRIAC Tool unit 2 starts at 4050!


  // Establish WebSocket connection to backend broadcaster
  const connectWS = useCallback(() => {
    setWsStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
    const wsUrl = `${wsBase}/api/control/triac/ws/vibit-data`;

    console.log("[Triac] Connecting to TRIAC telemetry WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Triac] TRIAC WebSocket connected");
      setIsWsConnected(true);
      setWsStatus("connected");
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === "snapshot") {
          // Full state replacement — first message or new client
          dataRef.current = msg.data;
          setData(msg.data);
          if (msg.data.axes?.x?.value != null) targetXRef.current = msg.data.axes.x.value;
          if (msg.data.axes?.y?.value != null) targetYRef.current = msg.data.axes.y.value;
          if (msg.data.axes?.z?.value != null) targetZRef.current = msg.data.axes.z.value;

        } else if (msg.type === "delta") {
          // Partial update — merge into current state
          const merged = deepMerge(dataRef.current, msg.data);
          dataRef.current = merged;
          setData(merged);
          // Only update axis refs when those keys are present in the delta
          if (msg.data.axes?.x?.value != null) targetXRef.current = msg.data.axes.x.value;
          if (msg.data.axes?.y?.value != null) targetYRef.current = msg.data.axes.y.value;
          if (msg.data.axes?.z?.value != null) targetZRef.current = msg.data.axes.z.value;

        }
        // heartbeat: connection is alive, nothing to update in the UI

      } catch (err) {
        console.error("[Triac] Error parsing WebSocket message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[Triac] TRIAC WebSocket error:", err);
      setIsWsConnected(false);
      setWsStatus("disconnected");
    };

    ws.onclose = () => {
      console.warn("[Triac] TRIAC WebSocket closed, reconnecting in 3s...");
      setIsWsConnected(false);
      setWsStatus("disconnected");
      reconnectTimerRef.current = setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          connectWS();
        }
      }, 3000);
    };
  }, []);

  // Check OPC-UA status on mount and subscribe to WS
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await TriacControlService.getConnectionStatus();
        setIsConnected(!!res.connected);
      } catch (e) {
        console.error("[Triac] Error getting connection status:", e);
        setIsConnected(false);
      } finally {
        setStatusLoading(false);
      }
    };

    checkStatus();
    connectWS();

    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWS]);

  // RequestAnimationFrame physics-based smoothing loop (omega = 5.0)
  useEffect(() => {
    let animationFrameId;

    const updateLoop = () => {
      const now = performance.now();
      let dt = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      // Guard against lag spikes and tab suspension
      if (dt > 0.1) dt = 0.1;
      if (dt < 0.005) dt = 0.005;

      const omega = 5.0; // Spring frequency for axis interpolation

      // Critically damped spring integration for X Axis
      const targetX = targetXRef.current;
      const prevX = smoothedXRef.current;
      const prevVX = velocityXRef.current;
      const x0 = prevX - targetX;
      const expTermX = Math.exp(-omega * dt);
      const AX = x0;
      const BX = prevVX + omega * x0;
      const nextX = targetX + (AX + BX * dt) * expTermX;
      const nextVX = (BX - omega * (AX + BX * dt)) * expTermX;

      if (Math.abs(nextX - targetX) < 0.05 && Math.abs(nextVX) < 0.1) {
        smoothedXRef.current = targetX;
        velocityXRef.current = 0;
        setSmoothedX(targetX);
      } else {
        smoothedXRef.current = nextX;
        velocityXRef.current = nextVX;
        setSmoothedX(nextX);
      }

      // Critically damped spring integration for Y Axis
      const targetY = targetYRef.current;
      const prevY = smoothedYRef.current;
      const prevVY = velocityYRef.current;
      const y0 = prevY - targetY;
      const expTermY = Math.exp(-omega * dt);
      const AY = y0;
      const BY = prevVY + omega * y0;
      const nextY = targetY + (AY + BY * dt) * expTermY;
      const nextVY = (BY - omega * (AY + BY * dt)) * expTermY;

      if (Math.abs(nextY - targetY) < 0.05 && Math.abs(nextVY) < 0.1) {
        smoothedYRef.current = targetY;
        velocityYRef.current = 0;
        setSmoothedY(targetY);
      } else {
        smoothedYRef.current = nextY;
        velocityYRef.current = nextVY;
        setSmoothedY(nextY);
      }

      // Critically damped spring integration for Z Axis
      const targetZ = targetZRef.current;
      const prevZ = smoothedZRef.current;
      const prevVZ = velocityZRef.current;
      const z0 = prevZ - targetZ;
      const expTermZ = Math.exp(-omega * dt);
      const AZ = z0;
      const BZ = prevVZ + omega * z0;
      const nextZ = targetZ + (AZ + BZ * dt) * expTermZ;
      const nextVZ = (BZ - omega * (AZ + BZ * dt)) * expTermZ;

      if (Math.abs(nextZ - targetZ) < 0.05 && Math.abs(nextVZ) < 0.1) {
        smoothedZRef.current = targetZ;
        velocityZRef.current = 0;
        setSmoothedZ(targetZ);
      } else {
        smoothedZRef.current = nextZ;
        velocityZRef.current = nextVZ;
        setSmoothedZ(nextZ);
      }

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    lastFrameTimeRef.current = performance.now();
    animationFrameId = requestAnimationFrame(updateLoop);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  const handleConnect = async () => {
    setStatusLoading(true);
    try {
      const res = await TriacControlService.connect();
      if (res.success) {
        setIsConnected(true);
        toast.success(res.message || "Connected to TRIAC-PC OPC-UA Gateway");
      } else {
        toast.error(res.message || "Failed to connect to TRIAC-PC");
      }
    } catch (e) {
      toast.error(e.message || "Failed to establish connection");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setStatusLoading(true);
    try {
      const res = await TriacControlService.disconnect();
      if (res.success) {
        setIsConnected(false);
        toast.success(res.message || "Disconnected from TRIAC-PC OPC-UA Gateway");
      } else {
        toast.error(res.message || "Failed to disconnect");
      }
    } catch (e) {
      toast.error(e.message || "Failed to disconnect");
    } finally {
      setStatusLoading(false);
    }
  };

  const greenActive = isConnected && plcOnline && (data?.status?.green ?? false) && !(data?.status?.red);
  const orangeActive = isConnected && plcOnline && ((data?.status?.yellow ?? false) || (data?.spindle?.speed > 0) || (data?.status?.cycle_start ?? false)) && !(data?.status?.red);
  const redActive = !isConnected || !plcOnline || (data?.status?.red ?? false);

  return (
    <div className="asm-page">
      {/* Page Header aligned with unified SCADA theme */}
      <PageHeader
        title="Smart TRIAC"
        subtitle="Process Control"
        actions={
          <>
            <TriacStatusRibbon
              plcConnected={isConnected}
              wsStatus={wsStatus}
              spindleSpeed={data?.spindle?.speed}
              cycleStart={data?.status?.cycle_start}
            />
            {isConnected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-primary)',
                  background: 'var(--primary-dark)',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  opacity: statusLoading ? 0.7 : 1,
                }}
                disabled={statusLoading}
              >
                {statusLoading ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--bg-primary)',
                  background: 'var(--primary)',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  opacity: statusLoading ? 0.7 : 1,
                }}
                disabled={statusLoading}
              >
                {statusLoading ? "Connecting…" : "Connect"}
              </button>
            )}
          </>
        }
      />

      {/* Sub-nav: Tabs — Stitch pattern */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        flexShrink: 0,
        background: 'var(--bg-primary)',
      }}>
        {/* Flat tabs */}
        <div style={{ display: 'flex', gap: '24px' }}>
          {["monitoring"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: '11px',
                fontWeight: activeTab === tab ? 700 : 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                padding: '10px 0',
                cursor: 'pointer',
                transition: 'color 150ms ease-out',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* 3-LED Status Tower Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 8px',
          background: 'rgba(255,255,255,0.01)',
          borderLeft: '1px solid var(--border)',
          height: '28px'
        }}>
          <span style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginRight: '2px'
          }}>STATUS TOWER:</span>
          
          {/* RUN LED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="System Connected and Ready">
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '1.5px solid #333',
              background: greenActive
                ? 'radial-gradient(circle, #4ade80, #22c55e)'
                : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
              boxShadow: greenActive
                ? '0 0 8px rgba(74, 222, 128, 0.75), inset 0 1px 1px rgba(255,255,255,0.3)'
                : 'inset 0 1px 2px rgba(0,0,0,0.5)',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: greenActive ? '#4ade80' : 'var(--text-disabled)' }}>RUN</span>
          </div>

          {/* BUSY LED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Machine Cycle Active">
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '1.5px solid #333',
              background: orangeActive
                ? 'radial-gradient(circle, #fbbf24, #f59e0b)'
                : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
              boxShadow: orangeActive
                ? '0 0 8px rgba(251, 191, 36, 0.75), inset 0 1px 1px rgba(255,255,255,0.3)'
                : 'inset 0 1px 2px rgba(0,0,0,0.5)',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: orangeActive ? '#fbbf24' : 'var(--text-disabled)' }}>BUSY</span>
          </div>

          {/* FLT LED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Machine Fault or Offline">
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '1.5px solid #333',
              background: redActive
                ? 'radial-gradient(circle, #ef4444, #dc2626)'
                : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
              boxShadow: redActive
                ? '0 0 8px rgba(239, 68, 68, 0.75), inset 0 1px 1px rgba(255,255,255,0.3)'
                : 'inset 0 1px 2px rgba(0,0,0,0.5)',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: redActive ? '#ef4444' : 'var(--text-disabled)' }}>FLT</span>
          </div>
        </div>
      </div>

      <div className="asm-body">
        <div className="triac-grid-container">
          {/* COLUMN 1: LEFT HUD (Status LEDs, Vibit Sensors, Energy) */}
          <div className="triac-column">
            {/* Machine Status Indicators */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span><SensorDot connected={plcOnline} />Machine Status Indicators</span>
                <span className={`asm-hud-badge ${plcOnline ? "asm-hud-badge--active" : ""}`}>
                  {plcOnline ? "PLC LIVE" : "PLC OFFLINE"}
                </span>
              </div>
              <div className="asm-led-group">
                <div className="asm-led-indicator">
                  <div className={`asm-led-lamp asm-led-lamp--red ${data?.status?.red ? "active" : ""}`} />
                  <span>Red</span>
                </div>
                <div className="asm-led-indicator">
                  <div className={`asm-led-lamp asm-led-lamp--yellow ${data?.status?.yellow ? "active" : ""}`} />
                  <span>Yellow</span>
                </div>
                <div className="asm-led-indicator">
                  <div className={`asm-led-lamp asm-led-lamp--green ${data?.status?.green ? "active" : ""}`} />
                  <span>Green</span>
                </div>
              </div>
            </div>

            {/* Vibit Sensor 1: Spindle */}
            <div
              className="asm-hud-card asm-hud-card--clickable"
              onClick={() => setActiveModal("spindle")}
              title="Click to open detailed diagnostics panel"
            >
              <div className="asm-hud-header">
                <span><SensorDot connected={vibit1Online} />Vibit Spindle Sensor (U1)</span>
                <span className={`asm-hud-badge ${vibit1Online && data?.spindle?.speed > 0 ? "asm-hud-badge--active" : ""}`}>
                  {!vibit1Online ? "OFFLINE" : data?.spindle?.speed > 0 ? "MILLING" : "IDLE"}
                </span>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Vibration</div>
                  <div className="asm-val__num asm-val__num--glowing-blue">
                    {sensorVal(data?.spindle?.vibration)}
                    <span className="asm-val__unit">mm/s</span>
                  </div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Temperature</div>
                  <div className="asm-val__num">
                    {sensorVal(data?.spindle?.temperature, 1)}
                    <span className="asm-val__unit">°C</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vibit Sensor 2: Tool */}
            <div
              className="asm-hud-card asm-hud-card--clickable tool-hover"
              onClick={() => setActiveModal("tool")}
              title="Click to open detailed diagnostics panel"
            >
              <div className="asm-hud-header">
                <span><SensorDot connected={vibit2Online} />Vibit Tool Sensor (U2)</span>
                <span className={`asm-hud-badge ${vibit2Online ? "asm-hud-badge--active" : ""}`}>
                  {vibit2Online ? "ACTIVE" : "OFFLINE"}
                </span>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Vibration</div>
                  <div className="asm-val__num asm-val__num--glowing-orange">
                    {sensorVal(data?.tool?.vibration)}
                    <span className="asm-val__unit">mm/s</span>
                  </div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Temperature</div>
                  <div className="asm-val__num">
                    {sensorVal(data?.tool?.temperature, 1)}
                    <span className="asm-val__unit">°C</span>
                  </div>
                </div>
              </div>
              <div className="asm-val" style={{ marginTop: "6px" }}>
                <div className="asm-val__label">Reboot Count</div>
                <div className="asm-val__num asm-val__num--sm">
                  {data?.tool?.reboot_count ?? "---"}
                </div>
              </div>
            </div>

            {/* Energy Meter — Repurposed from Unit ID 3 */}
            <div
              className="asm-hud-card asm-hud-card--clickable energy-hover"
              onClick={() => setActiveModal("energy")}
              title="Click to open detailed diagnostics panel"
            >
              <div className="asm-hud-header">
                <span><SensorDot connected={vibit3Online} />Energy Meter (U3)</span>
                <span className={`asm-hud-badge ${vibit3Online ? "asm-hud-badge--active" : ""}`}>
                  {vibit3Online ? "LIVE" : "OFFLINE"}
                </span>
              </div>
              {data?.energy_meter ? (
                <div className="asm-val-grid">
                  <div className="asm-val">
                    <div className="asm-val__label">Active Power</div>
                    <div className="asm-val__num asm-val__num--glowing-green">
                      {sensorVal(data.energy_meter.power, 3)}
                      <span className="asm-val__unit">kW</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Total consumption</div>
                    <div className="asm-val__num">
                      {sensorVal(data.energy_meter.kwh, 4)}
                      <span className="asm-val__unit">kWh</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px 12px",
                  gap: 6,
                  background: "rgba(0, 0, 0, 0.15)",
                  borderRadius: "var(--radius-md, 8px)",
                  border: "1px dashed rgba(255, 255, 255, 0.08)",
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#475569" }}>
                    power_off
                  </span>
                  <span style={{ fontSize: "0.62rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    No Energy Meter Connected
                  </span>
                </div>
              )}
            </div>

            {/* Safety Integrity Diagnostics */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Safety Integrity Diagnostics</span>
                <span className={`asm-hud-badge ${isConnected && plcOnline && !data?.status?.red ? "asm-hud-badge--active" : ""}`}>
                  {isConnected && plcOnline ? (data?.status?.red ? "FAULT / ALARM" : "SECURE") : "UNKNOWN"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                <div className={`asm-safety-item ${isConnected && plcOnline && data?.status?.red ? "asm-safety-item--danger" : ""}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }}>
                  <span>Main Safety Loop</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {isConnected && plcOnline && data?.status?.red && <span className="asm-pulse-dot" />}
                    <span style={{ color: !isConnected || !plcOnline ? "#94a3b8" : data?.status?.red ? "#ef4444" : "#10b981" }}>
                      {!isConnected || !plcOnline ? "UNKNOWN" : data?.status?.red ? "INTERRUPTED" : "SECURE"}
                    </span>
                  </span>
                </div>
                <div className={`asm-safety-item ${!isConnected || !plcOnline ? "" : data?.spindle?.speed > 0 ? "asm-safety-item--warn" : ""}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }}>
                  <span>Spindle Guard Door</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: !isConnected || !plcOnline ? "#94a3b8" : data?.spindle?.speed > 0 ? "#fbbf24" : "#10b981" }}>
                      {!isConnected || !plcOnline ? "UNKNOWN" : data?.spindle?.speed > 0 ? "LOCKED (AUTO)" : "UNLOCKED"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 2: CENTER MACHINE PANEL */}
          <div className="triac-column" style={{ overflow: "hidden" }}>
            <div className="asm-center-container">
              {/* High-Fidelity SVG Viewer */}
              <div className="asm-viz-panel">
                <TriacMachineView
                  spindleRPM={data?.spindle?.speed || 0}
                  xAxisValue={smoothedX}
                  yAxisValue={smoothedY}
                  zAxisValue={smoothedZ}
                  spindleRunning={data?.status?.cycle_start || false}
                  alarmActive={data?.status?.red || false}
                  coolantOn={data?.status?.cycle_start || false}
                  toolNumber={data?.tool?.number ?? 0}
                  vibit1Online={vibit1Online}
                  vibit1Data={data?.raw?.vibit1}
                  vibit2Online={vibit2Online}
                  vibit2Data={data?.raw?.vibit2}
                />
              </div>

              {/* Bottom Quick-Metrics Panel */}
              <div className="asm-footer-stats">
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Milling Cycle</div>
                  <div className="asm-val__num" style={{ fontSize: "0.95rem", color: data?.status?.cycle_start ? "#4ade80" : !isConnected || !plcOnline ? "#475569" : "#64748b" }}>
                    {!isConnected || !plcOnline ? "---" : data.status.cycle_start ? "ACTIVE" : "STOPPED"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Coolant Pump</div>
                  <div className="asm-val__num" style={{ fontSize: "0.95rem", color: data?.status?.cycle_start ? "#38bdf8" : !isConnected || !plcOnline ? "#475569" : "#64748b" }}>
                    {!isConnected || !plcOnline ? "---" : data.status.cycle_start ? "ACTIVE" : "OFF"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Target Feed</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem" }}>
                    {isConnected && plcOnline && data?.axes?.x?.feed != null ? Math.round(data.axes.x.feed) : "---"} <span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>mm/m</span>
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Active Tool</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem" }}>
                    {isConnected && plcOnline && data?.tool?.number != null ? `#${data.tool.number}` : "---"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 3: RIGHT PANEL (CNC Block console and axis indicators) */}
          <div className="triac-column">
            {/* CNC G-Code Block Console */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>G-Code Block Execution</span>
                <span className="asm-hud-badge">CONSOLE</span>
              </div>
              <div style={{ background: "#030712", borderRadius: "4px", border: "1px solid var(--border)", padding: "10px", fontFamily: "var(--font-mono)", fontSize: "11px", display: "flex", flexDirection: "column", gap: "6px", minHeight: "84px" }}>
                <div style={{ color: "var(--text-disabled)", fontSize: "9px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "4px", display: "flex", justifyContent: "space-between" }}>
                  <span>ACTIVE BLOCK</span>
                  <span style={{ color: isConnected && plcOnline && data?.spindle?.speed > 0 ? "#fbbf24" : "inherit" }}>
                    {isConnected && plcOnline && data?.spindle?.speed > 0 ? "RUNNING" : "READY"}
                  </span>
                </div>
                <div style={{ color: isConnected && plcOnline ? "#4ade80" : "#ef4444", fontWeight: 700, wordBreak: "break-all" }}>
                  {isConnected && plcOnline ? `${data?.gcode?.block_num || ""} ${data?.gcode?.block || "SYSTEM READY"}` : "SYSTEM OFFLINE"}
                </div>
                {isConnected && plcOnline && data?.gcode?.index >= 0 && data?.gcode?.index !== undefined && (
                  <div style={{ display: "flex", gap: "4px", overflow: "hidden", whiteSpace: "nowrap", opacity: 0.35, fontSize: "9px", color: "var(--text-muted)" }}>
                    <span>STEP INDEX:</span>
                    <span>{data.gcode.index}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Live Axis Telemetry */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span><SensorDot connected={plcOnline} />Axis Positions</span>
                <span className={`asm-hud-badge ${plcOnline ? "asm-hud-badge--active" : ""}`}>
                  {plcOnline ? "TELEM" : "NO DATA"}
                </span>
              </div>

              {/* X Axis */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "0.8rem", fontWeight: 800, color: "#38bdf8" }}>X</span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  <span style={{ fontSize: "0.55rem", color: "#64748b", fontWeight: 600 }}>TRANSVERSE</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div className="asm-val">
                    <div className="asm-val__label">Target Pos</div>
                    <div className="asm-val__num asm-val__num--sm">
                      {sensorVal(data?.axes?.x?.value, 3)}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Smoothed Pos</div>
                    <div className="asm-val__num asm-val__num--sm asm-val__num--glowing-blue">
                      {plcOnline ? smoothedX.toFixed(3) : "---"}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Y Axis */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px", marginTop: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "0.8rem", fontWeight: 800, color: "#4ade80" }}>Y</span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  <span style={{ fontSize: "0.55rem", color: "#64748b", fontWeight: 600 }}>CROSS</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div className="asm-val">
                    <div className="asm-val__label">Target Pos</div>
                    <div className="asm-val__num asm-val__num--sm">
                      {sensorVal(data?.axes?.y?.value, 3)}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Smoothed Pos</div>
                    <div className="asm-val__num asm-val__num--sm asm-val__num--glowing-green">
                      {plcOnline ? smoothedY.toFixed(3) : "---"}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Z Axis */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px", marginTop: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "0.8rem", fontWeight: 800, color: "#ff7b00" }}>Z</span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  <span style={{ fontSize: "0.55rem", color: "#64748b", fontWeight: 600 }}>VERTICAL</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div className="asm-val">
                    <div className="asm-val__label">Target Pos</div>
                    <div className="asm-val__num asm-val__num--sm">
                      {sensorVal(data?.axes?.z?.value, 3)}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Smoothed Pos</div>
                    <div className="asm-val__num asm-val__num--sm" style={{ color: "#fb923c", textShadow: "0 0 8px rgba(251,146,60,0.3)" }}>
                      {plcOnline ? smoothedZ.toFixed(3) : "---"}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sensor Pop-Up Diagnostics Panel Modal Overlay */}
      {activeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setActiveModal(null)}
        >
          <div
            style={{
              background: "#252932",
              border: "1px solid #323842",
              borderRadius: "4px",
              width: "580px",
              maxWidth: "95%",
              padding: "24px",
              animation: "modalFadeIn 0.2s ease-out",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setActiveModal(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "transparent",
                border: "1px solid #323842",
                color: "#e1e2ea",
                borderRadius: "4px",
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "background 0.2s",
                fontWeight: 600,
                fontSize: "13px",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#323842";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
              }}
            >
              ✕
            </button>

            {/* Modal Header */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background:
                      activeModal === "spindle"
                        ? (vibit1Online ? "#3a9d6e" : "transparent")
                        : activeModal === "tool"
                        ? (vibit2Online ? "#3a9d6e" : "transparent")
                        : (vibit3Online ? "#3a9d6e" : "transparent"),
                    border:
                      activeModal === "spindle"
                        ? (vibit1Online ? "none" : "1px solid #c4424b")
                        : activeModal === "tool"
                        ? (vibit2Online ? "none" : "1px solid #c4424b")
                        : (vibit3Online ? "none" : "1px solid #c4424b"),
                  }}
                />
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#e1e2ea", fontFamily: "Inter" }}>
                  {activeModal === "spindle" && "Spindle Diagnostics Panel"}
                  {activeModal === "tool" && "Tool Diagnostics Panel"}
                  {activeModal === "energy" && "Energy Meter Diagnostics Panel"}
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: "11px", color: "#8f9097", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "Inter" }}>
                {activeModal === "spindle" && "Sensor Model: VibIT-VIB-S01 • Device ID 1"}
                {activeModal === "tool" && "Sensor Model: VibIT-VIB-S01 • Device ID 2"}
                {activeModal === "energy" && "Sensor Model: VibIT-PEM-E02 • Device ID 3"}
              </p>
            </div>

            {/* Hardware Specifications */}
            <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "12px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "11px", color: "#8f9097", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "Inter" }}>
                Hardware Specifications
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px", fontFamily: "Inter" }}>
                <div><span style={{ color: "#8f9097" }}>Target Host:</span> <span style={{ fontFamily: "JetBrains Mono", color: "#e1e2ea" }}>10.10.14.129</span></div>
                <div><span style={{ color: "#8f9097" }}>Modbus Port:</span> <span style={{ fontFamily: "JetBrains Mono", color: "#e1e2ea" }}>502</span></div>
                <div><span style={{ color: "#8f9097" }}>Protocol:</span> <span style={{ fontFamily: "JetBrains Mono", color: "#e1e2ea" }}>Modbus TCP/IP (Word-Swapped)</span></div>
                <div><span style={{ color: "#8f9097" }}>Unit ID:</span> <span style={{ fontFamily: "JetBrains Mono", color: "#e1e2ea" }}>{activeModal === "spindle" ? "1" : activeModal === "tool" ? "2" : "3"}</span></div>
                <div><span style={{ color: "#8f9097" }}>Register Type:</span> <span style={{ fontFamily: "JetBrains Mono", color: "#e1e2ea" }}>{activeModal === "spindle" ? (data?.raw?.vibit1?.is_holding === 1 ? "Holding Registers" : "Input Registers") : activeModal === "tool" ? (data?.raw?.vibit2?.is_holding === 1 ? "Holding Registers" : "Input Registers") : "Input Registers"}</span></div>
                <div><span style={{ color: "#8f9097" }}>Status:</span> <span style={{ fontWeight: 700, fontFamily: "Inter", color: activeModal === "spindle" ? (vibit1Online ? "#3a9d6e" : "#c4424b") : activeModal === "tool" ? (vibit2Online ? "#3a9d6e" : "#c4424b") : (vibit3Online ? "#3a9d6e" : "#c4424b") }}>{activeModal === "spindle" ? (vibit1Online ? "ONLINE" : "OFFLINE") : activeModal === "tool" ? (vibit2Online ? "ONLINE" : "OFFLINE") : (vibit3Online ? "ONLINE" : "OFFLINE")}</span></div>
              </div>
            </div>

            {/* Live Metrics */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "11px", color: "#8f9097", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "Inter" }}>
                Decoded Process Variables
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                {activeModal === "spindle" && (
                  <>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "#8f9097", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Vibration</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "#e1e2ea", marginTop: "4px" }}>{sensorVal(data?.spindle?.vibration)} <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: "Inter" }}>mm/s</span></div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "#8f9097", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Temperature</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "#e1e2ea", marginTop: "4px" }}>{sensorVal(data?.spindle?.temperature, 1)} <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: "Inter" }}>°C</span></div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "#8f9097", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Rotational Speed</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "#e1e2ea", marginTop: "4px" }}>{data?.spindle?.speed != null ? Math.round(data.spindle.speed) : "---"} <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: "Inter" }}>RPM</span></div>
                    </div>
                  </>
                )}
                {activeModal === "tool" && (
                  <>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "#8f9097", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Vibration Peak</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "#e1e2ea", marginTop: "4px" }}>{sensorVal(data?.tool?.vibration)} <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: "Inter" }}>mm/s</span></div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "#8f9097", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Temperature</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "#e1e2ea", marginTop: "4px" }}>{sensorVal(data?.tool?.temperature, 1)} <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: "Inter" }}>°C</span></div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "#8f9097", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Reboot Count</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "#e1e2ea", marginTop: "4px" }}>{data?.tool?.reboot_count ?? "---"}</div>
                    </div>
                  </>
                )}
                {activeModal === "energy" && (
                  <>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "#8f9097", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Active Power</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "#3a9d6e", marginTop: "4px" }}>{sensorVal(data?.energy_meter?.power, 3)} <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: "Inter" }}>kW</span></div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center", gridColumn: "span 2" }}>
                      <div style={{ fontSize: "11px", color: "#8f9097", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Accumulated Consumption</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "#e1e2ea", marginTop: "4px" }}>{sensorVal(data?.energy_meter?.kwh, 4)} <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: "Inter" }}>kWh</span></div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Modbus Direct Registers */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "11px", color: "#8f9097", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "Inter" }}>
                Modbus Telemetry Register Table (16-bit word representation)
              </h4>
              <div style={{ overflowX: "auto", border: "1px solid #323842", borderRadius: "4px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", textAlign: "left", fontFamily: "JetBrains Mono" }}>
                  <thead>
                    <tr style={{ background: "#14161a", borderBottom: "1px solid #323842" }}>
                      <th style={{ padding: "8px 12px", color: "#8f9097", fontSize: "10px" }}>ADDRESS</th>
                      <th style={{ padding: "8px 12px", color: "#8f9097", fontSize: "10px" }}>VARIABLE NAME</th>
                      <th style={{ padding: "8px 12px", color: "#8f9097", fontSize: "10px" }}>RAW INT16[2]</th>
                      <th style={{ padding: "8px 12px", color: "#8f9097", fontSize: "10px" }}>HEX WORD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeModal === "spindle" && (
                      <>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b1, 6)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>X-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit1?.x_rms_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit1?.x_rms_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b1, 8)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Y-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit1?.y_rms_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit1?.y_rms_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b1, 10)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Z-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit1?.z_rms_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit1?.z_rms_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b1, 12)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Temperature</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit1?.temperature, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit1?.temperature, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b1, 38)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Rotational Speed (RPM)</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit1?.rpm, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit1?.rpm, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "tool" && (
                      <>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b2, 20)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>X-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit2?.x_peak_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit2?.x_peak_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b2, 22)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Y-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit2?.y_peak_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit2?.y_peak_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b2, 24)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Z-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit2?.z_peak_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit2?.z_peak_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b2, 12)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Temperature</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{floatToRegs(data?.raw?.vibit2?.temperature, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{floatToRegs(data?.raw?.vibit2?.temperature, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{getRegRange(b2, 30)}</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Reboot Count</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{[data?.raw?.vibit2?.reboot_count ?? 0, 0].join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{[`0x${(data?.raw?.vibit2?.reboot_count ?? 0).toString(16).toUpperCase()}`, "0x0000"].join(", ")}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "energy" && (
                      <>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>42-43</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Active Power (kW)</td>
                          <td style={{ padding: "8px 12px", color: "#3a9d6e" }}>{data?.energy_meter?.raw_power_regs?.join(", ") || "---"}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{data?.energy_meter?.raw_power_regs?.map(r => "0x" + r.toString(16).toUpperCase()).join(", ") || "---"}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>58-59</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>Total Active Energy (kWh)</td>
                          <td style={{ padding: "8px 12px", color: "#e1e2ea" }}>{data?.energy_meter?.raw_kwh_regs?.join(", ") || "---"}</td>
                          <td style={{ padding: "8px 12px", color: "#8f9097" }}>{data?.energy_meter?.raw_kwh_regs?.map(r => "0x" + r.toString(16).toUpperCase()).join(", ") || "---"}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer position="bottom-right" autoClose={4000} closeOnClick pauseOnHover />
    </div>
  );
}
