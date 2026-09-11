import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import { 
  Search, SlidersHorizontal, ArrowRight, Sparkles, PackageOpen, Layers, 
  LayoutGrid, Table2, ShieldCheck, Factory, ShoppingCart, Check, FileText, X, RefreshCw, Cpu
} from 'lucide-react';
import { motion } from 'framer-motion';
import { getProductAsset, formatPrice } from '../utils/productImages';
import { addToCart } from '../store/cartStore';

const CATEGORIES = [
  { id: 'all',     label: 'All Components' },
  { id: 'casing',  label: 'Housings (Station 4)' },
  { id: 'bearing', label: 'Bearings (Station 2)' },
  { id: 'shaft',   label: 'Shafts (Station 3)' },
  { id: 'raw',     label: 'Raw Stock Billets' },
  { id: 'service', label: 'Services & Assembly' },
];

function getStationInfo(name = '', sku = '') {
  const n = (name || '').toLowerCase();
  const s = (sku || '').toLowerCase();
  if (n.includes('bracket') || n.includes('oval') || n.includes('70sq') || n.includes('casing') || n.includes('housing') || s.includes('csg')) {
    return { station: 'Station 4 • TRIAC Mill', bin: 'A1a - A3a', fit: 'Ø40mm H7 Bore (12mm seat)' };
  }
  if (n.includes('shaft') || s.includes('sft')) {
    return { station: 'Station 3 • MIRAC Lathe', bin: 'B2a', fit: 'Ø18mm h6 Ground Journal' };
  }
  if (n.includes('bearing') || s.includes('brg')) {
    return { station: 'Station 2 • Assembly Press', bin: 'B1a', fit: 'Ø40mm OD × Ø18mm ID' };
  }
  if (n.includes('service') || s.includes('svc') || n.includes('press')) {
    return { station: 'Station 2 • Hydraulic Press Cell', bin: 'Mating Cell', fit: 'H7/h6 Interference Fit' };
  }
  return { station: 'Raw Stock Warehouse', bin: 'C1a - C2a', fit: '6061-T6 / EN8 Billet' };
}

export default function Catalogue({ onCartChange }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'matrix'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [addedItemIds, setAddedItemIds] = useState({});
  const searchInputRef = useRef(null);

  const fetch_products = () => {
    fetch('/api/ecom/products')
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetch_products();
    const id = setInterval(fetch_products, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleQuickAdd = (e, product) => {
    e.stopPropagation();
    if (product.available_qty <= 0 && product.item_type !== 'service') return;
    addToCart(product, 1);
    onCartChange?.();
    setAddedItemIds(prev => ({ ...prev, [product.item_id]: true }));
    setTimeout(() => {
      setAddedItemIds(prev => ({ ...prev, [product.item_id]: false }));
    }, 1500);
  };

  // Filter
  const filtered = products.filter(p => {
    const query = search.toLowerCase().trim();
    if (query) {
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const unit = (p.unit || '').toLowerCase();
      const stInfo = getStationInfo(p.name, p.sku);
      const station = (stInfo.station || '').toLowerCase();
      const fit = (stInfo.fit || '').toLowerCase();
      const match = name.includes(query) || 
                    sku.includes(query) || 
                    desc.includes(query) || 
                    unit.includes(query) ||
                    station.includes(query) || 
                    fit.includes(query);
      if (!match) return false;
    }

    if (inStockOnly && p.available_qty <= 0 && p.item_type !== 'service') return false;

    if (activeCategory === 'all') return true;
    const n = (p.name || '').toLowerCase();
    const s = (p.sku || '').toLowerCase();
    if (activeCategory === 'shaft') return n.includes('shaft') || s.includes('sft');
    if (activeCategory === 'bearing') return n.includes('bearing') || s.includes('brg');
    if (activeCategory === 'casing') return n.includes('casing') || n.includes('housing') || s.includes('csg') || n.includes('bracket') || n.includes('oval') || n.includes('70sq');
    if (activeCategory === 'raw') return n.includes('billet') || n.includes('block') || n.includes('raw') || p.item_type === 'raw';
    if (activeCategory === 'service') return n.includes('service') || s.includes('svc') || p.item_type === 'service' || n.includes('press');
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === 'price-low') return a.price - b.price;
    if (sortBy === 'price-high') return b.price - a.price;
    if (sortBy === 'stock-high') return b.available_qty - a.available_qty;
    return a.name.localeCompare(b.name);
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      {/* Hero Header with CAD Grid Accent */}
      <motion.div 
        className="page-header cad-grid-bg"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: 'center', padding: '44px 20px 24px', borderRadius: 'var(--radius-lg)', marginBottom: 28, border: '1px solid var(--border)' }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 99, padding: '4px 16px', fontSize: '0.8rem', fontWeight: 700,
          color: 'var(--text-secondary)', marginBottom: 14
        }}>
          <Sparkles size={14} className="text-primary" /> Center of Excellence in Digital Manufacturing • BVM Engineering
        </div>
        <h1 className="page-title" style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          Precision Components & Sub-Assemblies
        </h1>
        <p className="page-subtitle" style={{ maxWidth: 700, margin: '12px auto 20px', fontSize: '1rem', lineHeight: 1.6 }}>
          Direct B2B engineering procurement portal connected to shopfloor CNC machining centres and ASRS automated warehouse shuttle retrieval.
        </p>

        {/* Live Shopfloor Capability Telemetry Ribbon */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="telemetry-ribbon">
            <div className="telemetry-chip">
              <Factory size={13} className="text-primary" />
              <span>Station 4: TRIAC CNC Mill</span>
            </div>
            <div className="telemetry-chip">
              <Cpu size={13} className="text-primary" />
              <span>Station 3: MIRAC CNC Lathe</span>
            </div>
            <div className="telemetry-chip">
              <ShieldCheck size={13} className="text-primary" />
              <span>Station 2: Hydraulic Press Cell</span>
            </div>
            <div className="telemetry-chip">
              <Layers size={13} className="text-primary" />
              <span>ASRS Automated Grid (A1–E7)</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Assembly Configurator Promo Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15 }}
        style={{
          background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 32px',
          marginBottom: 36,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{
          position: 'absolute', right: -20, top: -20, width: 140, height: 140,
          background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
          opacity: 0.08, pointerEvents: 'none'
        }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              background: 'var(--primary)', color: 'var(--bg-primary)',
              borderRadius: 4, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase'
            }}>
              Interactive Tool
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Industry 4.0 Sub-Assembly Builder
            </span>
          </div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Interactive Mechanical Assembly Configurator
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '6px 0 0', maxWidth: 580 }}>
            Configure precision shafts, bearings, and certified CNC housings with real-time mating validation and automated hydraulic press assembly routing.
          </p>
        </div>

        <Link
          to="/configure"
          className="btn btn-primary"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 24px', fontSize: '0.95rem', fontWeight: 700,
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-glow)'
          }}
        >
          <Layers size={18} /> Launch Configurator <ArrowRight size={16} />
        </Link>
      </motion.div>

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 580 }}>
            <Search size={20} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              ref={searchInputRef}
              className="form-input"
              placeholder="Search components (e.g. 70sq, Oval, Bracket, Shaft, Bearing, H7, 6061)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setSearch('');
                  e.currentTarget.blur();
                }
              }}
              style={{ paddingLeft: 52, paddingRight: search ? 100 : 80, fontSize: '1.05rem', height: 50, borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}
            />
            <div style={{ 
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', 
              display: 'flex', alignItems: 'center', gap: 6
            }}>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); searchInputRef.current?.focus(); }}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 4, borderRadius: '50%'
                  }}
                  title="Clear search"
                >
                  <X size={16} />
                </button>
              )}
              <span style={{ 
                fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', 
                border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4,
                pointerEvents: 'none', background: 'var(--bg-secondary)'
              }}>
                Ctrl+K
              </span>
            </div>
          </div>
        </div>

        {/* Category Tabs & Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          {/* Category Pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: 600,
                  border: activeCategory === cat.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: activeCategory === cat.id ? 'var(--primary)' : 'var(--bg-card)',
                  color: activeCategory === cat.id ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 0.2s ease'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* View Toggle, Sort & In-stock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {/* Grid vs Matrix Toggle */}
            <div style={{
              display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: 3
            }}>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  padding: '6px 10px', borderRadius: 4, border: 'none',
                  background: viewMode === 'grid' ? 'var(--primary)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--bg-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700
                }}
                title="Visual Card Grid View"
              >
                <LayoutGrid size={14} /> Cards
              </button>
              <button
                onClick={() => setViewMode('matrix')}
                style={{
                  padding: '6px 10px', borderRadius: 4, border: 'none',
                  background: viewMode === 'matrix' ? 'var(--primary)' : 'transparent',
                  color: viewMode === 'matrix' ? 'var(--bg-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700
                }}
                title="Industrial Quick-Order Matrix View"
              >
                <Table2 size={14} /> Matrix
              </button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={e => setInStockOnly(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              In Stock Only
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                  background: 'var(--bg-card)', color: 'var(--text-primary)',
                  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
                }}
              >
                <option value="name-asc">Name (A-Z)</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="stock-high">Stock Availability</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Product Content */}
      {loading ? (
        <div className="center" style={{ minHeight: 300 }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <motion.div 
          className="empty-state glass-panel" 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }}
          style={{ maxWidth: 600, margin: '0 auto', padding: 64 }}
        >
          <PackageOpen size={64} className="text-muted" style={{ opacity: 0.5 }} />
          <div className="empty-state-title" style={{ marginTop: 16 }}>No products found</div>
          <div className="empty-state-desc">
            {search ? 'Try clearing your search or switching categories.' : 'The ASRS inventory is currently empty.'}
          </div>
        </motion.div>
      ) : viewMode === 'matrix' ? (
        /* B2B INDUSTRIAL QUICK-ORDER MATRIX TABLE */
        <div className="glass-panel" style={{ overflowX: 'auto', padding: 0, borderRadius: 'var(--radius-md)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>Component / Drawing Ref</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>Station Origin</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>Tolerance / Fit</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>ASRS Bin</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>Stock</th>
                <th style={{ padding: '14px 16px', fontWeight: 700 }}>Unit Price</th>
                <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>Quick Order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const info = getStationInfo(p.name, p.sku);
                const inStock = p.available_qty > 0;
                const isAdded = !!addedItemIds[p.item_id];
                const imageSrc = getProductAsset(p.name, p.sku, p.image_url);

                return (
                  <tr 
                    key={p.item_id}
                    onClick={() => setSelectedProduct(p)}
                    style={{
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    className="table-row-hover"
                  >
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <img 
                          src={imageSrc} 
                          alt={p.name} 
                          style={{ width: 44, height: 44, objectFit: 'contain', background: 'var(--bg-secondary)', borderRadius: 4, padding: 4 }} 
                        />
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{p.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>SKU: {p.sku}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        padding: '3px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)'
                      }}>
                        <Factory size={12} className="text-primary" /> {info.station}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                      {info.fit}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4 }}>
                        {info.bin}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span className={`status-badge ${inStock ? 'shipped' : 'cancelled'}`} style={{ fontSize: '0.72rem' }}>
                        {inStock ? `${p.available_qty} in ASRS` : 'Out of stock'}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      {formatPrice(p.price)}
                    </td>

                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          onClick={(e) => handleQuickAdd(e, p)}
                          disabled={!inStock}
                          className={`btn ${isAdded ? 'btn-ghost' : 'btn-primary'}`}
                          style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: 4 }}
                        >
                          {isAdded ? <><Check size={14} /> Added</> : <><ShoppingCart size={14} /> Add</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* VISUAL PRODUCT CARD GRID */
        <motion.div 
          className="product-grid"
          variants={containerVariants} 
          initial="hidden" 
          animate="show"
          style={{ marginTop: 12 }}
        >
          {filtered.map(p => (
            <ProductCard 
              key={p.item_id} 
              product={p} 
              onCartChange={onCartChange} 
              onClick={setSelectedProduct}
            />
          ))}
        </motion.div>
      )}

      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onCartChange={onCartChange}
      />
    </div>
  );
}

