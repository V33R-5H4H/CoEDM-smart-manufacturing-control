import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import MiracControlService from "../services/MiracControl";
import MiracMachineView from "../components/MiracMachineView";
import PageHeader from "../components/PageHeader";
import MiracStatusRibbon from "./asrs/components/MiracStatusRibbon";
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
      background: connected ? "#4ade80" : "#ef4444",
      boxShadow: connected
        ? "0 0 6px rgba(74, 222, 128, 0.5)"
        : "0 0 6px rgba(239, 68, 68, 0.5)",
      marginRight: 6,
      verticalAlign: "middle",
    }}
  />
);

// Full VIBIT sensor panel for one slave unit
const VibitPanel = ({ title, unitId, data, connected, accentColor }) => {
  const accent = accentColor || "#818cf8";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${connected ? accent + "44" : "var(--border)"}`,
        borderRadius: 10,
        overflow: "hidden",
        transition: "border-color 0.4s",
      }}
    >
      {/* Panel header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: `linear-gradient(90deg, ${accent}10 0%, transparent 100%)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: connected ? "#4ade80" : "#555",
            boxShadow: connected ? "0 0 8px #4ade80" : "none",
            animation: connected ? "vibit-pulse 2s ease-in-out infinite" : "none",
          }} />
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: accent }}>
            {title}
          </span>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
            Unit {unitId}
          </span>
        </div>
        <div style={{
          fontSize: "0.6rem", fontWeight: 600, padding: "2px 8px",
          borderRadius: 12,
          background: connected ? "rgba(74,222,128,0.12)" : "rgba(100,100,100,0.12)",
          color: connected ? "#4ade80" : "var(--text-muted)",
          border: `1px solid ${connected ? "rgba(74,222,128,0.3)" : "var(--border)"}`,
        }}>
          {connected ? "ONLINE" : "OFFLINE"}
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ padding: "12px 14px" }}>
        {!connected && (
          <div style={{
            textAlign: "center", padding: "12px 0",
            fontSize: "0.72rem", color: "var(--text-muted)",
          }}>
            Sensor not responding
          </div>
        )}

        {connected && data && (
          <>
            {/* Temperature + LED + RPM */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: "0.75rem", marginBottom: "1rem",
              paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)",
            }}>
              <Metric title="Temp" value={data.temperature} unit="°C" />
              <Metric title="RPM" value={data.rpm} unit="" highlight={data.rpm > 0} />
              <Metric title="LED" value={data.led_status} unit="" />
            </div>

            {/* Acceleration */}
            <div style={{ marginBottom: "0.9rem" }}>
              <div style={{
                fontSize: "0.6rem", color: accent, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem",
              }}>RMS Acceleration</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
                <Metric title="X" value={data.x_rms_acceleration} unit="mm/s²" />
                <Metric title="Y" value={data.y_rms_acceleration} unit="mm/s²" />
                <Metric title="Z" value={data.z_rms_acceleration} unit="mm/s²" />
              </div>
            </div>

            {/* Velocity */}
            <div style={{ marginBottom: "0.9rem" }}>
              <div style={{
                fontSize: "0.6rem", color: accent, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem",
              }}>RMS Velocity</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
                <Metric title="X" value={data.x_rms_velocity} unit="mm/s" />
                <Metric title="Y" value={data.y_rms_velocity} unit="mm/s" />
                <Metric title="Z" value={data.z_rms_velocity} unit="mm/s" />
              </div>
            </div>

            {/* Peak Acceleration */}
            <div style={{ marginBottom: "0.9rem" }}>
              <div style={{
                fontSize: "0.6rem", color: accent, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem",
              }}>Peak Acceleration</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
                <Metric title="X" value={data.x_peak_acceleration} unit="mm/s²" />
                <Metric title="Y" value={data.y_peak_acceleration} unit="mm/s²" />
                <Metric title="Z" value={data.z_peak_acceleration} unit="mm/s²" />
              </div>
            </div>

            {/* Peak Velocity */}
            <div>
              <div style={{
                fontSize: "0.6rem", color: accent, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem",
              }}>Peak Velocity</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
                <Metric title="X" value={data.x_peak_velocity} unit="mm/s" />
                <Metric title="Y" value={data.y_peak_velocity} unit="mm/s" />
                <Metric title="Z" value={data.z_peak_velocity} unit="mm/s" />
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────
const Mirac = () => {
  const [data, setData] = useState(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState("disconnected"); // 'connected', 'connecting', 'disconnected'
  const [isConnected, setIsConnected] = useState(false); // OPC-UA connectivity
  const [statusLoading, setStatusLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("monitoring");
  const [activeModal, setActiveModal] = useState(null); // 'spindle' | 'tool' | 'energy' | null

  // Smooth position state for axis coordinate interpolation
  const [smoothedX, setSmoothedX] = useState(0);
  const [smoothedZ, setSmoothedZ] = useState(0);

  // Refs for tracking target coordinates and physics state
  const targetXRef = useRef(0);
  const targetZRef = useRef(0);
  const smoothedXRef = useRef(0);
  const smoothedZRef = useRef(0);
  const velocityXRef = useRef(0);
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
  const b2 = data?.raw?.vibit2?.base_address ?? 4001;

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
        const payload = JSON.parse(e.data);
        if (payload) {
          setData(payload);

          // Capture raw coordinates instantly in refs for physics loop to bypass React lag
          if (payload.axes?.x?.value !== undefined && payload.axes?.x?.value !== null) {
            targetXRef.current = payload.axes.x.value;
          }
          if (payload.axes?.z?.value !== undefined && payload.axes?.z?.value !== null) {
            targetZRef.current = payload.axes.z.value;
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
    const check = async () => {
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

      if (Math.abs(nextX - targetX) < 0.05 && Math.abs(nextVX) < 0.1) {
        smoothedXRef.current = targetX;
        velocityXRef.current = 0;
        setSmoothedX(targetX);
      } else {
        smoothedXRef.current = nextX;
        velocityXRef.current = nextVX;
        setSmoothedX(nextX);
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
              plcConnected={conn?.opcua?.connected}
              wsStatus={conn?.any_connected ? "connected" : "connecting"}
              spindleSpeed={merged?.spindle_speed}
              cycleStart={merged?.cycle_start}
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
              onClick={() => setActiveModal("spindle")}
              title="Click to open detailed diagnostics panel"
            >
              <div className="asm-hud-header">
                <span><SensorDot connected={vibit1Online} />Vibit Spindle Sensor (U1)</span>
                <span className={`asm-hud-badge ${vibit1Online && data?.spindle?.speed > 0 ? "asm-hud-badge--active" : ""}`}>
                  {!vibit1Online ? "OFFLINE" : data?.spindle?.speed > 0 ? "SPINNING" : "IDLE"}
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
          </div>

          {/* COLUMN 2: CENTER PANEL (Lathe Machine SVG Visualizer & Footer Stats) */}
          <div className="mirac-column" style={{ overflow: "hidden" }}>
            <div className="asm-center-container">
              {/* High-Fidelity SVG Viewer */}
              <div className="asm-viz-panel">
                <MiracMachineView
                  spindleRPM={data?.spindle?.speed || 0}
                  xAxisValue={smoothedX}
                  zAxisValue={smoothedZ}
                  spindleRunning={data?.status?.cycle_start || false}
                  alarmActive={data?.status?.red || false}
                  toolEngaged={data?.status?.cycle_start && smoothedX > 10}
                  coolantOn={data?.status?.cycle_start || false}
                  toolNumber={data?.tool?.number ?? 0}
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
                  <div className="asm-val__num" style={{ fontSize: "1.1rem" }}>
                    {data?.spindle?.speed != null ? Math.round(data.spindle.speed) : "---"} <span className="asm-val__unit">RPM</span>
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Active Tool</div>
                  <div className="asm-val__num" style={{ fontSize: "1.1rem" }}>
                    {data?.tool?.number != null ? `#${data.tool.number}` : "---"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 3: RIGHT HUD (OPC-UA connection status, controls, and axis telemetry feed) */}
          <div className="mirac-column">
            {/* Live Axis Telemetry */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span><SensorDot connected={plcOnline} />Axis Positions</span>
                <span className={`asm-hud-badge ${plcOnline ? "asm-hud-badge--active" : ""}`}>
                  {plcOnline ? "TELEM" : "NO DATA"}
                </span>
              </div>

              {/* X Axis */}
              <div className="asm-axis-section">
                <div className="asm-axis-header">
                  <span className="asm-axis-letter asm-axis-letter--x">X</span>
                  <div className="asm-axis-line" />
                  <span style={{ fontSize: "0.6rem", color: "#64748b", fontWeight: 600 }}>TRANSVERSE</span>
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
                      {plcOnline ? smoothedX.toFixed(3) : "---"}
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
              </div>

              {/* Z Axis */}
              <div className="asm-axis-section" style={{ marginTop: "8px" }}>
                <div className="asm-axis-header">
                  <span className="asm-axis-letter asm-axis-letter--z">Z</span>
                  <div className="asm-axis-line" />
                  <span style={{ fontSize: "0.6rem", color: "#64748b", fontWeight: 600 }}>LONGITUDINAL</span>
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
                      {plcOnline ? smoothedZ.toFixed(3) : "---"}
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
                    boxShadow: `0 0 8px ${activeModal === "spindle"
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
                <div><span style={{ color: "var(--text-muted)" }}>Target Host:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>10.10.14.103</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Modbus Port:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>502</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Protocol:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>Modbus TCP/IP</span></div>
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
                Modbus Telemetry Register Table
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
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>{floatToRegs(data?.raw?.vibit1?.x_rms_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.x_rms_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 8)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Y-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>{floatToRegs(data?.raw?.vibit1?.y_rms_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.y_rms_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 10)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Z-Axis Velocity RMS</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>{floatToRegs(data?.raw?.vibit1?.z_rms_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.z_rms_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 12)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Temperature</td>
                          <td style={{ padding: "8px 12px" }}>{floatToRegs(data?.raw?.vibit1?.temperature, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.temperature, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b1, 38)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Rotational Speed (RPM)</td>
                          <td style={{ padding: "8px 12px" }}>{floatToRegs(data?.raw?.vibit1?.rpm, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit1?.rpm, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "tool" && (
                      <>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 20)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>X-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#fb923c" }}>{floatToRegs(data?.raw?.vibit2?.x_peak_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit2?.x_peak_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 22)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Y-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#fb923c" }}>{floatToRegs(data?.raw?.vibit2?.y_peak_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit2?.y_peak_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 24)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Z-Axis Velocity Peak</td>
                          <td style={{ padding: "8px 12px", color: "#fb923c" }}>{floatToRegs(data?.raw?.vibit2?.z_peak_vel, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit2?.z_peak_vel, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{getRegRange(b2, 12)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>Temperature</td>
                          <td style={{ padding: "8px 12px" }}>{floatToRegs(data?.raw?.vibit2?.temperature, false).join(", ")}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-disabled)" }}>{floatToRegs(data?.raw?.vibit2?.temperature, false).map(r => "0x" + r.toString(16).toUpperCase()).join(", ")}</td>
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
    </div>
  );
};

export default Mirac;