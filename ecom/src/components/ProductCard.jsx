import { useState } from 'react';
import { addToCart } from '../store/cartStore';

const ITEM_EMOJIS = {
  'finished':   '🔩',
  'raw':        '🪨',
  'tool':       '🔧',
  'consumable': '💧',
};

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function ProductCard({ product, onCartChange }) {
  const [added, setAdded] = useState(false);
  const inStock = product.available_qty > 0;
  const lowStock = product.available_qty > 0 && product.available_qty <= 5;

  const handleAdd = () => {
    if (!inStock) return;
    addToCart(product, 1);
    onCartChange?.();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="product-card">
      {/* Image / icon area */}
      <div className="product-image" style={{ fontSize: '3.5rem', color: 'var(--text-muted)' }}>
        {ITEM_EMOJIS[product.item_type] || '📦'}
      </div>

      <div className="product-body">
        <div>
          <div className="product-name">{product.name}</div>
          {product.sku && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              SKU: {product.sku}
            </div>
          )}
        </div>

        {product.description && (
          <div className="product-desc">{product.description}</div>
        )}

        <div className="product-meta">
          <div className="product-price">{formatPrice(product.price)}</div>
          <span className={`stock-badge ${inStock ? (lowStock ? 'low' : 'in') : 'out'}`}>
            {inStock
              ? (lowStock ? `Only ${product.available_qty} left` : `${product.available_qty} in stock`)
              : 'Out of stock'}
          </span>
        </div>
      </div>

      <div className="product-footer">
        <button
          className={`btn ${added ? 'btn-ghost' : 'btn-primary'}`}
          style={{ width: '100%', transition: 'all 0.2s' }}
          onClick={handleAdd}
          disabled={!inStock}
        >
          {added ? '✓ Added to Cart' : inStock ? 'Add to Cart' : 'Out of Stock'}
        </button>
      </div>
    </div>
  );
}
