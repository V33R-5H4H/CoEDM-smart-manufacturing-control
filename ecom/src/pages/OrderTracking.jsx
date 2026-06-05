import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { authHeaders } from '../store/cartStore';
import { motion } from 'framer-motion';
import { Package, Activity, AlertTriangle, CheckCircle, RefreshCcw, MapPin, Search } from 'lucide-react';

const STATUS_STEPS = ['pending', 'processing', 'shipped', 'delivered'];
const STEP_LABELS  = ['Order Placed', 'ASRS Retrieving', 'Dispatched', 'Delivered'];

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
        <div style={{ color: 'var(--text-muted)' }}>Retrieving order details...</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="container">
      <div className="empty-state" style={{ minHeight: '60vh' }}>
        <AlertTriangle size={48} className="text-warning" style={{ opacity: 0.5, marginBottom: 16 }} />
        <div className="empty-state-title">{error}</div>
      </div>
    </div>
  );

  const currentStep = stepIndex(order.order_status);

  return (
    <motion.div 
      className="container" style={{ paddingBottom: 64 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <h1 className="page-title">Order <span style={{ color: 'var(--text-muted)' }}>#{order.order_id}</span></h1>
            <span className={`status-badge ${order.order_status}`}>
              {order.order_status}
            </span>
          </div>
          <p className="page-subtitle">Placed on {formatDate(order.created_at)}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchOrder}>
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>

      {/* ASRS notice */}
      {fresh && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{
            background: plcNote ? 'var(--warning-bg)' : 'var(--success-bg)',
            border: `1px solid ${plcNote ? 'var(--warning)' : 'var(--success)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            marginBottom: 32,
            fontSize: '0.9rem',
            color: plcNote ? 'var(--warning)' : 'var(--success)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          {plcNote ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
          {plcNote
            ? 'ASRS is currently offline. Your order is queued — the shuttle will retrieve when the system reconnects.'
            : 'ASRS retrieval triggered! The shuttle is now moving to retrieve your items.'}
        </motion.div>
      )}

      {/* Progress steps */}
      <div className="glass-panel" style={{ marginBottom: 32, padding: '40px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto' }}>
          
          {/* Background Track */}
          <div style={{ position: 'absolute', top: 24, left: '10%', right: '10%', height: 4, background: 'var(--border)', borderRadius: 2, zIndex: -1 }} />
          
          {/* Active Track (animated) */}
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${(currentStep / (STEP_LABELS.length - 1)) * 80}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ position: 'absolute', top: 24, left: '10%', height: 4, background: 'var(--primary)', borderRadius: 2, zIndex: -1 }} 
          />

          {STEP_LABELS.map((label, i) => {
            const isDone = i < currentStep;
            const isActive = i === currentStep;
            const isPending = i > currentStep;
            
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 12 }}>
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.15 }}
                  style={{
                    width: 48, height: 48, borderRadius: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isDone ? 'var(--primary)' : isActive ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
                    border: `2px solid ${isDone ? 'var(--primary)' : isActive ? 'var(--primary)' : 'var(--border)'}`,
                    color: isDone ? 'var(--bg-primary)' : isActive ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: isActive ? '0 0 15px var(--primary)' : 'none',
                    zIndex: 2,
                  }}
                >
                  {isDone ? <CheckCircle size={24} /> : 
                   i === 0 ? <Package size={22} /> : 
                   i === 1 ? <Activity size={22} /> : 
                   i === 2 ? <MapPin size={22} /> : 
                   <CheckCircle size={22} />}
                </motion.div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: isActive ? 800 : 600, color: isPending ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '0.9rem' }}>
                    {label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* Order items */}
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={20} className="text-primary" /> Items Ordered
          </div>
          {order.items?.map(item => (
            <div key={item.item_id} style={{
              padding: '16px 0',
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.9rem',
            }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                  SKU: <span style={{ fontFamily: 'monospace' }}>{item.sku}</span> — Qty: {item.quantity}
                </div>
                {item.queue_status && (
                  <span className={`status-badge ${item.queue_status}`} style={{ marginTop: 8, display: 'inline-flex', fontSize: '0.7rem' }}>
                    Queue: {item.queue_status}
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatPrice(item.total_price)}</div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 20, fontWeight: 800, fontSize: '1.1rem' }}>
            <span>Total</span>
            <span style={{ color: 'var(--primary)' }}>{formatPrice(order.total_amount)}</span>
          </div>
        </div>

        <div>
          {/* ASRS transactions */}
          <div className="card" style={{ marginBottom: 32 }}>
            <div style={{ fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={20} className="text-primary" /> ASRS Retrieval Log
            </div>
            {(!order.transactions || order.transactions.length === 0) ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={18} />
                {order.order_status === 'pending'
                  ? 'Waiting for ASRS to begin retrieval...'
                  : 'No retrieval records yet.'}
              </div>
            ) : (
              order.transactions.map((tx, idx) => (
                <div key={tx.tran_id} style={{
                  padding: '16px 0',
                  borderBottom: idx === order.transactions.length - 1 ? 'none' : '1px solid var(--border)',
                  fontSize: '0.85rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                      Compartment {tx.compartment_id}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatDate(tx.time)}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Command: <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                      {tx.asrs_command || '—'}
                    </code>
                    <span style={{ margin: '0 8px', color: 'var(--border)' }}>|</span> Result: <strong style={{ color: tx.asrs_result === 'success' ? 'var(--success)' : 'inherit' }}>{tx.asrs_result || '—'}</strong>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Shipping info */}
          <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={20} className="text-primary" /> Delivery Details
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
              {order.shipping_address}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
