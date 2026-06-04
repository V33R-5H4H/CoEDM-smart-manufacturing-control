import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCart, cartTotal, clearCart, authHeaders, getUser } from '../store/cartStore';

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
    navigate('/login?redirect=checkout');
    return null;
  }

  if (cart.length === 0) {
    return (
      <div className="container">
        <div className="empty-state" style={{ minHeight: '60vh' }}>
          <div className="empty-state-icon">🛒</div>
          <div className="empty-state-title">Your cart is empty</div>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Browse Products</button>
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
      if (!res.ok) throw new Error(data.detail || 'Order placement failed');

      clearCart();
      onCartChange?.();
      navigate(`/order/${data.order_id}`, { state: { fresh: true, plc_connected: data.plc_connected } });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      <div className="page-header">
        <h1 className="page-title">Checkout</h1>
        <p className="page-subtitle">Review your order and confirm</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start' }}>
        {/* Left: Form */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 20 }}>📬 Shipping Details</div>

          <div style={{ marginBottom: 16 }}>
            <div className="form-label" style={{ marginBottom: 4 }}>Customer</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {user.full_name} &lt;{user.email}&gt;
            </div>
          </div>

          <form onSubmit={handleOrder} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Shipping Address</label>
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

            <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
              {loading ? '⏳ Placing Order...' : '✅ Place Order & Trigger ASRS'}
            </button>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Placing this order will automatically trigger the physical ASRS to retrieve your items.
            </p>
          </form>
        </div>

        {/* Right: Summary */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 16 }}>Order Summary</div>

          {cart.map(item => (
            <div key={item.item_id} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid var(--border)',
              fontSize: '0.875rem',
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {item.quantity} × {formatPrice(item.price)}
                </div>
              </div>
              <div style={{ fontWeight: 700 }}>{formatPrice(item.price * item.quantity)}</div>
            </div>
          ))}

          <div style={{
            display: 'flex', justifyContent: 'space-between',
            paddingTop: 16, fontWeight: 800, fontSize: '1.1rem',
          }}>
            <span>Total</span>
            <span style={{ color: 'var(--primary)' }}>{formatPrice(cartTotal(cart))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
