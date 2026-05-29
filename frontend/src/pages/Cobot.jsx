import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-toastify";
import PageHeader from "../components/PageHeader";
import SensorDot from "../components/SensorDot";
import DraggableHUD from "../components/DraggableHUD";
import "./Assembly.css";
import "./Triac.css";

const sensorVal = (value, decimals = 2, fallback = "---") => {
  if (value === null || value === undefined) return fallback;
  return Number(value).toFixed(decimals);
};

export default function Cobot() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  // Cobot simulation states
  const [cobotStatus, setCobotStatus] = useState("STANDBY"); // 'STANDBY' | 'PICKING' | 'PLACING' | 'HOMING' | 'ESTOP'
  const [cycleCount, setCycleCount] = useState(42);
  const [gripperState, setGripperState] = useState("OPEN"); // 'OPEN' | 'CLOSED' | 'GRIPPED'
  const [payloadKg, setPayloadKg] = useState(0.0);
  const [gripperForce, setGripperForce] = useState(0.0); // Newtons

  // 6-Joint Angles in degrees
  const [j1, setJ1] = useState(0.0);
  const [j2, setJ2] = useState(-45.0);
  const [j3, setJ3] = useState(90.0);
  const [j4, setJ4] = useState(-45.0);
  const [j5, setJ5] = useState(90.0);
  const [j6, setJ6] = useState(0.0);

  // Tool Center Point (TCP) Coordinates in mm
  const [tcpX, setTcpX] = useState(450.2);
  const [tcpY, setTcpY] = useState(0.0);
  const [tcpZ, setTcpZ] = useState(320.5);

  const containerRef = useRef(null);

  // Simulate an automated Pick & Place cycle
  const runAutoCycle = () => {
    if (!isConnected) {
      toast.warning("Cobot is offline. Connect gateway first.");
      return;
    }
    if (cobotStatus === "ESTOP") {
      toast.error("Cobot in Emergency Stop! Reset E-Stop first.");
      return;
    }
    if (cobotStatus !== "STANDBY") {
      toast.warning("Cobot is busy executing another command.");
      return;
    }

    setCobotStatus("PICKING");
    toast.info("Commencing Pick & Place automation cycle...");

    // Phase 1: Move down to pick (Angles shift)
    setTimeout(() => {
      setJ2(-20.0);
      setJ3(60.0);
      setJ4(-40.0);
      setTcpZ(120.0);
    }, 400);

    // Phase 2: Close Gripper around workpiece
    setTimeout(() => {
      setGripperState("GRIPPED");
      setPayloadKg(1.45); // weight of bearing crate
      setGripperForce(35.2); // Newtons gripping force
      toast.info("Gripper engaged: Workpiece picked successfully.");
    }, 1200);

    // Phase 3: Lift up and rotate to placement position
    setTimeout(() => {
      setCobotStatus("PLACING");
      setJ1(90.0); // Rotate base
      setJ2(-50.0);
      setJ3(100.0);
      setJ4(-50.0);
      setTcpX(0.0);
      setTcpY(450.2);
      setTcpZ(350.0);
    }, 2200);

    // Phase 4: Open Gripper to release workpiece
    setTimeout(() => {
      setGripperState("OPEN");
      setPayloadKg(0.0);
      setGripperForce(0.0);
      toast.success("Workpiece deposited successfully.", { icon: "📥" });
    }, 3500);

    // Phase 5: Return to Home / Standby position
    setTimeout(() => {
      setCobotStatus("HOMING");
      setJ1(0.0);
      setJ2(-45.0);
      setJ3(90.0);
      setJ4(-45.0);
      setTcpX(450.2);
      setTcpY(0.0);
      setTcpZ(320.5);
    }, 4200);

    // Phase 6: Standby
    setTimeout(() => {
      setCobotStatus("STANDBY");
      setCycleCount(prev => prev + 1);
      toast.success("Cycle Complete: Cobot Arm returned to Safe Standby.");
    }, 5200);
  };

  const triggerEStop = () => {
    if (cobotStatus === "ESTOP") {
      setCobotStatus("STANDBY");
      toast.info("Emergency Stop reset. Arm motor drives engaged.");
    } else {
      setCobotStatus("ESTOP");
      setGripperForce(0.0);
      toast.error("Cobot EMERGENCY STOP ACTIVE! Motors de-energized immediately.", { icon: "🚨" });
    }
  };

  const toggleGripper = () => {
    if (gripperState === "OPEN") {
      setGripperState("CLOSED");
      setGripperForce(40.0);
      toast.info("Pneumatic gripper closed.");
    } else {
      setGripperState("OPEN");
      setGripperForce(0.0);
      toast.info("Pneumatic gripper opened.");
    }
  };

  const resetArm = () => {
    setJ1(0.0);
    setJ2(-45.0);
    setJ3(90.0);
    setJ4(-45.0);
    setJ5(90.0);
    setJ6(0.0);
    setTcpX(450.2);
    setTcpY(0.0);
    setTcpZ(320.5);
    setGripperState("OPEN");
    setPayloadKg(0.0);
    setGripperForce(0.0);
    toast.info("Cobot arm reset to factory reference home.");
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
      setCobotStatus("STANDBY");
      toast.warning("Disconnected from Cobot Controller");
    }, 500);
  };

  // Cobot HUD Glow dynamic styling
  const cobotGlowStyle = useMemo(() => {
    if (!isConnected) return { border: '1px solid rgba(239, 68, 68, 0.2)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 12px rgba(239, 68, 68, 0.1)' };
    if (cobotStatus === "ESTOP") return { border: '1px solid rgba(239, 68, 68, 0.5)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(239, 68, 68, 0.35)' };
    if (cobotStatus === "PICKING" || cobotStatus === "PLACING") return { border: '1px solid rgba(14, 165, 233, 0.4)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(14, 165, 233, 0.25)' };
    return { border: '1px solid rgba(16, 185, 129, 0.4)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(16, 185, 129, 0.25)' };
  }, [isConnected, cobotStatus]);

  // Compute J2 & J3 rotation translations dynamically for the high-fidelity SVG arm!
  const rotationJ1 = j1;
  const rotationJ2 = j2 + 45; // offset
  const rotationJ3 = j3 - 90; // offset

  return (
    <div className="asm-page">
      <PageHeader
        title="TM Cobot"
        subtitle="6-Axis Collaborative Robot Control Room"
        actions={
          <>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginRight: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "14px", color: isConnected ? "#10b981" : "#ef4444" }}>
                  {isConnected ? "security" : "lock_open"}
                </span>
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>
                  SERVO STATUS: {isConnected ? "POWERED" : "OFFLINE"}
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
          
          {/* COLUMN 1: JOINT JOGGER SLIDERS */}
          <div className="triac-column">
            
            {/* 6-Axis Joint controllers */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Joint Jogging Panel</span>
                <span className="asm-hud-badge">JOGGER</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px", fontSize: "11px" }}>
                
                {/* Joint 1 */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span style={{ color: "#38bdf8" }}>Joint 1 (Base)</span>
                    <span style={{ fontFamily: "JetBrains Mono" }}>{j1.toFixed(1)}°</span>
                  </div>
                  <input 
                    type="range" min="-180" max="180" value={j1} 
                    onChange={(e) => isConnected && cobotStatus === "STANDBY" && setJ1(parseFloat(e.target.value))}
                    disabled={!isConnected || cobotStatus !== "STANDBY"}
                    style={{ width: "100%", accentColor: "#38bdf8" }} 
                  />
                </div>

                {/* Joint 2 */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span style={{ color: "#38bdf8" }}>Joint 2 (Shoulder)</span>
                    <span style={{ fontFamily: "JetBrains Mono" }}>{j2.toFixed(1)}°</span>
                  </div>
                  <input 
                    type="range" min="-90" max="90" value={j2} 
                    onChange={(e) => isConnected && cobotStatus === "STANDBY" && setJ2(parseFloat(e.target.value))}
                    disabled={!isConnected || cobotStatus !== "STANDBY"}
                    style={{ width: "100%", accentColor: "#38bdf8" }} 
                  />
                </div>

                {/* Joint 3 */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span style={{ color: "#38bdf8" }}>Joint 3 (Elbow)</span>
                    <span style={{ fontFamily: "JetBrains Mono" }}>{j3.toFixed(1)}°</span>
                  </div>
                  <input 
                    type="range" min="-150" max="150" value={j3} 
                    onChange={(e) => isConnected && cobotStatus === "STANDBY" && setJ3(parseFloat(e.target.value))}
                    disabled={!isConnected || cobotStatus !== "STANDBY"}
                    style={{ width: "100%", accentColor: "#38bdf8" }} 
                  />
                </div>

                {/* Joint 4 */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span style={{ color: "#38bdf8" }}>Joint 4 (Wrist 1)</span>
                    <span style={{ fontFamily: "JetBrains Mono" }}>{j4.toFixed(1)}°</span>
                  </div>
                  <input 
                    type="range" min="-180" max="180" value={j4} 
                    onChange={(e) => isConnected && cobotStatus === "STANDBY" && setJ4(parseFloat(e.target.value))}
                    disabled={!isConnected || cobotStatus !== "STANDBY"}
                    style={{ width: "100%", accentColor: "#38bdf8" }} 
                  />
                </div>

              </div>
            </div>

            {/* Quick action triggers */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Task Dispatcher</span>
                <span className="asm-hud-badge">AUTO</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                <button
                  onClick={runAutoCycle}
                  disabled={!isConnected || cobotStatus !== "STANDBY"}
                  className="asm-btn-control asm-btn-control--connect"
                  style={{
                    height: "38px",
                    fontWeight: 800,
                    background: isConnected && cobotStatus === "STANDBY" ? "rgba(16, 185, 129, 0.08)" : "var(--bg-secondary)",
                    borderColor: isConnected && cobotStatus === "STANDBY" ? "#10b981" : "var(--border)",
                    color: isConnected && cobotStatus === "STANDBY" ? "#10b981" : "var(--text-disabled)"
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>smart_toy</span>
                  RUN PICK & PLACE CYCLE
                </button>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button 
                    onClick={toggleGripper} 
                    disabled={!isConnected || cobotStatus !== "STANDBY"} 
                    className="asm-btn-control"
                    style={{ height: "34px", fontSize: "10px" }}
                  >
                    TOGGLE GRIPPER
                  </button>
                  <button 
                    onClick={resetArm} 
                    disabled={!isConnected || cobotStatus !== "STANDBY"} 
                    className="asm-btn-control"
                    style={{ height: "34px", fontSize: "10px" }}
                  >
                    HOME ARM
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* COLUMN 2: ANIMATED 6-AXIS SVG ROBOT ARM */}
          <div className="triac-column" style={{ overflow: "hidden" }}>
            <div className="asm-center-container" ref={containerRef}>
              
              {/* High-Fidelity SVG Viewer */}
              <div className="asm-viz-panel" style={{ position: "relative" }}>
                
                {/* Embedded Draggable HUD for Gripper Force */}
                <DraggableHUD id="cobot_gripper_hud" defaultPosition={{ x: 30, y: 30 }} boundsRef={containerRef}>
                  <div style={{
                    width: '180px',
                    background: 'rgba(10, 15, 25, 0.7)',
                    backdropFilter: 'blur(16px)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    ...cobotGlowStyle,
                    transition: 'border 0.3s, box-shadow 0.3s'
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "6px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#f8fafc", letterSpacing: "0.5px" }}>LOAD CELL</span>
                      <span style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        color: gripperState !== "OPEN" ? "#fb923c" : "#cbd5e1"
                      }}>
                        {gripperState}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "JetBrains Mono", fontSize: "11px", color: "#94a3b8" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>FORCE</span>
                        <span style={{ color: "#f1f5f9" }}>{gripperForce.toFixed(1)} N</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>PAYLOAD</span>
                        <span style={{ color: "#f1f5f9" }}>{payloadKg.toFixed(2)} kg</span>
                      </div>
                    </div>
                  </div>
                </DraggableHUD>

                {/* SVG Visualizing the 6-axis articulated robot arm */}
                <svg
                  viewBox="0 0 600 380"
                  style={{ width: "100%", height: "100%", background: "#06070a", borderRadius: "8px" }}
                >
                  <defs>
                    <linearGradient id="cobot-body" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#475569" />
                      <stop offset="50%" stopColor="#94a3b8" />
                      <stop offset="100%" stopColor="#334155" />
                    </linearGradient>
                    <linearGradient id="arm-joint-color" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#1e293b" />
                      <stop offset="100%" stopColor="#0f172a" />
                    </linearGradient>
                  </defs>

                  {/* Floor pedestal mount base */}
                  <rect x="250" y="320" width="100" height="20" fill="url(#arm-joint-color)" rx="4" stroke="#475569" />
                  <rect x="280" y="280" width="40" height="40" fill="#334155" />

                  {/* 6-Axis Articulated arm links */}
                  {/* Joint 1 Base rotation representation */}
                  <g transform={`rotate(${rotationJ1}, 300, 300)`}>
                    
                    {/* Shoulder Joint Cylinder (Joint 2) */}
                    <circle cx="300" cy="260" r="16" fill="url(#arm-joint-color)" stroke="#64748b" strokeWidth="2" />
                    
                    {/* Upper Arm link J2 -> J3 */}
                    <g transform={`rotate(${rotationJ2}, 300, 260)`} style={{ transition: "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)" }}>
                      <rect x="288" y="100" width="24" height="160" fill="url(#cobot-body)" rx="6" />
                      
                      {/* Elbow Joint (Joint 3) */}
                      <circle cx="300" cy="100" r="14" fill="url(#arm-joint-color)" stroke="#64748b" strokeWidth="2" />
                      
                      {/* Forearm Link J3 -> J4 */}
                      <g transform={`rotate(${rotationJ3}, 300, 100)`} style={{ transition: "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)" }}>
                        <rect x="290" y="0" width="20" height="100" fill="url(#cobot-body)" rx="4" />
                        
                        {/* Wrist pitch (Joint 4) */}
                        <circle cx="300" cy="0" r="10" fill="url(#arm-joint-color)" stroke="#64748b" strokeWidth="1.5" />
                        
                        {/* Tool flange assembly & Pneumatic Gripper (Joint 5 & 6) */}
                        <g transform="translate(300, -20)">
                          <rect x="-12" y="0" width="24" height="20" fill="#1e293b" rx="2" />
                          <circle cx="0" cy="0" r="8" fill="#fb923c" />
                          
                          {/* Gripper actuator base */}
                          <rect x="-18" y="-12" width="36" height="12" fill="#334155" rx="1" />
                          
                          {/* Gripper fingers (moves dynamically based on open/close) */}
                          <path 
                            d={gripperState === "OPEN" ? "M -12,-12 L -18,-24 L -12,-30" : "M -6,-12 L -8,-24 L -4,-30"} 
                            stroke="#94a3b8" 
                            strokeWidth="2.5" 
                            fill="none" 
                            style={{ transition: "d 0.3s ease" }}
                          />
                          <path 
                            d={gripperState === "OPEN" ? "M 12,-12 L 18,-24 L 12,-30" : "M 6,-12 L 8,-24 L 4,-30"} 
                            stroke="#94a3b8" 
                            strokeWidth="2.5" 
                            fill="none" 
                            style={{ transition: "d 0.3s ease" }}
                          />
                          
                          {/* Item gripped representation */}
                          {gripperState === "GRIPPED" && (
                            <rect x="-8" y="-32" width="16" height="12" fill="#38bdf8" rx="1" />
                          )}
                        </g>

                      </g>
                    </g>
                  </g>

                  {/* Workspace targets (ASRS pickup pad on the left, vice clamp on the right) */}
                  <g id="workpieces-docks">
                    {/* Left Dock */}
                    <rect x="80" y="320" width="60" height="20" fill="#1e293b" rx="2" />
                    {gripperState === "OPEN" && cobotStatus === "STANDBY" && (
                      <rect x="100" y="305" width="20" height="15" fill="#38bdf8" rx="1" />
                    )}
                    
                    {/* Right Dock */}
                    <rect x="460" y="320" width="60" height="20" fill="#1e293b" rx="2" />
                    {gripperState === "OPEN" && cobotStatus === "STANDBY" && cycleCount > 42 && (
                      <rect x="480" y="305" width="20" height="15" fill="#38bdf8" rx="1" />
                    )}
                  </g>
                </svg>
              </div>

              {/* Bottom Quick-Metrics Panel */}
              <div className="asm-footer-stats">
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Cycle Count</div>
                  <div className="asm-val__num" style={{ fontSize: "1.1rem" }}>
                    {cycleCount}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">TCP X / Z</div>
                  <div className="asm-val__num" style={{ fontSize: "0.88rem", fontFamily: "JetBrains Mono" }}>
                    {tcpX.toFixed(1)} / {tcpZ.toFixed(1)} <span style={{ fontSize: "8px", color: "#64748b" }}>mm</span>
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">Gripper Status</div>
                  <div className="asm-val__num" style={{ fontSize: "0.95rem", color: gripperState !== "OPEN" ? "#fb923c" : "#64748b" }}>
                    {gripperState}
                  </div>
                </div>
                <div className="asm-footer-stats-card">
                  <div className="asm-val__label">System Status</div>
                  <div className="asm-val__num" style={{ fontSize: "0.95rem", color: cobotStatus === "ESTOP" ? "#ef4444" : cobotStatus !== "STANDBY" ? "#38bdf8" : "#10b981" }}>
                    {cobotStatus}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* COLUMN 3: SAFETY INTEGRITY & STATUS */}
          <div className="triac-column">
            
            {/* E-Stop controller */}
            <div className="asm-hud-card">
              <div className="asm-hud-header">
                <span>Arm Emergency E-Stop</span>
                <span className={`asm-hud-badge ${cobotStatus === "ESTOP" ? "" : "asm-hud-badge--active"}`} style={{ color: cobotStatus === "ESTOP" ? "#ef4444" : "#10b981", borderColor: cobotStatus === "ESTOP" ? "#ef4444" : "#10b981" }}>
                  {cobotStatus === "ESTOP" ? "SAFETY TRIPPED" : "SERVO OK"}
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
                    background: cobotStatus === "ESTOP" ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                    borderColor: cobotStatus === "ESTOP" ? "#10b981" : "#ef4444",
                    color: cobotStatus === "ESTOP" ? "#10b981" : "#ef4444"
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                    {cobotStatus === "ESTOP" ? "settings_backup_restore" : "emergency_home"}
                  </span>
                  {cobotStatus === "ESTOP" ? "ENGAGE MOTOR DRIVES" : "HALT MOTOR DRIVES"}
                </button>
              </div>
            </div>

            {/* Event Console */}
            <div className="asm-hud-card" style={{ flex: 1 }}>
              <div className="asm-hud-header">
                <span>Operation Logs</span>
                <span className="asm-hud-badge">CONSOLE</span>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", fontFamily: "JetBrains Mono", fontSize: "10px", color: "var(--text-secondary)", overflowY: "auto", maxHeight: "170px" }}>
                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>[15:47:18]</span> Robot arm safe homed. Motors de-energized.
                </div>
                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>[15:46:12]</span> Gripper release complete. Crate placed on Milling table.
                </div>
                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>[15:45:00]</span> TCP target reached. Initiating payload grasp.
                </div>
                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>[15:44:05]</span> Pick command received from Assembly main controller.
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>[15:40:00]</span> TM5-700 servo connection active. Calibration zero OK.
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
