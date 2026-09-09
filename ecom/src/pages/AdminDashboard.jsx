import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, ShoppingCart, Package, CheckCircle, Clock, XCircle, Box, MapPin, 
  Zap, RefreshCw, Download, Search, AlertCircle, Play, Cpu, UserPlus, ShieldCheck, Trash2,
  Plus, Edit, Sliders, Database, Layers, ArrowUpRight, Check
} from 'lucide-react';
import { getToken, clearAuth } from '../store/cartStore';
import { getProductAsset, formatPrice } from '../utils/productImages';

const ASRS_BOXES = [];
for (const r of ['A','B','C','D','E']) {
  for (let c = 1; c <= 7; c++) {
    ASRS_BOXES.push(`${r}${c}`);
  }
}
const SUB_SLOTS = ['a', 'b', 'c', 'd', 'e', 'f'];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'items' | 'inventory' | 'users'
  
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [plcStatus, setPlcStatus] = useState(null);
  
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [itemSearch, setItemSearch] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('all');

  const [userSearch, setUserSearch] = useState('');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ full_name: '', email: '', password: '', is_admin: false });
  
  // Item Master Modals
  const [showCreateItemModal, setShowCreateItemModal] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    sku: '', name: '', description: '', price: 1000, item_type: 'finished', unit: 'pcs', image_url: '/images/casing.png',
    box_id: 'A1', sub_slot: 'a', initial_qty: 10
  });

  const [editingItem, setEditingItem] = useState(null);
  const [showEditItemModal, setShowEditItemModal] = useState(false);

  const [stockAdjustItem, setStockAdjustItem] = useState(null);
  const [showStockAdjustModal, setShowStockAdjustModal] = useState(false);
  const [stockAdjustForm, setStockAdjustForm] = useState({ box_id: 'A1', sub_slot: 'a', quantity: 10, status: 'occupied' });

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
      setActionNotice({ type: res.ok ? 'success' : 'error', text: data.message || 'User role updated' });
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
      setActionNotice({ type: res.ok ? 'success' : 'error', text: data.message || 'Account status updated' });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleDeleteUser = async (user_id, name) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${name}"?`)) return;
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/users/${user_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setActionNotice({ type: res.ok ? 'success' : 'error', text: data.message || 'User deleted' });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  // ── ITEM MASTER ACTIONS ────────────────────────────────────────────────────
  const handleCreateItem = async (e) => {
    e.preventDefault();
    const token = getToken();
    try {
      const res = await fetch('/api/ecom/admin/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ...newItemForm,
          price: Number(newItemForm.price),
          initial_qty: Number(newItemForm.initial_qty)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create item');
      
      setActionNotice({ type: 'success', text: data.message });
      setShowCreateItemModal(false);
      setNewItemForm({
        sku: '', name: '', description: '', price: 1000, item_type: 'finished', unit: 'pcs', image_url: '/images/casing.png',
        box_id: 'A1', sub_slot: 'a', initial_qty: 10
      });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/items/${editingItem.item_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          sku: editingItem.sku,
          name: editingItem.name,
          description: editingItem.description,
          price: Number(editingItem.price),
          item_type: editingItem.item_type,
          unit: editingItem.unit,
          image_url: editingItem.image_url
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update item');
      
      setActionNotice({ type: 'success', text: data.message });
      setShowEditItemModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleDeleteItem = async (item_id, name) => {
    if (!window.confirm(`Delete item "${name}" (#${item_id}) from catalog?`)) return;
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/items/${item_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to delete item');
      
      setActionNotice({ type: 'success', text: data.message });
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleAdjustCompartmentStock = async (e) => {
    e.preventDefault();
    if (!stockAdjustItem) return;
    const token = getToken();
    try {
      const res = await fetch(`/api/ecom/admin/items/${stockAdjustItem.item_id}/compartment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          box_id: stockAdjustForm.box_id,
          sub_slot: stockAdjustForm.sub_slot,
          quantity: Number(stockAdjustForm.quantity),
          status: Number(stockAdjustForm.quantity) > 0 ? 'occupied' : 'empty'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to adjust stock');
      
      setActionNotice({ type: 'success', text: data.message });
      setShowStockAdjustModal(false);
      setStockAdjustItem(null);
      fetchData();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const exportOrdersCSV = () => {
    if (!orders.length) return;
    const headers = ["Order ID", "Customer Name", "Customer Email", "Status", "Total Amount", "Created At"];
    const rows = orders.map(o => [
      o.order_id,
      `"${o.customer_name || ''}"`,
      `"${o.customer_email || ''}"`,
      o.order_status,
      o.total_price,
      `"${o.created_at || ''}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `CoEDM_Orders_Export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredOrders = orders.filter(o => {
    const matchText = (o.customer_name || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
                      (o.customer_email || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
                      String(o.order_id).includes(orderSearch);
    if (!matchText) return false;
    if (statusFilter !== 'all' && o.order_status !== statusFilter) return false;
    return true;
  });

  const filteredItems = inventory.filter(item => {
    const matchText = (item.name || '').toLowerCase().includes(itemSearch.toLowerCase()) ||
                      (item.sku || '').toLowerCase().includes(itemSearch.toLowerCase());
    if (!matchText) return false;
    if (itemTypeFilter !== 'all' && item.item_type !== itemTypeFilter) return false;
    return true;
  });

  const filteredUsers = users.filter(u => {
    return (u.full_name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
           (u.email || '').toLowerCase().includes(userSearch.toLowerCase());
  });

  return (
    <div className="container" style={{ padding: '40px 20px', minHeight: '80vh', paddingBottom: 80 }}>
      {/* Header & PLC Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Fulfillment & Item Operations Center</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontSize: '0.95rem' }}>
            MES shopfloor dispatch control, item master catalog, and real-time ASRS storage management.
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
            background: plcStatus?.plc_connected ? '#10b981' : '#f59e0b',
            boxShadow: plcStatus?.plc_connected ? '0 0 8px #10b981' : 'none'
          }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
              ASRS PLC Controller: {plcStatus?.plc_connected ? 'ONLINE' : 'SIMULATION MODE'}
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

      {/* Main Tabs Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
            onClick={() => setActiveTab('items')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-md)',
              background: activeTab === 'items' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'items' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <Database size={18} /> Item Master & Specs ({inventory.length})
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
            <Package size={18} /> ASRS Grid Allocation
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

        {activeTab === 'items' && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateItemModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Component Item
          </button>
        )}
      </div>

      {/* Content Panels */}
      <AnimatePresence mode="wait">
        {loading ? (
          <div className="center" style={{ minHeight: 300 }}>
            <div className="spinner" />
          </div>
        ) : (
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
            
            {/* 1. ORDER QUEUE TAB */}
            {activeTab === 'orders' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Search & Status Filters */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                    <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      className="form-input"
                      placeholder="Search orders by ID, buyer name, email..."
                      value={orderSearch}
                      onChange={e => setOrderSearch(e.target.value)}
                      style={{ paddingLeft: 42, height: 44, borderRadius: 8, fontSize: '0.9rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map(st => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        style={{
                          padding: '6px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700,
                          border: statusFilter === st ? '1px solid var(--primary)' : '1px solid var(--border)',
                          background: statusFilter === st ? 'var(--primary)' : 'var(--bg-card)',
                          color: statusFilter === st ? 'var(--bg-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer', textTransform: 'capitalize'
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredOrders.length === 0 ? (
                  <div className="glass-panel" style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No orders matching your criteria.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {filteredOrders.map(order => (
                      <div key={order.order_id} className="glass-panel" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                              <span style={{ fontWeight: 800, fontSize: '1.2rem', fontFamily: 'monospace' }}>
                                #{order.order_id}
                              </span>
                              <span className={`status-badge ${order.order_status}`}>
                                {order.order_status.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              Buyer: <strong>{order.customer_name}</strong> ({order.customer_email}) • {order.created_at ? new Date(order.created_at).toLocaleString('en-IN') : '—'}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Manual ASRS Trigger */}
                            {['pending', 'processing'].includes(order.order_status) && (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleManualDispatch(order.order_id)}
                                disabled={actionLoading[order.order_id]}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                              >
                                <Play size={14} /> {actionLoading[order.order_id] ? 'Dispatching...' : 'Dispatch ASRS Shuttle'}
                              </button>
                            )}

                            {/* Status Selector Dropdown */}
                            <select
                              value={order.order_status}
                              onChange={(e) => handleStatusChange(order.order_id, e.target.value)}
                              style={{
                                padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                                background: 'var(--bg-card)', color: 'var(--text-primary)',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="processing">Processing (ASRS)</option>
                              <option value="shipped">Shipped</option>
                              <option value="delivered">Delivered</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>
                        </div>

                        {/* Order Items Table */}
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', paddingBottom: 8 }}>Component Item</th>
                                <th style={{ textAlign: 'left', paddingBottom: 8 }}>SKU</th>
                                <th style={{ textAlign: 'center', paddingBottom: 8 }}>Qty</th>
                                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Price</th>
                                <th style={{ textAlign: 'right', paddingBottom: 8 }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '8px 0', fontWeight: 600 }}>{item.name}</td>
                                  <td style={{ padding: '8px 0', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.sku || '—'}</td>
                                  <td style={{ padding: '8px 0', textAlign: 'center', fontWeight: 700 }}>{item.quantity}</td>
                                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatPrice(item.unit_price)}</td>
                                  <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700 }}>{formatPrice(item.total_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10 }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Shipping: {order.shipping_address ? order.shipping_address.slice(0, 60) + '...' : 'Factory Floor Delivery'}
                          </div>
                          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>
                            Total: {formatPrice(order.total_price)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. ITEM MASTER & SPECIFICATIONS MANAGER TAB */}
            {activeTab === 'items' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Search, Filter & Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                    <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      className="form-input"
                      placeholder="Search items by SKU, component name..."
                      value={itemSearch}
                      onChange={e => setItemSearch(e.target.value)}
                      style={{ paddingLeft: 42, height: 44, borderRadius: 8, fontSize: '0.9rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {['all', 'finished', 'raw', 'tool'].map(t => (
                      <button
                        key={t}
                        onClick={() => setItemTypeFilter(t)}
                        style={{
                          padding: '6px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700,
                          border: itemTypeFilter === t ? '1px solid var(--primary)' : '1px solid var(--border)',
                          background: itemTypeFilter === t ? 'var(--primary)' : 'var(--bg-card)',
                          color: itemTypeFilter === t ? 'var(--bg-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer', textTransform: 'capitalize'
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Items Master Table */}
                <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 880 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                        <th style={{ padding: '14px 18px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Component Master</th>
                        <th style={{ padding: '14px 16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Type</th>
                        <th style={{ padding: '14px 16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Price (INR)</th>
                        <th style={{ padding: '14px 16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ASRS Stock</th>
                        <th style={{ padding: '14px 16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Allocated Bins</th>
                        <th style={{ padding: '14px 18px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>Admin Controls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map(item => {
                        const img = getProductAsset(item.name, item.sku, item.image_url);
                        return (
                          <tr key={item.item_id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <img src={img} alt={item.name} style={{ width: 44, height: 44, objectFit: 'contain', background: 'var(--bg-secondary)', borderRadius: 6, padding: 4 }} />
                                <div>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{item.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>SKU: {item.sku} • ID #{item.item_id}</div>
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: '14px 16px' }}>
                              <span style={{
                                textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                                background: item.item_type === 'finished' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 203, 92, 0.15)',
                                color: item.item_type === 'finished' ? 'var(--success)' : 'var(--warning)',
                                border: '1px solid var(--border)'
                              }}>
                                {item.item_type}
                              </span>
                            </td>

                            <td style={{ padding: '14px 16px', fontWeight: 800, fontSize: '0.95rem' }}>
                              {formatPrice(item.price)}
                            </td>

                            <td style={{ padding: '14px 16px' }}>
                              <span className={`status-badge ${item.total_quantity > 0 ? 'shipped' : 'cancelled'}`} style={{ fontSize: '0.75rem' }}>
                                {item.total_quantity} {item.unit || 'pcs'}
                              </span>
                            </td>

                            <td style={{ padding: '14px 16px' }}>
                              {item.locations && item.locations.length > 0 ? (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {item.locations.map((loc, li) => (
                                    <span key={li} style={{
                                      fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700,
                                      background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)'
                                    }}>
                                      {loc.compartment_id} ({loc.quantity})
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Unallocated</span>
                              )}
                            </td>

                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                {/* Adjust Stock / Bin Allocation */}
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    setStockAdjustItem(item);
                                    setStockAdjustForm({ box_id: 'A1', sub_slot: 'a', quantity: item.total_quantity || 10, status: 'occupied' });
                                    setShowStockAdjustModal(true);
                                  }}
                                  style={{ padding: '5px 10px', fontSize: '0.75rem', borderRadius: 4 }}
                                  title="Adjust ASRS Compartment Storage & Stock"
                                >
                                  <Sliders size={13} /> Stock/Bin
                                </button>

                                {/* Edit Metadata & Specs */}
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => {
                                    setEditingItem({ ...item });
                                    setShowEditItemModal(true);
                                  }}
                                  style={{ padding: '5px 8px', fontSize: '0.75rem', borderRadius: 4 }}
                                  title="Edit Specs & Metadata"
                                >
                                  <Edit size={14} />
                                </button>

                                {/* Delete */}
                                <button
                                  className="btn-icon"
                                  onClick={() => handleDeleteItem(item.item_id, item.name)}
                                  style={{ color: 'var(--error)', width: 28, height: 28, borderRadius: 4 }}
                                  title="Delete Item"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredItems.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No items found in master catalog.</div>
                  )}
                </div>
              </div>
            )}

            {/* 3. ASRS PHYSICAL GRID ALLOCATION TAB */}
            {activeTab === 'inventory' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
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
                        <div style={{ background: 'var(--primary)', color: 'var(--bg-primary)', padding: '4px 10px', borderRadius: 4, fontWeight: 800, fontSize: '0.8rem' }}>
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

            {/* 4. BUYERS / USERS TAB */}
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
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleToggleRole(u.user_id, u.is_admin)}
                                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 6 }}
                              >
                                {u.is_admin ? 'Demote' : 'Make Admin'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleToggleActive(u.user_id, u.is_active)}
                                style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: 6 }}
                              >
                                {u.is_active ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                className="btn-icon"
                                onClick={() => handleDeleteUser(u.user_id, u.full_name)}
                                style={{ color: 'var(--error)', width: 30, height: 30, borderRadius: 6 }}
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

      {/* ── MODALS ── */}

      {/* 1. Create New Component Item Modal */}
      <AnimatePresence>
        {showCreateItemModal && (
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateItemModal(false)} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div onClick={e => e.stopPropagation()} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 540, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus className="text-primary" size={20} /> Create New Component Item
                </h3>
                <button className="btn-icon" onClick={() => setShowCreateItemModal(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateItem} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>SKU Code</label>
                    <input className="form-input" placeholder="e.g. CSG-CUS-40" value={newItemForm.sku} onChange={e => setNewItemForm(f => ({ ...f, sku: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Unit Price (₹)</label>
                    <input className="form-input" type="number" step="0.01" value={newItemForm.price} onChange={e => setNewItemForm(f => ({ ...f, price: e.target.value }))} required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Full Component Name</label>
                  <input className="form-input" placeholder="e.g. Custom Flanged Housing (Ø40mm Bore)" value={newItemForm.name} onChange={e => setNewItemForm(f => ({ ...f, name: e.target.value }))} required />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Technical Specs & Description</label>
                  <textarea className="form-input" rows={3} placeholder="Dimensions, bore tolerances, CNC origin station, drawing reference..." value={newItemForm.description} onChange={e => setNewItemForm(f => ({ ...f, description: e.target.value }))} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Item Classification</label>
                    <select className="form-input" value={newItemForm.item_type} onChange={e => setNewItemForm(f => ({ ...f, item_type: e.target.value }))}>
                      <option value="finished">Finished Product</option>
                      <option value="raw">Raw Stock Billet</option>
                      <option value="tool">Machine Tooling</option>
                      <option value="consumable">Consumable</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Image Asset</label>
                    <select className="form-input" value={newItemForm.image_url} onChange={e => setNewItemForm(f => ({ ...f, image_url: e.target.value }))}>
                      <option value="/images/casing.png">Square Housing (casing.png)</option>
                      <option value="/images/casing2.png">Oval Housing (casing2.png)</option>
                      <option value="/images/casing3.png">Bracket Housing (casing3.png)</option>
                      <option value="/images/bearing.png">Radial Bearing (bearing.png)</option>
                      <option value="/images/shaft.png">Turned Shaft (shaft.png)</option>
                      <option value="/images/shaft2.png">Aluminum Billet (shaft2.png)</option>
                      <option value="/images/shaft3.png">Steel Round Bar (shaft3.png)</option>
                    </select>
                  </div>
                </div>

                {/* Initial ASRS Compartment Allocation */}
                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 8 }}>Initial ASRS Compartment Allocation</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Box ID (A1-E7)</label>
                      <select className="form-input" value={newItemForm.box_id} onChange={e => setNewItemForm(f => ({ ...f, box_id: e.target.value }))}>
                        {ASRS_BOXES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sub-slot</label>
                      <select className="form-input" value={newItemForm.sub_slot} onChange={e => setNewItemForm(f => ({ ...f, sub_slot: e.target.value }))}>
                        {SUB_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Initial Qty</label>
                      <input className="form-input" type="number" min="0" value={newItemForm.initial_qty} onChange={e => setNewItemForm(f => ({ ...f, initial_qty: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowCreateItemModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create Item</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Edit Item Modal */}
      <AnimatePresence>
        {showEditItemModal && editingItem && (
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditItemModal(false)} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div onClick={e => e.stopPropagation()} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 540, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Edit className="text-primary" size={20} /> Edit Item #{editingItem.item_id}
                </h3>
                <button className="btn-icon" onClick={() => setShowEditItemModal(false)}>✕</button>
              </div>

              <form onSubmit={handleUpdateItem} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>SKU Code</label>
                    <input className="form-input" value={editingItem.sku || ''} onChange={e => setEditingItem(f => ({ ...f, sku: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Unit Price (₹)</label>
                    <input className="form-input" type="number" step="0.01" value={editingItem.price || 0} onChange={e => setEditingItem(f => ({ ...f, price: e.target.value }))} required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Component Name</label>
                  <input className="form-input" value={editingItem.name || ''} onChange={e => setEditingItem(f => ({ ...f, name: e.target.value }))} required />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Technical Specs & Description</label>
                  <textarea className="form-input" rows={3} value={editingItem.description || ''} onChange={e => setEditingItem(f => ({ ...f, description: e.target.value }))} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Item Classification</label>
                    <select className="form-input" value={editingItem.item_type || 'finished'} onChange={e => setEditingItem(f => ({ ...f, item_type: e.target.value }))}>
                      <option value="finished">Finished Product</option>
                      <option value="raw">Raw Stock Billet</option>
                      <option value="tool">Machine Tooling</option>
                      <option value="consumable">Consumable</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Image Asset</label>
                    <select className="form-input" value={editingItem.image_url || '/images/casing.png'} onChange={e => setEditingItem(f => ({ ...f, image_url: e.target.value }))}>
                      <option value="/images/casing.png">Square Housing (casing.png)</option>
                      <option value="/images/casing2.png">Oval Housing (casing2.png)</option>
                      <option value="/images/casing3.png">Bracket Housing (casing3.png)</option>
                      <option value="/images/bearing.png">Radial Bearing (bearing.png)</option>
                      <option value="/images/shaft.png">Turned Shaft (shaft.png)</option>
                      <option value="/images/shaft2.png">Aluminum Billet (shaft2.png)</option>
                      <option value="/images/shaft3.png">Steel Round Bar (shaft3.png)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowEditItemModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Changes</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Adjust Compartment Stock Modal */}
      <AnimatePresence>
        {showStockAdjustModal && stockAdjustItem && (
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowStockAdjustModal(false)} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div onClick={e => e.stopPropagation()} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders className="text-primary" size={20} /> ASRS Stock & Bin Adjustment
                </h3>
                <button className="btn-icon" onClick={() => setShowStockAdjustModal(false)}>✕</button>
              </div>

              <div style={{ marginBottom: 16, background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
                <div style={{ fontWeight: 700 }}>{stockAdjustItem.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>SKU: {stockAdjustItem.sku} • Current Stock: {stockAdjustItem.total_quantity}</div>
              </div>

              <form onSubmit={handleAdjustCompartmentStock} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>ASRS Box (A1-E7)</label>
                    <select className="form-input" value={stockAdjustForm.box_id} onChange={e => setStockAdjustForm(f => ({ ...f, box_id: e.target.value }))}>
                      {ASRS_BOXES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Sub-slot (a-f)</label>
                    <select className="form-input" value={stockAdjustForm.sub_slot} onChange={e => setStockAdjustForm(f => ({ ...f, sub_slot: e.target.value }))}>
                      {SUB_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Quantity in this Compartment</label>
                  <input className="form-input" type="number" min="0" max="100" value={stockAdjustForm.quantity} onChange={e => setStockAdjustForm(f => ({ ...f, quantity: e.target.value }))} required />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Setting quantity to 0 marks the compartment as empty.</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowStockAdjustModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Update ASRS Compartment</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. Provision User Modal */}
      <AnimatePresence>
        {showCreateUserModal && (
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateUserModal(false)} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div onClick={e => e.stopPropagation()} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserPlus className="text-primary" size={20} /> Provision User Account
                </h3>
                <button className="btn-icon" onClick={() => setShowCreateUserModal(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Full Name</label>
                  <input className="form-input" placeholder="e.g. Rahul Sharma" value={newUserForm.full_name} onChange={e => setNewUserForm(f => ({ ...f, full_name: e.target.value }))} required />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Email Address</label>
                  <input className="form-input" type="email" placeholder="e.g. rahul@bvmengineering.ac.in" value={newUserForm.email} onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))} required />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Temporary Password</label>
                  <input className="form-input" type="password" placeholder="••••••••" value={newUserForm.password} onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
                  <input type="checkbox" checked={newUserForm.is_admin} onChange={e => setNewUserForm(f => ({ ...f, is_admin: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                  Grant Administrator Access
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowCreateUserModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create Account</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
