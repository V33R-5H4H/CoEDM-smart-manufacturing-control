import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import PageHeader from "../components/PageHeader";
import SensorDot from "../components/SensorDot";

import "./Assembly.css";
import "./Triac.css";

const sensorVal = (value, decimals = 2, fallback = "---") => {
  if (value === null || value === undefined) return fallback;
  return Number(value).toFixed(decimals);
};

export default function TestingStation() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  // Live simulation states
  const [isTesting, setIsTesting] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(null);
  const [measuredWeight, setMeasuredWeight] = useState(null);
  const [testResult, setTestResult] = useState(null); // 'OK' | 'NG'
  const [barcode, setBarcode] = useState(null);

  // Statistics
  const [totalTested, setTotalTested] = useState(148);
  const [passedCount, setPassedCount] = useState(142);
  const [failedCount, setFailedCount] = useState(6);

  // Force failure on next test (Simulate NG)
  const [forceFail, setForceFail] = useState(false);

  // Test logs
  const [logs, setLogs] = useState([
    { id: 1, time: "15:42:01", barcode: "BC-BEAR-40912", height: 50.02, weight: 120.4, status: "OK" },
    { id: 2, time: "15:43:12", barcode: "BC-BEAR-40913", height: 49.98, weight: 119.8, status: "OK" },
    { id: 3, time: "15:44:28", barcode: "BC-BEAR-40914", height: 50.45, weight: 124.5, status: "NG" },
    { id: 4, time: "15:46:05", barcode: "BC-BEAR-40915", height: 50.01, weight: 120.1, status: "OK" },
    { id: 5, time: "15:48:40", barcode: "BC-BEAR-40916", height: 49.95, weight: 119.5, status: "OK" },
  ]);

  const containerRef = useRef(null);

  // Trigger test cycle
  const startTestCycle = () => {
    if (!isConnected) {
      toast.warning("Testing Station gateway is offline. Connect first.");
      return;
    }
    if (isTesting) return;

    setIsTesting(true);
    setTestProgress(0);
    setMeasuredHeight(null);
    setMeasuredWeight(null);
    setTestResult(null);
    setBarcode("BC-SCAN-RUNNING...");

    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setTestProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        
        // Finalize test results
        const isNg = forceFail || Math.random() < 0.12; // 12% default failure rate
        const finalHeight = isNg 
          ? (Math.random() > 0.5 ? 50.35 + Math.random() * 0.2 : 49.65 - Math.random() * 0.2)
          : (50.00 + (Math.random() - 0.5) * 0.18);
        const finalWeight = 120.0 + (finalHeight - 50.00) * 10 + (Math.random() - 0.5) * 2;
        const newStatus = isNg ? "NG" : "OK";
        const newBarcode = `BC-BEAR-${Math.floor(40917 + Math.random() * 1000)}`;
        
        setMeasuredHeight(finalHeight);
        setMeasuredWeight(finalWeight);
        setTestResult(newStatus);
        setBarcode(newBarcode);
        setIsTesting(false);

        // Update statistics
        setTotalTested(prev => prev + 1);
        if (newStatus === "OK") {
          setPassedCount(prev => prev + 1);
          toast.success("Inspection Complete: WORKPIECE PASSED (OK)", { icon: "✅" });
        } else {
          setFailedCount(prev => prev + 1);
          toast.error("Inspection Complete: REJECTED (NG - Dimension Out of Limits)", { icon: "❌" });
        }

        // Add Log
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        setLogs(prev => [
          {
            id: Date.now(),
            time: timeStr,
            barcode: newBarcode,
            height: finalHeight,
            weight: finalWeight,
            status: newStatus
          },
          ...prev.slice(0, 7) // keep last 8
        ]);

        if (forceFail) setForceFail(false);
      }
    }, 150);
  };

  const handleConnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(true);
      setStatusLoading(false);
      toast.success("Connected to Keyence LVDT & Pneumatic Inspection Gateway");
    }, 800);
  };

  const handleDisconnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(false);
      setStatusLoading(false);
      setIsTesting(false);
      setTestResult(null);
      toast.warning("Disconnected from Quality Inspection Gateway");
    }, 500);
  };

  const resetStats = () => {
    setTotalTested(0);
    setPassedCount(0);
    setFailedCount(0);
    toast.info("Inspection statistics reset.");
  };

  const passRate = totalTested > 0 ? (passedCount / totalTested) * 100 : 100;

  // LVDT HUD Glow dynamic styling
  const isLvdthgNormal = measuredHeight === null || (measuredHeight >= 49.80 && measuredHeight <= 50.20);
  const lvdtGlowStyle = useMemo(() => {
    if (!isConnected) return { border: '1px solid rgba(239, 68, 68, 0.2)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 12px rgba(239, 68, 68, 0.1)' };
    if (isTesting) return { border: '1px solid rgba(14, 165, 233, 0.4)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(14, 165, 233, 0.25)' };
    if (testResult === "OK") return { border: '1px solid rgba(16, 185, 129, 0.4)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(16, 185, 129, 0.25)' };
    if (testResult === "NG") return { border: '1px solid rgba(239, 68, 68, 0.5)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(239, 68, 68, 0.35)' };
    return { border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)' };
  }, [isConnected, isTesting, testResult]);

  return (
    <div className="asm-page">
      <PageHeader
        title="Testing Station"
        subtitle="Dimensional & Weight Verification"
        actions={
          <>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginRight: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "14px", color: isConnected ? "#10b981" : "#ef4444" }}>
                  {isConnected ? "cloud_done" : "cloud_off"}
                </span>
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>
                  PLC: {isConnected ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            </div>
            {isConnected ? (
              <button type="button" onClick={handleDisconnect} disabled={statusLoading} className="asm-btn-control asm-btn-control--disconnect" style={{ padding: "4px 16px" }}>
                {statusLoading ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : (
              <button type="button" onClick={handleConnect} disabled={statusLoading} className="asm-btn-control asm-btn-control--connect" style={{ padding: "4px 16px" }}>
                {statusLoading ? "Connecting…" : "Connect"}
              </button>
            )}
          </>
        }
      />

      <div className="asm-body">
        <div className="triac-grid-container">
          
          {/* COLUMN 1: GAUGING DATA & COUNTERS */}
          <div className="triac-column">
            
            {/* Connection Bezel Status */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Inspection Gate Status</span>
                <span className={`asm-hud-badge ${isConnected ? "asm-hud-badge--active" : ""}`}>
                  {isConnected ? "GATE ACTIVE" : "GATE OFFLINE"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-muted)" }}>BARCODE SCANNER</span>
                  <span style={{ fontFamily: "JetBrains Mono", color: barcode ? "#38bdf8" : "#64748b", fontWeight: 700 }}>
                    {barcode || "WAITING FOR ITEM"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-muted)" }}>PNEUMATIC vice CLAMP</span>
                  <span style={{ color: isTesting ? "#fbbf24" : isConnected ? "#10b981" : "#64748b", fontWeight: 700 }}>
                    {isTesting ? "CLAMPED (LOCKED)" : isConnected ? "OPEN (READY)" : "OFFLINE"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quality Pass Rate Bezel */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Verification Statistics</span>
                <button 
                  onClick={resetStats} 
                  style={{ background: "none", border: "none", color: "#fb923c", fontSize: "9px", fontFamily: "var(--font-mono)", cursor: "pointer", fontWeight: 700, textTransform: "uppercase" }}
                >
                  Reset
                </button>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "4px" }}>
                <div className="asm-val">
                  <div className="asm-val__label">Total Checked</div>
                  <div className="asm-val__num" style={{ fontSize: "1.3rem" }}>{totalTested}</div>
                </div>
                <div className="asm-val">
                  <div className="asm-val__label">Pass Rate</div>
                  <div className="asm-val__num asm-val__num--glowing-green" style={{ fontSize: "1.3rem", color: "#10b981" }}>
                    {passRate.toFixed(1)}<span style={{ fontSize: "10px" }}>%</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", borderTop: "1px solid var(--border)", paddingTop: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600 }}>
                  <span style={{ color: "#4ade80" }}>PASSED (OK)</span>
                  <span style={{ color: "#4ade80", fontFamily: "JetBrains Mono" }}>{passedCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600 }}>
                  <span style={{ color: "#f87171" }}>REJECTED (NG)</span>
                  <span style={{ color: "#f87171", fontFamily: "JetBrains Mono" }}>{failedCount}</span>
                </div>
              </div>
            </div>

            {/* QA Testing Simulation Controller */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Inspection Process Controls</span>
                <span className="asm-hud-badge">MANUAL</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                <button
                  onClick={startTestCycle}
                  disabled={!isConnected || isTesting}
                  className="asm-btn-control asm-btn-control--connect"
                  style={{
                    height: "40px",
                    fontWeight: 800,
                    background: isConnected && !isTesting ? "rgba(16, 185, 129, 0.08)" : "var(--bg-secondary)",
                    borderColor: isConnected && !isTesting ? "#10b981" : "var(--border)",
                    color: isConnected && !isTesting ? "#10b981" : "var(--text-disabled)"
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>play_circle</span>
                  {isTesting ? `INSPECTING (${testProgress}%)` : "START INSPECTION"}
                </button>

                <div 
                  onClick={() => isConnected && setForceFail(!forceFail)}
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    padding: "10px", 
                    border: "1px solid var(--border)", 
                    borderRadius: "6px", 
                    background: forceFail ? "rgba(239, 68, 68, 0.08)" : "transparent",
                    borderColor: forceFail ? "#ef4444" : "var(--border)",
                    cursor: isConnected ? "pointer" : "not-allowed",
                    opacity: isConnected ? 1 : 0.5,
                    transition: "all 0.2s"
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>Simulate Rejection (Force NG)</span>
                  <div style={{ 
                    width: "12px", 
                    height: "12px", 
                    borderRadius: "50%", 
                    background: forceFail ? "#ef4444" : "#374151",
                    boxShadow: forceFail ? "0 0 8px #ef4444" : "none"
                  }} />
                </div>
              </div>
            </div>

          </div>

          {/* COLUMN 2: ANIMATED INSPECTION GRAPHICS */}
          <div className="triac-column" style={{ overflow: "hidden" }}>
            <div className="asm-center-container" ref={containerRef}>
              
              {/* High-Fidelity SVG Visualizer */}
              <div className="asm-viz-panel" style={{ position: "relative" }}>
                
                {/* Embedded Draggable HUD for LVDT Gauging */}
                {/* Static, high-density glassmorphic panel overlay for live LVDT probe gauge telemetry */}
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  width: '180px',
                  background: 'rgba(19, 27, 46, 0.85)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 'var(--radius)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 10,
                  ...lvdtGlowStyle,
                  transition: 'border 0.3s, box-shadow 0.3s'
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.5px" }}>LVDT PROBE</span>
                    <span style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      color: !isConnected ? "var(--error)" : isTesting ? "var(--primary)" : testResult === "NG" ? "var(--error)" : "var(--success)",
                      textTransform: "uppercase"
                    }}>
                      {!isConnected ? "Offline" : isTesting ? "Testing" : testResult || "Ready"}
                    </span>
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>LIMITS</span>
                      <span style={{ color: "var(--text-primary)" }}>49.80-50.20</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--border)", paddingTop: "6px" }}>
                      <span>HEIGHT</span>
                      <span style={{ 
                        fontSize: "12px", 
                        fontWeight: 700, 
                        color: isTesting ? "var(--primary-light)" : testResult === "NG" ? "var(--error)" : testResult === "OK" ? "var(--success)" : "var(--text-secondary)"
                      }}>
                        {sensorVal(measuredHeight, 2)} <span style={{ fontSize: "9px", fontWeight: 500, color: "var(--text-muted)" }}>mm</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* SVG Visualizing the Quality checking machine */}
                <svg
                  viewBox="0 0 600 380"
                  style={{ width: "100%", height: "100%", background: "#06070a", borderRadius: "8px" }}
                >
                  <defs>
                    <linearGradient id="laser-glow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="red-laser-glow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="testing-metal" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#334155" />
                      <stop offset="50%" stopColor="#64748b" />
                      <stop offset="100%" stopColor="#1e293b" />
                    </linearGradient>
                  </defs>

                  {/* Conveyor slide */}
                  <rect x="50" y="240" width="500" height="20" fill="url(#testing-metal)" rx="4" />
                  <line x1="50" y1="250" x2="550" y2="250" stroke="#0f172a" strokeWidth="2" strokeDasharray="10, 8" />

                  {/* Central Vice clamp support */}
                  <rect x="250" y="220" width="100" height="20" fill="#1e293b" rx="2" />
                  
                  {/* Left Side Clamp Jaw */}
                  <rect x={isTesting ? "235" : "210"} y="195" width="20" height="40" fill="#475569" rx="1" style={{ transition: "x 0.5s ease" }} />
                  {/* Right Side Clamp Jaw */}
                  <rect x={isTesting ? "345" : "370"} y="195" width="20" height="40" fill="#475569" rx="1" style={{ transition: "x 0.5s ease" }} />

                  {/* Gauging Cylinder Gantry */}
                  <rect x="290" y="30" width="20" height="100" fill="url(#testing-metal)" />
                  <rect x="260" y="30" width="80" height="15" fill="#1e293b" />

                  {/* Pneumatic Cylinder Piston Probe (Moves down when testing) */}
                  <g transform={`translate(0, ${isTesting ? 65 : 0})`} style={{ transition: "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
                    <rect x="297" y="100" width="6" height="60" fill="#94a3b8" />
                    {/* Gauge Probe tip */}
                    <circle cx="300" cy="160" r="6" fill="#fb923c" />
                    
                    {/* Laser measuring light */}
                    {isTesting && (
                      <polygon
                        points="285,160 315,160 305,210 295,210"
                        fill="url(#laser-glow)"
                        style={{ mixBlendMode: "screen" }}
                      />
                    )}
                  </g>

                  {/* Rejection sorting gate (Rotates based on status) */}
                  <g transform="translate(480, 240)">
                    <rect 
                      x="-8" 
                      y="-40" 
                      width="16" 
                      height="50" 
                      fill="#ef4444" 
                      rx="2"
                      style={{ 
                        transform: testResult === "NG" ? "rotate(45deg)" : "rotate(0deg)", 
                        transformOrigin: "top center",
                        transition: "transform 0.4s ease" 
                      }} 
                    />
                    <circle cx="0" cy="0" r="5" fill="#1e293b" />
                  </g>

                  {/* Workpiece block being verified */}
                  <g transform="translate(300, 210)">
                    <rect 
                      x="-20" 
                      y="-15" 
                      width="40" 
                      height="30" 
                      fill={testResult === "OK" ? "#059669" : testResult === "NG" ? "#dc2626" : "#b45309"} 
                      rx="2" 
                      stroke="#f59e0b"
                      strokeWidth={isTesting ? "2" : "1"}
                    />
                    <text x="0" y="4" fill="#f8fafc" fontSize="10" fontFamily="Inter" fontWeight="bold" textAnchor="middle">
                      {isTesting ? "MEAS..." : testResult || "WAIT"}
                    </text>
                  </g>
                  
                  {/* Status lights on the panel */}
                  <g transform="translate(520, 50)">
                    <rect x="0" y="0" width="50" height="80" fill="#1b1c23" rx="4" stroke="#323842" />
                    {/* Green LED */}
                    <circle cx="25" cy="20" r="6" fill={testResult === "OK" ? "#10b981" : "#1f2937"} style={{ transition: "fill 0.2s" }} />
                    {/* Orange LED (Testing) */}
                    <circle cx="25" cy="40" r="6" fill={isTesting ? "#f59e0b" : "#1f2937"} style={{ transition: "fill 0.2s" }} />
                    {/* Red LED (NG) */}
                    <circle cx="25" cy="60" r="6" fill={testResult === "NG" ? "#ef4444" : "#1f2937"} style={{ transition: "fill 0.2s" }} />
                  </g>
                </svg>
              </div>

              {/* Bottom Quick-Metrics Panel */}
              <div className="asm-footer-stats">
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">LVDT Sensor</div>
                  <div className="asm-val__num" style={{ fontSize: "0.95rem", color: isConnected ? "#10b981" : "#64748b" }}>
                    {isConnected ? "ONLINE" : "OFFLINE"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Target Height</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem" }}>
                    50.00 <span className="asm-val__unit" style={{ fontSize: "0.6rem" }}>mm</span>
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Actual Height</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: testResult === "NG" ? "#f87171" : "#e2e8f0" }}>
                    {sensorVal(measuredHeight, 3)} <span className="asm-val__unit" style={{ fontSize: "0.55rem" }}>mm</span>
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Test Verdict</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: testResult === "OK" ? "#4ade80" : testResult === "NG" ? "#f87171" : "#e2e8f0" }}>
                    {testResult || "WAITING"}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* COLUMN 3: REAL-TIME VERIFICATION LOG */}
          <div className="triac-column">
            
            {/* Live Testing Log Console */}
            <div className="asm-hud-card" style={{ flex: 1 }}>
              <div className="asm-hud-header">
                <span>Recent Quality Logs</span>
                <span className="asm-hud-badge">LIVE_DATA</span>
              </div>
              
              <div 
                style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "6px", 
                  marginTop: "6px", 
                  overflowY: "auto", 
                  maxHeight: "310px", 
                  paddingRight: "2px" 
                }}
              >
                {logs.map((log) => (
                  <div 
                    key={log.id} 
                    style={{ 
                      padding: "8px 10px", 
                      background: "rgba(0, 0, 0, 0.2)", 
                      border: "1px solid var(--border)", 
                      borderRadius: "6px", 
                      display: "flex", 
                      flexDirection: "column", 
                      gap: "4px",
                      borderColor: log.status === "NG" ? "rgba(239, 68, 68, 0.25)" : "var(--border)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px" }}>
                      <span style={{ fontFamily: "JetBrains Mono", color: "#64748b" }}>{log.time}</span>
                      <span 
                        style={{ 
                          padding: "1px 6px", 
                          borderRadius: "4px", 
                          fontSize: "9px", 
                          fontWeight: 700, 
                          background: log.status === "OK" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: log.status === "OK" ? "#4ade80" : "#f87171" 
                        }}
                      >
                        {log.status}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", fontFamily: "JetBrains Mono" }}>
                      <span style={{ color: "var(--text-secondary)" }}>{log.barcode}</span>
                      <span style={{ color: log.status === "NG" ? "#f87171" : "#cbd5e1" }}>
                        H: {log.height.toFixed(2)} mm • W: {log.weight.toFixed(1)} g
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={3000} closeOnClick pauseOnHover />
    </div>
  );
}
