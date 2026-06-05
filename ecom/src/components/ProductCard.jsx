import { useState } from 'react';
import { addToCart } from '../store/cartStore';
import { ShoppingCart, Check, PackageOpen } from 'lucide-react';
import { motion } from 'framer-motion';

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function getProductImage(name) {
  const lower = name.toLowerCase();
  if (lower.includes('shaft')) return '/images/shaft.png';
  if (lower.includes('bearing')) return '/images/bearing.png';
  if (lower.includes('casing')) return '/images/casing.png';
  return null; // fallback
}

export default function ProductCard({ product, onCartChange, onClick }) {
  const [added, setAdded] = useState(false);
  
  const inStock = product.available_qty > 0;
  const lowStock = product.available_qty > 0 && product.available_qty <= 5;
  const imageSrc = product.image_url || getProductImage(product.name);

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!inStock) return;
    addToCart(product, 1);
    onCartChange?.();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <motion.div 
      className="product-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={() => onClick && onClick(product)}
      style={{ cursor: 'pointer' }}
    >
      {/* Image / icon area */}
      <div className="product-image">
        {imageSrc ? (
          <img src={imageSrc} alt={product.name} />
        ) : (
          <PackageOpen size={48} className="text-muted" />
        )}
      </div>

      <div className="product-body">
        <div>
          <div className="product-name">{product.name}</div>
          {product.sku && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
              {product.sku}
            </div>
          )}
        </div>

        {product.description && (
          <div className="product-desc" style={{ 
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' 
          }}>{product.description}</div>
        )}

        <div className="product-meta">
          <div className="product-price">{formatPrice(product.price)}</div>
          <span className={`status-badge ${inStock ? (lowStock ? 'pending' : 'shipped') : 'cancelled'}`} style={{ textTransform: 'none', fontSize: '0.7rem' }}>
            {inStock
              ? (lowStock ? `Only ${product.available_qty} left` : `${product.available_qty} in stock`)
              : 'Out of stock'}
          </span>
        </div>
      </div>

      <div className="product-footer">
        <motion.button
          whileTap={inStock ? { scale: 0.97 } : {}}
          className={`btn ${added ? 'btn-ghost' : 'btn-primary'}`}
          style={{ width: '100%' }}
          onClick={handleAdd}
          disabled={!inStock}
        >
          {added ? (
            <><Check size={16} /> Added</>
          ) : inStock ? (
            <><ShoppingCart size={16} /> Add to Cart</>
          ) : (
            'Out of Stock'
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
