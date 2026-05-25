import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import PageHeader from "../components/PageHeader";
import TriacStatusRibbon from "./asrs/components/TriacStatusRibbon";
import TriacControlService from "../services/TriacControl";
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
 * Small inline dot indicator for sensor connectivity
 */
const SensorDot = ({ connected }) => (
  <span
    style={{
      display: "inline-block",
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: connected ? "#4ade80" : "#ef4444",
      boxShadow: connected
        ? "0 0 6px rgba(74, 222, 128, 0.5)"
        : "0 0 6px rgba(239, 68, 68, 0.5)",
      marginRight: 6,
      verticalAlign: "middle",
    }}
  />
);

/**
 * High-Fidelity SVG milling machine viewer
 */
const TriacMachineView = ({ spindleRPM, xAxisValue, yAxisValue, zAxisValue, spindleRunning, alarmActive, coolantOn, toolNumber }) => {
  // Normalize axes for display in SVG (0 to 100/150 ranges)
  const normX = Math.min(1, Math.max(0, xAxisValue / 100));
  const normY = Math.min(1, Math.max(0, yAxisValue / 100));
  const normZ = Math.min(1, Math.max(0, zAxisValue / 150));

  // Translate coordinates for visual elements in SVG
  const bedX = 140 + normX * 80;        // Bed X movement range
  const bedY = 220 + normY * 20;        // Bed depth representation
  const spindleHeadZ = 50 + (1 - normZ) * 80; // Spindle head vertical movement

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "340px", background: "#060b13", borderRadius: "10px", border: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
      {/* SVG drawing */}
      <svg width="100%" height="340" viewBox="0 0 400 340" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transition: "all 0.3s ease" }}>
        {/* Background Grid */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.015)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Machine Enclosure */}
        <rect x="20" y="20" width="360" height="300" rx="6" fill="#090e17" stroke="rgba(255,255,255,0.03)" strokeWidth="2" />
        <rect x="25" y="25" width="350" height="290" rx="4" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

        {/* Linear rails Z-Axis */}
        <line x1="180" y1="40" x2="180" y2="220" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeLinecap="round" />
        <line x1="220" y1="40" x2="220" y2="220" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeLinecap="round" />

        {/* Vertical Spindle Head (Z-Axis sliding block) */}
        <g transform={`translate(0, ${spindleHeadZ})`}>
          {/* Spindle Column Carriage */}
          <rect x="170" y="-30" width="60" height="80" rx="3" fill="linear-gradient(90deg, #1e293b 0%, #334155 100%)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <rect x="175" y="-25" width="50" height="70" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />

          {/* Spindle Motor Block */}
          <rect x="180" y="0" width="40" height="50" rx="2" fill="url(#spindleGrad)" stroke="#475569" strokeWidth="1" />
          
          {/* Spindle Shaft / Chuck */}
          <rect x="194" y="50" width="12" height="15" fill="#94a3b8" />
          <rect x="190" y="65" width="20" height="8" rx="1" fill="#475569" />

          {/* Rotating Milling Bit (Cutting tool) */}
          <path d="M 197 73 L 203 73 L 202 93 L 200 98 L 198 93 Z" fill={spindleRunning ? "#cbd5e1" : "#64748b"} />
          
          {/* Spindle rotational arrows (when running) */}
          {spindleRunning && (
            <g style={{ transformOrigin: "200px 83px", animation: "spin 0.2s linear infinite" }}>
              <path d="M 186 83 A 14 14 0 0 1 214 83" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
              <path d="M 214 83 A 14 14 0 0 1 186 83" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
            </g>
          )}

          {/* Coolant spray nozzles and liquid lines */}
          <line x1="175" y1="50" x2="190" y2="78" stroke="#475569" strokeWidth="2.5" />
          <line x1="225" y1="50" x2="210" y2="78" stroke="#475569" strokeWidth="2.5" />
          
          {coolantOn && (
            <g opacity="0.8">
              {/* Animated coolant droplets */}
              <line x1="190" y1="78" x2="196" y2="92" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 3" style={{ animation: "coolantFlow 0.5s linear infinite" }} />
              <line x1="210" y1="78" x2="204" y2="92" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 3" style={{ animation: "coolantFlow 0.5s linear infinite" }} />
            </g>
          )}
        </g>

        {/* Horizontal Slide Guide Rails (X-Axis) */}
        <rect x="80" y="240" width="240" height="12" fill="#1e293b" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <line x1="82" y1="244" x2="318" y2="244" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
        <line x1="82" y1="248" x2="318" y2="248" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />

        {/* Milling Table (X-Axis block moving horizontally) */}
        <g transform={`translate(${bedX - 180}, 0)`}>
          {/* Table saddle structure */}
          <rect x="120" y="232" width="120" height="12" rx="2" fill="#334155" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          
          {/* Table Slot Lines */}
          <line x1="130" y1="236" x2="230" y2="236" stroke="#0f172a" strokeWidth="1.5" />
          <line x1="130" y1="240" x2="230" y2="240" stroke="#0f172a" strokeWidth="1.5" />

          {/* Vise base & jaws */}
          <rect x="150" y="222" width="60" height="10" fill="#475569" stroke="#334155" strokeWidth="1" />
          <rect x="155" y="212" width="10" height="10" fill="#64748b" />
          <rect x="195" y="212" width="10" height="10" fill="#64748b" />
          
          {/* Simulated workpiece block (metal stock) */}
          <rect x="165" y="207" width="30" height="15" fill="#94a3b8" stroke="#cbd5e1" strokeWidth="1" />
          
          {/* Cutting Sparks (when spindle running and Z axis is down in cut range) */}
          {spindleRunning && zAxisValue < 20 && (
            <g>
              <circle cx="180" cy="207" r="1.5" fill="#f97316" style={{ animation: "sparkFlicker 0.1s infinite" }} />
              <path d="M 180 207 L 172 198 M 180 207 L 188 196 M 180 207 L 175 204 M 180 207 L 185 203" stroke="#fca5a5" strokeWidth="1" style={{ animation: "sparkBurst 0.15s infinite" }} />
            </g>
          )}
        </g>

        {/* Gradients */}
        <defs>
          <linearGradient id="spindleGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="50%" stopColor="#475569" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>
      </svg>

      {/* CSS Styles for animations */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes coolantFlow {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -5; }
          }
          @keyframes sparkFlicker {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.3); }
          }
          @keyframes sparkBurst {
            0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
            50% { opacity: 1; }
            100% { opacity: 0; transform: translate(var(--x, 2px), var(--y, -3px)) scale(1.2); }
          }
        `}
      </style>

      {/* Safety curtain breached overlay */}
      {alarmActive && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(239,68,68,0.12)", border: "2px solid #ef4444", borderRadius: "10px", pointerEvents: "none", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", animation: "flashBorder 1s infinite alternate" }}>
          <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid #ef4444", padding: "10px 16px", borderRadius: "4px", color: "#ef4444", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em" }}>
            SAFETY SHUTDOWN ACTIVE
          </div>
        </div>
      )}
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
        const payload = JSON.parse(e.data);
        if (payload) {
          setData(payload);

          // Capture raw coordinates instantly in refs for physics loop to bypass React lag
          if (payload.axes?.x?.value !== undefined && payload.axes?.x?.value !== null) {
            targetXRef.current = payload.axes.x.value;
          }
          if (payload.axes?.y?.value !== undefined && payload.axes?.y?.value !== null) {
            targetYRef.current = payload.axes.y.value;
          }
          if (payload.axes?.z?.value !== undefined && payload.axes?.z?.value !== null) {
            targetZRef.current = payload.axes.z.value;
          }
        }
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
            background: "rgba(3, 7, 18, 0.75)",
            backdropFilter: "blur(10px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setActiveModal(null)}
        >
          <div
            style={{
              background: "rgba(10, 15, 30, 0.96)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              width: "580px",
              maxWidth: "95%",
              padding: "24px",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.85), 0 0 32px rgba(56, 189, 248, 0.05)",
              animation: "modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
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
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-secondary)",
                borderRadius: "50%",
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                fontWeight: 700,
                fontSize: "13px",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255,255,255,0.08)";
                e.target.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(255,255,255,0.03)";
                e.target.style.color = "var(--text-secondary)";
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
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background:
                      activeModal === "spindle"
                        ? (vibit1Online ? "#4ade80" : "#ef4444")
                        : activeModal === "tool"
                        ? (vibit2Online ? "#4ade80" : "#ef4444")
                        : (vibit3Online ? "#4ade80" : "#ef4444"),
                    boxShadow: `0 0 8px ${
                      activeModal === "spindle"
                        ? (vibit1Online ? "#4ade80" : "#ef4444")
                        : activeModal === "tool"
                        ? (vibit2Online ? "#4ade80" : "#ef4444")
                        : (vibit3Online ? "#4ade80" : "#ef4444")
                    }`,
                  }}
                />
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  {activeModal === "spindle" && "Spindle Diagnostics Panel"}
                  {activeModal === "tool" && "Tool Diagnostics Panel"}
                  {activeModal === "energy" && "Energy Meter Diagnostics Panel"}
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                {activeModal === "spindle" && "Sensor Model: VibIT-VIB-S01 • Device ID 1"}
                {activeModal === "tool" && "Sensor Model: VibIT-VIB-S01 • Device ID 2"}
                {activeModal === "energy" && "Sensor Model: VibIT-PEM-E02 • Device ID 3"}
              </p>
            </div>

            {/* Hardware Specifications */}
            <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px", padding: "12px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.68rem", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Hardware Specifications
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
                <div><span style={{ color: "var(--text-muted)" }}>Target Host:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>10.10.14.129</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Modbus Port:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>502</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Protocol:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>Modbus TCP/IP (Word-Swapped)</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Unit ID:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{activeModal === "spindle" ? "1" : activeModal === "tool" ? "2" : "3"}</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Register Type:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{activeModal === "spindle" ? (data?.raw?.vibit1?.is_holding === 1 ? "Holding Registers" : "Input Registers") : activeModal === "tool" ? (data?.raw?.vibit2?.is_holding === 1 ? "Holding Registers" : "Input Registers") : "Input Registers"}</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Status:</span> <span style={{ fontWeight: 700, color: activeModal === "spindle" ? (vibit1Online ? "#4ade80" : "#ef4444") : activeModal === "tool" ? (vibit2Online ? "#4ade80" : "#ef4444") : (vibit3Online ? "#4ade80" : "#ef4444") }}>{activeModal === "spindle" ? (vibit1Online ? "ONLINE" : "OFFLINE") : activeModal === "tool" ? (vibit2Online ? "ONLINE" : "OFFLINE") : (vibit3Online ? "ONLINE" : "OFFLINE")}</span></div>
              </div>
            </div>

            {/* Live Metrics */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.68rem", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Decoded Process Variables
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                {activeModal === "spindle" && (
                  <>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Vibration</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>{sensorVal(data?.spindle?.vibration)} <span style={{ fontSize: "10px", fontWeight: 600 }}>mm/s</span></div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Temperature</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>{sensorVal(data?.spindle?.temperature, 1)} <span style={{ fontSize: "10px", fontWeight: 600 }}>°C</span></div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Rotational Speed</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>{data?.spindle?.speed != null ? Math.round(data.spindle.speed) : "---"} <span style={{ fontSize: "10px", fontWeight: 600 }}>RPM</span></div>
                    </div>
                  </>
                )}
                {activeModal === "tool" && (
                  <>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Vibration Peak</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fb923c", marginTop: "4px" }}>{sensorVal(data?.tool?.vibration)} <span style={{ fontSize: "10px", fontWeight: 600 }}>mm/s</span></div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Temperature</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>{sensorVal(data?.tool?.temperature, 1)} <span style={{ fontSize: "10px", fontWeight: 600 }}>°C</span></div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Reboot Count</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>{data?.tool?.reboot_count ?? "---"}</div>
                    </div>
                  </>
                )}
                {activeModal === "energy" && (
                  <>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Active Power</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#4ade80", marginTop: "4px" }}>{sensorVal(data?.energy_meter?.power, 3)} <span style={{ fontSize: "10px", fontWeight: 600 }}>kW</span></div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "10px", textAlign: "center", gridColumn: "span 2" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Accumulated Consumption</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>{sensorVal(data?.energy_meter?.kwh, 4)} <span style={{ fontSize: "10px", fontWeight: 600 }}>kWh</span></div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Modbus Direct Registers */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.68rem", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Modbus Telemetry Register Table (16-bit word representation)
              </h4>
              <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", textAlign: "left", fontFamily: "var(--font-mono)" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "9px" }}>ADDRESS</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "9px" }}>VARIABLE NAME</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "9px" }}>RAW INT16[2]</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "9px" }}>HEX WORD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeModal === "spindle" && (
                      <>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 6)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>X-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>{floatToRegs(data?.raw?.vibit1?.x_rms_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.x_rms_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 8)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Y-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>{floatToRegs(data?.raw?.vibit1?.y_rms_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.y_rms_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 10)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Z-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>{floatToRegs(data?.raw?.vibit1?.z_rms_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.z_rms_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 12)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Temperature</td>
                          <td style={{ padding: "8px 12px" }}>{floatToRegs(data?.raw?.vibit1?.temperature, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.temperature, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 38)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Rotational Speed (RPM)</td>
                          <td style={{ padding: "8px 12px" }}>{floatToRegs(data?.raw?.vibit1?.rpm, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.rpm, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "tool" && (
                      <>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 20)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>X-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#fb923c" }}>{floatToRegs(data?.raw?.vibit2?.x_peak_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit2?.x_peak_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 22)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Y-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#fb923c" }}>{floatToRegs(data?.raw?.vibit2?.y_peak_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit2?.y_peak_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 24)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Z-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#fb923c" }}>{floatToRegs(data?.raw?.vibit2?.z_peak_vel, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit2?.z_peak_vel, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 12)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Temperature</td>
                          <td style={{ padding: "8px 12px" }}>{floatToRegs(data?.raw?.vibit2?.temperature, true).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit2?.temperature, true).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 30)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Reboot Count</td>
                          <td style={{ padding: "8px 12px" }}>{[data?.raw?.vibit2?.reboot_count ?? 0, 0].join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{[`0x${(data?.raw?.vibit2?.reboot_count ?? 0).toString(16).toUpperCase()}`, "0x0000"].join(", ")}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "energy" && (
                      <>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>42-43</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Active Power (kW)</td>
                          <td style={{ padding: "8px 12px", color: "#4ade80" }}>{data?.energy_meter?.raw_power_regs?.join(", ") || "---"}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{data?.energy_meter?.raw_power_regs?.map(r => "0x" + r.toString(16).toUpperCase()).join(", ") || "---"}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>58-59</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Total Active Energy (kWh)</td>
                          <td style={{ padding: "8px 12px" }}>{data?.energy_meter?.raw_kwh_regs?.join(", ") || "---"}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{data?.energy_meter?.raw_kwh_regs?.map(r => "0x" + r.toString(16).toUpperCase()).join(", ") || "---"}</td>
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
