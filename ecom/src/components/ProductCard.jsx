import { useState } from 'react';
import { addToCart } from '../store/cartStore';
import { ShoppingCart, Check, PackageOpen, Cpu, ShieldCheck, Factory, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import { getProductAsset, formatPrice } from '../utils/productImages';

function getStationTag(name = '', sku = '') {
  const n = (name || '').toLowerCase();
  const s = (sku || '').toLowerCase();
  if (n.includes('bracket') || n.includes('oval') || n.includes('70sq') || n.includes('casing') || n.includes('housing') || s.includes('csg')) {
    return 'Station 4 • TRIAC Mill';
  }
  if (n.includes('shaft') || s.includes('sft')) {
    return 'Station 3 • MIRAC Lathe';
  }
  if (n.includes('bearing') || s.includes('brg')) {
    return 'Station 2 • Assembly Press';
  }
  return 'ASRS Warehouse Grid';
}

export default function ProductCard({ product, onCartChange, onClick }) {
  const [added, setAdded] = useState(false);
  
  const inStock = product.available_qty > 0;
  const lowStock = product.available_qty > 0 && product.available_qty <= 5;
  const imageSrc = getProductAsset(product.name, product.sku, product.image_url);
  const stationTag = getStationTag(product.name, product.sku);

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
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
      onClick={() => onClick && onClick(product)}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      {/* Image area */}
      <div className="product-image" style={{ position: 'relative', overflow: 'hidden', padding: 24, background: 'var(--bg-secondary)', borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)' }}>
        {imageSrc ? (
          <img 
            src={imageSrc} 
            alt={product.name} 
            style={{ width: '100%', height: 160, objectFit: 'contain', transition: 'transform 0.3s ease' }}
          />
        ) : (
          <PackageOpen size={48} className="text-muted" />
        )}
        
        {/* Precision Industrial Badges */}
        <div style={{
          position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, flexWrap: 'wrap'
        }}>
          <span style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700,
            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4,
            boxShadow: 'var(--shadow-sm)'
          }}>
            <ShieldCheck size={12} className="text-primary" /> ISO 9001
          </span>
        </div>

        {/* Station Origin Chip */}
        <div style={{
          position: 'absolute', bottom: 10, right: 12,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700,
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4
        }}>
          <Factory size={11} className="text-primary" /> {stationTag}
        </div>
      </div>

      <div className="product-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
        <div>
          <div className="product-name" style={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.35 }}>{product.name}</div>
          {product.sku && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace', fontWeight: 600 }}>
              SKU: {product.sku}
            </div>
          )}
        </div>

        {product.description && (
          <div className="product-desc" style={{ 
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            fontSize: '0.82rem', marginTop: 8, color: 'var(--text-secondary)', lineHeight: 1.5
          }}>{product.description}</div>
        )}

        <div className="product-meta" style={{ marginTop: 'auto', paddingTop: 16 }}>
          <div className="product-price">{formatPrice(product.price)}</div>
          <span className={`status-badge ${inStock ? (lowStock ? 'pending' : 'shipped') : 'cancelled'}`} style={{ textTransform: 'none', fontSize: '0.72rem' }}>
            {inStock
              ? (lowStock ? `Only ${product.available_qty} in ASRS` : `${product.available_qty} in ASRS Stock`)
              : 'Out of stock'}
          </span>
        </div>
      </div>

      <div className="product-footer" style={{ padding: '0 20px 20px' }}>
        <motion.button
          whileTap={inStock ? { scale: 0.96 } : {}}
          className={`btn ${added ? 'btn-ghost' : 'btn-primary'}`}
          style={{ width: '100%', fontSize: '0.88rem', padding: '12px' }}
          onClick={handleAdd}
          disabled={!inStock}
        >
          {added ? (
            <><Check size={16} /> Added to Cart</>
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


