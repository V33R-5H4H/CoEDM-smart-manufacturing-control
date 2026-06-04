import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { authHeaders } from '../store/cartStore';

const STATUS_STEPS = ['pending', 'processing', 'shipped', 'delivered'];
const STEP_LABELS  = ['Placed', 'ASRS Retrieving', 'Shipped', 'Delivered'];

function stepIndex(status) {
  return STATUS_STEPS.indexOf(status);
}

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrderTracking() {
  const { order_id } = useParams();
  const location = useLocation();
  const fresh = location.state?.fresh;
  const plcNote = location.state?.plc_connected === false;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrder = () => {
    fetch(`/api/ecom/orders/${order_id}`, {
      headers: authHeaders(),
    })
      .then(r => { if (!r.ok) throw new Error('Order not found'); return r.json(); })
      .then(data => { setOrder(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  };

  useEffect(() => {
    fetchOrder();
    const active = !order || ['pending','processing'].includes(order?.order_status);
    if (active) {
      const id = setInterval(fetchOrder, 5000);
      return () => clearInterval(id);
    }
  }, [order_id, order?.order_status]);

  if (loading) return (
    <div className="container center" style={{ minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div style={{ color: 'var(--text-muted)' }}>Loading order...</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="container">
      <div className="empty-state" style={{ minHeight: '60vh' }}>
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-title">{error}</div>
      </div>
    </div>
  );

  const currentStep = stepIndex(order.order_status);

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 className="page-title">Order #{order.order_id}</h1>
          <span className={`status-badge ${order.order_status}`}>
            {order.order_status}
          </span>
        </div>
        <p className="page-subtitle">Placed on {formatDate(order.created_at)}</p>
      </div>

      {/* ASRS notice */}
      {fresh && (
        <div style={{
          background: plcNote ? 'var(--warning-bg)' : 'var(--success-bg)',
          border: `1px solid ${plcNote ? 'var(--warning)' : 'var(--success)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '14px 20px',
          marginBottom: 24,
          fontSize: '0.9rem',
          color: plcNote ? 'var(--warning)' : 'var(--success)',
          fontWeight: 500,
        }}>
          {plcNote
            ? '⚠️ ASRS is currently offline. Your order is queued — the shuttle will retrieve when the system reconnects.'
            : '✅ ASRS retrieval triggered! The shuttle is now moving to retrieve your items.'}
        </div>
      )}

      {/* Progress steps */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="order-steps">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className={`step ${i < currentStep ? 'done' : i === currentStep ? 'active' : ''}`}>
              <div className="step-dot">
                {i < currentStep ? '✓' : i + 1}
              </div>
              <div className="step-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Order items */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>📦 Items Ordered</div>
          {order.items?.map(item => (
            <div key={item.item_id} style={{
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between',
              fontSize: '0.875rem',
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  SKU: {item.sku} — Qty: {item.quantity}
                </div>
                {item.queue_status && (
                  <span className={`status-badge ${item.queue_status}`} style={{ marginTop: 4, display: 'inline-flex' }}>
                    Queue: {item.queue_status}
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 700 }}>{formatPrice(item.total_price)}</div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, fontWeight: 800, fontSize: '1rem' }}>
            <span>Total</span>
            <span style={{ color: 'var(--primary)' }}>{formatPrice(order.total_amount)}</span>
          </div>
        </div>

        {/* ASRS transactions */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>🤖 ASRS Retrieval Log</div>
          {(!order.transactions || order.transactions.length === 0) ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '16px 0' }}>
              {order.order_status === 'pending'
                ? 'Waiting for ASRS to begin retrieval...'
                : 'No retrieval records yet.'}
            </div>
          ) : (
            order.transactions.map(tx => (
              <div key={tx.tran_id} style={{
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.8rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    🔲 {tx.compartment_id}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatDate(tx.time)}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  Command: <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4 }}>
                    {tx.asrs_command || '—'}
                  </code>
                  &nbsp;→ {tx.asrs_result || '—'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Shipping info */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>📬 Shipping Address</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>
          {order.shipping_address}
        </div>
      </div>

      {/* Auto-refresh note */}
      {['pending','processing'].includes(order.order_status) && (
        <p style={{ marginTop: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          🔄 This page refreshes automatically every 5 seconds
        </p>
      )}
    </div>
  );
}
