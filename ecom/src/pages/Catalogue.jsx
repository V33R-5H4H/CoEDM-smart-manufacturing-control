import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import { Search, PackageOpen, SlidersHorizontal, Layers, ArrowRight, Sparkles, Filter } from 'lucide-react';
import { motion } from 'framer-motion';

const CATEGORIES = [
  { id: 'all', label: 'All Components' },
  { id: 'shaft', label: 'Shafts (MIRAC Turn)' },
  { id: 'bearing', label: 'Bearings' },
  { id: 'casing', label: 'Casings & Housings' },
  { id: 'raw', label: 'Raw Stock & Billets' }
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

export default function Catalogue({ onCartChange }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const searchInputRef = useRef(null);

  const fetch_products = () => {
    fetch('/api/ecom/products')
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetch_products();
    const id = setInterval(fetch_products, 30000); // refresh every 30s
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

  // Filter by category, search, and stock
  let filtered = products.filter(p => {
    const nameMatch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                      (p.sku || '').toLowerCase().includes(search.toLowerCase());
    if (!nameMatch) return false;

    if (inStockOnly && p.available_qty <= 0) return false;

    if (activeCategory === 'all') return true;
    const n = p.name.toLowerCase();
    const s = (p.sku || '').toLowerCase();
    if (activeCategory === 'shaft') return n.includes('shaft') || s.includes('sft');
    if (activeCategory === 'bearing') return n.includes('bearing') || s.includes('brg');
    if (activeCategory === 'casing') return n.includes('casing') || n.includes('housing') || s.includes('csg') || n.includes('bracket') || n.includes('oval') || n.includes('70sq');
    if (activeCategory === 'raw') return n.includes('billet') || n.includes('block') || n.includes('raw') || p.item_type === 'raw';
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === 'price-low') return a.price - b.price;
    if (sortBy === 'price-high') return b.price - a.price;
    if (sortBy === 'stock-high') return b.available_qty - a.available_qty;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      {/* Hero Header */}
      <motion.div 
        className="page-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: 'center', padding: '56px 0 36px' }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 99, padding: '4px 14px', fontSize: '0.8rem', fontWeight: 700,
          color: 'var(--text-secondary)', marginBottom: 16
        }}>
          <Sparkles size={14} className="text-primary" /> Center of Excellence in Digital Manufacturing
        </div>
        <h1 className="page-title" style={{ fontSize: '2.75rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          Precision Components & Assemblies
        </h1>
        <p className="page-subtitle" style={{ maxWidth: 640, margin: '14px auto 0', fontSize: '1.05rem', lineHeight: 1.6 }}>
          Direct procurement portal for machined components. Orders trigger automated shuttle retrieval on the factory floor's ASRS grid.
        </p>
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
          marginBottom: 40,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
          boxShadow: 'var(--shadow-md)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'var(--primary)', color: 'var(--bg-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Layers size={26} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
              Interactive Mechanical Assembly Configurator
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: 4 }}>
              Custom-mate Shafts, Bearings & Housings with live fit validation & hydraulic press assembly dispatch.
            </div>
          </div>
        </div>

        <Link to="/configure" className="btn btn-primary" style={{ padding: '12px 22px', fontSize: '0.92rem', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 8 }}>
          Launch Configurator <ArrowRight size={16} />
        </Link>
      </motion.div>

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 580 }}>
            <Search size={20} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              ref={searchInputRef}
              className="form-input"
              placeholder="Search components by name or SKU (e.g. Shaft, Bearing, Casing)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') e.currentTarget.blur();
              }}
              style={{ paddingLeft: 52, paddingRight: 80, fontSize: '1.05rem', height: 52, borderRadius: 99, boxShadow: 'var(--shadow-sm)' }}
            />
            <div style={{ 
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', 
              fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', 
              border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6,
              pointerEvents: 'none', background: 'var(--bg-secondary)'
            }}>
              Ctrl+K
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
                  padding: '8px 16px', borderRadius: 99, fontSize: '0.85rem', fontWeight: 600,
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

          {/* Sort & In-stock toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
                  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
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

      {/* Grid */}
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
      ) : (
        <motion.div 
          className="product-grid"
          variants={containerVariants} 
          initial="hidden" 
          animate="show"
          style={{ marginTop: 24 }}
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

