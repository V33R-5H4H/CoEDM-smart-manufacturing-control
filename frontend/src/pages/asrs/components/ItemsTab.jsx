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
    <div>
      <h2>Items Management</h2>
      
      <div className="control-panel">
        <form onSubmit={handleAddItem} className="add-item-form">
          <div className="form-group">
            <label className="form-label" htmlFor="itemId">Item ID</label>
            <input
              className="form-input"
              type="text"
              id="itemId"
              value={itemId}
              onChange={handleItemIdChange}
              onBlur={handleItemIdBlur}
              placeholder="Enter item ID"
              required
            />
            {idError && <div className="error-message" style={{ color: 'var(--error)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{idError}</div>}
          </div>
          
          <div className="form-group">
            <label className="form-label" htmlFor="name">Item Name</label>
            <input
              className="form-input"
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter item name"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label" htmlFor="description">Description</label>
            <textarea
              className="form-input"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="3"
              placeholder="Enter item description (optional)"
            />
          </div>
          
          <button className="btn btn-primary" type="submit" disabled={loading || validatingId}>
            {loading ? 'Adding...' : 'Add Item'}
          </button>
          
          <button className="btn btn-secondary" type="button" onClick={fetchItems} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </form>
      </div>
      
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Name</th>
              <th>Description</th>
              <th>Added On</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="loading-cell">
                  <span className="animate-pulse">Loading...</span>
                </td>
              </tr>
            ) : !items || items.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-cell">No items found</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.item_id}>
                  <td>{item.item_id}</td>
                  <td>{item.name}</td>
                  <td>{item.description}</td>
                  <td>{formatDate(item.added_on)}</td>
                  <td>
                    <button 
                      className="btn btn-error btn-sm"
                      onClick={() => openDeleteModal(item.item_id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
