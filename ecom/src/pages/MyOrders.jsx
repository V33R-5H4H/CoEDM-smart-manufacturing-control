import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authHeaders } from '../store/cartStore';

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ecom/orders', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setOrders(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="container center" style={{ minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      <div className="page-header">
        <h1 className="page-title">My Orders</h1>
        <p className="page-subtitle">Track your orders and ASRS retrieval status</p>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No orders yet</div>
          <div className="empty-state-desc">Place your first order from the catalogue</div>
          <Link to="/" className="btn btn-primary">Browse Products</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map(order => (
            <Link key={order.order_id} to={`/order/${order.order_id}`}
              style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                      Order #{order.order_id}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {formatDate(order.created_at)}
                    </div>
                    {order.items_summary && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 8 }}>
                        {order.items_summary}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`status-badge ${order.order_status}`} style={{ display: 'inline-flex', marginBottom: 8 }}>
                      {order.order_status}
                    </span>
                    <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>
                      {formatPrice(order.total_amount)}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
