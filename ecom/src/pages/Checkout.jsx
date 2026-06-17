import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCart, cartTotal, clearCart, authHeaders, getUser, clearAuth } from '../store/cartStore';
import { motion } from 'framer-motion';
import { MapPin, User, CheckCircle, PackageOpen, Loader2 } from 'lucide-react';

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function Checkout({ onCartChange }) {
  const navigate = useNavigate();
  const cart = getCart();
  const user = getUser();
  const [address, setAddress] = useState('');
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
    if (!address.trim()) { setError('Please enter a shipping address'); return; }
    setLoading(true);
    setError('');

    const body = {
      shipping_address: address,
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
      <div className="page-header" style={{ padding: '48px 0 32px' }}>
        <h1 className="page-title">Checkout</h1>
        <p className="page-subtitle">Review your parts and confirm dispatch.</p>
      </div>

      <div className="checkout-layout">
        {/* Left: Form */}
        <div className="glass-panel" style={{ padding: 32 }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin className="text-primary" size={20} /> Shipping Details
          </div>

          <div style={{ marginBottom: 24, background: 'var(--bg-secondary)', padding: '16px 20px', borderRadius: 'var(--radius-md)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={20} className="text-muted" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.full_name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{user.email}</div>
            </div>
          </div>

          <form onSubmit={handleOrder} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Delivery Address
              </label>
              <textarea
                className="form-input"
                placeholder="Full address including city, state, PIN..."
                rows={4}
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

            <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? <><Loader2 size={18} className="spinner" style={{ border: 'none', animation: 'spin 1s linear infinite' }} /> Placing Order...</> : <><CheckCircle size={18} /> Confirm & Dispatch</>}
            </button>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Placing this order will automatically trigger the physical ASRS to retrieve your items.
            </p>
          </form>
        </div>

        {/* Right: Summary */}
        <div className="card" style={{ position: 'sticky', top: 100 }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 20 }}>Order Summary</div>

          {cart.map(item => (
            <div key={item.item_id} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '12px 0', borderBottom: '1px solid var(--border)',
              fontSize: '0.875rem',
            }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                  {item.quantity} × {formatPrice(item.price)}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatPrice(item.price * item.quantity)}</div>
            </div>
          ))}

          <div style={{
            display: 'flex', justifyContent: 'space-between',
            paddingTop: 20, fontWeight: 800, fontSize: '1.25rem',
          }}>
            <span>Total</span>
            <span style={{ color: 'var(--primary)' }}>{formatPrice(cartTotal(cart))}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
