import React, { useState } from "react";
import PageHeader from "../components/PageHeader";
import AmrStatusRibbon from "./asrs/components/AmrStatusRibbon";

export default function Amr() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const handleConnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(true);
      setStatusLoading(false);
    }, 800);
  };

  const handleDisconnect = () => {
    setStatusLoading(true);
    setTimeout(() => {
      setIsConnected(false);
      setStatusLoading(false);
    }, 500);
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
              { id: 1, name: "ASRS", desc: "Automated Storage and Retrieval System" },
              { id: 2, name: "MIRAC", desc: "CNC Lathe Machine" }
            ],
            [
              { id: 3, name: "TRIAC", desc: "CNC Milling Machine" },
              { id: 4, name: "ASSEMBLY", desc: "Robotic Assembly Station" }
            ],
            [
              { id: 5, name: "TESTING", desc: "Quality Testing Station" },
              { id: 6, name: "INSPECTION", desc: "Visual Defect Inspection" }
            ]
          ].map((pair, idx) => (
            <div key={idx} style={{ display: 'flex', width: '100%', minHeight: '160px', alignItems: 'stretch' }}>
              <div style={{ flex: 1, paddingRight: '24px', display: 'flex', flexDirection: 'column' }}>
                <div className="asm-hud-card" style={{ padding: '20px', height: '100%', position: 'relative' }}>
                  <div className="asm-hud-header" style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', letterSpacing: '0.05em' }}>{pair[0].name}</span>
                    <span className="asm-hud-badge" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                      STATION {String(pair[0].id).padStart(2, '0')}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '11px', fontFamily: 'var(--font-mono)', flex: 1, marginTop: '4px' }}>
                    {pair[0].desc}
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <button 
                      className="asm-btn-control" 
                      style={{ 
                        width: '100%', 
                        justifyContent: 'center',
                        height: '36px',
                        opacity: isConnected ? 1 : 0.5,
                        cursor: isConnected ? 'pointer' : 'not-allowed'
                      }}
                      disabled={!isConnected}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>route</span>
                      DISPATCH AMR
                    </button>
                  </div>
                </div>
              </div>
              
              <div style={{ width: '80px', position: 'relative', display: 'flex', justifyContent: 'center' }}>
                {/* Vertical Track Line */}
                <div style={{ 
                  width: '2px', 
                  height: idx === 0 ? 'calc(50% + 16px)' : (idx === 2 ? 'calc(50% + 16px)' : 'calc(100% + 32px)'),
                  top: idx === 0 ? '50%' : '-16px',
                  borderLeft: '2px dashed var(--border)', 
                  position: 'absolute',
                  opacity: 0.5
                }}></div>
                
                {/* Horizontal connection line to left */}
                <div style={{ 
                  width: '50%', 
                  height: '2px', 
                  borderTop: '2px dashed var(--border)', 
                  position: 'absolute', 
                  top: '50%', 
                  left: 0,
                  opacity: 0.5
                }}></div>
                
                {/* Horizontal connection line to right */}
                <div style={{ 
                  width: '50%', 
                  height: '2px', 
                  borderTop: '2px dashed var(--border)', 
                  position: 'absolute', 
                  top: '50%', 
                  right: 0,
                  opacity: 0.5
                }}></div>
                
                {/* AMR Icon */}
                {idx === 0 && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%',
                    transform: 'translate(-50%, -50%)', 
                    background: 'var(--bg-elevated)', 
                    padding: '8px', 
                    borderRadius: '50%', 
                    border: '2px solid var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 10px var(--primary-light)',
                    zIndex: 2
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--primary)' }}>precision_manufacturing</span>
                  </div>
                )}
                {/* Track Node Dots for other intersections */}
                {idx !== 0 && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%',
                    transform: 'translate(-50%, -50%)', 
                    width: '12px',
                    height: '12px',
                    background: 'var(--bg-elevated)', 
                    borderRadius: '50%', 
                    border: '2px solid var(--border)',
                    zIndex: 1
                  }}></div>
                )}
              </div>
              
              <div style={{ flex: 1, paddingLeft: '24px', display: 'flex', flexDirection: 'column' }}>
                <div className="asm-hud-card" style={{ padding: '20px', height: '100%', position: 'relative' }}>
                  <div className="asm-hud-header" style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', letterSpacing: '0.05em' }}>{pair[1].name}</span>
                    <span className="asm-hud-badge" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                      STATION {String(pair[1].id).padStart(2, '0')}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '11px', fontFamily: 'var(--font-mono)', flex: 1, marginTop: '4px' }}>
                    {pair[1].desc}
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <button 
                      className="asm-btn-control" 
                      style={{ 
                        width: '100%', 
                        justifyContent: 'center',
                        height: '36px',
                        opacity: isConnected ? 1 : 0.5,
                        cursor: isConnected ? 'pointer' : 'not-allowed'
                      }}
                      disabled={!isConnected}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>route</span>
                      DISPATCH AMR
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
