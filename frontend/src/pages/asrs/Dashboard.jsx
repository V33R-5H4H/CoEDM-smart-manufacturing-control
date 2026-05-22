import React, { useState, useEffect, useRef } from "react";
import BoxesTab from "./components/BoxesTab";
import ItemsTab from "./components/ItemsTab";
import TransactionsTab from "./components/TransactionsTab";
import TopStatusRibbon from "./components/TopStatusRibbon";
import PageHeader from "../../components/PageHeader";
import { useLEDMonitoring } from "./hooks/useLEDMonitoring";
import { useTheme } from "../../theme/ThemeContext";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../Assembly.css";

const API_BASE = `${import.meta.env.VITE_API_URL || "/api"}/control/asrs`;

function Dashboard() {
  const [activeTab, setActiveTab] = useState("boxes");
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const { shuttleState, connected: ledConnected, ledStates } = useLEDMonitoring();
  const { resolved: theme } = useTheme();

  // Safety telemetry state synced from cell automation
  const [safetyState, setSafetyState] = useState({
    curtain: false,
    buzzer: false,
    lights: { red: false, orange: false, green: false }
  });

  const prevSafetyRef = useRef({ curtain: false, buzzer: false });

  // Connect to the central cell-wide safety curtain & buzzer telemetry channel
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiBase = import.meta.env.VITE_API_URL || "/api";
    const httpBase = apiBase.startsWith("http") ? apiBase : `${window.location.origin}${apiBase}`;
    const wsBase = import.meta.env.VITE_WS_URL || httpBase.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/control/assembly/ws/hydraulic-data`;

    let ws;
    let reconnectTimer;

    function connect() {
      console.log("[ASRS Dashboard] Subscribing to safety telemetry:", wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.safety) {
            setSafetyState({
              curtain: !!data.safety.curtain,
              buzzer: !!data.safety.buzzer,
              lights: {
                red: !!data.safety.lights?.red,
                orange: !!data.safety.lights?.orange,
                green: !!data.safety.lights?.green
              }
            });

            // Edge-triggered safety alerts to avoid spamming toast notifications
            const prev = prevSafetyRef.current;
            if (data.safety.curtain && !prev.curtain) {
              toast.error("⚠️ SAFETY CURTAIN TRIGGERED — Human presence detected!", {
                toastId: "asrs-curtain-alert",
                autoClose: false,
                closeOnClick: false,
              });
            }
            if (data.safety.buzzer && !prev.buzzer) {
              toast.error("🔔 BUZZER ACTIVE — Emergency condition!", {
                toastId: "asrs-buzzer-alert",
                autoClose: false,
                closeOnClick: false,
              });
            }

            // Dismiss alerts when conditions return to normal
            if (!data.safety.curtain && prev.curtain) toast.dismiss("asrs-curtain-alert");
            if (!data.safety.buzzer && prev.buzzer) toast.dismiss("asrs-buzzer-alert");

            prevSafetyRef.current = {
              curtain: !!data.safety.curtain,
              buzzer: !!data.safety.buzzer,
            };
          }
        } catch (err) {
          console.error("[ASRS Dashboard] Error parsing safety ws data:", err);
        }
      };

      ws.onclose = () => {
        console.warn("[ASRS Dashboard] Safety WS closed. Reconnecting in 3s...");
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch(`${API_BASE}/connection-status`);
        const result = await response.json();
        setIsConnected(result.connected);
      } catch {
        setIsConnected(false);
      }
    };
    checkConnection();
  }, []);

  const handleDisconnect = async () => {
    setStatusLoading(true);
    try {
      const response = await fetch(`${API_BASE}/disconnect`, { method: "POST" });
      const result = await response.json();
      if (result.success) {
        setIsConnected(false);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to disconnect from OPC-UA server.");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleConnect = async () => {
    setStatusLoading(true);
    try {
      const response = await fetch(`${API_BASE}/connect`, { method: "POST" });
      const result = await response.json();
      if (result.success) {
        setIsConnected(true);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to connect to OPC-UA server.");
    } finally {
      setStatusLoading(false);
    }
  };

  // Derive status tower light conditions: Green (RUN), Orange (BUSY), Red (FLT)
  const isSafetyInterrupted = safetyState.curtain || safetyState.buzzer;
  const greenActive = isConnected && !isSafetyInterrupted && shuttleState?.state !== "moving" && shuttleState?.state !== "busy";
  const orangeActive = isConnected && !isSafetyInterrupted && (shuttleState?.state === "moving" || shuttleState?.state === "busy");
  const redActive = isSafetyInterrupted || shuttleState?.state === "error" || shuttleState?.state === "fault";

  const tabPanels = {
    boxes: (
      <BoxesTab
        isServerConnected={isConnected}
        ledStates={ledStates}
        shuttleState={shuttleState}
        ledConnected={ledConnected}
        safetyCurtainTriggered={isSafetyInterrupted}
      />
    ),
    items: <ItemsTab isServerConnected={isConnected} />,
    transactions: <TransactionsTab isServerConnected={isConnected} />,
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      {/* Stitch-style top bar */}
      <PageHeader
        title="AS/RS"
        subtitle="Inventory"
        actions={
          <>

            <TopStatusRibbon
              plcConnected={isConnected}
              ledConnected={ledConnected}
              shuttleState={shuttleState}
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
          {["boxes", "items", "transactions"].map((tab) => (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Shuttle Moving or Active">
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Safety Curtain Triggered or Fault Active">
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

      {/* Workspace — fills remaining space */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {tabPanels[activeTab]}

        {/* SAFETY INTERRUPT OVERLAY */}
        {isSafetyInterrupted && (
          <div className="asm-safety-overlay" style={{ background: "rgba(0,0,0,0.92)", borderRadius: 0 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "1.5rem",
              flexWrap: "wrap",
              padding: "2rem"
            }}>
              <div className="asm-safety-overlay__icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" />
                  <circle cx="12" cy="17" r="0.5" fill="#ef4444" />
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
                <div className="asm-safety-overlay__title">
                  SAFETY<br />INTERRUPT
                </div>
                <div className="asm-safety-overlay__sub" style={{ maxWidth: "420px", fontSize: "0.85rem", margin: 0 }}>
                  {safetyState.curtain
                    ? "Human presence detected in cell area (hydraulic curtain breached)."
                    : "Emergency active (buzzer sound active)."
                  }
                </div>
                <div className="asm-safety-overlay__badge">
                  ASRS Operations Locked Out
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BUZZER ALARM VIEWPORT RING */}
      {safetyState.buzzer && <div className="asm-buzzer-ring" />}

      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        closeOnClick
        pauseOnHover
        draggable
        theme={theme}
      />
    </div>
  );
}

export default Dashboard;
