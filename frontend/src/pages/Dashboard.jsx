import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";

const stations = [
  {
    name: "AS/RS",
    to: "/asrs",
    icon: "inventory_2",
    description: "Automated Storage & Retrieval System",
    metrics: [
      { label: "INVENTORY", value: "62", unit: "items" },
      { label: "SHUTTLE", value: "IDLE", sub: "@ A7" },
    ],
    statusColor: "var(--status-ok)",
    statusText: "CONNECTED",
  },
  {
    name: "Assembly Station",
    to: "/assembly",
    icon: "factory",
    description: "Hydraulic Press Control",
    metrics: [
      { label: "PISTON POS", value: "43", unit: "mm" },
      { label: "SAFETY SYS", value: "OK", sub: "" },
    ],
    statusColor: "var(--status-ok)",
    statusText: "CONNECTED",
  },
  {
    name: "Smart MIRAC",
    to: "/mirac",
    icon: "settings_input_component",
    description: "CNC Lathe Monitoring",
    metrics: [
      { label: "SPINDLE", value: "1,200", unit: "RPM" },
      { label: "CORE TEMP", value: "32", unit: "°C" },
    ],
    statusColor: "var(--status-ok)",
    statusText: "CONNECTED",
  },
  {
    name: "Smart TRIAC",
    to: "/triac",
    icon: "precision_manufacturing",
    description: "Process Control",
    metrics: [
      { label: "STATUS", value: "---", unit: "" },
      { label: "FEED RATE", value: "---", unit: "" },
    ],
    statusColor: "var(--status-idle)",
    statusText: "OFFLINE",
  },
];

export default function Dashboard() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      <PageHeader
        title="Smart Manufacturing Control"
        status="SYS_OK // 99.9% UPTIME"
      />

      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px',
      }}>
        {/* Facility Overview */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            marginBottom: '4px',
          }}>Facility Overview</h2>
          <p style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            margin: 0,
          }}>Real-time station monitoring</p>
        </div>

        {/* Station Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '12px',
          marginBottom: '32px',
        }}>
          {stations.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              style={{
                textDecoration: 'none',
                color: 'inherit',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'background 150ms ease-out, border-color 150ms ease-out',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.borderColor = 'var(--border-lighter)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="material-symbols-outlined" style={{
                    fontSize: '20px',
                    color: 'var(--primary)',
                  }}>{s.icon}</span>
                  <div>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}>{s.name}</div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}>{s.description}</div>
                  </div>
                </div>
                {/* Status badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '2px',
                  border: `1px solid color-mix(in srgb, ${s.statusColor} 30%, transparent)`,
                  background: `color-mix(in srgb, ${s.statusColor} 8%, transparent)`,
                }}>
                  <div style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: s.statusColor,
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: s.statusColor,
                  }}>{s.statusText}</span>
                </div>
              </div>

              {/* Metrics row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                borderTop: '1px solid var(--border)',
                paddingTop: '10px',
              }}>
                {s.metrics.map((m, i) => (
                  <div key={i}>
                    <div style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: '2px',
                    }}>{m.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}>{m.value}</span>
                      {m.unit && (
                        <span style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                        }}>{m.unit}</span>
                      )}
                      {m.sub && (
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                        }}>{m.sub}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Details link */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
              }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>Details →</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent Transaction Log */}
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '10px',
          }}>Recent Transaction Log</div>
          <div style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['TIMESTAMP', 'STATION NODE', 'ACTION / EVENT', 'STATUS CODE'].map((h) => (
                    <th key={h} style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      borderBottom: '1px solid var(--border)',
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
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{
                      padding: '8px 12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      color: row.code.startsWith('ERR') ? 'var(--status-error)' : row.code.startsWith('WARN') ? 'var(--status-warn)' : 'var(--text-secondary)',
                    }}>{row.time}</td>
                    <td style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}>{row.node}</td>
                    <td style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                    }}>{row.event}</td>
                    <td style={{
                      padding: '8px 12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 500,
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
