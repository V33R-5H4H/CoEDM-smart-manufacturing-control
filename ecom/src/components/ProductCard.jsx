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

function getFitTag(name = '', sku = '') {
  const n = (name || '').toLowerCase();
  const s = (sku || '').toLowerCase();
  if (n.includes('bracket') || n.includes('oval') || n.includes('70sq') || n.includes('casing') || n.includes('housing') || s.includes('csg')) {
    return 'Ø40mm H7 Bore';
  }
  if (n.includes('shaft') || s.includes('sft')) {
    return 'Ø18mm h6 Journal';
  }
  if (n.includes('bearing') || s.includes('brg')) {
    return 'Ø40 OD × Ø18 ID (P5)';
  }
  if (n.includes('alu') || n.includes('6061')) {
    return '6061-T6 Billet';
  }
  if (n.includes('en8')) {
    return 'EN8 Carbon Steel';
  }
  if (n.includes('service') || s.includes('svc')) {
    return 'Hydraulic Press Fit';
  }
  return 'Standard Spec';
}

export default function ProductCard({ product, onCartChange, onClick }) {
  const [added, setAdded] = useState(false);
  
  const inStock = product.available_qty > 0 || product.item_type === 'service';
  const lowStock = product.available_qty > 0 && product.available_qty <= 5 && product.item_type !== 'service';
  const imageSrc = getProductAsset(product.name, product.sku, product.image_url);
  const stationTag = getStationTag(product.name, product.sku);
  const fitTag = getFitTag(product.name, product.sku);

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
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      onClick={() => onClick && onClick(product)}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      {/* Image Area */}
      <div className="product-image" style={{ position: 'relative', overflow: 'hidden', padding: 20, background: 'var(--bg-secondary)' }}>
        {imageSrc ? (
          <img 
            src={imageSrc} 
            alt={product.name} 
            style={{ width: '100%', height: 165, objectFit: 'contain' }}
          />
        ) : (
          <PackageOpen size={48} className="text-muted" />
        )}
        
        {/* Top Badges */}
        <div style={{
          position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, flexWrap: 'wrap'
        }}>
          <span style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 800,
            color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4,
            boxShadow: 'var(--shadow-sm)', fontFamily: 'monospace'
          }}>
            <ShieldCheck size={12} className="text-primary" /> {fitTag}
          </span>
        </div>

        {/* Station Origin Chip */}
        <div style={{
          position: 'absolute', bottom: 10, right: 10,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700,
          color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <Factory size={11} className="text-primary" /> {stationTag}
        </div>
      </div>

      {/* Body Area */}
      <div className="product-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '18px 20px 14px' }}>
        <div>
          <div className="product-name" style={{ fontSize: '1.02rem', fontWeight: 700, lineHeight: 1.35 }}>{product.name}</div>
          {product.sku && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace', fontWeight: 600 }}>
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

        <div className="product-meta" style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="product-price">{formatPrice(product.price)}</div>
          <span className={`status-badge ${inStock ? (lowStock ? 'pending' : 'shipped') : 'cancelled'}`} style={{ textTransform: 'none', fontSize: '0.72rem' }}>
            {product.item_type === 'service'
              ? 'Service Active'
              : inStock
                ? (lowStock ? `Only ${product.available_qty} in ASRS` : `${product.available_qty} in ASRS Stock`)
                : 'Out of stock'}
          </span>
        </div>
      </div>

      {/* Footer Area */}
      <div className="product-footer" style={{ padding: '0 20px 18px' }}>
        <motion.button
          whileTap={inStock ? { scale: 0.96 } : {}}
          className={`btn ${added ? 'btn-ghost' : 'btn-primary'}`}
          style={{ width: '100%', fontSize: '0.88rem', padding: '11px', borderRadius: 'var(--radius-md)' }}
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


