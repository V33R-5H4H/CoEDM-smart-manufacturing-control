import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ShoppingCart, Package, CheckCircle, Clock, XCircle, Box, MapPin } from 'lucide-react';
import { getToken } from '../store/cartStore';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('users');
  
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const token = getToken();
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const [uRes, oRes, iRes] = await Promise.all([
        fetch('/api/ecom/admin/users', { headers }),
        fetch('/api/ecom/admin/orders', { headers }),
        fetch('/api/ecom/admin/inventory', { headers })
      ]);

      if (uRes.ok) setUsers(await uRes.json());
      if (oRes.ok) setOrders(await oRes.json());
      if (iRes.ok) setInventory(await iRes.json());
    } catch (err) {
      console.error("Error fetching admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = status.toLowerCase();
    if (s.includes('delivered') || s.includes('completed')) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600 }}><CheckCircle size={14}/> Completed</span>;
    }
    if (s.includes('cancel')) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600 }}><XCircle size={14}/> Cancelled</span>;
    }
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600 }}><Clock size={14}/> {status}</span>;
  };

  return (
    <div className="container" style={{ padding: '40px 20px', minHeight: '80vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>Admin Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0' }}>Manage store operations and inventory.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 32, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
        <button 
          onClick={() => setActiveTab('users')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 'var(--radius-md)',
            background: activeTab === 'users' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'users' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <Users size={18} /> Customers
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 'var(--radius-md)',
            background: activeTab === 'orders' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'orders' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <ShoppingCart size={18} /> Orders
        </button>
        <button 
          onClick={() => setActiveTab('inventory')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 'var(--radius-md)',
            background: activeTab === 'inventory' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'inventory' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <Package size={18} /> Inventory & ASRS
        </button>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: 40, textAlign: 'center' }}>
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, borderColor: 'var(--border)', borderTopColor: 'var(--primary)', margin: '0 auto' }} />
          </motion.div>
        ) : (
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'users' && (
              <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Customer</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Role</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '16px 24px', fontWeight: 600 }}>{u.full_name}</td>
                        <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{u.email}</td>
                        <td style={{ padding: '16px 24px' }}>
                          {u.is_admin ? <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Admin</span> : 'Customer'}
                        </td>
                        <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No customers found.</div>}
              </div>
            )}

            {activeTab === 'orders' && (
              <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Order ID</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Customer</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Items</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.order_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '16px 24px', fontFamily: 'monospace', fontSize: '0.875rem' }}>{o.order_id}</td>
                        <td style={{ padding: '16px 24px' }}>
                          <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{o.customer_email}</div>
                        </td>
                        <td style={{ padding: '16px 24px' }}>{getStatusBadge(o.order_status)}</td>
                        <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>
                          {o.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                        </td>
                        <td style={{ padding: '16px 24px', fontWeight: 700 }}>${o.total_price.toFixed(2)}</td>
                        <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>
                          {new Date(o.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No orders found.</div>}
              </div>
            )}

            {activeTab === 'inventory' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 24 }}>
                {inventory.map(item => (
                  <div key={item.item_id} className="glass-panel" style={{ padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 16 }}>
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} style={{ width: 64, height: 64, objectFit: 'contain', background: '#fff', borderRadius: 8 }} />
                        ) : (
                          <div style={{ width: 64, height: 64, background: 'var(--surface-hover)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={24} className="text-muted" />
                          </div>
                        )}
                        <div>
                          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem' }}>{item.name}</h3>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>SKU: {item.sku}</span>
                        </div>
                      </div>
                      <div style={{ background: 'var(--primary)', color: '#fff', padding: '4px 12px', borderRadius: 99, fontWeight: 700, fontSize: '0.875rem' }}>
                        {item.total_quantity} in stock
                      </div>
                    </div>
                    
                    <div style={{ background: 'var(--surface-hover)', padding: 16, borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={16} /> ASRS Locations
                      </div>
                      {item.locations.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {item.locations.map((loc, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', background: 'var(--surface)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                <Box size={14} className="text-primary" /> Bin {loc.compartment_id}
                              </span>
                              <span style={{ color: 'var(--text-secondary)' }}>Qty: {loc.quantity} ({loc.status})</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.875rem', color: 'var(--error)' }}>Out of stock</div>
                      )}
                    </div>
                  </div>
                ))}
                {inventory.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>No inventory data found.</div>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
