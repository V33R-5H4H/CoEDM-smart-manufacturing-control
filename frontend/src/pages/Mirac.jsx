import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import MiracControlService from "../services/MiracControl";
import MiracMachineView from "../components/MiracMachineView";
import PageHeader from "../components/PageHeader";

// --- Custom Hook for MIRAC WebSocket Data ---
const useMiracData = () => {
  const [data, setData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const pollRef = useRef(null);
  const hookInstanceRef = useRef(Math.random().toString(36).slice(2, 9));

  useEffect(() => {
    let stopped = false;
    const endpoint = "http://localhost:8000/api/control/mirac/vibit-data";
    const hookId = hookInstanceRef.current;
    const POLL_INTERVAL_MS = 1000;

    console.log(`[useMiracData:${hookId}] Effect mounted, setting up polling`);

    async function fetchData() {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const telemetry = await res.json();
        if (stopped) return;

        const rpm = Number(telemetry?.rpm ?? telemetry?.spindle_speed ?? 0);
        const ledStatus = telemetry?.led_status;

        // Map telemetry from backend to nested structure expected by UI
        const mappedData = {
          status: {
            green: telemetry?.led_green || ledStatus === 1 || ledStatus === 1.0,
            yellow: telemetry?.led_yellow || ledStatus === 0 || ledStatus === 0.0,
            red: telemetry?.led_red || ledStatus === 2 || ledStatus === 2.0,
            cycle_start: telemetry?.cycle_start || rpm > 0
          },
          spindle: {
            speed: rpm,
            temperature: telemetry?.spindle_temp ?? telemetry?.temperature ?? 0,
            vibration: telemetry?.spindle_vibration ?? telemetry?.x_rms_acceleration ?? 0
          },
          tool: {
            number: telemetry?.tool_number ?? 1,
            temperature: telemetry?.tool_temp ?? telemetry?.temperature ?? 0,
            vibration: telemetry?.tool_vibration ?? telemetry?.y_rms_acceleration ?? 0,
            reboot_count: telemetry?.reboot_count ?? 0
          },
          axes: {
            x: {
              rms_accel: telemetry?.x_rms_acceleration ?? 0,
              rms_velocity: telemetry?.x_rms_velocity ?? 0,
              peak_accel: telemetry?.x_peak_acceleration ?? 0,
              peak_velocity: telemetry?.x_peak_velocity ?? 0,
              value: telemetry?.x_axis_value ?? 0
            },
            y: {
              rms_accel: telemetry?.y_rms_acceleration ?? 0,
              rms_velocity: telemetry?.y_rms_velocity ?? 0,
              peak_accel: telemetry?.y_peak_acceleration ?? 0,
              peak_velocity: telemetry?.y_peak_velocity ?? 0,
              value: 0
            },
            z: {
              rms_accel: telemetry?.z_rms_acceleration ?? 0,
              rms_velocity: telemetry?.z_rms_velocity ?? 0,
              peak_accel: telemetry?.z_peak_acceleration ?? 0,
              peak_velocity: telemetry?.z_peak_velocity ?? 0,
              value: telemetry?.z_axis_value ?? 0
            }
          }
        };

        setData(mappedData);
        setConnectionStatus("connected");
      } catch (err) {
        if (stopped) return;
        console.error(`[useMiracData:${hookId}] VIBIT poll error`, err);
        setConnectionStatus("disconnected");
      }
    }

    // Initial fetch
    fetchData();

    // Guard: only create ONE interval per hook instance
    if (pollRef.current === null) {
      console.log(`[useMiracData:${hookId}] Starting polling interval (${POLL_INTERVAL_MS}ms)`);
      pollRef.current = window.setInterval(fetchData, POLL_INTERVAL_MS);
    } else {
      console.warn(`[useMiracData:${hookId}] Interval already exists, skipping duplicate`);
    }

    return () => {
      stopped = true;
      if (pollRef.current != null) {
        console.log(`[useMiracData:${hookId}] Cleaning up polling interval`);
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  return { data, connectionStatus };
};

// --- Helper: Normalize axis position to carriage percentage (0-100) ---
// Uses X-axis position as proxy for carriage travel along bed
const getCarriagePositionPct = (axisData) => {
  if (!axisData?.x?.peak_velocity) return 50; // Default center
  // Normalize: assume 0-2 mm/s range maps to 0-100% travel
  return Math.min(100, Math.max(0, (axisData.x.peak_velocity / 2) * 100));
};

// --- Subcomponents for Clean Layout ---

const HorizontalLamp = ({ active, colorVariant }) => {
  let colors = { bg: '', glow: '' };
  if (colorVariant === 'green') {
    colors.bg = active ? 'radial-gradient(circle, #4ade80, #22c55e)' : 'radial-gradient(circle, #1a1a1a, #0a0a0a)';
    colors.glow = active ? '0 0 12px rgba(74, 222, 128, 0.6), inset 0 1px 2px rgba(255,255,255,0.3)' : 'inset 0 1px 3px rgba(0,0,0,0.5)';
  } else if (colorVariant === 'yellow') {
    colors.bg = active ? 'radial-gradient(circle, #fbbf24, #f59e0b)' : 'radial-gradient(circle, #1a1a1a, #0a0a0a)';
    colors.glow = active ? '0 0 12px rgba(251, 191, 36, 0.6), inset 0 1px 2px rgba(255,255,255,0.3)' : 'inset 0 1px 3px rgba(0,0,0,0.5)';
  } else if (colorVariant === 'red') {
    colors.bg = active ? 'radial-gradient(circle, #ef4444, #dc2626)' : 'radial-gradient(circle, #1a1a1a, #0a0a0a)';
    colors.glow = active ? '0 0 12px rgba(239, 68, 68, 0.6), inset 0 1px 2px rgba(255,255,255,0.3)' : 'inset 0 1px 3px rgba(0,0,0,0.5)';
  }

  return (
    <div style={{
      width: '28px', height: '28px', borderRadius: '50%',
      border: '2px solid #444',
      background: colors.bg,
      boxShadow: colors.glow,
      transition: 'all 0.3s ease'
    }} />
  );
};

const OpPill = ({ label, active }) => (
  <div style={{
    padding: '0.4rem 0.6rem',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: active ? 'rgba(74, 222, 128, 0.1)' : 'var(--bg-primary)',
    color: active ? '#4ade80' : 'var(--text-muted)',
    border: `1px solid ${active ? '#4ade80' : 'var(--border)'}`,
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  }}>
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#4ade80' : '#444' }} />
    {label}
  </div>
);

const SmallMetric = ({ title, value, unit }) => (
  <div>
    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
      {title}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
      <span style={{ fontSize: '1.2rem', fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value !== undefined && value !== null ? value.toFixed ? value.toFixed(2) : value : "---"}
      </span>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{unit}</span>
    </div>
  </div>
);

// --- Main Page Component ---
const Mirac = () => {
  const { data, connectionStatus: wsStatus } = useMiracData();
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  // Check OPC-UA status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await MiracControlService.getConnectionStatus();
        setIsConnected(res.status === 'connected');
      } catch (e) {
        console.error(e);
        setIsConnected(false);
      } finally {
        setStatusLoading(false);
      }
    };
    checkStatus();
  }, []);

  const handleConnect = async () => {
    setStatusLoading(true);
    try {
      const res = await MiracControlService.connect();
      if (res.success) {
        setIsConnected(true);
        toast.success(res.message || "Connected to MIRAC-PC");
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(e.message || 'Failed to connect');
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
        toast.success(res.message || "Disconnected from MIRAC-PC");
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(e.message || 'Failed to disconnect');
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="asrs-inventory module-layout">
      {/* Header - Consistent with Assembly */}
      <PageHeader
        title="MIRAC-PC"
        subtitle="CNC Machine Control"
        status={isConnected ? 'SYSTEM ACTIVE' : 'IDLE'}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              onClick={() => setDemoMode(!demoMode)}
              className={demoMode ? 'btn btn-warning btn-sm' : 'btn btn-ghost btn-sm'}
              style={{
                height: '28px',
                fontSize: '0.75rem',
                padding: '0 0.75rem',
                border: demoMode ? '1px solid rgba(251, 146, 60, 0.5)' : '1px solid rgba(255,255,255,0.2)'
              }}
              title="Toggle demo mode (pendulum motion)"
            >
              {demoMode ? 'Demo: ON' : 'Demo: OFF'}
            </button>
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                className="btn btn-error btn-sm"
                style={{
                  height: '28px',
                  fontSize: '0.75rem',
                  padding: '0 0.75rem'
                }}
                disabled={statusLoading}
              >
                {statusLoading ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="btn btn-success btn-sm"
                style={{
                  height: '28px',
                  fontSize: '0.75rem',
                  padding: '0 0.75rem'
                }}
                disabled={statusLoading}
              >
                {statusLoading ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
        }
      />

      {/* Main Layout Area */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* 2-Column Layout: Data Sidebar + Machine Visualization */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 320px) 1fr',
          gap: '1.5rem',
          flex: 1,
          minHeight: 0
        }}>
          {/* LEFT: Data Sidebar */}
          <aside className="assembly-sidebar" style={{ overflowY: 'auto' }}>

          {/* 1. Machine Status */}
          <div className="sidebar-section" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Machine Status
            </div>

            {/* Horizontal LEDs */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '1rem', padding: '0.5rem 0 1.25rem 0' }}>
              <HorizontalLamp active={data?.status?.green} colorVariant="green" />
              <HorizontalLamp active={data?.status?.yellow} colorVariant="yellow" />
              <HorizontalLamp active={data?.status?.red} colorVariant="red" />
            </div>


          </div>

          {/* 2. Spindle Dynamics */}
          <div className="sidebar-section" style={{ borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Spindle Dynamics
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <SmallMetric title="Speed" value={data?.spindle?.speed} unit="RPM" />
              <SmallMetric title="Temp" value={data?.spindle?.temperature} unit="°C" />
              <SmallMetric title="Vibration" value={data?.spindle?.vibration} unit="mm/s" />
            </div>
          </div>

          {/* 3. Active Tool */}
          <div className="sidebar-section" style={{ borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Active Tool
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <SmallMetric title="Tool Num" value={data?.tool?.number} unit="#" />
              <SmallMetric title="Temp" value={data?.tool?.temperature} unit="°C" />
              <SmallMetric title="Vibration" value={data?.tool?.vibration} unit="mm/s" />
              <SmallMetric title="Reboot Count" value={data?.tool?.reboot_count} unit="" />
            </div>
          </div>

          {/* 4. Axis Telemetry - Full Metrics */}
          <div className="sidebar-section">
            <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Axis Telemetry
            </div>

            {/* X Axis */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#4dabf7', fontWeight: 700 }}>X</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
                <SmallMetric title="RMS Accel" value={data?.axes?.x?.rms_accel} unit="mm/s²" />
                <SmallMetric title="Peak Accel" value={data?.axes?.x?.peak_accel} unit="mm/s²" />
                <SmallMetric title="RMS Velocity" value={data?.axes?.x?.rms_velocity} unit="mm/s" />
                <SmallMetric title="Peak Velocity" value={data?.axes?.x?.peak_velocity} unit="mm/s" />
              </div>
            </div>

            {/* Y Axis */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#51cf66', fontWeight: 700 }}>Y</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
                <SmallMetric title="RMS Accel" value={data?.axes?.y?.rms_accel} unit="mm/s²" />
                <SmallMetric title="Peak Accel" value={data?.axes?.y?.peak_accel} unit="mm/s²" />
                <SmallMetric title="RMS Velocity" value={data?.axes?.y?.rms_velocity} unit="mm/s" />
                <SmallMetric title="Peak Velocity" value={data?.axes?.y?.peak_velocity} unit="mm/s" />
              </div>
            </div>

            {/* Z Axis */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#ff6b6b', fontWeight: 700 }}>Z</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
                <SmallMetric title="RMS Accel" value={data?.axes?.z?.rms_accel} unit="mm/s²" />
                <SmallMetric title="Peak Accel" value={data?.axes?.z?.peak_accel} unit="mm/s²" />
                <SmallMetric title="RMS Velocity" value={data?.axes?.z?.rms_velocity} unit="mm/s" />
                <SmallMetric title="Peak Velocity" value={data?.axes?.z?.peak_velocity} unit="mm/s" />
              </div>
            </div>
          </div>

        </aside>

        {/* RIGHT: Machine Visualization */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          gap: '1rem'
        }}>
          <MiracMachineView
            spindleRPM={data?.spindle?.speed || 0}
            carriagePositionPct={getCarriagePositionPct(data?.axes)}
            spindleRunning={data?.status?.cycle_start || false}
            alarmActive={!isConnected}
            toolEngaged={false}
            coolantOn={false}
            demoMode={demoMode}
          />
        </div>
      </div>
      </div>
    </div>
  );
};

export default Mirac;