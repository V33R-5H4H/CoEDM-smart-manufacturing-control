import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, PackageOpen, Check } from 'lucide-react';
import { useState } from 'react';
import { addToCart } from '../store/cartStore';

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

export default function ProductModal({ product, onClose, onCartChange }) {
  const [added, setAdded] = useState(false);
  
  if (!product) return null;
  
  const inStock = product.available_qty > 0;
  const lowStock = inStock && product.available_qty <= 5;
  const imageSrc = getProductImage(product.name);

  const handleAdd = () => {
    if (!inStock) return;
    addToCart(product, 1);
    onCartChange?.();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            background: 'var(--bg-elevated)',
            borderRadius: 24,
            width: '100%',
            maxWidth: 800,
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="btn-icon"
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, background: 'var(--bg-secondary)' }}
          >
            <X size={20} />
          </button>

          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {/* Image Section */}
            <div style={{ 
              flex: '1 1 300px', 
              background: 'var(--bg-secondary)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 350, padding: 48,
              borderRight: '1px solid var(--border)'
            }}>
              {imageSrc ? (
                <motion.img 
                  initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                  src={imageSrc} alt={product.name} 
                  style={{ width: '100%', maxWidth: 300, objectFit: 'contain', filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.15))' }} 
                />
              ) : (
                <PackageOpen size={96} className="text-muted" />
              )}
            </div>

            {/* Details Section */}
            <div style={{ flex: '2 1 400px', padding: '40px' }}>
              <div style={{ marginBottom: 16 }}>
                {product.sku && (
                  <span style={{ 
                    background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: 6,
                    fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'monospace'
                  }}>
                    SKU: {product.sku}
                  </span>
                )}
              </div>
              
              <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16, lineHeight: 1.2 }}>
                {product.name}
              </h2>
              
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginBottom: 24 }}>
                {formatPrice(product.price)}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
                <span className={`status-badge ${inStock ? (lowStock ? 'pending' : 'shipped') : 'cancelled'}`} style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                  {inStock
                    ? (lowStock ? `Only ${product.available_qty} left in ASRS` : `${product.available_qty} units in ASRS Stock`)
                    : 'Out of stock in ASRS'}
                </span>
              </div>

              <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12 }}>Description</h3>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, fontSize: '1.05rem' }}>
                  {product.description || 'Premium precision machined component.'}
                </p>
              </div>

              <motion.button
                whileTap={inStock ? { scale: 0.97 } : {}}
                className={`btn btn-lg ${added ? 'btn-ghost' : 'btn-primary'}`}
                style={{ width: '100%', padding: '20px' }}
                onClick={handleAdd}
                disabled={!inStock}
              >
                {added ? (
                  <><Check size={20} /> Added to Cart</>
                ) : inStock ? (
                  <><ShoppingCart size={20} /> Add to Cart</>
                ) : (
                  'Currently Out of Stock'
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
