import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import PageHeader from "../components/PageHeader";
import CobotStatusRibbon from "./asrs/components/CobotStatusRibbon";
import "./Assembly.css";
import "./Triac.css";

export default function Cobot() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  // Physical robot hardware states
  const [realConnected, setRealConnected] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Periodically check actual cobot port connectivity
  const checkRealStatus = async () => {
    try {
      const res = await fetch("/api/control/cobot/connection-status");
      const data = await res.json();
      setRealConnected(data.connected);
    } catch (err) {
      setRealConnected(false);
    }
  };

  useEffect(() => {
    checkRealStatus();
    const timer = setInterval(checkRealStatus, 4000);
    return () => clearInterval(timer);
  }, []);

  // Trigger the actual TMSCT listen script
  const handleRealTrigger = async () => {
    setTriggering(true);
    const toastId = toast.loading("Connecting and sending script to TM Cobot...");
    try {
      const res = await fetch("/api/control/cobot/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: "ScriptExit()" })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        toast.update(toastId, {
          render: "Success: Cobot received command and proceeded past listen block!",
          type: "success",
          isLoading: false,
          autoClose: 3000
        });
        setIsConnected(true);
      } else {
        toast.update(toastId, {
          render: `Error: ${data.detail || data.message || "Failed to trigger"}`,
          type: "error",
          isLoading: false,
          autoClose: 5000
        });
      }
    } catch (err) {
      toast.update(toastId, {
        render: `Network Error: Could not reach backend API`,
        type: "error",
        isLoading: false,
        autoClose: 5000
      });
    } finally {
      setTriggering(false);
    }
  };

  const handleConnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(true);
      setStatusLoading(false);
      toast.success("Connected to Omron TM5 Cobot TCP Server (Port 5890)");
    }, 800);
  };

  const handleDisconnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(false);
      setStatusLoading(false);
      toast.warning("Disconnected from Cobot Controller");
    }, 500);
  };

  return (
    <div className="asm-page">
      <PageHeader
        title="TM Cobot"
        subtitle="6-Axis Collaborative Robot Control Room"
        actions={
          <>
            <CobotStatusRibbon 
              plcConnected={isConnected}
              hwConnected={realConnected} 
              cobotState={isConnected ? 'RUNNING' : 'IDLE'}
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
                {statusLoading ? 'Disconnecting…' : 'Disconnect'}
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
                {statusLoading ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </>
        }
      />

      <div className="asm-body" style={{ position: 'relative', height: '100%' }}>
        
        {/* Real Physical Robot Hardware Trigger */}
        <div style={{ position: 'absolute', top: '24px', right: '24px', zIndex: 10 }}>
          <div className="asm-hud-card" style={{ width: '100%', minWidth: '320px', border: realConnected ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(239, 68, 68, 0.3)", boxShadow: realConnected ? "0 0 8px rgba(16, 185, 129, 0.15)" : "none" }}>
            <div className="asm-hud-header">
              <span>Physical Robot Link</span>
              <span className="asm-hud-badge" style={{ color: realConnected ? "#10b981" : "#ef4444", borderColor: realConnected ? "#10b981" : "#ef4444" }}>
                {realConnected ? "HARDWARE ONLINE" : "HARDWARE OFFLINE"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
              <button
                onClick={handleRealTrigger}
                disabled={triggering}
                className="asm-btn-control"
                style={{
                  height: "40px",
                  fontWeight: 800,
                  backgroundColor: realConnected ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.04)",
                  borderColor: realConnected ? "#10b981" : "#ef4444",
                  color: realConnected ? "#10b981" : "#ef4444",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>send_and_archive</span>
                {triggering ? "TRANSMITTING..." : "TRIGGER PHYSICAL COBOT"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flex: 1 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontFamily: 'var(--font-mono)' }}>
            Cobot module placeholder.
          </div>
        </div>
      </div>
    </div>
  );
}
