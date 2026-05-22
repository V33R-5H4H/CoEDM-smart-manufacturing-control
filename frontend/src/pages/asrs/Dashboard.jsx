import React, { useState, useEffect } from "react";
import BoxesTab from "./components/BoxesTab";
import ItemsTab from "./components/ItemsTab";
import TransactionsTab from "./components/TransactionsTab";
import TopStatusRibbon from "./components/TopStatusRibbon";
import PageHeader from "../../components/PageHeader";
import { useLEDMonitoring } from "./hooks/useLEDMonitoring";
import { useTheme } from "../../theme/ThemeContext";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = `${import.meta.env.VITE_API_URL || "/api"}/control/asrs`;

function Dashboard() {
  const [activeTab, setActiveTab] = useState("boxes");
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const { shuttleState, connected: ledConnected, ledStates } = useLEDMonitoring();
  const { resolved: theme } = useTheme();

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
                  color: 'var(--status-error)',
                  border: '1px solid var(--status-error)',
                  background: 'transparent',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
                title="Force reset shuttle position to A7"
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
      </div>

      {/* Workspace — fills remaining space */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {tabPanels[activeTab]}
      </div>

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
