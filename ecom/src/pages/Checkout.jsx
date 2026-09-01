import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCart, cartTotal, clearCart, authHeaders, getUser, clearAuth } from '../store/cartStore';
import { motion } from 'framer-motion';
import { MapPin, User, CheckCircle, PackageOpen, Loader2, Building, FileText, Zap, Factory, Truck } from 'lucide-react';
import { formatPrice } from '../utils/productImages';

export default function Checkout({ onCartChange }) {
  const navigate = useNavigate();
  const cart = getCart();
  const user = getUser();
  
  const [address, setAddress] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [gstin, setGstin] = useState('');
  const [dispatchPriority, setDispatchPriority] = useState('immediate');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    navigate('/login');
    return null;
  }

  if (cart.length === 0) {
    return (
      <div className="container">
        <div className="empty-state" style={{ minHeight: '60vh' }}>
          <PackageOpen size={64} className="text-muted" style={{ opacity: 0.5 }} />
          <div className="empty-state-title" style={{ marginTop: 16 }}>Your cart is empty</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>Browse Catalog</button>
        </div>
      </div>
    );
  }

  const handleOrder = async (e) => {
    e.preventDefault();
    if (!address.trim()) { setError('Please enter a delivery address'); return; }
    setLoading(true);
    setError('');

    // Format notes with B2B details
    let fullAddress = address.trim();
    if (companyName || poNumber || gstin) {
      fullAddress += `\n[B2B Details] Company: ${companyName || 'N/A'} | PO#: ${poNumber || 'N/A'} | GSTIN: ${gstin || 'N/A'} | Priority: ${dispatchPriority.toUpperCase()}`;
    }

    const body = {
      shipping_address: fullAddress,
      items: cart.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
    };

    try {
      const res = await fetch('/api/ecom/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearAuth();
          navigate('/login');
          return;
        }
        throw new Error(data.detail || 'Order placement failed');
      }

      clearCart();
      onCartChange?.();
      navigate(`/order/${data.order_id}`, { state: { fresh: true, plc_connected: data.plc_connected } });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <motion.div 
      className="container" style={{ paddingBottom: 64 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header" style={{ padding: '48px 0 28px' }}>
        <h1 className="page-title">B2B Checkout & Fulfillment</h1>
        <p className="page-subtitle">Configure enterprise purchase order parameters and dispatch routing.</p>
      </div>

      <div className="checkout-layout">
        {/* Left: Form */}
        <div className="glass-panel" style={{ padding: 32 }}>
          {/* User badge */}
          <div style={{ marginBottom: 28, background: 'var(--bg-secondary)', padding: '16px 20px', borderRadius: 'var(--radius-md)', display: 'flex', gap: 12, alignItems: 'center', border: '1px solid var(--border)' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary)', color: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>{user.full_name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{user.email}</div>
            </div>
          </div>

          <form onSubmit={handleOrder} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* B2B Procurement Section */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 20, borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                <Building className="text-primary" size={18} /> Enterprise B2B Details (Optional)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>PO Number (Purchase Order)</label>
                  <input
                    className="form-input"
                    placeholder="e.g. PO-2026-BVM-089"
                    value={poNumber}
                    onChange={e => setPoNumber(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Company / Institution</label>
                  <input
                    className="form-input"
                    placeholder="e.g. BVM Engineering Works"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>GSTIN / Tax ID</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 24AAACB1234F1Z5"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Fulfillment Priority */}
            <div>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Factory Dispatch Priority
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {[
                  { id: 'immediate', label: 'Automated ASRS Dispatch', desc: 'Instant Omron shuttle motion', icon: Zap },
                  { id: 'assembly', label: 'Route to Assembly Press', desc: 'Station 2 CODESYS mating', icon: Factory },
                  { id: 'standard', label: 'Standard Batch Pickup', desc: 'Scheduled manual collection', icon: Truck },
                ].map(p => {
                  const Icon = p.icon;
                  const isSel = dispatchPriority === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setDispatchPriority(p.id)}
                      style={{
                        padding: 14, borderRadius: 'var(--radius-md)',
                        border: isSel ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: isSel ? 'var(--surface-hover)' : 'var(--bg-card)',
                        cursor: 'pointer', transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        <Icon size={16} className="text-primary" /> {p.label}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {p.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Delivery Address */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <MapPin size={14} style={{ display: 'inline', marginRight: 4 }} /> Delivery & Shipping Address
              </label>
              <textarea
                className="form-input"
                placeholder="Full delivery address with department, plant gate number, city, PIN..."
                rows={3}
                value={address}
                onChange={e => setAddress(e.target.value)}
                required
                style={{ resize: 'vertical' }}
              />
            </div>

            {error && (
              <div style={{
                background: 'var(--error-bg)', color: 'var(--error)',
                padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem',
              }}>
                ⚠ {error}
              </div>
            )}

            <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ padding: '16px', fontSize: '1.05rem' }}>
              {loading ? (
                <><Loader2 size={18} className="spinner" style={{ border: 'none', animation: 'spin 1s linear infinite' }} /> Dispatching to ASRS...</>
              ) : (
                <><CheckCircle size={18} /> Confirm Order & Trigger ASRS ({formatPrice(cartTotal(cart))})</>
              )}
            </button>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
              Order will immediately communicate with Omron NX102 PLC over OPC-UA at 10.10.14.104:4840.
            </p>
          </form>
        </div>

        {/* Right: Summary */}
        <div className="card" style={{ position: 'sticky', top: 100 }}>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: 20 }}>Order Items ({cart.length})</div>

          {cart.map(item => (
            <div key={item.item_id} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '12px 0', borderBottom: '1px solid var(--border)',
              fontSize: '0.875rem',
            }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                  SKU: {item.sku || 'N/A'} — {item.quantity} × {formatPrice(item.price)}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatPrice(item.price * item.quantity)}</div>
            </div>
          ))}

          <div style={{
            display: 'flex', justifyContent: 'space-between',
            paddingTop: 20, fontWeight: 800, fontSize: '1.25rem',
          }}>
            <span>Total Payable</span>
            <span style={{ color: 'var(--primary)' }}>{formatPrice(cartTotal(cart))}</span>
          </div>

          <div style={{ marginTop: 20, background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Includes automated inventory reservation across ASRS compartments `A1` to `E7`.
          </div>
        </div>
      </div>
    </motion.div>
  );
}

