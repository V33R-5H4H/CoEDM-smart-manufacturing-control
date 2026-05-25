import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import TriacControlService from "../services/TriacControl";
import TriacMachineView from "../components/TriacMachineView";
import PageHeader from "../components/PageHeader";
import MiracStatusRibbon from "./asrs/components/MiracStatusRibbon";
import "./Assembly.css";
import "./Mirac.css";

const Triac = () => {
  const [data, setData] = useState(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  // Smooth position state for axis coordinate interpolation
  const [smoothedX, setSmoothedX] = useState(0);
  const [smoothedY, setSmoothedY] = useState(0);
  const [smoothedZ, setSmoothedZ] = useState(0);

  // Refs for tracking target coordinates and physics state
  const targetXRef = useRef(0);
  const targetYRef = useRef(0);
  const targetZRef = useRef(0);
  const smoothedXRef = useRef(0);
  const smoothedYRef = useRef(0);
  const smoothedZRef = useRef(0);
  
  const velocityXRef = useRef(0);
  const velocityYRef = useRef(0);
  const velocityZRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());

  // WebSocket references
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const connectWS = useCallback(() => {
    setWsStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
    const wsUrl = `${wsBase}/api/control/triac/ws/data`;

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

          // Capture raw coordinates instantly
          if (payload.axes?.x?.value !== undefined) targetXRef.current = payload.axes.x.value;
          if (payload.axes?.y?.value !== undefined) targetYRef.current = payload.axes.y.value;
          if (payload.axes?.z?.value !== undefined) targetZRef.current = payload.axes.z.value;
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
      if (wsRef.current) wsRef.current.close();
    };
  }, [connectWS]);

  // RequestAnimationFrame physics-based smoothing loop (omega = 5.0)
  useEffect(() => {
    let animationFrameId;

    const updateLoop = () => {
      const now = performance.now();
      let dt = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      if (dt > 0.1) dt = 0.1;
      if (dt < 0.005) dt = 0.005;

      const omega = 5.0; 

      const integrate = (targetRef, smoothedRef, velocityRef, setSmoothed) => {
        const target = targetRef.current;
        const prev = smoothedRef.current;
        const prevV = velocityRef.current;
        const error = prev - target;
        const expTerm = Math.exp(-omega * dt);
        const A = error;
        const B = prevV + omega * error;
        const next = target + (A + B * dt) * expTerm;
        const nextV = (B - omega * (A + B * dt)) * expTerm;

        if (Math.abs(next - target) < 0.05 && Math.abs(nextV) < 0.1) {
          smoothedRef.current = target;
          velocityRef.current = 0;
          setSmoothed(target);
        } else {
          smoothedRef.current = next;
          velocityRef.current = nextV;
          setSmoothed(next);
        }
      };

      integrate(targetXRef, smoothedXRef, velocityXRef, setSmoothedX);
      integrate(targetYRef, smoothedYRef, velocityYRef, setSmoothedY);
      integrate(targetZRef, smoothedZRef, velocityZRef, setSmoothedZ);

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const handleConnect = async () => {
    setStatusLoading(true);
    try {
      const res = await TriacControlService.connect();
      if (res.success) {
        setIsConnected(true);
        toast.success(res.message || "Connected to Triac OPC-UA");
      } else {
        toast.error(res.message || "Failed to connect to Triac");
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
      await TriacControlService.disconnect();
      setIsConnected(false);
      toast.info("Disconnected from Triac");
    } catch (e) {
      toast.error("Failed to disconnect from Triac");
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="asm-page">
      <PageHeader
        title="TRIAC-PC"
        subtitle="CNC Machine Control"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <MiracStatusRibbon
              plcConnected={isConnected}
              wsStatus={wsStatus}
              spindleSpeed={data?.spindle?.speed}
              cycleStart={data?.spindle?.speed > 0}
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
                  <div className={`asm-led-lamp asm-led-lamp--red ${data?.status?.error ? "active" : ""}`} />
                  <span>Red</span>
                </div>
                <div className="asm-led-indicator">
                  <div className={`asm-led-lamp asm-led-lamp--yellow ${!isConnected ? "active" : ""}`} />
                  <span>Yellow</span>
                </div>
                <div className="asm-led-indicator">
                  <div className={`asm-led-lamp asm-led-lamp--green ${isConnected && !data?.status?.error ? "active" : ""}`} />
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
                    {(isConnected ? 1.254 : 0.000).toFixed(3)}
                    <span className="asm-val__unit">kW</span>
                  </div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Total consumption</div>
                  <div className="asm-val__num">
                    {(isConnected ? 245.1234 : 0.0000).toFixed(4)}
                    <span className="asm-val__unit">kWh</span>
                  </div>
                </div>
              </div>
              <div className="asm-val-grid">
                <div className="asm-val">
                  <div className="asm-val__label">Power Factor</div>
                  <div className="asm-val__num asm-val__num--sm">
                    0.95
                  </div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Frequency</div>
                  <div className="asm-val__num asm-val__num--sm">
                    50.00
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
                      {isConnected ? "230.1" : "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>V</span>
                    </div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem", color: "#8e94a5" }}>
                      {isConnected ? "5.4" : "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>A</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label" style={{ fontSize: "0.5rem" }}>L2</div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem" }}>
                      {isConnected ? "229.8" : "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>V</span>
                    </div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem", color: "#8e94a5" }}>
                      {isConnected ? "5.5" : "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>A</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label" style={{ fontSize: "0.5rem" }}>L3</div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem" }}>
                      {isConnected ? "230.5" : "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>V</span>
                    </div>
                    <div className="asm-val__num" style={{ fontSize: "0.8rem", color: "#8e94a5" }}>
                      {isConnected ? "5.2" : "---"}<span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>A</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 2: CENTER PANEL (Machine SVG Visualizer & Footer Stats) */}
          <div className="mirac-column" style={{ overflow: "hidden" }}>
            <div className="asm-center-container">
              {/* High-Fidelity SVG Viewer */}
              <div className="asm-viz-panel">
                <TriacMachineView 
                   xAxisValue={smoothedX}
                   yAxisValue={smoothedY}
                   zAxisValue={smoothedZ}
                   spindleRPM={data?.spindle?.speed || 0}
                   spindleRunning={(data?.spindle?.speed || 0) > 0}
                   alarmActive={data?.status?.error !== 0 && data?.status?.error !== undefined}
                   toolNumber={parseInt(String(data?.status?.tool || '').replace('T', '')) || 0}
                />
              </div>

              {/* Bottom Quick-Metrics Panel */}
              <div className="asm-footer-stats">
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Spindle State</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: data?.spindle?.speed > 0 ? "#4ade80" : "#64748b" }}>
                    {data?.spindle?.speed > 0 ? "RUNNING" : "STOPPED"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Pneumatic Chuck</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: data?.spindle?.speed > 0 ? "#38bdf8" : "#64748b" }}>
                    {data?.spindle?.speed > 0 ? "CLAMPED" : "OPEN"}
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
                    #{parseInt(String(data?.status?.tool || '').replace('T', '')) || 0}
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
              </div>

              {/* Y Axis */}
              <div className="asm-axis-section" style={{ marginTop: "8px" }}>
                <div className="asm-axis-header">
                  <span className="asm-axis-letter" style={{ color: "#10b981", borderColor: "#10b981", background: "rgba(16, 185, 129, 0.1)" }}>Y</span>
                  <div className="asm-axis-line" />
                  <span style={{ fontSize: "0.6rem", color: "#64748b", fontWeight: 600 }}>DEPTH</span>
                </div>
                <div className="asm-val-grid">
                  <div className="asm-val">
                    <div className="asm-val__label">Raw Pos</div>
                    <div className="asm-val__num asm-val__num--sm">
                      {data?.axes?.y?.value != null ? data.axes.y.value.toFixed(3) : "0.000"}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Smoothed Pos</div>
                    <div className="asm-val__num asm-val__num--sm asm-val__num--glowing-green">
                      {smoothedY.toFixed(3)}
                      <span className="asm-val__unit">mm</span>
                    </div>
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

export default Triac;
