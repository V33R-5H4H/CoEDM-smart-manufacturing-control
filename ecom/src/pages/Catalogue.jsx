import { useEffect, useState } from 'react';
import ProductCard from '../components/ProductCard';

export default function Catalogue({ onCartChange }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetch_products = () => {
    setLoading(true);
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

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">🏭 Manufacturing Products</h1>
        <p className="page-subtitle">
          Precision-manufactured components from CoEDM Lab — order and the ASRS retrieves automatically.
        </p>
      </div>

      {/* Search */}
      <input
        className="form-input"
        placeholder="🔍  Search products by name or SKU..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ maxWidth: 480 }}
      />

      {/* Grid */}
      {loading ? (
        <div className="center" style={{ minHeight: 300 }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">No products found</div>
          <div className="empty-state-desc">
            {search ? 'Try a different search.' : 'The ASRS inventory is empty.'}
          </div>
        </div>
      ) : (
        <>
          <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {filtered.length} product{filtered.length !== 1 ? 's' : ''} available
          </p>
          <div className="product-grid">
            {filtered.map(p => (
              <ProductCard key={p.item_id} product={p} onCartChange={onCartChange} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
