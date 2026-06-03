import React, { useState, useEffect, useRef } from "react";
import BoxesTab from "./components/BoxesTab";
import ItemsTab from "./components/ItemsTab";
import TransactionsTab from "./components/TransactionsTab";
import TopStatusRibbon from "./components/TopStatusRibbon";
import PageHeader from "../../components/PageHeader";
import { useLEDMonitoring } from "./hooks/useLEDMonitoring";
import { useTheme } from "../../theme/ThemeContext";
import { toast } from "react-toastify";
import "../Assembly.css";
import SafetyOverlay from "../../components/SafetyOverlay";
import TutorialOverlay from "./components/TutorialOverlay";

const API_BASE = `${import.meta.env.VITE_API_URL || "/api"}/control/asrs`;

function Dashboard() {
  const [activeTab, setActiveTab] = useState("boxes");
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const { shuttleState, connected: ledConnected, ledStates, safetyCurtain } = useLEDMonitoring();
  const { resolved: theme } = useTheme();

  const prevSafetyCurtainRef = useRef(false);

  // ── Custom Tutorial ──────────────────────────────────────────────────────
  const [tutorialActive, setTutorialActive] = useState(false);
  // advanceRef is called by the box-click handler to move past the
  // "click any box" step without any Joyride controlled-mode complexity.
  const advanceRef = useRef(null);

  const TUTORIAL_STEPS = [
    {
      targetId: 'asrs-cell-DROP_OFF',
      title: 'Handoff Zone',
      content: 'This is where AMRs and operators drop off or pick up crates. The shuttle crane services this position first.',
      placement: 'right',
    },
    {
      targetId: 'asrs-connect-btn',
      title: 'Connect / Disconnect',
      content: 'Use this button to connect the AS/RS control system to the OPC-UA server. You must be connected to run store or retrieve operations.',
      placement: 'bottom',
    },
    {
      targetId: 'asrs-rack-grid',
      title: 'Storage Matrix',
      content: 'Each cell is a physical bin. The colour shows occupancy: green = full, red = empty. Click any bin now to open its operations panel.',
      placement: 'right',
      waitForClick: true,
    },
    {
      targetId: 'asrs-operations-panel',
      title: 'Operations Panel',
      content: 'This panel slides up whenever you select a bin. From here you can inspect the bin\'s contents and choose to Store or Retrieve an item. The left side shows the 6 subcompartment slots; the right side shows the action.',
      placement: 'top',
    },
    {
      targetId: 'asrs-subcompartment-grid',
      title: 'Subcompartment Slots',
      content: 'Each bin has 6 slots labelled A–F. Green slots are occupied; dashed slots are empty. Click a slot to select it — the right panel will automatically show Store or Retrieve based on whether it\'s occupied.',
      placement: 'right',
    },
    {
      targetId: 'asrs-action-area',
      title: 'Execute Store or Retrieve',
      content: 'Once a slot is selected, this area shows the action. For empty slots: pick an inventory item and hit Execute Store. For occupied slots: hit Execute Retrieve to dispatch the shuttle. That\'s it — you\'re ready!',
      placement: 'top',
    },
  ];

  // Listen for box clicks so we can advance past the "click any box" step.
  // Registered once — reads tutorialActive via ref to avoid stale closures.
  const tutorialActiveRef = useRef(false);
  useEffect(() => { tutorialActiveRef.current = tutorialActive; }, [tutorialActive]);

  useEffect(() => {
    const handleBoxClicked = () => {
      if (!tutorialActiveRef.current) return;
      // advanceRef.current is set by TutorialOverlay and moves to the next step.
      // We wait one rAF so the OperationsPanel has time to mount before the
      // overlay tries to measure its bounding rect.
      const tryAdvance = () => {
        const panel = document.getElementById('asrs-operations-panel');
        if (panel) {
          advanceRef.current?.();
        } else {
          requestAnimationFrame(tryAdvance);
        }
      };
      requestAnimationFrame(tryAdvance);
    };
    window.addEventListener('asrs-box-clicked', handleBoxClicked);
    return () => window.removeEventListener('asrs-box-clicked', handleBoxClicked);
  }, []);

  // Trigger edge-triggered toast notifications for ASRS Safety Curtain status
  useEffect(() => {
    if (safetyCurtain && !prevSafetyCurtainRef.current) {
      toast.error("⚠️ SAFETY CURTAIN TRIGGERED — Human presence detected!", {
        toastId: "asrs-curtain-alert",
        autoClose: false,
        closeOnClick: false,
      });
    } else if (!safetyCurtain && prevSafetyCurtainRef.current) {
      toast.dismiss("asrs-curtain-alert");
    }
    prevSafetyCurtainRef.current = safetyCurtain;
  }, [safetyCurtain]);

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
  const isSafetyInterrupted = safetyCurtain;
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
      {/* Custom tutorial overlay — replaces Joyride */}
      {tutorialActive && (
        <TutorialOverlay
          steps={TUTORIAL_STEPS}
          advanceRef={advanceRef}
          onFinish={() => setTutorialActive(false)}
        />
      )}
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
            
            {/* Tutorial Button */}
            <button
              type="button"
              onClick={() => setTutorialActive(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '4px 12px',
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>school</span>
              Start Tutorial
            </button>
            {isConnected ? (
              <button
                id="asrs-connect-btn"
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
                id="asrs-connect-btn"
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
        <div id="asrs-status-tower" style={{
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
              border: '1.5px solid var(--border-dark)',
              background: greenActive ? 'var(--status-ok)' : 'transparent',
              opacity: greenActive ? 1 : 0.3,
              boxShadow: greenActive ? '0 0 8px var(--status-ok)' : 'none',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: greenActive ? 'var(--status-ok)' : 'var(--text-disabled)' }}>RUN</span>
          </div>

          {/* BUSY LED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Shuttle Moving or Active">
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '1.5px solid var(--border-dark)',
              background: orangeActive ? 'var(--status-warn)' : 'transparent',
              opacity: orangeActive ? 1 : 0.3,
              boxShadow: orangeActive ? '0 0 8px var(--status-warn)' : 'none',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: orangeActive ? 'var(--status-warn)' : 'var(--text-disabled)' }}>BUSY</span>
          </div>

          {/* FLT LED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Safety Curtain Triggered or Fault Active">
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '1.5px solid var(--border-dark)',
              background: redActive ? 'var(--status-error)' : 'transparent',
              opacity: redActive ? 1 : 0.3,
              boxShadow: redActive ? '0 0 8px var(--status-error)' : 'none',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: redActive ? 'var(--status-error)' : 'var(--text-disabled)' }}>FLT</span>
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
        <SafetyOverlay
          isVisible={isSafetyInterrupted}
          message="Human presence detected in ASRS area (safety curtain breached)."
          badgeText="ASRS Operations Locked Out"
        />
      </div>

    </div>
  );
}

export default Dashboard;
