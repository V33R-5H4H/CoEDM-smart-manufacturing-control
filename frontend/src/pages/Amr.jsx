import React, { useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";
import PageHeader from "../components/PageHeader";
import AmrStatusRibbon from "./asrs/components/AmrStatusRibbon";
import AmrControlService from "../services/AmrControl";
import AmrIcon from "../components/icons/AmrIcon";
import StationEmoticon from "../components/StationEmoticon";

export default function Amr() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [telemetry, setTelemetry] = useState({
    status: "disconnected",
    last_message: null,
    last_seen: null,
    battery: null,
    position: null,
    error: null
  });
  const [posHistory, setPosHistory] = useState([]);

  // Single source of truth for station real-world coords → screen % positions
  // Must match STATIONS in tcp_nav_bridge/tcp_nav_bridge/tcp_nav_node.py on the robot
  const STATION_MAP = {
    ASRS:       { x: -4.000000, y:  0.200000, sx: 10, sy: 50 },
    INSPECTION: { x: -3.000000, y:  0.200000, sx: 90, sy: 50 },
    TESTING:    { x: -2.000000, y:  0.200000, sx: 70, sy: 83 },
    HOME:       { x:  0.000000, y:  0.000000, sx: 50, sy: 50 },
    TRIAC:      { x:  1.476023, y:  0.405875, sx: 50, sy: 17 },
    MIRAC:      { x:  4.148900, y:  0.427600, sx: 30, sy: 17 },
    ASSEMBLY:   { x:  5.630868, y:  1.215410, sx: 75, sy: 17 },  // updated to active robot coordinates
  };

  const getScreenCoords = (amrX, amrY) => {
    const stations = STATION_MAP;

    let totalWeight = 0;
    let screenX = 0;
    let screenY = 0;

    for (const name in stations) {
      const s = stations[name];
      const dx = amrX - s.x;
      const dy = amrY - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.05) {
        return { x: s.sx, y: s.sy };
      }

      const w = 1 / (dist * dist);
      totalWeight += w;
      screenX += s.sx * w;
      screenY += s.sy * w;
    }

    if (totalWeight === 0) return { x: 50, y: 50 };
    return { x: screenX / totalWeight, y: screenY / totalWeight };
  };

  useEffect(() => {
    if (telemetry.position && telemetry.position.x !== undefined && telemetry.position.y !== undefined) {
      const coords = getScreenCoords(telemetry.position.x, telemetry.position.y);
      setPosHistory(prev => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (Math.abs(last.x - coords.x) < 0.1 && Math.abs(last.y - coords.y) < 0.1) {
            return prev;
          }
        }
        const updated = [...prev, coords];
        if (updated.length > 40) {
          updated.shift();
        }
        return updated;
      });
    }
  }, [telemetry.position]);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const connectWS = () => {
    if (wsRef.current) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = import.meta.env.VITE_WS_URL || window.location.host;
    const wsUrl = `${protocol}//${host}/api/control/amr/ws`;

    console.log("[AMR] Connecting to WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[AMR] WebSocket connected");
      setStatusLoading(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "amr_state") {
          setTelemetry(data.payload);
          setIsConnected(data.payload.status !== "disconnected");
        }
      } catch (err) {
        console.error("[AMR] Error parsing WS message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[AMR] WebSocket error:", err);
    };

    ws.onclose = () => {
      console.log("[AMR] WebSocket closed, reconnecting in 3s...");
      setIsConnected(false);
      setStatusLoading(false);
      wsRef.current = null;
      setTelemetry({
        status: "disconnected",
        last_message: null,
        last_seen: null,
        battery: null,
        position: null,
        error: null
      });
      setPosHistory([]);

      reconnectTimerRef.current = setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          connectWS();
        }
      }, 3000);
    };
  };

  const disconnectWS = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const handleConnect = async () => {
    setStatusLoading(true);
    const res = await AmrControlService.connectAMR();
    if (res.success) {
      connectWS();
    } else {
      toast.error(res.message);
      setStatusLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setStatusLoading(true);
    const res = await AmrControlService.disconnectAMR();
    if (res.success) {
      clearTimeout(reconnectTimerRef.current);
      disconnectWS();
    } else {
      toast.error(res.message);
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await AmrControlService.getConnectionStatus();
        setIsConnected(!!res.connected);
      } catch (e) {
        console.error("[AMR] Error getting connection status:", e);
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
  }, []);

  const handleDispatch = async (stationName, cmd) => {
    if (!cmd) {
      toast.warning(`Dispatch to ${stationName} is not yet configured.`);
      return;
    }
    
    toast.info(`Dispatching AMR to ${stationName}...`);
    const res = await AmrControlService.dispatchAMR(cmd);
    
    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(`Failed to dispatch: ${res.message}`);
    }
  };

  return (
    <div className="asm-page">
      <PageHeader
        title="Smart AMR"
        subtitle="Mobile Robot Telemetry & Path Dispatcher"
        actions={
          <>
            <AmrStatusRibbon
              plcConnected={isConnected}
              wsStatus={isConnected ? "connected" : "disconnected"}
              robotStatus={isConnected ? telemetry.status.toUpperCase() : "OFFLINE"}
            />
            {isConnected ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleDispatch("HOME", "HOME")}
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
                  }}
                >
                  Return Home
                </button>
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
                  {statusLoading ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
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
                {statusLoading ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </>
        }
      />
      <div className="asm-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, height: 'calc(100vh - 80px)', padding: '16px', boxSizing: 'border-box', overflow: 'hidden' }}>
        {/* Full Page Grid Layout representing the Factory Floor */}
        <div style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: '20px',
          width: '100%',
          height: '100%',
          padding: '40px',
          boxSizing: 'border-box',
          borderRadius: '12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.1), var(--shadow-lg)',
          backgroundImage: `
            linear-gradient(to right, color-mix(in srgb, var(--border) 45%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in srgb, var(--border) 45%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px, 40px 40px',
          overflow: 'hidden'
        }}>

          {/* Coordinate Grid Ticks and Labeling (Floor Blueprint Style) */}
          {/* Top Border Ticks (X Axis meters) */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '40px',
            right: '40px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            opacity: 0.9,
            pointerEvents: 'none'
          }}>
            <span>X: -5.0m</span>
            <span>-2.5m</span>
            <span>0.0m (HOME)</span>
            <span>+2.5m</span>
            <span>X: +5.0m</span>
          </div>

          {/* Left Border Ticks (Y Axis meters) */}
          <div style={{
            position: 'absolute',
            left: '12px',
            top: '40px',
            bottom: '40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            opacity: 0.9,
            pointerEvents: 'none'
          }}>
            <span>Y: +1.0m</span>
            <span>0.0m</span>
            <span>Y: -1.0m</span>
          </div>

          {/* Right Border Ticks (Y Axis meters) */}
          <div style={{
            position: 'absolute',
            right: '12px',
            top: '40px',
            bottom: '40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            opacity: 0.9,
            pointerEvents: 'none'
          }}>
            <span>Y: +1.0m</span>
            <span>0.0m</span>
            <span>Y: -1.0m</span>
          </div>

          {/* SVG Track Lines directly on the main Grid page */}
          <svg style={{ position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, top: 0, left: 0 }}>
            <defs>
              <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--primary-dark)" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            
            {/* Central hub lines connecting columns */}
            {/* Path layout lines */}
            <line x1="10%" y1="50%" x2="50%" y2="50%" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.6" />
            <line x1="50%" y1="50%" x2="90%" y2="50%" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.6" />
            <line x1="30%" y1="17%" x2="50%" y2="50%" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.6" />
            <line x1="50%" y1="17%" x2="50%" y2="50%" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.6" />
            <line x1="70%" y1="17%" x2="50%" y2="50%" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.6" />
            <line x1="70%" y1="83%" x2="50%" y2="50%" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.6" />

            {/* Live Breadcrumb / Coordinate trail plotted in real time */}
            {posHistory.length > 1 && (
              <path
                d={posHistory.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x}% ${p.y}%`).join(' ')}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.65"
                style={{ filter: 'drop-shadow(0 0 5px var(--primary))' }}
              />
            )}
            {posHistory.map((p, idx) => (
              <circle
                key={idx}
                cx={`${p.x}%`}
                cy={`${p.y}%`}
                r="3.5"
                fill="var(--primary)"
                opacity={0.3 + (0.7 * idx) / posHistory.length}
                style={{ filter: 'drop-shadow(0 0 3px var(--primary))' }}
              />
            ))}

            {/* Glowing active path indicators when navigating */}
            {isConnected && telemetry.status === "navigating" && (
              <>
                <line x1="10%" y1="50%" x2="50%" y2="50%" stroke="var(--primary)" strokeWidth="3" opacity="0.5" />
                <line x1="50%" y1="50%" x2="90%" y2="50%" stroke="var(--primary)" strokeWidth="3" opacity="0.5" />
                <line x1="30%" y1="17%" x2="50%" y2="50%" stroke="var(--primary)" strokeWidth="3" opacity="0.5" />
                <line x1="50%" y1="17%" x2="50%" y2="50%" stroke="var(--primary)" strokeWidth="3" opacity="0.5" />
                <line x1="70%" y1="17%" x2="50%" y2="50%" stroke="var(--primary)" strokeWidth="3" opacity="0.5" />
                <line x1="70%" y1="83%" x2="50%" y2="50%" stroke="var(--primary)" strokeWidth="3" opacity="0.5" />
              </>
            )}
          </svg>

          {/* Station Cards */}
          {[
            { id: 1, name: "ASRS", desc: "Automated Storage & Retrieval System", cmd: "ASRS", gridArea: '2 / 1 / 3 / 2', icon: "dns" },
            { id: 2, name: "MIRAC", desc: "CNC Lathe Machine", cmd: "MIRAC", gridArea: '1 / 2 / 2 / 3', icon: "precision_manufacturing" },
            { id: 3, name: "TRIAC", desc: "CNC Milling Machine", cmd: "TRIAC", gridArea: '1 / 3 / 2 / 4', icon: "settings" },
            { id: 4, name: "ASSEMBLY", desc: "Robotic Assembly Station", cmd: "ASSEMBLY", gridArea: '1 / 4 / 2 / 5', icon: "build" },
            { id: 5, name: "INSPECTION", desc: "Visual Defect Inspection", cmd: "INSPECTION", gridArea: '2 / 5 / 3 / 6', icon: "visibility" },
            { id: 6, name: "TESTING", desc: "Quality Testing Station", cmd: "TESTING", gridArea: '3 / 4 / 4 / 5', icon: "analytics" }
          ].map((station) => (
            <div 
              key={station.id}
              className="asm-hud-card" 
              style={{ 
                gridArea: station.gridArea,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '16px', 
                background: 'color-mix(in srgb, var(--bg-elevated) 85%, transparent)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                borderRadius: '8px',
                transition: 'all 0.3s ease',
                height: 'fit-content',
                alignSelf: station.gridArea.startsWith('1 /') ? 'start' : station.gridArea.startsWith('2 /') ? 'center' : 'end',
                boxSizing: 'border-box',
                zIndex: 2 // Sit above lines but below AMR
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StationEmoticon machineType={station.name.toLowerCase()} state={isConnected ? "idle" : "offline"} size={36} />
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                      {station.name}
                    </span>
                  </div>
                  <span style={{ 
                    fontSize: '0.65rem', 
                    fontWeight: 700, 
                    letterSpacing: '0.1em', 
                    color: 'var(--primary)', 
                    background: 'color-mix(in srgb, var(--primary) 10%, transparent)', 
                    padding: '2px 6px', 
                    borderRadius: '4px',
                    border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)'
                  }}>
                    {String(station.id).padStart(2, '0')}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', lineHeight: '1.3' }}>
                  {station.desc}
                </div>
              </div>
              
              <div style={{ marginTop: 'auto' }}>
                <button 
                  onClick={() => handleDispatch(station.name, station.cmd)}
                  disabled={!isConnected}
                  style={{ 
                    width: '100%', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '38px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    borderRadius: '6px',
                    transition: 'all 0.2s ease',
                    cursor: isConnected ? 'pointer' : 'not-allowed',
                    background: isConnected 
                      ? 'color-mix(in srgb, var(--primary) 15%, transparent)' 
                      : 'var(--bg-hover)',
                    color: isConnected ? 'var(--primary)' : 'var(--text-disabled)',
                    border: isConnected 
                      ? '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' 
                      : '1px solid var(--border)',
                    boxShadow: isConnected ? '0 0 15px color-mix(in srgb, var(--primary) 15%, transparent)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (isConnected) {
                      e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 25%, transparent)';
                      e.currentTarget.style.boxShadow = '0 0 20px color-mix(in srgb, var(--primary) 25%, transparent)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isConnected) {
                      e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 15%, transparent)';
                      e.currentTarget.style.boxShadow = '0 0 15px color-mix(in srgb, var(--primary) 15%, transparent)';
                    }
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '8px', opacity: 0.8 }}>
                    {!isConnected ? 'link_off' : 'route'}
                  </span>
                  {!isConnected ? 'OFFLINE' : 'DISPATCH AMR'}
                </button>
              </div>
            </div>
          ))}

          {/* AMR Telemetry Values Card placed in the Bottom Left Corner */}
          <div style={{
            gridArea: '3 / 1 / 4 / 2',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '16px',
            background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
            boxSizing: 'border-box',
            zIndex: 3,
            alignSelf: 'end',
            height: 'fit-content'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                  AMR TELEMETRY
                </span>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: isConnected ? 'var(--status-ok)' : 'var(--status-error)',
                  background: isConnected ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 23, 68, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  {isConnected ? telemetry.status.toUpperCase() : 'OFFLINE'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-hover)', padding: '5px 8px', borderRadius: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>POS X</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {telemetry.position?.x !== undefined ? `${telemetry.position.x.toFixed(3)} m` : '0.000 m'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-hover)', padding: '5px 8px', borderRadius: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>POS Y</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {telemetry.position?.y !== undefined ? `${telemetry.position.y.toFixed(3)} m` : '0.000 m'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-hover)', padding: '5px 8px', borderRadius: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>POS Z</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {telemetry.position?.z !== undefined ? `${telemetry.position.z.toFixed(3)} m` : '0.000 m'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-hover)', padding: '5px 8px', borderRadius: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>HEADING</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {telemetry.position?.yaw !== undefined ? `${telemetry.position.yaw.toFixed(1)}°` : '0.0°'}
                  </span>
                </div>
                {telemetry.error && (
                  <div style={{
                    fontSize: '0.65rem',
                    color: 'var(--error)',
                    background: 'color-mix(in srgb, var(--error) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--error) 20%, transparent)',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    whiteSpace: 'normal',
                    wordBreak: 'break-all'
                  }}>
                    Error: {telemetry.error}
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={telemetry.last_message || 'No messages'}>
              MSG: {telemetry.last_message || 'None'}
            </div>
          </div>

          {/* Moving AMR Robot Icon directly on the page layout */}
          {(() => {
            const pos = (() => {
              if (!telemetry.position) return { x: 50, y: 50 };
              // Reuse the same function that drives posHistory — single source of truth
              return getScreenCoords(telemetry.position.x, telemetry.position.y);
            })();

            return (
              <div style={{
                position: 'absolute',
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: `translate(-50%, -50%) rotate(${telemetry.position?.yaw !== undefined ? telemetry.position.yaw : 0}deg)`,
                zIndex: 20, // Sit on top of cards
                transition: isConnected ? 'all 0.8s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none',
                pointerEvents: 'none'
              }}>
                <AmrIcon state={isConnected ? (telemetry.status === "navigating" ? "moving" : (telemetry.status === "error" ? "error" : "idle")) : "offline"} size={60} />
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
