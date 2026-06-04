import { useEffect, useRef, useState } from 'react';

/**
 * OrderFeed — Live incoming e-commerce orders panel for the ASRS HMI.
 *
 * Connects to the existing ASRS WebSocket (ws://host/api/control/asrs/ws/led-status)
 * and listens for `ecom_order` typed events injected by the orders API.
 * Displays the last 10 orders with status badges.
 */

const STATUS_COLORS = {
  pending:    { bg: 'rgba(217,119,6,0.12)',   color: '#d97706' },
  processing: { bg: 'rgba(37,99,235,0.12)',   color: '#2563eb' },
  shipped:    { bg: 'rgba(22,163,74,0.12)',    color: '#16a34a' },
  delivered:  { bg: 'rgba(22,163,74,0.12)',    color: '#16a34a' },
  cancelled:  { bg: 'rgba(220,38,38,0.12)',    color: '#dc2626' },
};

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function OrderFeed({ wsUrl }) {
  const [orders, setOrders] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const connectWS = () => {
    if (wsRef.current) return; // already connected

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type !== 'ecom_order') return;
        const payload = msg.payload;

        setOrders(prev => {
          // Update existing or prepend new
          const idx = prev.findIndex(o => o.order_id === payload.order_id);
          const entry = {
            order_id:    payload.order_id,
            item_id:     payload.item_id,
            status:      payload.status,
            plc_ok:      payload.plc_ok,
            compartments: payload.compartments_cleared || [],
            time:        new Date().toISOString(),
          };
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = entry;
            return updated;
          }
          return [entry, ...prev].slice(0, 10); // keep last 10
        });
      } catch { /* ignore non-JSON */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Auto-reconnect after 5s
      reconnectRef.current = setTimeout(connectWS, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  useEffect(() => {
    connectWS();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div className="asm-hud-card" style={{ minWidth: 260 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--primary)' }}>
          🛒 Ecom Orders
        </div>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          padding: '2px 8px', borderRadius: 99,
          background: connected ? 'var(--success-bg, rgba(22,163,74,0.12))' : 'var(--error-bg, rgba(220,38,38,0.12))',
          color: connected ? 'var(--success, #16a34a)' : 'var(--error, #dc2626)',
        }}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Order list */}
      {orders.length === 0 ? (
        <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.78rem', padding: '12px 0', textAlign: 'center' }}>
          No ecom orders yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {orders.map((order, i) => {
            const sc = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
            return (
              <div key={`${order.order_id}-${i}`} style={{
                borderRadius: 6,
                border: '1px solid var(--border, #e2e8f0)',
                padding: '8px 10px',
                background: 'var(--bg-elevated, #fff)',
                fontSize: '0.78rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                    #ORD-{order.order_id}
                  </span>
                  <span style={{
                    background: sc.bg, color: sc.color,
                    padding: '2px 7px', borderRadius: 99,
                    fontWeight: 700, fontSize: '0.65rem',
                    textTransform: 'uppercase',
                  }}>
                    {order.status}
                  </span>
                </div>
                {order.compartments?.length > 0 && (
                  <div style={{ color: 'var(--text-muted, #94a3b8)', marginTop: 4, fontFamily: 'monospace', fontSize: '0.7rem' }}>
                    Cleared: {order.compartments.join(', ')}
                  </div>
                )}
                <div style={{ color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
                  {formatTime(order.time)} · Item #{order.item_id}
                  {order.plc_ok ? ' · PLC ✓' : ' · DB only'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
