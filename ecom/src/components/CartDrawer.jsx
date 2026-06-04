import { getCart, removeFromCart, updateQty, cartTotal, clearCart } from '../store/cartStore';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../store/cartStore';

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function CartDrawer({ open, onClose, onCartChange }) {
  const cart = getCart();
  const navigate = useNavigate();

  const handleRemove = (item_id) => {
    removeFromCart(item_id);
    onCartChange?.();
  };

  const handleQty = (item_id, qty) => {
    updateQty(item_id, qty);
    onCartChange?.();
  };

  const handleCheckout = () => {
    const user = getUser();
    if (!user) {
      onClose();
      navigate('/login?redirect=checkout');
    } else {
      onClose();
      navigate('/checkout');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 200, opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.2s',
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 400, maxWidth: '95vw',
        background: 'var(--bg-elevated)',
        borderLeft: '1px solid var(--border)',
        zIndex: 201,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
            🛒 Cart ({cart.length} items)
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
          {cart.length === 0 ? (
            <div className="empty-state" style={{ paddingTop: 60 }}>
              <div className="empty-state-icon">🛒</div>
              <div className="empty-state-title">Your cart is empty</div>
              <div className="empty-state-desc">Add some products to get started</div>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.item_id} className="cart-item">
                <div style={{
                  width: 48, height: 48, borderRadius: 8,
                  background: 'var(--bg-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', flexShrink: 0,
                }}>
                  🔩
                </div>
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-price">{formatPrice(item.price)} / {item.unit}</div>
                </div>
                <div className="cart-item-qty">
                  <button className="qty-btn" onClick={() => handleQty(item.item_id, item.quantity - 1)}>−</button>
                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
                  <button className="qty-btn" onClick={() => handleQty(item.item_id, item.quantity + 1)}>+</button>
                  <button className="qty-btn" onClick={() => handleRemove(item.item_id)}
                    style={{ color: 'var(--error)', marginLeft: 4 }}>🗑</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div style={{
            padding: '20px 24px',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontWeight: 700, fontSize: '1.1rem', marginBottom: 16,
            }}>
              <span>Total</span>
              <span style={{ color: 'var(--primary)' }}>{formatPrice(cartTotal(cart))}</span>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleCheckout}>
              Proceed to Checkout →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
