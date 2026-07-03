import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import BoxService from "./asrs/services/boxService";
import "./Assembly.css";
import { wsCache } from "../utils/wsCache";
import FactoryLayout from "../components/FactoryLayout";

export default function Dashboard() {
  const [asrsConnected, setAsrsConnected] = useState(false); // WebSocket status
  const [asrsPlcConnected, setAsrsPlcConnected] = useState(false); // PLC connection status
  const [asrsShuttle, setAsrsShuttle] = useState(wsCache.dashboard.asrsShuttle);
  const [inventoryCount, setInventoryCount] = useState(0);

  const [forceAnimations, setForceAnimations] = useState(false);

  const [assemblyConnected, setAssemblyConnected] = useState(false);
  const [assemblyPosition, setAssemblyPosition] = useState(wsCache.dashboard.assemblyPosition);
  const [assemblySafety, setAssemblySafety] = useState(wsCache.dashboard.assemblySafety);

  const [miracConnected, setMiracConnected] = useState(false);
  const [miracSpindle, setMiracSpindle] = useState(wsCache.dashboard.miracSpindle);
  const [miracTemp, setMiracTemp] = useState(wsCache.dashboard.miracTemp);

  const [triacConnected, setTriacConnected] = useState(false);
  const [triacSpindle, setTriacSpindle] = useState(wsCache.dashboard.triacSpindle);
  const [triacFeed, setTriacFeed] = useState(wsCache.dashboard.triacFeed);

  const [amrConnected, setAmrConnected] = useState(false);
  const [amrTelemetry, setAmrTelemetry] = useState(null);

  const [transactions, setTransactions] = useState(wsCache.dashboard.transactions);
  const [lastUpdated, setLastUpdated] = useState(wsCache.dashboard.lastUpdated);

  // Track the exact timestamp of the last actual data change (delta)
  const [activity, setActivity] = useState({ asrs: 0, assembly: 0, mirac: 0, triac: 0, amr: 0 });
  
  // Force a re-render every second to smoothly transition from "running" to "idle"
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;

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
            const shuttle = {
              col: data.payload.column,
              row: data.payload.row,
              state: data.payload.state,
            };
            wsCache.dashboard.asrsShuttle = shuttle;
            setAsrsShuttle(shuttle);
            const ts = new Date().toTimeString().slice(0, 8);
            wsCache.dashboard.lastUpdated = { ...wsCache.dashboard.lastUpdated, asrs: ts };
            setLastUpdated(prev => ({ ...prev, asrs: ts }));
            setActivity(prev => ({ ...prev, asrs: Date.now() }));
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
              } catch { }
            }, 1000);
          }
          window.dispatchEvent(new Event('asrs-ws-activity'));
        } catch { }
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
      let assemblyLastData = null;
      assemblyWs.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          let data;
          if (msg.type === 'snapshot') {
            data = msg.data;
            assemblyLastData = data;
          } else if (msg.type === 'delta') {
            // Simple shallow merge for dashboard (only needs top-level fields)
            assemblyLastData = assemblyLastData ? {
              ...assemblyLastData, ...msg.data,
              position: { ...(assemblyLastData.position || {}), ...(msg.data.position || {}) },
              safety: { ...(assemblyLastData.safety || {}), ...(msg.data.safety || {}) },
            } : msg.data;
            data = assemblyLastData;
          } else {
            return; // heartbeat
          }
          setAssemblyConnected(data.connected !== false);
          if (data.position?.displacement_mm !== undefined) {
            const disp = Math.max(0, data.position.displacement_mm - 43);
            const pos = Math.round(disp);
            wsCache.dashboard.assemblyPosition = pos;
            setAssemblyPosition(pos);
          }
          if (data.safety?.curtain || data.safety?.buzzer) {
            wsCache.dashboard.assemblySafety = "BREACH";
            setAssemblySafety("BREACH");
          } else {
            wsCache.dashboard.assemblySafety = "OK";
            setAssemblySafety("OK");
          }
          const ts = new Date().toTimeString().slice(0, 8);
          wsCache.dashboard.lastUpdated = { ...wsCache.dashboard.lastUpdated, assembly: ts };
          setLastUpdated(prev => ({ ...prev, assembly: ts }));
          if (msg.type === 'delta' || msg.type === 'snapshot') {
            setActivity(prev => ({ ...prev, assembly: Date.now() }));
          }
        } catch { }
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
      let miracLastData = null;
      miracWs.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          let data;
          if (msg.type === 'snapshot') {
            data = msg.data;
            miracLastData = data;
          } else if (msg.type === 'delta') {
            miracLastData = miracLastData ? {
              ...miracLastData, ...msg.data,
              spindle: { ...(miracLastData.spindle || {}), ...(msg.data.spindle || {}) },
              data_sources: { ...(miracLastData.data_sources || {}), ...(msg.data.data_sources || {}) },
            } : msg.data;
            data = miracLastData;
          } else {
            return; // heartbeat
          }
          const isConnected = data.data_sources?.plc === true || data.data_sources?.vibit === true;
          console.log("[MIRAC WS] Received data:", data.data_sources, "Connected:", isConnected);
          setMiracConnected(isConnected);
          if (data.spindle?.speed !== undefined && data.spindle?.speed !== null) {
            wsCache.dashboard.miracSpindle = data.spindle.speed;
            setMiracSpindle(data.spindle.speed);
          }
          if (data.spindle?.temperature !== undefined && data.spindle?.temperature !== null) {
            wsCache.dashboard.miracTemp = data.spindle.temperature;
            setMiracTemp(data.spindle.temperature);
          }
          const ts = new Date().toTimeString().slice(0, 8);
          wsCache.dashboard.lastUpdated = { ...wsCache.dashboard.lastUpdated, mirac: ts };
          setLastUpdated(prev => ({ ...prev, mirac: ts }));
          if (msg.type === 'delta' || msg.type === 'snapshot') {
            setActivity(prev => ({ ...prev, mirac: Date.now() }));
          }
        } catch { }
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
      let triacLastData = null;
      triacWs.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          let data;
          if (msg.type === 'snapshot') {
            data = msg.data;
            triacLastData = data;
          } else if (msg.type === 'delta') {
            triacLastData = triacLastData ? {
              ...triacLastData, ...msg.data,
              spindle: { ...(triacLastData.spindle || {}), ...(msg.data.spindle || {}) },
              axes: {
                ...(triacLastData.axes || {}), ...(msg.data.axes || {}),
                x: { ...((triacLastData.axes || {}).x || {}), ...((msg.data.axes || {}).x || {}) },
              },
              data_sources: { ...(triacLastData.data_sources || {}), ...(msg.data.data_sources || {}) },
            } : msg.data;
            data = triacLastData;
          } else {
            return; // heartbeat
          }
          const isConnected = data.data_sources?.plc === true || data.data_sources?.vibit === true;
          setTriacConnected(isConnected);
          if (data.spindle?.speed !== undefined && data.spindle?.speed !== null) {
            wsCache.dashboard.triacSpindle = data.spindle.speed;
            setTriacSpindle(data.spindle.speed);
          }
          if (data.axes?.x?.feed !== undefined && data.axes?.x?.feed !== null) {
            wsCache.dashboard.triacFeed = data.axes.x.feed;
            setTriacFeed(data.axes.x.feed);
          }
          const ts = new Date().toTimeString().slice(0, 8);
          wsCache.dashboard.lastUpdated = { ...wsCache.dashboard.lastUpdated, triac: ts };
          setLastUpdated(prev => ({ ...prev, triac: ts }));
          if (msg.type === 'delta' || msg.type === 'snapshot') {
            setActivity(prev => ({ ...prev, triac: Date.now() }));
          }
        } catch { }
      };
      triacWs.onclose = () => {
        setTriacConnected(false);
      };
    };

    const connectAmr = () => {
      const amrUrl = `${wsBase}/api/control/amr/ws`;
      const amrWs = new WebSocket(amrUrl);
      sockets.push(amrWs);
      amrWs.onopen = () => {};
      amrWs.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "amr_state") {
            const isConnected = msg.payload.status !== "disconnected";
            setAmrConnected(isConnected);
            setAmrTelemetry(msg.payload);
            const ts = new Date().toTimeString().slice(0, 8);
            wsCache.dashboard.lastUpdated = { ...wsCache.dashboard.lastUpdated, amr: ts };
            setLastUpdated(prev => ({ ...prev, amr: ts }));
            setActivity(prev => ({ ...prev, amr: Date.now() }));
          }
        } catch { }
      };
      amrWs.onclose = () => {
        setAmrConnected(false);
      };
    };

    connectAsrs();
    connectAssembly();
    connectMirac();
    connectTriac();
    connectAmr();

    return () => {
      sockets.forEach((s) => {
        try {
          s.close();
        } catch { }
      });
    };
  }, []);

  // Fetch transaction log — initial load + refresh on WS activity (debounced)
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const httpBase = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`;
    let isMounted = true;
    let refreshTimer = null;

    const fetchEvents = async () => {
      try {
        const res = await fetch(`${httpBase}/data/events?limit=25`);
        const json = await res.json();
        if (json.success && isMounted) {
          wsCache.dashboard.transactions = json.data;
          setTransactions(json.data);
        }
      } catch (e) {
        console.error("Failed to fetch events:", e);
      }
    };

    // Initial load
    fetchEvents();

    // Refresh at most once every 5s when triggered by WS activity
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (isMounted) fetchEvents();
      }, 5000);
    };

    // Listen for any WS message on the page to trigger a refresh
    const handleWsActivity = () => scheduleRefresh();
    window.addEventListener('asrs-ws-activity', handleWsActivity);

    // Periodically fetch PLC connection statuses
    const fetchStatuses = async () => {
      if (!isMounted) return;
      try {
        const asrsRes = await fetch(`${httpBase}/control/asrs/connection-status`);
        if (asrsRes.ok) {
          const asrsJson = await asrsRes.json();
          setAsrsPlcConnected(asrsJson.connected);
        }
      } catch (e) {}
    };
    
    fetchStatuses();
    const statusTimer = setInterval(fetchStatuses, 3000);

    return () => {
      isMounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(statusTimer);
      window.removeEventListener('asrs-ws-activity', handleWsActivity);
    };
  }, []);

  const ACTIVITY_TIMEOUT = 3000; // 3 seconds of no data changes = idle

  const getMiracState = () => {
    if (forceAnimations) return "running";
    if (!miracConnected) return "offline";
    if (miracSpindle != null && miracSpindle > 0) return "running";
    if (now - activity.mirac < ACTIVITY_TIMEOUT) return "running";
    return "idle";
  };

  const getTriacState = () => {
    if (forceAnimations) return "running";
    if (!triacConnected) return "offline";
    if ((triacSpindle != null && triacSpindle > 0) || (triacFeed != null && triacFeed > 0)) return "running";
    if (now - activity.triac < ACTIVITY_TIMEOUT) return "running";
    return "idle";
  };

  const getAssemblyState = () => {
    if (forceAnimations) return "running";
    if (!assemblyConnected) return "offline";
    if (assemblySafety === "BREACH") return "error";
    if (assemblyPosition != null && assemblyPosition > 7) return "running";
    return "idle";
  };

  const getAsrsState = () => {
    if (forceAnimations) return "running";
    // If either the websocket is dead OR the PLC is disconnected, it's offline
    if (!asrsConnected || !asrsPlcConnected) return "offline";
    if (now - activity.asrs < ACTIVITY_TIMEOUT) return "running";
    return "idle";
  };

  const getAmrState = () => {
    if (forceAnimations) return "running";
    if (!amrConnected) return "offline";
    if (amrTelemetry?.status === "navigating" || amrTelemetry?.status === "busy") return "running";
    if (now - activity.amr < ACTIVITY_TIMEOUT) return "running";
    return "idle";
  };

  const STATION_MAP = {
    ASRS:       { x: -4.000000, y:  0.200000 },
    INSPECTION: { x: -3.000000, y:  0.200000 },
    TESTING:    { x: -2.000000, y:  0.200000 },
    HOME:       { x:  0.000000, y:  0.000000 },
    TRIAC:      { x:  1.476023, y:  0.405875 },
    MIRAC:      { x:  4.148900, y:  0.427600 },
    ASSEMBLY:   { x:  5.630868, y:  1.215410 },
  };

  const getAmrLocationString = () => {
    if (!amrConnected || !amrTelemetry || !amrTelemetry.position) return "---";
    const { x, y } = amrTelemetry.position;
    if (x === undefined || y === undefined || x === null || y === null) return "---";

    for (const name in STATION_MAP) {
      const s = STATION_MAP[name];
      const dx = x - s.x;
      const dy = y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.25) {
        return name;
      }
    }
    return `${x.toFixed(1)}, ${y.toFixed(1)}`;
  };

  const stations = [
    {
      name: "Smart MIRAC",
      key: "mirac",
      to: "/mirac",
      emoticonState: getMiracState(),
      metrics: [
        { label: "RPM", value: miracConnected && miracSpindle !== null ? Math.round(miracSpindle) : "---" },
        { label: "TEMP", value: miracConnected && miracTemp !== null ? Math.round(miracTemp) : "---", unit: "°C" },
      ]
    },
    {
      name: "Smart TRIAC",
      key: "triac",
      to: "/triac",
      emoticonState: getTriacState(),
      metrics: [
        { label: "FEED", value: triacConnected && triacFeed !== null ? Math.round(triacFeed) : "---" },
        { label: "STATUS", value: triacConnected ? (triacSpindle > 0 ? "RUN" : "RDY") : "---" },
      ]
    },
    {
      name: "Assembly",
      key: "assembly",
      to: "/assembly",
      emoticonState: getAssemblyState(),
      metrics: [
        { label: "POS", value: assemblyConnected && assemblyPosition !== null ? assemblyPosition : "---", unit: "mm" },
        { label: "SYS", value: assemblyConnected ? assemblySafety : "---" },
      ]
    },
    {
      name: "AS/RS",
      key: "asrs",
      to: "/asrs",
      emoticonState: getAsrsState(),
      metrics: [
        { label: "INV", value: inventoryCount, unit: "pcs" },
        { label: "SHUTTLE", value: asrsConnected && asrsShuttle?.state ? asrsShuttle.state.substring(0, 3).toUpperCase() : "OFF" },
      ]
    },
    {
      name: "Testing",
      key: "testing",
      to: "/testing-station",
      emoticonState: forceAnimations ? "running" : "offline",
      metrics: [
        { label: "STAT", value: "---" },
        { label: "RATE", value: "---", unit: "u/h" },
      ]
    },
    {
      name: "Inspection",
      key: "inspection",
      to: "/inspection",
      emoticonState: forceAnimations ? "running" : "offline",
      metrics: [
        { label: "PASS", value: "---", unit: "%" },
        { label: "FAIL", value: "---" },
      ]
    },
    {
      name: "AMR",
      key: "amr",
      to: "/amr",
      emoticonState: getAmrState(),
      metrics: [
        { label: "FLEET", value: amrConnected && amrTelemetry?.status ? amrTelemetry.status.toUpperCase() : "---" },
        { label: "LOC", value: getAmrLocationString() },
      ]
    },
    {
      name: "Cobot",
      key: "cobot",
      to: "/cobot",
      emoticonState: forceAnimations ? "running" : "offline",
      metrics: [
        { label: "STATE", value: "---" },
        { label: "LOAD", value: "---", unit: "kg" },
      ]
    }
  ];

  return (
    <div className="asm-page">
      <PageHeader
        title="Smart Manufacturing Control Portal"
        actions={
          <button 
            style={{ 
              padding: '6px 16px', 
              background: forceAnimations ? 'var(--status-error)' : 'var(--primary)', 
              color: 'var(--bg-primary)', 
              borderRadius: 'var(--radius-sm)', 
              fontWeight: 700,
              fontSize: '14px', 
              border: 'none', 
              cursor: 'pointer', 
              boxShadow: 'var(--shadow-sm)' 
            }}
            onClick={() => setForceAnimations(prev => !prev)}
          >
            {forceAnimations ? "Stop Force Animations" : "Force Animations ON"}
          </button>
        }
      />

      <div className="asm-main" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Station Cards Grid (Top Half) */}
        <FactoryLayout stations={stations} />

        {/* Recent Transaction Log */}
        <div className="asm-viz" style={{ minHeight: 'auto', flex: 'none', border: '1px solid var(--border)' }}>
          <div className="asm-viz__bar" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
            <span>Recent Facility Transaction Log</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--primary)', fontWeight: 'bold' }}>SECURE_STREAM // ONLINE</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  {['TIMESTAMP', 'STATION NODE', 'ACTION / EVENT', 'STATUS CODE'].map((h) => (
                    <th key={h} style={{
                      padding: '12px 16px',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((row, i) => {
                  const eventTime = new Date(row.time);
                  let timeStr = row.time;
                  try { 
                    timeStr = eventTime.toLocaleTimeString('en-IN', { hour12: false }) + '.' + String(eventTime.getMilliseconds()).padStart(3, '0'); 
                  } catch (e) { }
                  let code = "OP_OK";
                  if (row.severity === "warning") code = "WARN";
                  if (row.severity === "critical") code = "ERR";
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background 150ms ease-out',
                    }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{
                        padding: '14px 16px',
                        color: code.startsWith('ERR') ? 'var(--status-error)' : code.startsWith('WARN') ? 'var(--status-warn)' : 'var(--text-secondary)',
                      }}>{timeStr}</td>
                      <td style={{
                        padding: '14px 16px',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        textTransform: 'uppercase'
                      }}>{row.machine_id}</td>
                      <td style={{
                        padding: '14px 16px',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-sans)'
                      }}>{row.title}</td>
                      <td style={{
                        padding: '14px 16px',
                        fontWeight: 700,
                        color: code.startsWith('ERR') ? 'var(--status-error)' : code.startsWith('WARN') ? 'var(--status-warn)' : 'var(--status-ok)',
                      }}>{code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
    </div>
  );
}
