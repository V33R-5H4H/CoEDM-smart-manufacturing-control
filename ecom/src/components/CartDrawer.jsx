import { getCart, removeFromCart, updateQty, cartTotal } from '../store/cartStore';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../store/cartStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, ShoppingBag, ArrowRight, PackageOpen } from 'lucide-react';
import { useEffect } from 'react';

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function getProductImage(name) {
  const lower = name.toLowerCase();
  if (lower.includes('shaft')) return '/images/shaft.png';
  if (lower.includes('bearing')) return '/images/bearing.png';
  if (lower.includes('casing')) return '/images/casing.png';
  return null;
}

export default function CartDrawer({ open, onClose, onCartChange }) {
  const cart = getCart();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (open && e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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
    onClose();
    if (!user) {
      navigate('/login');
    } else {
      navigate('/checkout');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="drawer-backdrop"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="drawer-content"
          >
            {/* Header */}
            <div style={{
              padding: '24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(var(--bg-elevated), 0.8)',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{ fontWeight: 800, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShoppingBag /> Cart <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>({cart.length})</span>
              </div>
              <button className="btn-icon" onClick={onClose}><X size={20} /></button>
            </div>

            {/* Items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              {cart.length === 0 ? (
                <div className="empty-state" style={{ paddingTop: 80 }}>
                  <PackageOpen size={64} className="text-muted" style={{ opacity: 0.5 }} />
                  <div className="empty-state-title" style={{ marginTop: 16 }}>Your cart is empty</div>
                  <div className="empty-state-desc">Add some precision components to get started.</div>
                </div>
              ) : (
                cart.map(item => {
                  const imageSrc = getProductImage(item.name);
                  return (
                    <motion.div layout key={item.item_id} style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '20px 0', borderBottom: '1px solid var(--border)'
                    }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: 12,
                        background: 'var(--bg-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, overflow: 'hidden', border: '1px solid var(--border)'
                      }}>
                        {imageSrc ? <img src={imageSrc} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <PackageOpen size={28} className="text-muted" />}
                      </div>
                      
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </div>
                        <div style={{ marginTop: 4, fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem' }}>
                          {formatPrice(item.price)}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ 
                          display: 'flex', alignItems: 'center', 
                          background: 'var(--bg-secondary)', borderRadius: 8, padding: '4px' 
                        }}>
                          <button style={{ 
                            width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem'
                          }} onClick={() => handleQty(item.item_id, item.quantity - 1)}>
                            −
                          </button>
                          <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                            {item.quantity}
                          </span>
                          <button style={{ 
                            width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem'
                          }} onClick={() => handleQty(item.item_id, item.quantity + 1)}>
                            +
                          </button>
                        </div>
                        <button 
                          onClick={() => handleRemove(item.item_id)}
                          style={{ 
                            width: 36, height: 36, borderRadius: 8, border: 'none', 
                            background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)'}
                          onMouseOut={e => e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div style={{
                padding: '24px',
                borderTop: '1px solid var(--border)',
                background: 'rgba(var(--bg-elevated), 0.8)',
                backdropFilter: 'blur(12px)',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontWeight: 800, fontSize: '1.25rem', marginBottom: 24,
                }}>
                  <span>Subtotal</span>
                  <span style={{ color: 'var(--primary)' }}>{formatPrice(cartTotal(cart))}</span>
                </div>
                <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleCheckout}>
                  Checkout <ArrowRight size={18} />
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
