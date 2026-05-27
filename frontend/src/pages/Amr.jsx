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

export default function Amr() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  // AMR live simulation states
  const [robotStatus, setRobotStatus] = useState("IDLE"); // 'IDLE' | 'NAVIGATING' | 'CHARGING' | 'ESTOP'
  const [batteryPercent, setBatteryPercent] = useState(84);
  const [posX, setPosX] = useState(15.2);
  const [posY, setPosY] = useState(6.4);
  const [theta, setTheta] = useState(0); // rotation in degrees
  const [cargo, setCargo] = useState("NONE"); // 'NONE' | 'BEARING_CRATE' | 'SHAFT_CRATE'
  const [currentMission, setCurrentMission] = useState("Idle / Standby");
  
  // Navigation coordinates for stations on our map
  const STATIONS = {
    CHARGER: { name: "Charging Dock", x: 60, y: 70, realX: 4.5, realY: 2.1, angle: 90 },
    ASRS: { name: "AS/RS Warehouse", x: 120, y: 220, realX: 8.2, realY: 6.5, angle: 0 },
    MIRAC: { name: "Smart MIRAC Lathe", x: 300, y: 90, realX: 18.5, realY: 3.2, angle: 270 },
    TRIAC: { name: "Smart TRIAC Mill", x: 480, y: 90, realX: 28.1, realY: 3.2, angle: 270 },
    ASSEMBLY: { name: "Assembly Station", x: 420, y: 260, realX: 24.8, realY: 8.4, angle: 180 },
    TESTING: { name: "Testing Station", x: 260, y: 260, realX: 15.6, realY: 8.4, angle: 180 }
  };

  // Graphical pixel values for the robot's current SVG position
  const [svgPos, setSvgPos] = useState({ x: 60, y: 70 });
  const [targetStation, setTargetStation] = useState("CHARGER");

  const containerRef = useRef(null);

  // Slowly discharge battery when navigating, charge when docked at charger
  useEffect(() => {
    let interval;
    if (isConnected) {
      interval = setInterval(() => {
        if (robotStatus === "CHARGING") {
          setBatteryPercent(prev => Math.min(100, prev + 1));
        } else if (robotStatus === "NAVIGATING") {
          setBatteryPercent(prev => Math.max(2, prev - 0.4));
        } else {
          setBatteryPercent(prev => Math.max(2, prev - 0.05));
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isConnected, robotStatus]);

  // Handle manual dispatch to a station
  const dispatchToStation = (stationKey) => {
    if (!isConnected) {
      toast.warning("AMR controller is offline. Connect gateway first.");
      return;
    }
    if (robotStatus === "ESTOP") {
      toast.error("AMR in Emergency Stop! Reset E-Stop first.");
      return;
    }
    if (robotStatus === "NAVIGATING") {
      toast.warning("AMR is currently navigating another mission. Wait for arrival.");
      return;
    }

    const station = STATIONS[stationKey];
    if (!station) return;

    setTargetStation(stationKey);
    setRobotStatus("NAVIGATING");
    setCurrentMission(`Navigating to ${station.name}`);
    toast.info(`AMR Dispatched: Heading to ${station.name}...`);

    // Animation variables
    const startX = svgPos.x;
    const startY = svgPos.y;
    const endX = station.x;
    const endY = station.y;
    const startTheta = theta;
    const endTheta = station.angle;

    let progress = 0;
    const steps = 40;
    const stepTime = 60; // total duration 2.4s

    const animInterval = setInterval(() => {
      progress += 1;
      const f = progress / steps;
      
      // Interpolate
      const currX = startX + (endX - startX) * f;
      const currY = startY + (endY - startY) * f;
      const currTheta = startTheta + (endTheta - startTheta) * f;

      setSvgPos({ x: currX, y: currY });
      setTheta(currTheta);

      // Map SVG pixels back to virtual real-world coordinates in meters (scale)
      setPosX(5.0 + (currX / 500) * 25.0);
      setPosY(2.0 + (currY / 300) * 8.0);

      if (progress >= steps) {
        clearInterval(animInterval);
        
        // Arrived!
        if (stationKey === "CHARGER") {
          setRobotStatus("CHARGING");
          setCurrentMission("Charging Battery...");
          toast.success("AMR Docked at Charger: Commencing fast-charge", { icon: "⚡" });
        } else {
          setRobotStatus("IDLE");
          setCurrentMission(`Docked at ${station.name}`);
          toast.success(`AMR Arrived successfully at ${station.name}`, { icon: "📍" });
        }
      }
    }, stepTime);
  };

  const triggerEStop = () => {
    if (robotStatus === "ESTOP") {
      setRobotStatus("IDLE");
      setCurrentMission("Idle / Standby");
      toast.info("AMR emergency condition cleared. System standing by.");
    } else {
      setRobotStatus("ESTOP");
      setCurrentMission("EMERGENCY STOP ACTIVE");
      toast.error("AMR EMERGENCY STOP TRIGGERED INSTANTLY!", { icon: "🚨" });
    }
  };

  const toggleCargo = () => {
    if (cargo === "NONE") {
      setCargo("BEARING_CRATE");
      toast.success("Loaded physical Bearing Crate onto AMR tray");
    } else if (cargo === "BEARING_CRATE") {
      setCargo("SHAFT_CRATE");
      toast.success("Loaded physical Shaft Crate onto AMR tray");
    } else {
      setCargo("NONE");
      toast.info("AMR payload deck cleared (Unloaded)");
    }
  };

  const handleConnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(true);
      setStatusLoading(false);
      toast.success("Connected to AMR Modbus Gateway & Navigation Controller");
    }, 800);
  };

  const handleDisconnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(false);
      setStatusLoading(false);
      setRobotStatus("IDLE");
      setCurrentMission("Offline");
      toast.warning("Disconnected from AMR Mobile Client");
    }, 500);
  };

  // AMR HUD Glow dynamic styling
  const amrGlowStyle = useMemo(() => {
    if (!isConnected) return { border: '1px solid rgba(239, 68, 68, 0.2)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 12px rgba(239, 68, 68, 0.1)' };
    if (robotStatus === "ESTOP") return { border: '1px solid rgba(239, 68, 68, 0.5)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(239, 68, 68, 0.35)' };
    if (robotStatus === "NAVIGATING") return { border: '1px solid rgba(14, 165, 233, 0.4)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(14, 165, 233, 0.25)' };
    if (robotStatus === "CHARGING") return { border: '1px solid rgba(251, 191, 36, 0.4)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(251, 191, 36, 0.25)' };
    return { border: '1px solid rgba(16, 185, 129, 0.4)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(16, 185, 129, 0.25)' };
  }, [isConnected, robotStatus]);

  return (
    <div className="asm-page">
      <PageHeader
        title="Smart AMR"
        subtitle="Mobile Robot Telemetry & Path Dispatcher"
        actions={
          <>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginRight: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "14px", color: isConnected ? "#10b981" : "#ef4444" }}>
                  {isConnected ? "link" : "link_off"}
                </span>
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>
                  COMM: {isConnected ? "CONNECTED" : "OFFLINE"}
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
          
          {/* COLUMN 1: ROBOT METRICS & CHARGE */}
          <div className="triac-column">
            
            {/* Battery Info card */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Power System</span>
                <span className={`asm-hud-badge ${batteryPercent > 20 ? "asm-hud-badge--active" : ""}`} style={{ color: batteryPercent <= 20 ? "#ef4444" : "#10b981", borderColor: batteryPercent <= 20 ? "#ef4444" : "#10b981" }}>
                  {robotStatus === "CHARGING" ? "CHARGING" : batteryPercent > 20 ? "BATTERY_OK" : "LOW_BATTERY"}
                </span>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="asm-val__label">Battery Charge</span>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: "1.4rem", fontWeight: 700, color: batteryPercent > 20 ? "#fbbf24" : "#f87171" }}>
                    {batteryPercent.toFixed(0)}%
                  </span>
                </div>
                
                {/* Custom glowing progress bar */}
                <div style={{ width: "100%", height: "8px", background: "#111827", borderRadius: "4px", overflow: "hidden", border: "1px solid #1f2937" }}>
                  <div 
                    style={{ 
                      width: `${batteryPercent}%`, 
                      height: "100%", 
                      background: batteryPercent > 50 ? "#10b981" : batteryPercent > 20 ? "#fbbf24" : "#ef4444",
                      transition: "width 0.5s ease" 
                    }} 
                  />
                </div>
              </div>
            </div>

            {/* Cargo Load State */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>AMR Deck Crate Load</span>
                <span className="asm-hud-badge">DECK</span>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-muted)" }}>CURRENT PAYLOAD:</span>
                  <span style={{ fontFamily: "JetBrains Mono", color: cargo !== "NONE" ? "#fb923c" : "#64748b", fontWeight: 700 }}>
                    {cargo}
                  </span>
                </div>

                <button
                  onClick={toggleCargo}
                  disabled={!isConnected || robotStatus === "NAVIGATING"}
                  className="asm-btn-control"
                  style={{
                    height: "36px",
                    fontWeight: 700,
                    color: isConnected ? "#f1f5f9" : "var(--text-disabled)"
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>swap_horiz</span>
                  {cargo === "NONE" ? "LOAD VIRTUAL CRATE" : "UNLOAD / ROTATE CRATE"}
                </button>
              </div>
            </div>

            {/* Emergency E-Stop Controls */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>E-Stop Safety Integrity</span>
                <span className={`asm-hud-badge ${robotStatus === "ESTOP" ? "" : "asm-hud-badge--active"}`} style={{ color: robotStatus === "ESTOP" ? "#ef4444" : "#10b981", borderColor: robotStatus === "ESTOP" ? "#ef4444" : "#10b981" }}>
                  {robotStatus === "ESTOP" ? "TRIPPED" : "ARMED"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                <button
                  onClick={triggerEStop}
                  disabled={!isConnected}
                  className="asm-btn-control"
                  style={{
                    height: "42px",
                    fontWeight: 800,
                    background: robotStatus === "ESTOP" ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                    borderColor: robotStatus === "ESTOP" ? "#10b981" : "#ef4444",
                    color: robotStatus === "ESTOP" ? "#10b981" : "#ef4444"
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                    {robotStatus === "ESTOP" ? "settings_backup_restore" : "emergency_home"}
                  </span>
                  {robotStatus === "ESTOP" ? "RESET EMERGENCY STOP" : "TRIGGER EMERGENCY STOP"}
                </button>
              </div>
            </div>

          </div>

          {/* COLUMN 2: WAREHOUSE NAVIGATION VISUALIZER */}
          <div className="triac-column" style={{ overflow: "hidden" }}>
            <div className="asm-center-container" ref={containerRef}>
              
              {/* High-Fidelity SVG Viewer */}
              <div className="asm-viz-panel" style={{ position: "relative" }}>
                
                {/* Embedded Draggable HUD for AMR Live Telemetry */}
                {/* Static, high-density glassmorphic panel overlay for live telemetry */}
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
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
                  ...amrGlowStyle,
                  transition: 'border 0.3s, box-shadow 0.3s'
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.5px" }}>AMR_OP_04</span>
                    <span style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: !isConnected ? "#ef4444" : robotStatus === "ESTOP" ? "#ef4444" : robotStatus === "NAVIGATING" ? "#38bdf8" : robotStatus === "CHARGING" ? "#fbbf24" : "#10b981",
                      boxShadow: isConnected ? "0 0 8px currentColor" : "none"
                    }} />
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>POSITION</span>
                      <span style={{ color: "var(--text-primary)" }}>{posX.toFixed(1)}m, {posY.toFixed(1)}m</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>HEADING</span>
                      <span style={{ color: "var(--text-primary)" }}>{theta.toFixed(0)}°</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>SPEED</span>
                      <span style={{ color: "var(--text-primary)" }}>{robotStatus === "NAVIGATING" ? "0.8 m/s" : "0.0 m/s"}</span>
                    </div>
                  </div>
                </div>

                {/* SVG Visualizing the warehouse floor plan */}
                <svg
                  viewBox="0 0 600 380"
                  style={{ width: "100%", height: "100%", background: "#07080d", borderRadius: "8px" }}
                >
                  <defs>
                    <linearGradient id="station-glow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e293b" />
                      <stop offset="100%" stopColor="#0f172a" />
                    </linearGradient>
                  </defs>

                  {/* Floor Grid Map */}
                  <g opacity="0.15">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <line key={`v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="380" stroke="#475569" strokeWidth="1" />
                    ))}
                    {Array.from({ length: 8 }).map((_, i) => (
                      <line key={`h-${i}`} x1="0" y1={i * 50} x2="600" y2={i * 50} stroke="#475569" strokeWidth="1" />
                    ))}
                  </g>

                  {/* Virtual workstations layout blocks */}
                  <g id="workstations-nodes" fontSize="9" fontFamily="Inter" fontWeight="bold">
                    
                    {/* Charging Pad */}
                    <g transform="translate(30, 40)">
                      <rect x="0" y="0" width="60" height="40" fill="url(#station-glow)" stroke="#fbbf24" strokeWidth="1" rx="2" />
                      <text x="30" y="24" fill="#fbbf24" textAnchor="middle">⚡ CHARGER</text>
                    </g>

                    {/* ASRS Warehouse */}
                    <g transform="translate(80, 200)">
                      <rect x="0" y="0" width="80" height="40" fill="url(#station-glow)" stroke="#38bdf8" strokeWidth="1" rx="2" />
                      <text x="40" y="24" fill="#38bdf8" textAnchor="middle">📦 AS/RS</text>
                    </g>

                    {/* MIRAC CNC Lathe */}
                    <g transform="translate(250, 60)">
                      <rect x="0" y="0" width="90" height="40" fill="url(#station-glow)" stroke="#e2e8f0" strokeWidth="1" rx="2" />
                      <text x="45" y="24" fill="#e2e8f0" textAnchor="middle">⚙️ MIRAC LATHE</text>
                    </g>

                    {/* TRIAC CNC Milling */}
                    <g transform="translate(430, 60)">
                      <rect x="0" y="0" width="90" height="40" fill="url(#station-glow)" stroke="#e2e8f0" strokeWidth="1" rx="2" />
                      <text x="45" y="24" fill="#e2e8f0" textAnchor="middle">🔧 TRIAC MILL</text>
                    </g>

                    {/* Assembly station */}
                    <g transform="translate(380, 240)">
                      <rect x="0" y="0" width="90" height="40" fill="url(#station-glow)" stroke="#10b981" strokeWidth="1" rx="2" />
                      <text x="45" y="24" fill="#10b981" textAnchor="middle">🏭 ASSEMBLY</text>
                    </g>

                    {/* Testing Inspection station */}
                    <g transform="translate(220, 240)">
                      <rect x="0" y="0" width="90" height="40" fill="url(#station-glow)" stroke="#10b981" strokeWidth="1" rx="2" />
                      <text x="45" y="24" fill="#10b981" textAnchor="middle">🔬 TESTING</text>
                    </g>

                  </g>

                  {/* Navigation paths (dotted lines) */}
                  <path d="M 60,70 L 120,220 L 260,260 L 420,260 L 480,90 L 300,90 Z" fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="4,4" strokeWidth="1.5" />

                  {/* AMR Mobile Robot Vector Asset (Rotates and slides dynamically) */}
                  <g 
                    transform={`translate(${svgPos.x}, ${svgPos.y}) rotate(${theta})`}
                    style={{ transition: "transform 0.05s linear" }}
                  >
                    {/* Outer Casing bumper */}
                    <rect x="-18" y="-12" width="36" height="24" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" rx="4" />
                    {/* Yellow stripes showing direction */}
                    <rect x="-10" y="-10" width="20" height="20" fill="#f59e0b" rx="2" />
                    <rect x="2" y="-6" width="6" height="12" fill="#0f172a" rx="1" />
                    
                    {/* Laser Scanner spinner */}
                    <circle cx="-12" cy="0" r="4" fill="#ef4444" />
                    
                    {/* Virtual cargo crate sitting on top */}
                    {cargo !== "NONE" && (
                      <rect 
                        x="-6" 
                        y="-6" 
                        width="12" 
                        height="12" 
                        fill={cargo === "BEARING_CRATE" ? "#0284c7" : "#059669"} 
                        rx="1" 
                        stroke="#f59e0b" 
                        strokeWidth="1" 
                      />
                    )}
                  </g>
                </svg>
              </div>

              {/* Bottom Quick-Metrics Panel */}
              <div className="asm-footer-stats">
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Target Station</div>
                  <div className="asm-val__num" style={{ fontSize: "0.95rem" }}>
                    {STATIONS[targetStation]?.name || "---"}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Current Action</div>
                  <div className="asm-val__num" style={{ fontSize: "0.9rem", color: robotStatus === "NAVIGATING" ? "#38bdf8" : robotStatus === "ESTOP" ? "#ef4444" : "#e2e8f0" }}>
                    {currentMission}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Mission Status</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem", color: robotStatus === "NAVIGATING" ? "#38bdf8" : robotStatus === "ESTOP" ? "#ef4444" : "#10b981" }}>
                    {robotStatus}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Payload Deck</div>
                  <div className="asm-val__num" style={{ fontSize: "1rem" }}>
                    {cargo === "NONE" ? "EMPTY" : "CARGO LOADED"}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* COLUMN 3: MISSION CONTROLLER */}
          <div className="triac-column">
            
            {/* Quick Dispatch Buttons */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Dispatch Stations Selector</span>
                <span className="asm-hud-badge">ROUTING</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                
                <button 
                  onClick={() => dispatchToStation("CHARGER")}
                  disabled={!isConnected || robotStatus === "NAVIGATING" || robotStatus === "ESTOP"}
                  className="asm-btn-control asm-btn-control--demo"
                  style={{ height: "36px", borderColor: "#fbbf24", color: "#fbbf24" }}
                >
                  ⚡ CHARGER
                </button>

                <button 
                  onClick={() => dispatchToStation("ASRS")}
                  disabled={!isConnected || robotStatus === "NAVIGATING" || robotStatus === "ESTOP"}
                  className="asm-btn-control"
                  style={{ height: "36px", color: "#38bdf8" }}
                >
                  📦 AS/RS
                </button>

                <button 
                  onClick={() => dispatchToStation("MIRAC")}
                  disabled={!isConnected || robotStatus === "NAVIGATING" || robotStatus === "ESTOP"}
                  className="asm-btn-control"
                  style={{ height: "36px", color: "#cbd5e1" }}
                >
                  ⚙️ LATHE
                </button>

                <button 
                  onClick={() => dispatchToStation("TRIAC")}
                  disabled={!isConnected || robotStatus === "NAVIGATING" || robotStatus === "ESTOP"}
                  className="asm-btn-control"
                  style={{ height: "36px", color: "#cbd5e1" }}
                >
                  🔧 MILLING
                </button>

                <button 
                  onClick={() => dispatchToStation("ASSEMBLY")}
                  disabled={!isConnected || robotStatus === "NAVIGATING" || robotStatus === "ESTOP"}
                  className="asm-btn-control"
                  style={{ height: "36px", color: "#10b981" }}
                >
                  🏭 ASSEMBLY
                </button>

                <button 
                  onClick={() => dispatchToStation("TESTING")}
                  disabled={!isConnected || robotStatus === "NAVIGATING" || robotStatus === "ESTOP"}
                  className="asm-btn-control"
                  style={{ height: "36px", color: "#10b981" }}
                >
                  🔬 TESTING
                </button>

              </div>
            </div>

            {/* Path logs */}
            <div className="asm-hud-card" style={{ flex: 1 }}>
              <div className="asm-hud-header">
                <span>Recent Fleet Logs</span>
                <span className="asm-hud-badge">FLEET</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", fontFamily: "JetBrains Mono", fontSize: "10px", color: "var(--text-secondary)", overflowY: "auto", maxHeight: "170px" }}>
                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>[15:48:10]</span> Docked at Charging Pad. Charging commenced.
                </div>
                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>[15:47:05]</span> Dispatched from AS/RS Dock 1 to Charger.
                </div>
                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>[15:45:20]</span> Crate loaded successfully onto payload tray.
                </div>
                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>[15:44:00]</span> Navigating to AS/RS Warehouse Dock 1.
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>[15:40:15]</span> AMR-04 initialized successfully. Self-diagnostics OK.
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={3000} closeOnClick pauseOnHover />
    </div>
  );
}
