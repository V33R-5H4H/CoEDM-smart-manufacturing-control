import React, { useState } from "react";
import { toast } from "react-toastify";
import PageHeader from "../components/PageHeader";
import AmrStatusRibbon from "./asrs/components/AmrStatusRibbon";
import AmrControlService from "../services/AmrControl";
import AmrIcon from "../components/icons/AmrIcon";
import StationEmoticon from "../components/StationEmoticon";

export default function Amr() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const handleConnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(true);
      setStatusLoading(false);
      toast.success("Connected to AMR Fleet Manager");
    }, 800);
  };

  const handleDisconnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(false);
      setStatusLoading(false);
      toast.info("Disconnected from AMR Fleet Manager");
    }, 500);
  };

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
              robotStatus={isConnected ? "IDLE" : "OFFLINE"}
            />
            {isConnected ? (
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
      <div className="asm-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ 
          padding: '24px', 
          display: 'flex', 
          flexDirection: 'column',
          gap: '32px',
          width: '100%', 
          maxWidth: '1000px',
          margin: '0 auto',
          overflowY: 'auto'
        }}>

          {[
            [
              { id: 1, name: "ASRS", desc: "Automated Storage and Retrieval System", cmd: null },
              { id: 2, name: "MIRAC", desc: "CNC Lathe Machine", cmd: "A" }
            ],
            [
              { id: 3, name: "TRIAC", desc: "CNC Milling Machine", cmd: "B" },
              { id: 4, name: "ASSEMBLY", desc: "Robotic Assembly Station", cmd: "C" }
            ],
            [
              { id: 5, name: "TESTING", desc: "Quality Testing Station", cmd: null },
              { id: 6, name: "INSPECTION", desc: "Visual Defect Inspection", cmd: null }
            ]
          ].map((pair, idx) => (
            <div key={idx} style={{ display: 'flex', width: '100%', minHeight: '180px', alignItems: 'stretch', position: 'relative' }}>
              
              {/* LEFT STATION */}
              <div style={{ flex: 1, paddingRight: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div 
                  className="asm-hud-card" 
                  style={{ 
                    padding: '24px', 
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%', 
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                    borderRadius: '8px',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <StationEmoticon machineType={pair[0].name.toLowerCase()} state={isConnected ? "idle" : "offline"} size={48} />
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                          {pair[0].name}
                        </span>
                      </div>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 700, 
                        letterSpacing: '0.1em', 
                        color: 'var(--primary)', 
                        background: 'color-mix(in srgb, var(--primary) 10%, transparent)', 
                        padding: '4px 8px', 
                        borderRadius: '4px',
                        border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)'
                      }}>
                        STATION {String(pair[0].id).padStart(2, '0')}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                      {pair[0].desc}
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '20px' }}>
                    <button 
                      onClick={() => pair[0].cmd && handleDispatch(pair[0].name, pair[0].cmd)}
                      disabled={!isConnected || !pair[0].cmd}
                      style={{ 
                        width: '100%', 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '42px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        borderRadius: '6px',
                        transition: 'all 0.2s ease',
                        cursor: (isConnected && pair[0].cmd) ? 'pointer' : 'not-allowed',
                        background: (isConnected && pair[0].cmd) 
                          ? 'color-mix(in srgb, var(--primary) 15%, transparent)' 
                          : 'var(--bg-hover)',
                        color: (isConnected && pair[0].cmd) ? 'var(--primary)' : 'var(--text-disabled)',
                        border: (isConnected && pair[0].cmd) 
                          ? '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' 
                          : '1px solid var(--border)',
                        boxShadow: (isConnected && pair[0].cmd) ? '0 0 15px color-mix(in srgb, var(--primary) 15%, transparent)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (isConnected && pair[0].cmd) {
                          e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 25%, transparent)';
                          e.currentTarget.style.boxShadow = '0 0 20px color-mix(in srgb, var(--primary) 25%, transparent)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isConnected && pair[0].cmd) {
                          e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 15%, transparent)';
                          e.currentTarget.style.boxShadow = '0 0 15px color-mix(in srgb, var(--primary) 15%, transparent)';
                        }
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '8px', opacity: 0.8 }}>
                        {!isConnected ? 'link_off' : (!pair[0].cmd ? 'block' : 'route')}
                      </span>
                      {!isConnected ? 'OFFLINE' : (!pair[0].cmd ? 'NO ROUTE' : 'DISPATCH AMR')}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* CENTER TRACK */}
              <div style={{ width: '100px', position: 'relative', display: 'flex', justifyContent: 'center' }}>
                {/* Vertical Main Track Line */}
                <div style={{ 
                  width: '4px', 
                  height: idx === 0 ? 'calc(50% + 16px)' : (idx === 2 ? 'calc(50% + 16px)' : 'calc(100% + 32px)'),
                  top: idx === 0 ? '50%' : '-16px',
                  background: isConnected 
                    ? 'color-mix(in srgb, var(--status-info) 30%, transparent)' 
                    : 'var(--border)',
                  position: 'absolute',
                  boxShadow: isConnected ? '0 0 10px color-mix(in srgb, var(--status-info) 20%, transparent)' : 'none',
                  borderRadius: '2px'
                }} />
                
                {/* Horizontal branch left */}
                <div style={{ 
                  width: '50%', 
                  height: '4px', 
                  background: (isConnected && pair[0].cmd) 
                    ? 'linear-gradient(90deg, color-mix(in srgb, var(--status-info) 30%, transparent) 0%, transparent 100%)' 
                    : 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
                  position: 'absolute', 
                  top: '50%', 
                  left: 0,
                  transform: 'translateY(-50%)',
                  borderRadius: '2px'
                }} />
                
                {/* Horizontal branch right */}
                <div style={{ 
                  width: '50%', 
                  height: '4px', 
                  background: (isConnected && pair[1].cmd) 
                    ? 'linear-gradient(270deg, color-mix(in srgb, var(--status-info) 30%, transparent) 0%, transparent 100%)' 
                    : 'linear-gradient(270deg, var(--border) 0%, transparent 100%)',
                  position: 'absolute', 
                  top: '50%', 
                  right: 0,
                  transform: 'translateY(-50%)',
                  borderRadius: '2px'
                }} />
                
                {/* Center Node / AMR Position */}
                {idx === 0 ? (
                  <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%',
                    transform: 'translate(-50%, -50%)', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2
                  }}>
                    <AmrIcon state={isConnected ? "idle" : "offline"} size={72} />
                  </div>
                ) : (
                  <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%',
                    transform: 'translate(-50%, -50%)', 
                    width: '16px',
                    height: '16px',
                    background: isConnected ? 'color-mix(in srgb, var(--status-info) 20%, transparent)' : 'var(--bg-hover)', 
                    borderRadius: '50%', 
                    border: isConnected ? '2px solid color-mix(in srgb, var(--status-info) 50%, transparent)' : '2px solid var(--border)',
                    boxShadow: isConnected ? '0 0 10px color-mix(in srgb, var(--status-info) 30%, transparent)' : 'none',
                    zIndex: 1
                  }} />
                )}
              </div>
              
              {/* RIGHT STATION */}
              <div style={{ flex: 1, paddingLeft: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div 
                  className="asm-hud-card" 
                  style={{ 
                    padding: '24px', 
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%', 
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                    borderRadius: '8px',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <StationEmoticon machineType={pair[1].name.toLowerCase()} state={isConnected ? "idle" : "offline"} size={48} />
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                          {pair[1].name}
                        </span>
                      </div>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 700, 
                        letterSpacing: '0.1em', 
                        color: 'var(--primary)', 
                        background: 'color-mix(in srgb, var(--primary) 10%, transparent)', 
                        padding: '4px 8px', 
                        borderRadius: '4px',
                        border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)'
                      }}>
                        STATION {String(pair[1].id).padStart(2, '0')}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                      {pair[1].desc}
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '20px' }}>
                    <button 
                      onClick={() => pair[1].cmd && handleDispatch(pair[1].name, pair[1].cmd)}
                      disabled={!isConnected || !pair[1].cmd}
                      style={{ 
                        width: '100%', 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '42px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        borderRadius: '6px',
                        transition: 'all 0.2s ease',
                        cursor: (isConnected && pair[1].cmd) ? 'pointer' : 'not-allowed',
                        background: (isConnected && pair[1].cmd) 
                          ? 'color-mix(in srgb, var(--primary) 15%, transparent)' 
                          : 'var(--bg-hover)',
                        color: (isConnected && pair[1].cmd) ? 'var(--primary)' : 'var(--text-disabled)',
                        border: (isConnected && pair[1].cmd) 
                          ? '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' 
                          : '1px solid var(--border)',
                        boxShadow: (isConnected && pair[1].cmd) ? '0 0 15px color-mix(in srgb, var(--primary) 15%, transparent)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (isConnected && pair[1].cmd) {
                          e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 25%, transparent)';
                          e.currentTarget.style.boxShadow = '0 0 20px color-mix(in srgb, var(--primary) 25%, transparent)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isConnected && pair[1].cmd) {
                          e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 15%, transparent)';
                          e.currentTarget.style.boxShadow = '0 0 15px color-mix(in srgb, var(--primary) 15%, transparent)';
                        }
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '8px', opacity: 0.8 }}>
                        {!isConnected ? 'link_off' : (!pair[1].cmd ? 'block' : 'route')}
                      </span>
                      {!isConnected ? 'OFFLINE' : (!pair[1].cmd ? 'NO ROUTE' : 'DISPATCH AMR')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
