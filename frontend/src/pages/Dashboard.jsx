import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import BoxService from "./asrs/services/boxService";
import "./Assembly.css";

export default function Dashboard() {
  const [asrsConnected, setAsrsConnected] = useState(false);
  const [asrsShuttle, setAsrsShuttle] = useState({ col: 'A', row: 7, state: 'idle' });
  const [inventoryCount, setInventoryCount] = useState(0);

  const [assemblyConnected, setAssemblyConnected] = useState(false);
  const [assemblyPosition, setAssemblyPosition] = useState(null);
  const [assemblySafety, setAssemblySafety] = useState("OK");

  const [miracConnected, setMiracConnected] = useState(false);
  const [miracSpindle, setMiracSpindle] = useState(null);
  const [miracTemp, setMiracTemp] = useState(null);

  const [triacConnected, setTriacConnected] = useState(false);
  const [triacSpindle, setTriacSpindle] = useState(null);
  const [triacFeed, setTriacFeed] = useState(null);

  // Fetch initial ASRS inventory count
  useEffect(() => {
    const fetchASRSInventory = async () => {
      try {
        const boxes = await BoxService.getAllBoxes();
        if (boxes && Array.isArray(boxes)) {
          let count = 0;
          boxes.forEach((box) => {
            if (box.subcompartments) {
              box.subcompartments.forEach((sub) => {
                if (sub.status === "Occupied") {
                  count += 1;
                }
              });
            }
          });
          setInventoryCount(count);
        }
      } catch (e) {
        console.error("Failed to fetch initial ASRS inventory count:", e);
        setInventoryCount(62); // fallback
      }
    };
    fetchASRSInventory();
  }, []);

  // WebSockets Connection Effect
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const httpBase = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`;
    const wsBase = import.meta.env.VITE_WS_URL || httpBase.replace(/^http/, 'ws');

    // Helper: clean WS close on cleanup
    const sockets = [];

    const connectAsrs = () => {
      const asrsUrl = `${wsBase}/api/control/asrs/ws/led-status`;
      const asrsWs = new WebSocket(asrsUrl);
      sockets.push(asrsWs);
      asrsWs.onopen = () => setAsrsConnected(true);
      asrsWs.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "shuttle") {
            setAsrsShuttle({
              col: data.payload.column,
              row: data.payload.row,
              state: data.payload.state,
            });
          } else if (data.type === "led") {
            setTimeout(async () => {
              try {
                const boxes = await BoxService.getAllBoxes();
                if (boxes && Array.isArray(boxes)) {
                  let count = 0;
                  boxes.forEach((box) => {
                    if (box.subcompartments) {
                      box.subcompartments.forEach((sub) => {
                        if (sub.status === "Occupied") count += 1;
                      });
                    }
                  });
                  setInventoryCount(count);
                }
              } catch {}
            }, 1000);
          }
        } catch {}
      };
      asrsWs.onclose = () => {
        setAsrsConnected(false);
      };
    };

    const connectAssembly = () => {
      const assemblyUrl = `${wsBase}/api/control/assembly/ws/hydraulic-data`;
      const assemblyWs = new WebSocket(assemblyUrl);
      sockets.push(assemblyWs);
      assemblyWs.onopen = () => setAssemblyConnected(true);
      assemblyWs.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setAssemblyConnected(data.connected !== false);
          if (data.position?.displacement_mm !== undefined) {
            const disp = Math.max(0, data.position.displacement_mm - 43);
            setAssemblyPosition(Math.round(disp));
          }
          if (data.safety?.curtain || data.safety?.buzzer) {
            setAssemblySafety("BREACH");
          } else {
            setAssemblySafety("OK");
          }
        } catch {}
      };
      assemblyWs.onclose = () => {
        setAssemblyConnected(false);
      };
    };

    const connectMirac = () => {
      const miracUrl = `${wsBase}/api/control/mirac/ws/vibit-data`;
      const miracWs = new WebSocket(miracUrl);
      sockets.push(miracWs);
      miracWs.onopen = () => setMiracConnected(true);
      miracWs.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const plcOn = data.data_sources?.plc ?? false;
          setMiracConnected(plcOn);
          if (data.spindle?.speed !== undefined && data.spindle?.speed !== null) {
            setMiracSpindle(data.spindle.speed);
          }
          if (data.spindle?.temperature !== undefined && data.spindle?.temperature !== null) {
            setMiracTemp(data.spindle.temperature);
          }
        } catch {}
      };
      miracWs.onclose = () => {
        setMiracConnected(false);
      };
    };

    const connectTriac = () => {
      const triacUrl = `${wsBase}/api/control/triac/ws/vibit-data`;
      const triacWs = new WebSocket(triacUrl);
      sockets.push(triacWs);
      triacWs.onopen = () => setTriacConnected(true);
      triacWs.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const plcOn = data.data_sources?.plc ?? false;
          setTriacConnected(plcOn);
          if (data.spindle?.speed !== undefined && data.spindle?.speed !== null) {
            setTriacSpindle(data.spindle.speed);
          }
          if (data.axes?.x?.feed !== undefined && data.axes?.x?.feed !== null) {
            setTriacFeed(data.axes.x.feed);
          }
        } catch {}
      };
      triacWs.onclose = () => {
        setTriacConnected(false);
      };
    };

    connectAsrs();
    connectAssembly();
    connectMirac();
    connectTriac();

    return () => {
      sockets.forEach((s) => {
        try {
          s.close();
        } catch {}
      });
    };
  }, []);

  const stations = [
    {
      name: "AS/RS",
      to: "/asrs",
      icon: "inventory_2",
      description: "Automated Storage & Retrieval System",
      metrics: [
        { label: "INVENTORY", value: inventoryCount, unit: "items" },
        { label: "SHUTTLE", value: asrsConnected ? asrsShuttle.state.toUpperCase() : "OFFLINE", sub: asrsConnected ? `@ ${asrsShuttle.col}${asrsShuttle.row}` : "" },
      ],
      statusColor: asrsConnected ? "var(--status-ok)" : "var(--status-idle)",
      statusText: asrsConnected ? "CONNECTED" : "OFFLINE",
    },
    {
      name: "Assembly Station",
      to: "/assembly",
      icon: "factory",
      description: "Hydraulic Press Control",
      metrics: [
        { label: "PISTON POS", value: assemblyConnected && assemblyPosition !== null ? assemblyPosition : "---", unit: assemblyConnected && assemblyPosition !== null ? "mm" : "" },
        { label: "SAFETY SYS", value: assemblyConnected ? assemblySafety : "---", sub: "" },
      ],
      statusColor: assemblyConnected ? "var(--status-ok)" : "var(--status-idle)",
      statusText: assemblyConnected ? "CONNECTED" : "OFFLINE",
    },
    {
      name: "Smart MIRAC",
      to: "/mirac",
      icon: "settings_input_component",
      description: "CNC Lathe Monitoring",
      metrics: [
        { label: "SPINDLE", value: miracConnected && miracSpindle !== null ? Math.round(miracSpindle).toLocaleString() : "---", unit: miracConnected && miracSpindle !== null ? "RPM" : "" },
        { label: "CORE TEMP", value: miracConnected && miracTemp !== null ? Math.round(miracTemp) : "---", unit: miracConnected && miracTemp !== null ? "°C" : "" },
      ],
      statusColor: miracConnected ? "var(--status-ok)" : "var(--status-idle)",
      statusText: miracConnected ? "CONNECTED" : "OFFLINE",
    },
    {
      name: "Smart TRIAC",
      to: "/triac",
      icon: "precision_manufacturing",
      description: "Process Control",
      metrics: [
        { label: "STATUS", value: triacConnected ? (triacSpindle > 0 ? "RUNNING" : "READY") : "---", unit: "" },
        { label: "FEED RATE", value: triacConnected && triacFeed !== null ? Math.round(triacFeed) : "---", unit: triacConnected && triacFeed !== null ? "mm/min" : "" },
      ],
      statusColor: triacConnected ? "var(--status-ok)" : "var(--status-idle)",
      statusText: triacConnected ? "CONNECTED" : "OFFLINE",
    },
  ];

  return (
    <div className="asm-page">
      <PageHeader
        title="Smart Manufacturing Control Portal"
        status="SYS_ACTIVE // 99.9% UPTIME // SECURE SCADA"
      />

      <div className="asm-main" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Facility Overview Header */}
        <div>
          <h2 style={{
            fontSize: '15px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}>Facility Overview</h2>
          <p style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}>Real-time cyber-physical station telemetry streams</p>
        </div>

        {/* Station Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {stations.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="asm-hud-card asm-hud-card--clickable"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 0 16px rgba(188, 199, 221, 0.15)';
                e.currentTarget.style.borderColor = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'var(--border-light)';
              }}
            >
              {/* Card Header */}
              <div className="asm-hud-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 'none', paddingBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="material-symbols-outlined" style={{
                    fontSize: '20px',
                    color: s.statusText === 'CONNECTED' ? 'var(--primary)' : 'var(--text-disabled)',
                    textShadow: s.statusText === 'CONNECTED' ? '0 0 8px var(--primary)' : 'none'
                  }}>{s.icon}</span>
                  <div>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                    }}>{s.name}</div>
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginTop: '1px'
                    }}>{s.description}</div>
                  </div>
                </div>
                {/* Status Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  border: `1px solid color-mix(in srgb, ${s.statusColor} 40%, transparent)`,
                  background: `color-mix(in srgb, ${s.statusColor} 10%, transparent)`,
                  boxShadow: `0 0 6px color-mix(in srgb, ${s.statusColor} 20%, transparent)`
                }}>
                  <div style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: s.statusColor,
                    boxShadow: `0 0 4px ${s.statusColor}`
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: s.statusColor,
                  }}>{s.statusText}</span>
                </div>
              </div>

              {/* Metrics Row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                borderTop: '1px solid var(--border-light)',
                paddingTop: '12px',
                marginTop: '4px'
              }}>
                {s.metrics.map((m, i) => (
                  <div key={i} className="asm-val">
                    <div className="asm-val__label">{m.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span className={`asm-val__num ${s.statusText === 'CONNECTED' ? 'asm-val__num--glowing-blue' : ''}`} style={{ fontSize: '15px' }}>
                        {m.value}
                      </span>
                      {m.unit && (
                        <span className="asm-val__unit" style={{ fontSize: '10px' }}>{m.unit}</span>
                      )}
                      {m.sub && (
                        <span className="asm-val__unit" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{m.sub}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Details link footer */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                borderTop: '1px solid var(--border-light)',
                paddingTop: '8px',
                marginTop: '8px'
              }}>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  color: s.statusText === 'CONNECTED' ? 'var(--primary)' : 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>Details & Control ➔</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent Transaction Log */}
        <div className="asm-viz" style={{ minHeight: 'auto', background: 'rgba(25, 28, 34, 0.85)', backdropFilter: 'blur(8px)', flex: 'none', border: '1px solid var(--border)' }}>
          <div className="asm-viz__bar" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
            <span>Recent Facility Transaction Log</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--primary)' }}>SECURE_STREAM // ONLINE</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  {['TIMESTAMP', 'STATION NODE', 'ACTION / EVENT', 'STATUS CODE'].map((h) => (
                    <th key={h} style={{
                      padding: '10px 16px',
                      fontSize: '9px',
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { time: '10:01:45.712', node: 'AS/RS', event: 'Shuttle moved to A7. Pallet retrieved.', code: 'OP_OK' },
                  { time: '10:01:18.204', node: 'ASSEMBLY', event: 'Piston actuation cycle complete (12ms).', code: 'OP_OK' },
                  { time: '10:29:05.891', node: 'MIRAC', event: 'Spindle RPM variance detected (+48 RPM). Compensating.', code: 'WARN_01' },
                  { time: '10:28:47.553', node: 'AS/RS', event: 'Inventory update. Item ID: R0214 stored at D2.', code: 'OP_OK' },
                  { time: '10:25:00.001', node: 'TRIAC', event: 'Connection timeout. Heartbeat lost. Node marked offline.', code: 'ERR_TIMEOUT' },
                ].map((row, i) => (
                  <tr key={i} style={{
                    borderBottom: '1px solid var(--border-light)',
                    transition: 'background 150ms ease-out',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{
                      padding: '10px 16px',
                      color: row.code.startsWith('ERR') ? 'var(--status-error)' : row.code.startsWith('WARN') ? 'var(--status-warn)' : 'var(--text-secondary)',
                    }}>{row.time}</td>
                    <td style={{
                      padding: '10px 16px',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                    }}>{row.node}</td>
                    <td style={{
                      padding: '10px 16px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-sans)'
                    }}>{row.event}</td>
                    <td style={{
                      padding: '10px 16px',
                      fontWeight: 700,
                      color: row.code.startsWith('ERR') ? 'var(--status-error)' : row.code.startsWith('WARN') ? 'var(--status-warn)' : 'var(--status-ok)',
                    }}>{row.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
