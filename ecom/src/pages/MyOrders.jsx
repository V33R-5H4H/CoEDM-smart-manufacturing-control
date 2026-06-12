import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authHeaders, clearAuth } from '../store/cartStore';
import { motion } from 'framer-motion';
import { Package, Clock, ChevronRight, ListOrdered } from 'lucide-react';

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

export default function MyOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = () => {
    fetch('/api/ecom/orders', { headers: authHeaders() })
      .then(r => {
        if (r.status === 401) {
          clearAuth();
          navigate('/login');
          throw new Error('Unauthorized');
        }
        return r.json();
      })
      .then(data => { 
        if (Array.isArray(data)) {
          setOrders(data); 
        } else {
          setOrders([]);
        }
        setLoading(false); 
      })
      .catch(e => { 
        if (e.message !== 'Unauthorized') setLoading(false); 
      });
  };

  useEffect(() => {
    fetchOrders();
    // Poll for real-time updates every 3 seconds
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="container center" style={{ minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      <motion.div 
        className="page-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ padding: '48px 0 32px' }}
      >
        <h1 className="page-title">My Orders</h1>
        <p className="page-subtitle">Track your orders and monitor ASRS retrieval status in real-time.</p>
      </motion.div>

      {orders.length === 0 ? (
        <motion.div 
          className="empty-state glass-panel"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ maxWidth: 600, margin: '0 auto', padding: 64 }}
        >
          <ListOrdered size={64} className="text-muted" style={{ opacity: 0.5 }} />
          <div className="empty-state-title" style={{ marginTop: 16 }}>No orders yet</div>
          <div className="empty-state-desc">You haven't placed any orders yet. Discover our precision components.</div>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 24 }}>Browse Catalog</Link>
        </motion.div>
      ) : (
        <motion.div 
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {orders.map(order => (
            <motion.div key={order.order_id} variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
              <Link to={`/order/${order.order_id}`} style={{ textDecoration: 'none' }}>
                <div className="glass-panel" style={{ cursor: 'pointer', padding: 24, transition: 'border-color 0.2s', border: '1px solid transparent' }} onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border)'} onMouseOut={e => e.currentTarget.style.borderColor = 'transparent'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <Package size={24} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4, color: 'var(--text-primary)' }}>
                          Order #{order.order_id}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Clock size={14} /> {formatDate(order.created_at)}
                        </div>
                        {order.items_summary && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 8 }}>
                            {order.items_summary}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                      <div style={{ textAlign: 'right' }}>
                        <span className={`status-badge ${order.order_status}`} style={{ display: 'inline-flex', marginBottom: 8, fontSize: '0.75rem' }}>
                          {order.order_status}
                        </span>
                        <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.2rem' }}>
                          {formatPrice(order.total_amount)}
                        </div>
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        <ChevronRight size={24} />
                      </div>
                    </div>

                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
