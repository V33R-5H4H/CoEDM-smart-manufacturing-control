import React, { useState, useEffect, useRef, useCallback } from "react";
import BoxesTab from "./components/BoxesTab";
import ItemsTab from "./components/ItemsTab";
import TransactionsTab from "./components/TransactionsTab";
import TopStatusRibbon from "./components/TopStatusRibbon";
import PageHeader from "../../components/PageHeader";
import { useLEDMonitoring } from "./hooks/useLEDMonitoring";
import { useTheme } from "../../theme/ThemeContext";
import { ToastContainer, toast } from "react-toastify";
import { motion, AnimatePresence } from "framer-motion";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = `${import.meta.env.VITE_API_URL || "/api"}/control/asrs`;

function Dashboard() {
  const [activeTab, setActiveTab] = useState("boxes");
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const { shuttleState, connected: ledConnected, ledStates, safetyCurtainActive } = useLEDMonitoring();
  const { resolved: theme } = useTheme();

  // Edge-triggered safety alerts
  const prevSafetyRef = useRef(false);

  useEffect(() => {
    const prev = prevSafetyRef.current;
    if (safetyCurtainActive && !prev) {
      toast.error('⚠️ SAFETY CURTAIN TRIGGERED — Human presence detected!', {
        toastId: 'curtain-alert',
        autoClose: false,
        closeOnClick: false,
      });
    } else if (!safetyCurtainActive && prev) {
      toast.dismiss('curtain-alert');
    }
    prevSafetyRef.current = safetyCurtainActive;
  }, [safetyCurtainActive]);

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

  const tabPanels = {
    boxes: <BoxesTab isServerConnected={isConnected} ledStates={ledStates} shuttleState={shuttleState} ledConnected={ledConnected} />,
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
      position: 'relative',
    }}>
      {/* Stitch-style top bar */}
      <PageHeader
        title="AS/RS"
        subtitle="Inventory"
        actions={
          <>
            {isConnected && (
              <button
                type="button"
                disabled={safetyCurtainActive}
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/home`, { method: "POST" });
                    if (res.ok) toast.info("Resetting shuttle to Home (A7)…");
                  } catch {
                    toast.error("Failed to reset shuttle");
                  }
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: safetyCurtainActive ? 'var(--text-muted)' : 'var(--status-error)',
                  border: `1px solid ${safetyCurtainActive ? 'var(--border)' : 'var(--status-error)'}`,
                  background: 'transparent',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  cursor: safetyCurtainActive ? 'not-allowed' : 'pointer',
                  opacity: safetyCurtainActive ? 0.5 : 1,
                }}
                title={safetyCurtainActive ? "Disabled due to safety curtain breach" : "Force reset shuttle position to A7"}
              >
                Reset A7
              </button>
            )}
            <TopStatusRibbon
              plcConnected={isConnected}
              ledConnected={ledConnected}
              shuttleState={shuttleState}
            />
            {isConnected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={safetyCurtainActive || statusLoading}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: safetyCurtainActive ? 'var(--text-muted)' : 'var(--text-primary)',
                  background: safetyCurtainActive ? 'var(--bg-elevated)' : 'var(--primary-dark)',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  opacity: statusLoading ? 0.7 : 1,
                }}
              >
                {statusLoading ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={safetyCurtainActive || statusLoading}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: safetyCurtainActive ? 'var(--text-muted)' : 'var(--bg-primary)',
                  background: safetyCurtainActive ? 'var(--bg-elevated)' : 'var(--primary)',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  opacity: statusLoading ? 0.7 : 1,
                }}
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
              disabled={safetyCurtainActive}
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: '11px',
                fontWeight: activeTab === tab ? 700 : 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: safetyCurtainActive
                  ? 'var(--text-muted)'
                  : (activeTab === tab ? 'var(--primary)' : 'var(--text-muted)'),
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                padding: '10px 0',
                cursor: safetyCurtainActive ? 'not-allowed' : 'pointer',
                transition: 'color 150ms ease-out',
                opacity: safetyCurtainActive ? 0.5 : 1,
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Workspace — fills remaining space */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: safetyCurtainActive ? 'none' : 'auto',
        opacity: safetyCurtainActive ? 0.35 : 1,
        transition: 'opacity 300ms ease-in-out',
      }}>
        {tabPanels[activeTab]}
      </div>

      {/* SAFETY INTERRUPT OVERLAY */}
      <AnimatePresence>
        {safetyCurtainActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: `
                linear-gradient(0deg, rgba(220, 38, 38, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(220, 38, 38, 0.03) 1px, transparent 1px),
                #000000e0
              `,
              backgroundSize: '40px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.5rem',
              zIndex: 9999,
              border: '2px solid #dc2626',
              boxShadow: 'inset 0 0 100px rgba(220, 38, 38, 0.3)',
              padding: '2rem',
              backdropFilter: 'blur(3px)',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2.5rem',
              flexWrap: 'wrap',
              maxWidth: '800px',
            }}>
              {/* Warning Triangle */}
              <motion.div
                animate={{
                  opacity: [1, 0.5, 1],
                  scale: [1, 1.02, 1]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" />
                  <circle cx="12" cy="17" r="0.5" fill="#dc2626" />
                </svg>
              </motion.div>

              {/* Text Warning Details */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                alignItems: 'flex-start'
              }}>
                <motion.div
                  animate={{ opacity: [1, 0.8, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    fontSize: 'clamp(2rem, 3.6vw, 3.5rem)',
                    fontWeight: 900,
                    color: '#dc2626',
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    fontFamily: 'monospace',
                    textShadow: '0 0 20px rgba(220, 38, 38, 0.8), 0 0 40px rgba(220, 38, 38, 0.5)',
                    lineHeight: 1.1
                  }}
                >
                  SAFETY<br />INTERRUPT
                </motion.div>

                <div style={{
                  fontSize: 'clamp(0.95rem, 1.8vw, 1.15rem)',
                  fontWeight: 600,
                  color: '#fca5a5',
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em',
                  maxWidth: '560px',
                  lineHeight: 1.5
                }}>
                  Human presence detected in smart cell area. Physical safety light curtain has been breached. All AS/RS shuttle motion has been locked.
                </div>

                <div style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#dc2626',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginTop: '0.5rem',
                  padding: '0.6rem 1.2rem',
                  background: 'rgba(220, 38, 38, 0.15)',
                  border: '2px solid #dc2626',
                  borderRadius: '0',
                  fontFamily: 'monospace',
                  boxShadow: '0 0 15px rgba(220, 38, 38, 0.4)'
                }}>
                  ■ MOTION LOCKOUT ACTIVE · AWAITING CLEARANCE
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
