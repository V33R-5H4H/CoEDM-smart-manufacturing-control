import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { toast } from "react-toastify";
import MiracControlService from "../services/MiracControl";
import MiracMachineView from "../components/MiracMachineView";
import PageHeader from "../components/PageHeader";
import MiracStatusRibbon from "./asrs/components/MiracStatusRibbon";
import { deepMerge } from "../utils/deepMerge";
import { useModal } from "../hooks/useModal";
import "./Assembly.css";
import "./Mirac.css";

/**
 * Helper: render a sensor value or "---" if null/undefined (sensor offline).
 * This ensures the user can distinguish "sensor reads zero" from "sensor disconnected".
 */
const sensorVal = (value, decimals = 2, fallback = "---") => {
  if (value === null || value === undefined) return fallback;
  return Number(value).toFixed(decimals);
};

/**
 * ISO 10816 vibration severity colour coding (velocity RMS in mm/s):
 * < 2.8  → green  (Zone A — new machinery)
 * 2.8–7.1 → amber  (Zone B — acceptable for long-term)
 * 7.1–18  → orange (Zone C — alarm, short-term only)
 * > 18    → red    (Zone D — danger)
 */
const vibColor = (value) => {
  if (value === null || value === undefined) return 'var(--text-muted)';
  if (value < 2.8) return 'var(--status-ok)';
  if (value < 7.1) return '#c9922e';
  if (value < 18)  return '#f97316';
  return 'var(--status-error)';
};

/**
 * Helper to convert Float32 to two 16-bit registers (Modbus registers representation)
 */
const floatToRegs = (val, swap = false) => {
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
      background: connected ? "var(--status-ok)" : "var(--status-error)",
      marginRight: 6,
      verticalAlign: "middle",
    }}
  />
);

import { wsCache } from "../utils/wsCache";

// --- Main Page Component ---
const Mirac = () => {
  const [data, setData] = useState(wsCache.mirac);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState("disconnected"); // 'connected', 'connecting', 'disconnected'
  const [isConnected, setIsConnected] = useState(false); // OPC-UA connectivity
  const [statusLoading, setStatusLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("monitoring");
  const { activeModal, openModal, closeModal } = useModal();
  const [energyHistory, setEnergyHistory] = useState([]);

  // machineViewRef exposes setPosition() for imperative 60fps SVG updates (no React setState)
  const machineViewRef = useRef(null);

  // Refs for tracking target coordinates and physics state
  const targetXRef = useRef(0);
  const targetZRef = useRef(0);
  // Ref that always holds the latest merged data (avoids stale closure in onmessage)
  const dataRef = useRef(wsCache.mirac);
  const smoothedXRef = useRef(0);
  const smoothedZRef = useRef(0);
  const velocityXRef = useRef(0);
  const velocityZRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());

  // VibIT last-seen timestamps (shown when sensor is offline but cached data exists)
  const vibit1LastSeenRef = useRef(null);
  const vibit2LastSeenRef = useRef(null);
  const vibit3LastSeenRef = useRef(null);
  const [vibit1LastSeen, setVibit1LastSeen] = useState(null);
  const [vibit2LastSeen, setVibit2LastSeen] = useState(null);
  const [vibit3LastSeen, setVibit3LastSeen] = useState(null);

  // WebSocket references
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const containerRef = useRef(null);

  // Data source connectivity flags from backend
  const dataSources = data?.data_sources || {};
  const plcOnline = dataSources.plc ?? false;
  const vibit1Online = dataSources.vibit1 ?? false;
  const vibit2Online = dataSources.vibit2 ?? false;
  const vibit3Online = dataSources.vibit3 ?? false;

  const b1 = data?.raw?.vibit1?.base_address ?? 4001;
  const b2 = data?.raw?.vibit2?.base_address ?? 4001;

  // Dynamic Neon HUD Glows
  const spindleGlow = useMemo(() => {
    const speed = data?.spindle?.speed || 0;
    if (!vibit1Online) return {
      border: '1px solid rgba(239, 68, 68, 0.25)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 12px rgba(239, 68, 68, 0.1)',
      background: 'rgba(239, 68, 68, 0.02)'
    };
    if (speed > 0) return {
      border: '1px solid rgba(56, 189, 248, 0.45)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65), 0 0 18px rgba(56, 189, 248, 0.25)',
      background: 'rgba(10, 15, 25, 0.75)'
    };
    return {
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)'
    };
  }, [vibit1Online, data?.spindle?.speed]);

  const toolGlow = useMemo(() => {
    const cycleStart = data?.status?.cycle_start || false;
    if (!vibit2Online) return {
      border: '1px solid rgba(239, 68, 68, 0.25)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 12px rgba(239, 68, 68, 0.1)',
      background: 'rgba(239, 68, 68, 0.02)'
    };
    if (cycleStart) return {
      border: '1px solid rgba(249, 115, 22, 0.45)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65), 0 0 18px rgba(249, 115, 22, 0.25)',
      background: 'rgba(10, 15, 25, 0.75)'
    };
    return {
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)'
    };
  }, [vibit2Online, data?.status?.cycle_start]);

  // Establish WebSocket connection to backend broadcaster
  const connectWS = useCallback(() => {
    setWsStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
    const wsUrl = `${wsBase}/api/control/mirac/ws/vibit-data`;

    console.log("[Mirac] Connecting to MIRAC telemetry WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Mirac] MIRAC WebSocket connected");
      setIsWsConnected(true);
      setWsStatus("connected");
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === "snapshot") {
          // Full state replacement — first message or new client
          dataRef.current = msg.data;
          wsCache.mirac = msg.data;
          setData(msg.data);
          if (msg.data.axes?.x?.value != null) targetXRef.current = msg.data.axes.x.value;
          if (msg.data.axes?.z?.value != null) targetZRef.current = msg.data.axes.z.value;

        } else if (msg.type === "delta") {
          // Partial update — merge into current state
          const merged = deepMerge(dataRef.current, msg.data);
          dataRef.current = merged;
          wsCache.mirac = merged;
          setData(merged);
          // Only update axis refs when those keys are present in the delta
          if (msg.data.axes?.x?.value != null) targetXRef.current = msg.data.axes.x.value;
          if (msg.data.axes?.z?.value != null) targetZRef.current = msg.data.axes.z.value;

        }
        // heartbeat: connection is alive, nothing to update in the UI

        // Update last-seen timestamps for VibIT sensors (Change 1 & 6)
        const latestData = dataRef.current;
        if (latestData) {
          const now = new Date();
          const timeStr = now.toTimeString().slice(0, 8);
          if (latestData?.data_sources?.vibit1) { vibit1LastSeenRef.current = timeStr; setVibit1LastSeen(timeStr); }
          if (latestData?.data_sources?.vibit2) { vibit2LastSeenRef.current = timeStr; setVibit2LastSeen(timeStr); }
          if (latestData?.data_sources?.vibit3) { vibit3LastSeenRef.current = timeStr; setVibit3LastSeen(timeStr); }
          if (latestData?.energy_meter?.power != null) {
            setEnergyHistory(prev => [...prev.slice(-9), latestData.energy_meter.power]);
          }
        }

      } catch (err) {
        console.error("[Mirac] Error parsing WebSocket message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[Mirac] MIRAC WebSocket error:", err);
      setIsWsConnected(false);
      setWsStatus("disconnected");
    };

    ws.onclose = () => {
      console.warn("[Mirac] MIRAC WebSocket closed, reconnecting in 3s...");
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
        const res = await MiracControlService.getConnectionStatus();
        setIsConnected(!!res.connected);
      } catch (e) {
        console.error("[Mirac] Error getting connection status:", e);
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

      // Compute the SVG pixel coordinates
      let displayX, displayZ;
      if (Math.abs(nextX - targetX) < 0.05 && Math.abs(nextVX) < 0.1) {
        smoothedXRef.current = targetX;
        velocityXRef.current = 0;
        displayX = targetX;
      } else {
        smoothedXRef.current = nextX;
        velocityXRef.current = nextVX;
        displayX = nextX;
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
        displayZ = targetZ;
      } else {
        smoothedZRef.current = nextZ;
        velocityZRef.current = nextVZ;
        displayZ = nextZ;
      }

      // Drive SVG directly — no React setState, no reconciliation
      if (machineViewRef.current) {
        const normalizedZ = Math.min(1, Math.max(0, Math.abs(displayZ) / 300));
        const tx = 170 - normalizedZ * 530;
        const normalizedX = Math.min(1, Math.max(0, Math.abs(displayX) / 100));
        const ty = 10 + normalizedX * 90;
        machineViewRef.current.setPosition(tx, ty);
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

  // Close modal on Escape key — handled by useModal hook

  const handleConnect = async () => {
    setStatusLoading(true);
    try {
      const res = await MiracControlService.connect();
      if (res.success) {
        setIsConnected(true);
        toast.success(res.message || "Connected to MIRAC-PC OPC-UA Gateway");
      } else {
        toast.error(res.message || "Failed to connect to MIRAC-PC");
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
      const res = await MiracControlService.disconnect();
      if (res.success) {
        setIsConnected(false);
        toast.success(res.message || "Disconnected from MIRAC-PC OPC-UA Gateway");
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
      {/* Header aligned with ASRS and Assembly modules */}
      <PageHeader
        title="Smart MIRAC"
        subtitle="CNC Lathe Monitoring"
        actions={
          <>
            <MiracStatusRibbon
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
                  fontSize: '14px',
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
                  fontSize: '14px',
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
                fontSize: '14px',
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
            fontSize: '12px',
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
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: greenActive ? '#4ade80' : 'var(--text-disabled)' }}>RUN</span>
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
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: orangeActive ? '#fbbf24' : 'var(--text-disabled)' }}>BUSY</span>
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
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: redActive ? '#ef4444' : 'var(--text-disabled)' }}>FLT</span>
          </div>
        </div>
      </div>

      <div className="asm-body">
        <div className="mirac-grid-container">
          {/* COLUMN 1: LEFT HUD (Status LEDs, Vibit Sensors) */}
          <div className="mirac-column">
            {/* Status Tower Lights */}
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
              onClick={() => flushSync(() => openModal("spindle"))}
              title="Click to open detailed diagnostics panel"
            >
              <div className="asm-hud-header">
                <span><SensorDot connected={vibit1Online} />Vibit Spindle Sensor (U1)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className={`asm-hud-badge ${vibit1Online && data?.spindle?.speed > 0 ? "asm-hud-badge--active" : ""}`}>
                    {!vibit1Online ? "OFFLINE" : data?.spindle?.speed > 0 ? "SPINNING" : "IDLE"}
                  </span>
                  {!vibit1Online && vibit1LastSeen && (
                    <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#475569', fontWeight: 600 }}>
                      LAST: {vibit1LastSeen}
                    </span>
                  )}
                </div>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Vibration</div>
                  <div className="asm-val__num" style={{ color: vibColor(data?.spindle?.vibration) }}>
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
              onClick={() => flushSync(() => openModal("tool"))}
              title="Click to open detailed diagnostics panel"
            >
              <div className="asm-hud-header">
                <span><SensorDot connected={vibit2Online} />Vibit Tool Sensor (U2)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className={`asm-hud-badge ${vibit2Online ? "asm-hud-badge--active" : ""}`}>
                    {vibit2Online ? "ACTIVE" : "OFFLINE"}
                  </span>
                  {!vibit2Online && vibit2LastSeen && (
                    <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#475569', fontWeight: 600 }}>
                      LAST: {vibit2LastSeen}
                    </span>
                  )}
                </div>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Vibration</div>
                  <div className="asm-val__num" style={{ color: vibColor(data?.tool?.vibration) }}>
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
              onClick={() => flushSync(() => openModal("energy"))}
              title="Click to open detailed diagnostics panel"
            >
              <div className="asm-hud-header">
                <span><SensorDot connected={vibit3Online} />Energy Meter (U3)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className={`asm-hud-badge ${vibit3Online ? "asm-hud-badge--active" : ""}`}>
                    {vibit3Online ? "LIVE" : "OFFLINE"}
                  </span>
                  {!vibit3Online && vibit3LastSeen && (
                    <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#475569', fontWeight: 600 }}>
                      LAST: {vibit3LastSeen}
                    </span>
                  )}
                </div>
              </div>
              {data?.energy_meter ? (
                <>
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
                  {energyHistory.length > 1 && (
                  <div style={{ marginTop: '6px' }}>
                    <div className="asm-val__label">Power Trend</div>
                    <svg width="100%" height="28" viewBox="0 0 100 28" preserveAspectRatio="none" style={{ display: 'block', marginTop: '4px' }}>
                      {(() => {
                        const max = Math.max(...energyHistory, 0.001);
                        const min = Math.min(...energyHistory);
                        const range = max - min || 1;
                        const pts = energyHistory.map((v, i) => {
                          const x = (i / (energyHistory.length - 1)) * 100;
                          const y = 24 - ((v - min) / range) * 20;
                          return x + ',' + y;
                        }).join(' ');
                        const lastX = 100;
                        const lastY = 24 - ((energyHistory[energyHistory.length - 1] - min) / range) * 20;
                        return (
                          <>
                            <polyline points={pts} fill="none" stroke="var(--status-ok)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                            <circle cx={lastX} cy={lastY} r="2.5" fill="var(--status-ok)" />
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                )}
                </>
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
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    No Energy Meter Connected
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2: CENTER PANEL (Lathe Machine SVG Visualizer & Footer Stats) */}
          <div className="mirac-column" style={{ overflow: "hidden" }}>
            <div className="asm-center-container" ref={containerRef}>
              {/* High-Fidelity SVG Viewer */}
              <div className="asm-viz-panel" style={{ position: "relative" }}>
                <MiracMachineView
                  ref={machineViewRef}
                  spindleRPM={data?.spindle?.speed || 0}
                  spindleRunning={data?.status?.cycle_start || false}
                  alarmActive={data?.status?.red || false}
                  toolEngaged={data?.status?.cycle_start && smoothedXRef.current > 10}
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
                  <div className="asm-val__label">Spindle State</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: data?.status?.cycle_start ? "#4ade80" : data?.status?.cycle_start === null ? "#475569" : "#64748b" }}>
                    {data?.status?.cycle_start === null ? "---" : data?.status?.cycle_start ? "RUNNING" : "STOPPED"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Pneumatic Chuck</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: data?.status?.pneumatic_chuck ? "#38bdf8" : data?.status?.pneumatic_chuck === null ? "#475569" : "#64748b" }}>
                    {data?.status?.pneumatic_chuck === null ? "---" : data?.status?.pneumatic_chuck ? "CLAMPED" : "OPEN"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Speed Feed</div>
                  <div className="asm-val__num" style={{ fontSize: "1.3rem" }}>
                    {data?.spindle?.speed != null ? Math.round(data.spindle.speed) : "---"} <span className="asm-val__unit">RPM</span>
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Active Tool</div>
                  <div className="asm-val__num" style={{ fontSize: "1.3rem" }}>
                    {data?.tool?.number != null ? `#${data.tool.number}` : "---"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 3: RIGHT HUD (OPC-UA connection status, controls, and axis telemetry feed) */}
          <div className="mirac-column">
            {/* Live Axis Telemetry */}
            <div
              className="asm-hud-card asm-hud-card--clickable"
              onClick={() => flushSync(() => openModal("axis"))}
            >
              <div className="asm-hud-header">
                <span><SensorDot connected={plcOnline} />Axis Positions</span>
                <span className={`asm-hud-badge ${plcOnline ? "asm-hud-badge--active" : ""}`}>
                  {plcOnline ? "TELEM" : "NO DATA"}
                </span>
              </div>

              {/* X Axis */}
              <div className="asm-axis-section">
                <div className="asm-axis-header">
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#38bdf8" }}>X</span>
                  <div className="asm-axis-line" />
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>TRANSVERSE</span>
                </div>
                <div className="asm-val-grid">
                  <div className="asm-val">
                    <div className="asm-val__label">Raw Pos</div>
                    <div className="asm-val__num asm-val__num--sm">
                      {sensorVal(data?.axes?.x?.value, 3)}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Smoothed Pos</div>
                    <div className="asm-val__num asm-val__num--sm asm-val__num--glowing-blue">
                      {plcOnline ? smoothedXRef.current.toFixed(3) : "---"}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                </div>
                <div className="asm-val" style={{ marginTop: "6px" }}>
                  <div className="asm-val__label">Feed Rate</div>
                  <div className="asm-val__num asm-val__num--sm">
                    {sensorVal(data?.axes?.x?.feed, 1)}
                    <span className="asm-val__unit">mm/min</span>
                  </div>
                </div>
                {/* Position bar — X axis */}
                <div style={{ marginTop: '4px' }}>
                  <div style={{ width: '100%', height: '3px', background: '#1f2937', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, ((data?.axes?.x?.value ?? 0) / 300) * 100))}%`,
                      background: '#38bdf8',
                      borderRadius: '2px',
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    <span>0</span><span>300mm</span>
                  </div>
                </div>
              </div>

              {/* Z Axis */}
              <div className="asm-axis-section" style={{ marginTop: "8px" }}>
                <div className="asm-axis-header">
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#ff7b00" }}>Z</span>
                  <div className="asm-axis-line" />
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>LONGITUDINAL</span>
                </div>
                <div className="asm-val-grid">
                  <div className="asm-val">
                    <div className="asm-val__label">Raw Pos</div>
                    <div className="asm-val__num asm-val__num--sm">
                      {sensorVal(data?.axes?.z?.value, 3)}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Smoothed Pos</div>
                    <div className="asm-val__num asm-val__num--sm asm-val__num--glowing-orange">
                      {plcOnline ? smoothedZRef.current.toFixed(3) : "---"}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                </div>
                <div className="asm-val" style={{ marginTop: "6px" }}>
                  <div className="asm-val__label">Feed Rate</div>
                  <div className="asm-val__num asm-val__num--sm">
                    {sensorVal(data?.axes?.z?.feed, 1)}
                    <span className="asm-val__unit">mm/min</span>
                  </div>
                </div>
                {/* Position bar — Z axis */}
                <div style={{ marginTop: '4px' }}>
                  <div style={{ width: '100%', height: '3px', background: '#1f2937', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, ((data?.axes?.z?.value ?? 0) / 200) * 100))}%`,
                      background: '#fb923c',
                      borderRadius: '2px',
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    <span>0</span><span>200mm</span>
                  </div>
                </div>
              </div>

              {/* Axis Vibration summary */}
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
          onClick={() => closeModal()}
        >
          <div
            style={{
              background: "var(--border)",
              border: "1px solid var(--border)",
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
              onClick={() => closeModal()}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                borderRadius: "4px",
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "background 0.2s",
                fontWeight: 600,
                fontSize: "16px",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "var(--border)";
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
                        ? (vibit1Online ? "var(--status-ok)" : "transparent")
                        : activeModal === "tool"
                        ? (vibit2Online ? "var(--status-ok)" : "transparent")
                        : activeModal === "energy"
                        ? (vibit3Online ? "var(--status-ok)" : "transparent")
                        : (plcOnline ? "var(--status-ok)" : "transparent"),
                    border:
                      activeModal === "spindle"
                        ? (vibit1Online ? "none" : "1px solid var(--status-error)")
                        : activeModal === "tool"
                        ? (vibit2Online ? "none" : "1px solid var(--status-error)")
                        : activeModal === "energy"
                        ? (vibit3Online ? "none" : "1px solid var(--status-error)")
                        : (plcOnline ? "none" : "1px solid var(--status-error)"),
                  }}
                />
                <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary)", fontFamily: "Inter" }}>
                  {activeModal === "spindle" && "Spindle Diagnostics Panel"}
                  {activeModal === "tool" && "Tool Diagnostics Panel"}
                  {activeModal === "energy" && "Energy Meter Diagnostics Panel"}
                  {activeModal === "axis" && "Axis Kinematics Panel"}
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "Inter" }}>
                {activeModal === "spindle" && "Sensor Model: VibIT-VIB-S01 • Device ID 1"}
                {activeModal === "tool" && "Sensor Model: VibIT-VIB-S01 • Device ID 2"}
                {activeModal === "energy" && "Sensor Model: VibIT-PEM-E02 • Device ID 3"}
                {activeModal === "axis" && "Controller: SIEMENS 828D • Node: MIRAC_PC"}
              </p>
            </div>

            {/* Hardware Specifications */}
            <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "12px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "Inter" }}>
                Hardware Specifications
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "14px", fontFamily: "Inter" }}>
                {activeModal === "axis" ? (
                  <>
                    <div><span style={{ color: "var(--text-muted)" }}>Target Host:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>10.10.14.103</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Port:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>4840</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Protocol:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>OPC-UA (TCP/IP)</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Namespace:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>ns=3</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Variable Type:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>Double (Float64)</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Status:</span> <span style={{ fontWeight: 700, fontFamily: "Inter", color: plcOnline ? "var(--status-ok)" : "var(--status-error)" }}>{plcOnline ? "ONLINE" : "OFFLINE"}</span></div>
                  </>
                ) : (
                  <>
                    <div><span style={{ color: "var(--text-muted)" }}>Target Host:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>10.10.14.103</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Modbus Port:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>502</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Protocol:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>Modbus TCP/IP</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Unit ID:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>{activeModal === "spindle" ? "1" : activeModal === "tool" ? "2" : "3"}</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Register Type:</span> <span style={{ fontFamily: "JetBrains Mono", color: "var(--text-primary)" }}>{activeModal === "spindle" ? (data?.raw?.vibit1?.is_holding === 1 ? "Holding Registers" : "Input Registers") : activeModal === "tool" ? (data?.raw?.vibit2?.is_holding === 1 ? "Holding Registers" : "Input Registers") : "Input Registers"}</span></div>
                    <div><span style={{ color: "var(--text-muted)" }}>Status:</span> <span style={{ fontWeight: 700, fontFamily: "Inter", color: activeModal === "spindle" ? (vibit1Online ? "var(--status-ok)" : "var(--status-error)") : activeModal === "tool" ? (vibit2Online ? "var(--status-ok)" : "var(--status-error)") : (vibit3Online ? "var(--status-ok)" : "var(--status-error)") }}>{activeModal === "spindle" ? (vibit1Online ? "ONLINE" : "OFFLINE") : activeModal === "tool" ? (vibit2Online ? "ONLINE" : "OFFLINE") : (vibit3Online ? "ONLINE" : "OFFLINE")}</span></div>
                  </>
                )}
              </div>
            </div>

            {/* Live Metrics */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "Inter" }}>
                Decoded Process Variables
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                {activeModal === "spindle" && (
                  <>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Vibration</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{sensorVal(data?.spindle?.vibration)} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>mm/s</span></div>
                    </div>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Temperature</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{sensorVal(data?.spindle?.temperature, 1)} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>°C</span></div>
                    </div>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Rotational Speed</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{data?.spindle?.speed != null ? Math.round(data.spindle.speed) : "---"} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>RPM</span></div>
                    </div>
                  </>
                )}
                {activeModal === "tool" && (
                  <>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Vibration Peak</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{sensorVal(data?.tool?.vibration)} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>mm/s</span></div>
                    </div>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Temperature</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{sensorVal(data?.tool?.temperature, 1)} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>°C</span></div>
                    </div>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Reboot Count</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{data?.tool?.reboot_count ?? "---"}</div>
                    </div>
                  </>
                )}
                {activeModal === "energy" && (
                  <>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Active Power</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--status-ok)", marginTop: "4px" }}>{sensorVal(data?.energy_meter?.power, 3)} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>kW</span></div>
                    </div>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center", gridColumn: "span 2" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Accumulated Consumption</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{sensorVal(data?.energy_meter?.kwh, 4)} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>kWh</span></div>
                    </div>
                  </>
                )}
                {activeModal === "axis" && (
                  <>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>X Axis Position</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{data?.axes?.x?.value != null ? data.axes.x.value.toFixed(3) : "---"} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>mm</span></div>
                    </div>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Z Axis Position</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{data?.axes?.z?.value != null ? data.axes.z.value.toFixed(3) : "---"} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>mm</span></div>
                    </div>
                    <div style={{ background: "var(--bg-900)", border: "1px solid var(--border)", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "Inter", textTransform: "uppercase", fontWeight: 600 }}>Feed Rate</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text-primary)", marginTop: "4px" }}>{data?.axes?.x?.feed != null ? data.axes.x.feed.toFixed(1) : "---"} <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "Inter" }}>mm/min</span></div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Modbus Direct Registers */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontFamily: "Inter" }}>
                {activeModal === "axis" ? "OPC-UA Tag Namespace Binding" : "Modbus Telemetry Register Table (16-bit word representation)"}
              </h4>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--bg-secondary)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left", fontFamily: "JetBrains Mono" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-900)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "13px" }}>{activeModal === "axis" ? "NODE ID" : "ADDRESS"}</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "13px" }}>VARIABLE NAME</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "13px" }}>{activeModal === "axis" ? "RAW DOUBLE" : "RAW INT16[2]"}</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "13px" }}>{activeModal === "axis" ? "BYTE LENGTH" : "HEX WORD"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeModal === "spindle" && (
                      <>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 6)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>X-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit1?.x_rms_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit1?.x_rms_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 8)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Y-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit1?.y_rms_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit1?.y_rms_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 10)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Z-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit1?.z_rms_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit1?.z_rms_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 12)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Temperature</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit1?.temperature, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit1?.temperature, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 38)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Rotational Speed (RPM)</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit1?.rpm, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit1?.rpm, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "tool" && (
                      <>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 20)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>X-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit2?.x_peak_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit2?.x_peak_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 22)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Y-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit2?.y_peak_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit2?.y_peak_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 24)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Z-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit2?.z_peak_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit2?.z_peak_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 12)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Temperature</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{floatToRegs(data?.raw?.vibit2?.temperature, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{floatToRegs(data?.raw?.vibit2?.temperature, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 30)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Reboot Count</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{[data?.raw?.vibit2?.reboot_count ?? 0, 0].join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{[`0x${(data?.raw?.vibit2?.reboot_count ?? 0).toString(16).toUpperCase()}`, "0x0000"].join(", ")}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "energy" && (
                      <>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>42-43</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Active Power (kW)</td>
                          <td style={{ padding: "8px 12px", color: "var(--status-ok)" }}>{data?.energy_meter?.raw_power_regs?.join(", ") || "---"}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{data?.energy_meter?.raw_power_regs?.map(r => "0x" + r.toString(16).toUpperCase()).join(", ") || "---"}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>58-59</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Total Active Energy (kWh)</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{data?.energy_meter?.raw_kwh_regs?.join(", ") || "---"}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{data?.energy_meter?.raw_kwh_regs?.map(r => "0x" + r.toString(16).toUpperCase()).join(", ") || "---"}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "axis" && (
                      <>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>ns=3;s="Axis_X_Pos"</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Transverse X Position</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{data?.axes?.x?.value != null ? data.axes.x.value.toFixed(8) : "---"}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>8 bytes</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>ns=3;s="Axis_Z_Pos"</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Longitudinal Z Position</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{data?.axes?.z?.value != null ? data.axes.z.value.toFixed(8) : "---"}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>8 bytes</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>ns=3;s="Feed_Rate"</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>Current Feed Rate</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{data?.axes?.x?.feed != null ? data.axes.x.feed.toFixed(4) : "---"}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>8 bytes</td>
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
    </div>
  );
};

export default Mirac;