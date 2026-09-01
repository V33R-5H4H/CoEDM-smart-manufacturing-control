import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, ShoppingCart, Package, CheckCircle, Clock, XCircle, Box, MapPin, 
  Zap, RefreshCw, Download, Search, AlertCircle, Play, Cpu, UserPlus, ShieldCheck, Trash2
} from 'lucide-react';
import { getToken, clearAuth } from '../store/cartStore';
import { getProductAsset, formatPrice } from '../utils/productImages';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('orders');
  
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [plcStatus, setPlcStatus] = useState(null);
  
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [userSearch, setUserSearch] = useState('');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ full_name: '', email: '', password: '', is_admin: false });
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [actionNotice, setActionNotice] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const token = getToken();
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const [uRes, oRes, iRes, plcRes] = await Promise.all([
        fetch('/api/ecom/admin/users', { headers }),
        fetch('/api/ecom/admin/orders', { headers }),
        fetch('/api/ecom/admin/inventory', { headers }),
        fetch('/api/ecom/admin/plc-status', { headers })
      ]);

      if (uRes.status === 401 || oRes.status === 401 || iRes.status === 401) {
        clearAuth();
        window.location.href = '/login';
        return;
      }

      if (uRes.ok) setUsers(await uRes.json());
      if (oRes.ok) setOrders(await oRes.json());
      if (iRes.ok) setInventory(await iRes.json());
      if (plcRes.ok) setPlcStatus(await plcRes.json());
    } catch (err) {
      console.error("Error fetching admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualDispatch = async (order_id) => {
    setActionLoading(prev => ({ ...prev, [order_id]: true }));
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/orders/${order_id}/dispatch`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setActionNotice({ type: res.ok ? 'success' : 'error', text: data.message || 'Dispatch command sent' });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: 'Dispatch failed: ' + err.message });
    } finally {
      setActionLoading(prev => ({ ...prev, [order_id]: false }));
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleStatusChange = async (order_id, newStatus) => {
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/orders/${order_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      setActionNotice({ type: res.ok ? 'success' : 'error', text: data.message || 'Status updated' });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: 'Status update failed: ' + err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const token = getToken();
    try {
      const res = await fetch('/api/ecom/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newUserForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to provision user');
      
      setActionNotice({ type: 'success', text: data.message || 'User created successfully' });
      setShowCreateUserModal(false);
      setNewUserForm({ full_name: '', email: '', password: '', is_admin: false });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleToggleRole = async (user_id, currentAdmin) => {
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/users/${user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ is_admin: !currentAdmin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update user role');
      setActionNotice({ type: 'success', text: 'User role updated' });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleToggleActive = async (user_id, currentActive) => {
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/users/${user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ is_active: !currentActive })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update status');
      setActionNotice({ type: 'success', text: currentActive ? 'User disabled' : 'User activated' });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleDeleteUser = async (user_id, name) => {
    if (!window.confirm(`Are you sure you want to delete user account "${name}"?`)) return;
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/users/${user_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to delete user');
      setActionNotice({ type: 'success', text: data.message || 'User deleted' });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const exportOrdersCSV = () => {
    const headers = ['Order ID', 'Customer Name', 'Email', 'Status', 'Total Price', 'Created At'];
    const rows = orders.map(o => [
      o.order_id,
      `"${o.customer_name}"`,
      o.customer_email,
      o.order_status,
      o.total_price,
      o.created_at
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CoEDM_Orders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredUsers = users.filter(u => {
    return (u.full_name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
           (u.email || '').toLowerCase().includes(userSearch.toLowerCase());
  });

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered') || s.includes('completed')) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 }}><CheckCircle size={14}/> Delivered</span>;
    }
    if (s.includes('shipped')) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 }}><Zap size={14}/> Dispatched</span>;
    }
    if (s.includes('cancel')) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 }}><XCircle size={14}/> Cancelled</span>;
    }
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 }}><Clock size={14}/> {status.toUpperCase()}</span>;
  };

  const filteredOrders = orders.filter(o => {
    const matchText = (o.customer_name || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
                      (o.customer_email || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
                      String(o.order_id).includes(orderSearch);
    if (!matchText) return false;
    if (statusFilter !== 'all' && o.order_status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="container" style={{ padding: '40px 20px', minHeight: '80vh', paddingBottom: 80 }}>
      {/* Header & PLC Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>Fulfillment Operations Center</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontSize: '0.95rem' }}>
            MES shopfloor dispatch control, ASRS grid inventory, and enterprise orders.
          </p>
        </div>

        {/* Live PLC Connection Widget */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '10px 18px'
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: plcStatus?.plc_connected ? '#22c55e' : '#f59e0b',
            boxShadow: plcStatus?.plc_connected ? '0 0 8px #22c55e' : 'none'
          }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
              ASRS PLC Controller: {plcStatus?.plc_connected ? 'ONLINE' : 'OFFLINE / SIM'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              10.10.14.104:4840 (OPC-UA)
            </div>
          </div>
          <button className="btn-icon" onClick={fetchData} title="Refresh status" style={{ marginLeft: 6 }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionNotice && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{
            background: actionNotice.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
            color: actionNotice.type === 'success' ? 'var(--success)' : 'var(--error)',
            padding: '12px 20px', borderRadius: 'var(--radius-md)', marginBottom: 24,
            fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 10
          }}
        >
          {actionNotice.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {actionNotice.text}
        </motion.div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={() => setActiveTab('orders')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-md)',
              background: activeTab === 'orders' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'orders' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <ShoppingCart size={18} /> Order Queue ({orders.length})
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-md)',
              background: activeTab === 'inventory' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'inventory' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <Package size={18} /> ASRS Inventory ({inventory.length})
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-md)',
              background: activeTab === 'users' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'users' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <Users size={18} /> B2B Buyers ({users.length})
          </button>
        </div>

        {activeTab === 'orders' && (
          <button className="btn btn-secondary btn-sm" onClick={exportOrdersCSV} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: 60, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </motion.div>
        ) : (
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, y: 8 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Search & Filter bar */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                    <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      className="form-input"
                      placeholder="Search orders by ID, customer name, email..."
                      value={orderSearch}
                      onChange={e => setOrderSearch(e.target.value)}
                      style={{ paddingLeft: 42, height: 44, borderRadius: 8, fontSize: '0.9rem' }}
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{
                      padding: '0 16px', height: 44, borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg-card)', color: 'var(--text-primary)',
                      fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Dispatched / Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Orders Table */}
                <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 880 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Order ID</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Customer Details</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Items</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Value</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Dispatch Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map(o => (
                        <tr key={o.order_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '16px 20px', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem' }}>
                            #{o.order_id}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{o.customer_name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{o.customer_email}</div>
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            {getStatusBadge(o.order_status)}
                          </td>
                          <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {o.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                          </td>
                          <td style={{ padding: '16px 20px', fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem' }}>
                            {formatPrice(o.total_price)}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Manual ASRS Dispatch button */}
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleManualDispatch(o.order_id)}
                                disabled={actionLoading[o.order_id]}
                                style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}
                                title="Trigger physical ASRS retrieval shuttle motion"
                              >
                                <Play size={12} /> Dispatch
                              </button>

                              {/* Status dropdown */}
                              <select
                                value={o.order_status}
                                onChange={e => handleStatusChange(o.order_id, e.target.value)}
                                style={{
                                  padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                                  background: 'var(--bg-card)', color: 'var(--text-primary)',
                                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                                }}
                              >
                                <option value="pending">Pending</option>
                                <option value="processing">Processing</option>
                                <option value="shipped">Dispatched</option>
                                <option value="delivered">Delivered</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredOrders.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No matching orders found.</div>}
                </div>
              </div>
            )}

            {/* Inventory Tab */}
            {activeTab === 'inventory' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 24 }}>
                {inventory.map(item => {
                  const img = getProductAsset(item.name, item.sku, item.image_url);
                  return (
                    <div key={item.item_id} className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 14 }}>
                          <img src={img} alt={item.name} style={{ width: 56, height: 56, objectFit: 'contain', background: 'var(--bg-secondary)', borderRadius: 8, padding: 4 }} />
                          <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 700 }}>{item.name}</h3>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>SKU: {item.sku}</span>
                          </div>
                        </div>
                        <div style={{ background: 'var(--primary)', color: 'var(--bg-primary)', padding: '4px 10px', borderRadius: 99, fontWeight: 800, fontSize: '0.8rem' }}>
                          {item.total_quantity} in stock
                        </div>
                      </div>
                      
                      <div style={{ background: 'var(--surface-hover)', padding: 14, borderRadius: 'var(--radius-md)', marginTop: 'auto' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={14} className="text-primary" /> ASRS Storage Compartments
                        </div>
                        {item.locations && item.locations.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {item.locations.map((loc, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                                  <Box size={12} className="text-primary" /> Bin {loc.compartment_id}
                                </span>
                                <span style={{ color: 'var(--text-secondary)' }}>Qty: {loc.quantity} ({loc.status})</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--error)', fontWeight: 600 }}>0 units in ASRS — Bin Replenishment Required</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Users / Customer Manager Tab */}
            {activeTab === 'users' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                    <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      className="form-input"
                      placeholder="Search customers or admins by name, email..."
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      style={{ paddingLeft: 42, height: 44, borderRadius: 8, fontSize: '0.9rem' }}
                    />
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => setShowCreateUserModal(true)}
                    style={{ padding: '10px 18px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8 }}
                  >
                    <UserPlus size={16} /> Provision New User
                  </button>
                </div>

                <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 840 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Customer / User</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email Address</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Role</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Account Status</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Joined Date</th>
                        <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Admin Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>ID: {u.user_id.slice(0, 8)}...</div>
                          </td>
                          <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>{u.email}</td>
                          <td style={{ padding: '16px 20px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                              background: u.is_admin ? 'var(--primary)' : 'var(--bg-secondary)',
                              color: u.is_admin ? 'var(--bg-primary)' : 'var(--text-secondary)',
                              borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border)'
                            }}>
                              <ShieldCheck size={12} /> {u.is_admin ? 'Administrator' : 'Customer'}
                            </span>
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                              background: u.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: u.is_active ? '#22c55e' : '#ef4444',
                              borderRadius: 99, fontSize: '0.75rem', fontWeight: 700
                            }}>
                              {u.is_active ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Toggle Admin Role */}
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleToggleRole(u.user_id, u.is_admin)}
                                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 6 }}
                                title={u.is_admin ? 'Demote to Customer' : 'Promote to Admin'}
                              >
                                {u.is_admin ? 'Demote' : 'Make Admin'}
                              </button>

                              {/* Toggle Active / Inactive */}
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleToggleActive(u.user_id, u.is_active)}
                                style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: 6 }}
                              >
                                {u.is_active ? 'Disable' : 'Enable'}
                              </button>

                              {/* Delete User */}
                              <button
                                className="btn-icon"
                                onClick={() => handleDeleteUser(u.user_id, u.full_name)}
                                style={{ color: 'var(--error)', width: 30, height: 30, borderRadius: 6 }}
                                title="Delete user account"
                              >
                                <XCircle size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No matching users found.</div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create User Modal */}
      <AnimatePresence>
        {showCreateUserModal && (
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCreateUserModal(false)}
            style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: 'var(--bg-elevated)', borderRadius: 20, padding: 32,
                width: '100%', maxWidth: 480, border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserPlus className="text-primary" size={20} /> Provision User Account
                </h3>
                <button className="btn-icon" onClick={() => setShowCreateUserModal(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Full Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Rahul Sharma"
                    value={newUserForm.full_name}
                    onChange={e => setNewUserForm(f => ({ ...f, full_name: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Email Address</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="e.g. rahul@bvmengineering.ac.in"
                    value={newUserForm.email}
                    onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Temporary Password</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="••••••••"
                    value={newUserForm.password}
                    onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))}
                    required
                    minLength={6}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={newUserForm.is_admin}
                    onChange={e => setNewUserForm(f => ({ ...f, is_admin: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                  />
                  Grant Administrator Access
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowCreateUserModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create Account
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

