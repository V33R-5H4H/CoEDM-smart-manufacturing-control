import { useState, useEffect } from 'react';
import ItemService from '../services/itemService';
import ConfirmModal from './ConfirmModal';
import { toast } from 'react-toastify';

function ItemsTab() {
  const [items, setItems] = useState([]);
  const [itemId, setItemId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [validatingId, setValidatingId] = useState(false);
  const [idError, setIdError] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await ItemService.getAllItems();
      setItems(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error('Failed to fetch items');
    } finally {
      setLoading(false);
    }
  };

  const validateItemId = async (id) => {
    if (!id.trim()) {
      setIdError('Item ID is required');
      return false;
    }

    // Check if ID is a valid number
    const numId = Number(id);
    if (isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
      setIdError('Item ID must be a positive integer');
      return false;
    }

    try {
      setValidatingId(true);
      const response = await ItemService.checkItemIdExists(id);
      console.log('ID validation response:', response); // Debug log
      
      // Check if the response has the expected format
      if (response && response.exists !== undefined) {
        if (response.exists) {
          setIdError('This Item ID is already in use');
          return false;
        }
        setIdError('');
        return true;
      } else {
        // Handle unexpected response format
        console.error('Unexpected response format:', response);
        setIdError('');
        return true; // Allow submission if response format is unexpected
      }
    } catch (error) {
      console.error('Error validating item ID:', error);
      // Don't block submission on API errors, just log them
      setIdError('');
      return true;
    } finally {
      setValidatingId(false);
    }
  };

  const handleItemIdChange = (e) => {
    const value = e.target.value;
    setItemId(value);
    if (value.trim()) {
      // Clear error immediately for better UX
      setIdError('');
    }
  };

  const handleItemIdBlur = async () => {
    if (itemId.trim()) {
      await validateItemId(itemId);
    } else {
      setIdError('Item ID is required');
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Please provide a name for the item');
      return;
    }

    if (!itemId.trim()) {
      setIdError('Item ID is required');
      return;
    }

    // For numeric validation only (skip the API check if having issues)
    const numId = Number(itemId);
    if (isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
      setIdError('Item ID must be a positive integer');
      return;
    }

    try {
      setLoading(true);
      // Check if this ID already exists in our current items list
      const itemExists = items.some(item => item.item_id === numId);
      if (itemExists) {
        toast.error('This Item ID already exists');
        setLoading(false);
        return;
      }
      
      const response = await ItemService.createItem({
        item_id: parseInt(itemId.trim()),
        name: name.trim(),
        description: description.trim()
      });
      
      toast.success('Item added successfully');
      setItemId('');
      setName('');
      setDescription('');
      fetchItems();
    } catch (error) {
      console.error('Error adding item:', error.response?.data || error.message);
      toast.error(`Failed to add item: ${error.response?.data?.message || error.message}`);
      setLoading(false);
    }
  };

  const openDeleteModal = (itemId) => {
    setItemToDelete(itemId);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleDeleteItem = async (itemId) => {
    try {
      setLoading(true);
      await ItemService.deleteItem(itemId);
      toast.success('Item deleted successfully');
      fetchItems();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
      setLoading(false);
    } finally {
      closeDeleteModal();
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '24px', 
      height: '100%',
      overflow: 'auto',
      padding: '16px 24px',
      position: 'relative'
    }}>
      
      {/* Control Panel / Form */}
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '16px',
        }}>Register New Item</div>
        
        <form onSubmit={handleAddItem} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 120px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }} htmlFor="itemId">Item ID</label>
            <input
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '8px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
              type="text"
              id="itemId"
              value={itemId}
              onChange={handleItemIdChange}
              onBlur={handleItemIdBlur}
              placeholder="e.g. 101"
              required
            />
            {idError && <div style={{ color: 'var(--error)', fontSize: '11px', marginTop: '4px', fontWeight: 500 }}>{idError}</div>}
          </div>
          
          <div style={{ flex: '2 1 200px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }} htmlFor="name">Item Name</label>
            <input
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px' }}
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter item name"
              required
            />
          </div>
          
          <div style={{ flex: '3 1 300px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }} htmlFor="description">Description</label>
            <input
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px' }}
              type="text"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter item description (optional)"
            />
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '62px', paddingBottom: idError ? '19px' : '0' }}>
            <button className="btn btn-primary" type="submit" disabled={loading || validatingId} style={{ height: '35px', padding: '0 16px', fontSize: '12px' }}>
              {loading ? 'ADDING...' : 'ADD ITEM'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={fetchItems} disabled={loading} style={{ height: '35px', padding: '0 12px' }} title="Refresh List">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
            </button>
          </div>
        </form>
      </div>
      
      {/* Items Table */}
      <div>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '10px',
        }}>Inventory Catalog</div>
        <div style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['ITEM ID', 'NAME', 'DESCRIPTION', 'ADDED ON', 'ACTIONS'].map((h) => (
                  <th key={h} style={{
                    padding: '10px 16px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border)'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite', fontSize: '20px', verticalAlign: 'middle', marginRight: '8px' }}>sync</span>
                    Loading items...
                  </td>
                </tr>
              ) : !items || items.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No items found in catalog.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.item_id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--primary)', fontWeight: 500 }}>
                      #{item.item_id}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {item.name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {item.description || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No description</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatDate(item.added_on)}
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <button 
                        className="btn btn-error btn-sm"
                        onClick={() => openDeleteModal(item.item_id)}
                        style={{ height: '26px', padding: '0 8px', fontSize: '11px' }}
                      >
                        DELETE
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={() => itemToDelete && handleDeleteItem(itemToDelete)}
        title="Delete Item"
      />
    </div>
  );
}

export default ItemsTab;
