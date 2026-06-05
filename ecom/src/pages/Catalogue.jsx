import { useEffect, useState } from 'react';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import { Search, PackageOpen } from 'lucide-react';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

export default function Catalogue({ onCartChange }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

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

  const filtered = products
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupedProducts = filtered.reduce((groups, p) => {
    let category = 'Other Components';
    if (p.name.includes(' - ')) {
      category = p.name.split(' - ')[0] + 's';
    }
    if (!groups[category]) groups[category] = [];
    groups[category].push(p);
    return groups;
  }, {});

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      {/* Hero Header */}
      <motion.div 
        className="page-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: 'center', padding: '64px 0 48px' }}
      >
        <h1 className="page-title" style={{ fontSize: '3rem' }}>Precision Components</h1>
        <p className="page-subtitle" style={{ maxWidth: 600, margin: '16px auto 0', fontSize: '1.125rem', lineHeight: 1.6 }}>
          Browse our catalog of high-quality machined parts. Orders are instantly fulfilled by the CoEDM Automated Storage and Retrieval System.
        </p>
      </motion.div>

      {/* Search Bar */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        style={{ display: 'flex', justifyContent: 'center', marginBottom: 48 }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: 540 }}>
          <Search size={20} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            placeholder="Search products by name or SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 48, paddingRight: 24, fontSize: '1.1rem', height: 56, borderRadius: 99, boxShadow: 'var(--shadow-sm)' }}
          />
        </div>
      </motion.div>

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
          <div className="empty-state-title">No products found</div>
          <div className="empty-state-desc">
            {search ? 'Try a different search term.' : 'The ASRS inventory is currently empty.'}
          </div>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show">
          {Object.entries(groupedProducts).map(([category, items]) => (
            <motion.div key={category} style={{ marginTop: 48 }} variants={containerVariants}>
              <h2 style={{ 
                fontSize: '1.5rem', fontWeight: 800, marginBottom: 24, 
                borderBottom: '1px solid var(--border)', paddingBottom: 12,
                color: 'var(--text-primary)'
              }}>
                {category}
              </h2>
              <div className="product-grid" style={{ marginTop: 0 }}>
                {items.map(p => (
                  <ProductCard 
                    key={p.item_id} 
                    product={p} 
                    onCartChange={onCartChange} 
                    onClick={setSelectedProduct}
                  />
                ))}
              </div>
            </motion.div>
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
