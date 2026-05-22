import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import MiracControlService from "../services/MiracControl";
import MiracMachineView from "../components/MiracMachineView";
import PageHeader from "../components/PageHeader";
import "./Mirac.css";

const API = "http://localhost:8000/api/control/mirac";

// ── Connectivity hook ──────────────────────────────────────────────────────
const useConnectivity = () => {
  const [conn, setConn] = useState({
    vibit1: { connected: false, unit_id: 1, label: "Spindle sensor" },
    vibit2: { connected: false, unit_id: 2, label: "Tool / bearing sensor" },
    opcua:  { connected: false },
    any_connected: false,
  });

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/connectivity`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped) setConn(data);
      } catch (_) {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  return conn;
};

// ── Dual VIBIT data hook ───────────────────────────────────────────────────
const useVibitData = () => {
  const [unit1, setUnit1] = useState(null);
  const [unit2, setUnit2] = useState(null);
  const [merged, setMerged] = useState(null);

  useEffect(() => {
    let ws;
    let reconnectTimeout;
    let isComponentMounted = true;

    const connectWebSocket = () => {
      ws = new WebSocket("ws://localhost:8000/api/control/mirac/ws/vibit-data");
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.merged) setMerged(data.merged);
          if (data.unit1) setUnit1(data.unit1);
          if (data.unit2) setUnit2(data.unit2);
        } catch (e) {
          console.error("Failed to parse WebSocket data", e);
        }
      };
      
      ws.onclose = () => {
        console.log("WebSocket connection closed, reconnecting in 2s...");
        if (isComponentMounted) {
          reconnectTimeout = setTimeout(connectWebSocket, 2000);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
      };
    };

    connectWebSocket();

    return () => { 
      isComponentMounted = false;
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  return { unit1, unit2, merged };
};

// ── Sub-components ─────────────────────────────────────────────────────────

const ConnBadge = ({ connected, label, unitId }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: "6px",
    padding: "4px 10px", borderRadius: "20px",
    background: connected ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.08)",
    border: `1px solid ${connected ? "rgba(74,222,128,0.35)" : "rgba(239,68,68,0.25)"}`,
    fontSize: "0.68rem", fontWeight: 600,
    color: connected ? "#4ade80" : "#f87171",
    whiteSpace: "nowrap",
    transition: "all 0.4s ease",
  }}>
    <span style={{
      width: 7, height: 7, borderRadius: "50%",
      background: connected ? "#4ade80" : "#f87171",
      boxShadow: connected ? "0 0 8px #4ade80" : "none",
      flexShrink: 0,
      animation: connected ? "vibit-pulse 2s ease-in-out infinite" : "none",
    }} />
    {label}{unitId !== undefined ? ` (Unit ${unitId})` : ""}
  </div>
);

const StatusLed = ({ active, color }) => {
  const colors = {
    green:  { on: "#4ade80", glow: "rgba(74,222,128,0.55)" },
    yellow: { on: "#fbbf24", glow: "rgba(251,191,36,0.55)" },
    red:    { on: "#ef4444", glow: "rgba(239,68,68,0.55)" },
  }[color] || {};
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "50%",
      border: "2px solid #333",
      background: active
        ? `radial-gradient(circle, ${colors.on}, ${colors.on}cc)`
        : "radial-gradient(circle, #1a1a1a, #0a0a0a)",
      boxShadow: active ? `0 0 14px ${colors.glow}, inset 0 1px 2px rgba(255,255,255,0.25)` : "inset 0 1px 3px rgba(0,0,0,0.5)",
      transition: "all 0.3s ease",
    }} />
  );
};

const Metric = ({ title, value, unit, highlight }) => (
  <div>
    <div style={{
      fontSize: "0.6rem", color: "var(--text-muted)", marginBottom: 2,
      textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600,
    }}>{title}</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
      <span style={{
        fontSize: "1.05rem", fontWeight: 600,
        color: highlight ? "#fbbf24" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value != null && !isNaN(value) ? Number(value).toFixed(2) : "—"}
      </span>
      <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{unit}</span>
    </div>
  </div>
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
  const conn = useConnectivity();
  const { unit1, unit2, merged } = useVibitData();
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "unit1" | "unit2"

  // OPC-UA connection status check
  useEffect(() => {
    const check = async () => {
      try {
        const res = await MiracControlService.getConnectionStatus();
        setIsConnected(res.connected || res.status === "connected");
      } catch (_) {
        setIsConnected(false);
      } finally {
        setStatusLoading(false);
      }
    };
    check();
  }, []);

  const handleConnect = async () => {
    setStatusLoading(true);
    try {
      const res = await MiracControlService.connect();
      if (res.success) {
        setIsConnected(true);
        toast.success("MIRAC connected — reading both VIBIT slaves");
      } else {
        toast.error(res.message || "Connection failed");
      }
    } catch (e) {
      toast.error(e.message || "Failed to connect");
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
        toast.success("MIRAC disconnected");
      } else {
        toast.error(res.message || "Disconnect failed");
      }
    } catch (e) {
      toast.error(e.message || "Failed to disconnect");
    } finally {
      setStatusLoading(false);
    }
  };

  // For machine view — use merged data
  const rpm = merged?.spindle_speed ?? merged?.rpm ?? 0;
  const carriagePct = Math.min(
    100,
    Math.max(0, ((merged?.x_peak_velocity ?? 0) / 2) * 100)
  );
  const ledStatus = merged?.led_status ?? 0;

  return (
    <div className="asrs-inventory module-layout">
      <style>{`
        @keyframes vibit-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #4ade80; }
          50%       { opacity: 0.6; box-shadow: 0 0 14px #4ade80; }
        }
      `}</style>

      {/* ── Header ── */}
      <PageHeader
        title="MIRAC-PC"
        subtitle="CNC Machine Control"
        status={isConnected ? "SYSTEM ACTIVE" : "IDLE"}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            {/* Connectivity badges */}
            <ConnBadge
              connected={conn.vibit1?.connected}
              label="VIBIT Spindle"
              unitId={conn.vibit1?.unit_id}
            />
            <ConnBadge
              connected={conn.vibit2?.connected}
              label="VIBIT Tool"
              unitId={conn.vibit2?.unit_id}
            />
            <ConnBadge
              connected={conn.opcua?.connected}
              label="OPC-UA"
            />

            {/* Demo toggle */}
            <button
              onClick={() => setDemoMode(!demoMode)}
              className={demoMode ? "btn btn-warning btn-sm" : "btn btn-ghost btn-sm"}
              style={{
                height: 28, fontSize: "0.72rem", padding: "0 0.75rem",
                border: demoMode
                  ? "1px solid rgba(251,146,60,0.5)"
                  : "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {demoMode ? "Demo: ON" : "Demo"}
            </button>

            {/* Connect / disconnect */}
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                className="btn btn-error btn-sm"
                style={{ height: 28, fontSize: "0.72rem", padding: "0 0.75rem" }}
                disabled={statusLoading}
              >
                {statusLoading ? "…" : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="btn btn-success btn-sm"
                style={{ height: 28, fontSize: "0.72rem", padding: "0 0.75rem" }}
                disabled={statusLoading}
              >
                {statusLoading ? "…" : "Connect"}
              </button>
            )}
          </div>
        }
      />

      {/* ── Body ── */}
      <div style={{
        flex: 1, overflow: "hidden", padding: "1rem",
        display: "flex", flexDirection: "column", gap: "0.75rem",
      }}>

        {/* Tab bar */}
        <div style={{
          display: "flex", gap: "0.4rem",
          borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem",
          flexShrink: 0,
        }}>
          {[
            { key: "overview", label: "Overview" },
            { key: "unit1",    label: "VIBIT Unit 1 — Spindle" },
            { key: "unit2",    label: "VIBIT Unit 2 — Tool" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "4px 14px", borderRadius: 6, cursor: "pointer",
                fontSize: "0.72rem", fontWeight: 600,
                border: "none", outline: "none",
                background: activeTab === t.key
                  ? "rgba(129,140,248,0.15)"
                  : "transparent",
                color: activeTab === t.key ? "#818cf8" : "var(--text-muted)",
                borderBottom: activeTab === t.key
                  ? "2px solid #818cf8"
                  : "2px solid transparent",
                transition: "all 0.2s",
              }}
            >
              {t.label}
              {t.key === "unit1" && conn.vibit1?.connected && (
                <span style={{
                  marginLeft: 6, width: 6, height: 6, borderRadius: "50%",
                  background: "#4ade80", display: "inline-block",
                  boxShadow: "0 0 6px #4ade80",
                }} />
              )}
              {t.key === "unit2" && conn.vibit2?.connected && (
                <span style={{
                  marginLeft: 6, width: 6, height: 6, borderRadius: "50%",
                  background: "#4ade80", display: "inline-block",
                  boxShadow: "0 0 6px #4ade80",
                }} />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ── */}
        {activeTab === "overview" && (
          <div style={{
            flex: 1, minHeight: 0, overflow: "auto",
            display: "grid",
            gridTemplateColumns: "minmax(280px, 320px) 1fr",
            gap: "1rem",
          }}>
            {/* LEFT sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto" }}>

              {/* Machine Status */}
              <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)", borderRadius: 10,
                padding: "12px 14px",
              }}>
                <div style={{
                  fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
                }}>Machine Status</div>
                <div style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-around", padding: "4px 0",
                }}>
                  <StatusLed active={ledStatus === 1.0 || merged?.led_green} color="green" />
                  <StatusLed active={ledStatus === 0.0 || merged?.led_yellow} color="yellow" />
                  <StatusLed active={ledStatus === 2.0 || merged?.led_red}   color="red" />
                </div>
              </div>

              {/* Quick metrics from slave 1 */}
              <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)", borderRadius: 10,
                padding: "12px 14px",
              }}>
                <div style={{
                  fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
                }}>Spindle (Unit 1)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem" }}>
                  <Metric title="RPM" value={merged?.spindle_speed ?? merged?.rpm} unit="RPM" highlight />
                  <Metric title="Temp" value={merged?.spindle_temp ?? merged?.temperature} unit="°C" />
                  <Metric title="X Accel" value={merged?.x_rms_acceleration} unit="mm/s²" />
                  <Metric title="X Vel" value={merged?.x_rms_velocity} unit="mm/s" />
                </div>
              </div>

              {/* Quick metrics from slave 2 */}
              <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)", borderRadius: 10,
                padding: "12px 14px",
              }}>
                <div style={{
                  fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
                }}>Tool / Bearing (Unit 2)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem" }}>
                  <Metric title="Temp" value={merged?.tool_temperature ?? unit2?.temperature} unit="°C" />
                  <Metric title="RPM" value={merged?.tool_rpm ?? unit2?.rpm} unit="" />
                  <Metric title="X Accel" value={merged?.tool_x_rms_acceleration ?? unit2?.x_rms_acceleration} unit="mm/s²" />
                  <Metric title="X Vel" value={merged?.tool_x_rms_velocity ?? unit2?.x_rms_velocity} unit="mm/s" />
                </div>
              </div>

              {/* OPC-UA tags */}
              {merged?.cycle_start !== undefined && (
                <div style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)", borderRadius: 10,
                  padding: "12px 14px",
                }}>
                  <div style={{
                    fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
                  }}>CNC Status (OPC-UA)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    {[
                      { label: "Cycle Start", val: merged?.cycle_start },
                      { label: "Cycle Stop",  val: merged?.cycle_stop },
                      { label: "Chuck",       val: merged?.pneumatic_chuck },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: val ? "#4ade80" : "#555",
                          boxShadow: val ? "0 0 6px #4ade80" : "none",
                        }} />
                        <span style={{ fontSize: "0.68rem", color: val ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {label}
                        </span>
                      </div>
                    ))}
                    <Metric title="Tool #" value={merged?.tool_number} unit="#" />
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Machine visualization */}
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <MiracMachineView
                spindleRPM={rpm}
                carriagePositionPct={carriagePct}
                xAxisValue={merged?.x_axis_value}
                zAxisValue={merged?.z_axis_value}
                spindleRunning={merged?.cycle_start || rpm > 0}
                alarmActive={!isConnected}
                toolEngaged={false}
                coolantOn={false}
                demoMode={demoMode}
              />
            </div>
          </div>
        )}

        {/* ── Tab: VIBIT Unit 1 detail ── */}
        {activeTab === "unit1" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <VibitPanel
              title="Spindle Vibration Sensor"
              unitId={1}
              data={unit1}
              connected={conn.vibit1?.connected}
              accentColor="#818cf8"
            />
          </div>
        )}

        {/* ── Tab: VIBIT Unit 2 detail ── */}
        {activeTab === "unit2" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <VibitPanel
              title="Tool / Bearing Vibration Sensor"
              unitId={2}
              data={unit2}
              connected={conn.vibit2?.connected}
              accentColor="#f472b6"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Mirac;