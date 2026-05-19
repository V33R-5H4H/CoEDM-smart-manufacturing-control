import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BoxesTab from "./components/BoxesTab";
import ItemsTab from "./components/ItemsTab";
import TransactionsTab from "./components/TransactionsTab";
import SystemStatusChip from "./components/SystemStatusChip";
import StatusPanel from "./components/StatusPanel";
import { useLEDMonitoring } from "./hooks/useLEDMonitoring";
import { ToastContainer, Flip, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function Dashboard() {
  const [activeTab, setActiveTab] = useState("boxes");
  const [isConnected, setIsConnected] = useState(false);
  const [isStatusExpanded, setIsStatusExpanded] = useState(false);
  const { ledStates, shuttleState, connected: ledConnected } = useLEDMonitoring();

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch("http://100.97.200.68:8000/api/control/asrs/connection-status");
        const result = await response.json();
        setIsConnected(result.connected);
      } catch (error) {
        setIsConnected(false);
      }
    };

    checkConnection();
  }, []);

  const tabContentVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  const handleTabChange = (tab) => {
    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  };

  const renderTabContent = () => (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={tabContentVariants}
        transition={{ duration: 0.3 }}
        className="tab-content-inner"
      >
        {{
          boxes: <BoxesTab isServerConnected={isConnected} />,
          items: <ItemsTab isServerConnected={isConnected} />,
          transactions: <TransactionsTab isServerConnected={isConnected} />,
        }[activeTab] || <BoxesTab isServerConnected={isConnected} />}
      </motion.div>
    </AnimatePresence>
  );

  const createRipple = (event) => {
    const button = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
    circle.classList.add("ripple");

    const ripple = button.getElementsByClassName("ripple")[0];
    if (ripple) ripple.remove();

    button.appendChild(circle);
  };

  const handleDisconnect = async () => {
    try {
      const response = await fetch("http://100.97.200.68:8000/api/control/asrs/disconnect", {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        setIsConnected(false);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("Failed to disconnect from OPC-UA server.");
    }
  };

  const handleConnect = async () => {
    try {
      const response = await fetch("http://100.97.200.68:8000/api/control/asrs/connect", {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        setIsConnected(true);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("Failed to connect to OPC-UA server.");
    }
  };

  return (
    <div className="asrs-inventory" style={{
      height: '100%',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Thin Status Bar - Not a Banner */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          flexShrink: 0,
          height: '44px',
          padding: '0 1.5rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-primary)'
        }}
      >
        {/* Left: Identity - Short Form Only */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <span style={{
            fontSize: '0.9rem',
            fontWeight: '600',
            color: 'var(--text-primary)',
            letterSpacing: '0.02em'
          }}>
            AS/RS
          </span>
          <span style={{
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            fontWeight: '500',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Inventory
          </span>
        </div>

        {/* Center: Current Mode (Subtle) */}
        <div style={{
          fontSize: '0.7rem',
          fontWeight: '600',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em'
        }}>
          {isConnected ? 'SYSTEM ACTIVE' : 'IDLE'}
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
        >
          {/* Reset Home Button - Always Visible */}
          {isConnected && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch('http://100.97.200.68:8000/api/control/asrs/home', { method: 'POST' });
                  if (res.ok) {
                    toast.info('Resetting shuttle to Home (A7)...');
                  }
                } catch (e) {
                  toast.error('Failed to reset shuttle');
                }
              }}
              className="btn btn-ghost btn-xs"
              style={{
                fontSize: '0.75rem',
                height: '28px',
                color: 'var(--text-muted)',
                fontWeight: '500',
                border: '1px solid var(--border)',
                marginRight: '0.5rem'
              }}
              title="Force reset shuttle position to A7"
            >
              ⟲ Reset A7
            </button>
          )}

          <div
            onMouseEnter={() => setIsStatusExpanded(true)}
            onMouseLeave={() => setIsStatusExpanded(false)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >

            <SystemStatusChip
              plcConnected={isConnected}
              ledConnected={ledConnected}
              shuttleState={shuttleState}
              onMouseEnter={() => setIsStatusExpanded(true)}
              isExpanded={isStatusExpanded}
            />
            <StatusPanel
              plcConnected={isConnected}
              ledConnected={ledConnected}
              shuttleState={shuttleState}
              isExpanded={isStatusExpanded}
            />
          </div>
          {isConnected ? (
            <button onClick={handleDisconnect} className="btn btn-error btn-sm" style={{
              height: '28px',
              fontSize: '0.75rem',
              padding: '0 0.75rem'
            }}>
              Disconnect
            </button>
          ) : (
            <button onClick={handleConnect} className="btn btn-success btn-sm" style={{
              height: '28px',
              fontSize: '0.75rem',
              padding: '0 0.75rem'
            }}>
              Connect
            </button>
          )}
        </div>
      </motion.header>

      {/* Fixed Tabs Navigation - Never Scrolls */}
      <div className="tabs" style={{
        flexShrink: 0,
        height: '44px',
        overflow: 'hidden',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)'
      }}>
        {["boxes", "items", "transactions"].map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? "active" : ""}`}
            onClick={(e) => {
              createRipple(e);
              handleTabChange(tab);
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Workspace - Fills Remaining Height, No Scroll */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {renderTabContent()}
      </motion.div>

      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        closeOnClick
        pauseOnHover
        draggable
        theme="light"
        transition={Flip}
        style={{ fontSize: "0.875rem" }}
        toastStyle={{
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
        }}
      />
    </div>
  );
}

export default Dashboard;
