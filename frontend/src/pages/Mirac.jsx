import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import MiracControlService from "../services/MiracControl";
import MiracMachineView from "../components/MiracMachineView";
import PageHeader from "../components/PageHeader";
import MiracStatusRibbon from "./asrs/components/MiracStatusRibbon";
import "./Assembly.css";
import "./Mirac.css";

// --- Main Page Component ---
const Mirac = () => {
  const [data, setData] = useState(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState("disconnected"); // 'connected', 'connecting', 'disconnected'
  const [isConnected, setIsConnected] = useState(false); // OPC-UA connectivity
  const [statusLoading, setStatusLoading] = useState(true);

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
          if (payload.axes?.x?.value !== undefined) {
            targetXRef.current = payload.axes.x.value;
          }
          if (payload.axes?.z?.value !== undefined) {
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

  return (
    <div className="asm-page">
      {/* Header aligned with ASRS and Assembly modules */}
      <PageHeader
        title="MIRAC-PC"
        subtitle="CNC Machine Control"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <MiracStatusRibbon
              plcConnected={isConnected}
              wsStatus={wsStatus}
              spindleSpeed={data?.spindle?.speed}
              cycleStart={data?.status?.cycle_start}
            />
          </div>
        }
      />

      <div className="asm-body">
        <div className="mirac-grid-container">
          {/* COLUMN 1: LEFT HUD (Status LEDs, Vibit Sensors, Energy Meter) */}
          <div className="mirac-column">
            {/* Status Tower Lights */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Machine Status Indicators</span>
                <span className="asm-hud-badge">TOWER</span>
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
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Vibit Spindle Sensor (U1)</span>
                <span className={`asm-hud-badge ${data?.spindle?.speed > 0 ? "asm-hud-badge--active" : ""}`}>
                  {data?.spindle?.speed > 0 ? "SPINNING" : "IDLE"}
                </span>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Vibration</div>
                  <div className="asm-val__num asm-val__num--glowing-blue">
                    {data?.spindle?.vibration != null ? data.spindle.vibration.toFixed(2) : "0.00"}
                    <span className="asm-val__unit">mm/s</span>
                  </div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Temperature</div>
                  <div className="asm-val__num">
                    {data?.spindle?.temperature != null ? data.spindle.temperature.toFixed(1) : "0.0"}
                    <span className="asm-val__unit">°C</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vibit Sensor 2: Tool */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Vibit Tool Sensor (U2)</span>
                <span className="asm-hud-badge">ACTIVE</span>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Vibration</div>
                  <div className="asm-val__num asm-val__num--glowing-orange">
                    {data?.tool?.vibration != null ? data.tool.vibration.toFixed(2) : "0.00"}
                    <span className="asm-val__unit">mm/s</span>
                  </div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Temperature</div>
                  <div className="asm-val__num">
                    {data?.tool?.temperature != null ? data.tool.temperature.toFixed(1) : "0.0"}
                    <span className="asm-val__unit">°C</span>
                  </div>
                </div>
              </div>
              <div className="asm-val">
                <div className="asm-val__label">Reboot Count</div>
                <div className="asm-val__num asm-val__num--sm">
                  {data?.tool?.reboot_count ?? 0}
                </div>
              </div>
            </div>

            {/* Energy Meter */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Energy Meter Diagnostics</span>
                <span className="asm-hud-badge">POWER</span>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Active Power</div>
                  <div className="asm-val__num asm-val__num--glowing-green">
                    {data?.energy_meter?.power != null ? data.energy_meter.power.toFixed(3) : "0.000"}
                    <span className="asm-val__unit">kW</span>
                  </div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Total consumption</div>
                  <div className="asm-val__num">
                    {data?.energy_meter?.kwh != null ? data.energy_meter.kwh.toFixed(4) : "0.0000"}
                    <span className="asm-val__unit">kWh</span>
                  </div>
                </div>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Power Factor</div>
                  <div className="asm-val__num asm-val__num--sm">
                    {data?.energy_meter?.power_factor != null ? data.energy_meter.power_factor.toFixed(2) : "0.00"}
                  </div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Frequency</div>
                  <div className="asm-val__num asm-val__num--sm">
                    {data?.energy_meter?.frequency != null ? data.energy_meter.frequency.toFixed(2) : "0.00"}
                    <span className="asm-val__unit">Hz</span>
                  </div>
                </div>
              </div>
              
              {/* Detailed Phase Grid */}
              <div style={{ marginTop: "4px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "8px" }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>Phase Analysis</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                  <div className="asm-val">
                    <div className="asm-val__label" style={{ fontSize: "0.5rem" }}>L1</div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem" }}>
                      {data?.energy_meter?.voltage?.l1 ?? "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>V</span>
                    </div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem", color: "#8e94a5" }}>
                      {data?.energy_meter?.current?.l1 ?? "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>A</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label" style={{ fontSize: "0.5rem" }}>L2</div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem" }}>
                      {data?.energy_meter?.voltage?.l2 ?? "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>V</span>
                    </div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem", color: "#8e94a5" }}>
                      {data?.energy_meter?.current?.l2 ?? "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>A</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label" style={{ fontSize: "0.5rem" }}>L3</div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem" }}>
                      {data?.energy_meter?.voltage?.l3 ?? "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>V</span>
                    </div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem", color: "#8e94a5" }}>
                      {data?.energy_meter?.current?.l3 ?? "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>A</span>
                    </div>
                  </div>
                </div>
              </div>
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
                  alarmActive={!isWsConnected}
                  toolEngaged={data?.status?.cycle_start && smoothedX > 10}
                  coolantOn={data?.status?.cycle_start || false}
                  toolNumber={data?.tool?.number ?? 4}
                />
              </div>

              {/* Bottom Quick-Metrics Panel */}
              <div className="asm-footer-stats">
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Spindle State</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: data?.status?.cycle_start ? "#4ade80" : "#64748b" }}>
                    {data?.status?.cycle_start ? "RUNNING" : "STOPPED"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Pneumatic Chuck</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: data?.status?.pneumatic_chuck ? "#38bdf8" : "#64748b" }}>
                    {data?.status?.pneumatic_chuck ? "CLAMPED" : "OPEN"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Speed Feed</div>
                  <div className="asm-val__num" style={{ fontSize: "1.1rem" }}>
                    {data?.spindle?.speed ?? 0} <span className="asm-val__unit">RPM</span>
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Active Tool</div>
                  <div className="asm-val__num" style={{ fontSize: "1.1rem" }}>
                    #{data?.tool?.number ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 3: RIGHT HUD (OPC-UA connection status, controls, and axis telemetry feed) */}
          <div className="mirac-column">
            {/* Connection and Gateway Controls */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>OPC-UA Connection</span>
                <span className={`asm-hud-badge ${isConnected ? "asm-hud-badge--active" : ""}`}>
                  {isConnected ? "CONNECTED" : "DISCONNECTED"}
                </span>
              </div>
              <div className="asm-val">
                <div className="asm-val__label">OPC UA Station Link</div>
                <div className="asm-val__num" style={{ fontSize: "1.2rem", color: isConnected ? "#4ade80" : "#ef4444" }}>
                  {isConnected ? "ONLINE" : "OFFLINE"}
                </div>
              </div>
              <div className="asm-action-group">
                {isConnected ? (
                  <button
                    onClick={handleDisconnect}
                    className="asm-btn-control asm-btn-control--disconnect"
                    disabled={statusLoading}
                  >
                    {statusLoading ? "Disconnecting..." : "Disconnect"}
                  </button>
                ) : (
                  <button
                    onClick={handleConnect}
                    className="asm-btn-control asm-btn-control--connect"
                    disabled={statusLoading}
                  >
                    {statusLoading ? "Connecting..." : "Connect"}
                  </button>
                )}
              </div>
            </div>

            {/* Live Axis Telemetry */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Axis Positions</span>
                <span className="asm-hud-badge">TELEM</span>
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
                      {data?.axes?.x?.value != null ? data.axes.x.value.toFixed(3) : "0.000"}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Smoothed Pos</div>
                    <div className="asm-val__num asm-val__num--sm asm-val__num--glowing-blue">
                      {smoothedX.toFixed(3)}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                </div>
                <div className="asm-val" style={{ marginTop: "6px" }}>
                  <div className="asm-val__label">Feed Rate</div>
                  <div className="asm-val__num asm-val__num--sm">
                    {data?.axes?.x?.feed != null ? data.axes.x.feed.toFixed(1) : "0.0"}
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
                      {data?.axes?.z?.value != null ? data.axes.z.value.toFixed(3) : "0.000"}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Smoothed Pos</div>
                    <div className="asm-val__num asm-val__num--sm asm-val__num--glowing-orange">
                      {smoothedZ.toFixed(3)}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                </div>
                <div className="asm-val" style={{ marginTop: "6px" }}>
                  <div className="asm-val__label">Feed Rate</div>
                  <div className="asm-val__num asm-val__num--sm">
                    {data?.axes?.z?.feed != null ? data.axes.z.feed.toFixed(1) : "0.0"}
                    <span className="asm-val__unit">mm/min</span>
                  </div>
                </div>
              </div>

              {/* Axis Vibration summary */}
              <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "10px" }}>
                <div className="asm-val">
                  <div className="asm-val__label">Axes Vibration</div>
                  <div className="asm-val__num asm-val__num--sm">
                    {data?.axes?.vibration != null ? data.axes.vibration.toFixed(2) : "0.00"}
                    <span className="asm-val__unit">mm/s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Mirac;