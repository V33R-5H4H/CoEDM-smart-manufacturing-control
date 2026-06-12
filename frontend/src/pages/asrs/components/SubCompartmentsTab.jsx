import { useState, useEffect } from 'react';
import SubCompartmentService from '../services/subCompartmentService';
import BoxService from '../services/boxService';
import ItemService from '../services/itemService';
import ConfirmModal from './ConfirmModal';
import { toast } from 'react-toastify';

function SubCompartmentsTab() {
  const [subCompartments, setSubCompartments] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [items, setItems] = useState([]);
  const [boxId, setBoxId] = useState('');
  const [subId, setSubId] = useState('');
  const [itemId, setItemId] = useState('');
  const [status, setStatus] = useState('Empty');
  const [loading, setLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [placeToDelete, setPlaceToDelete] = useState(null);

  useEffect(() => {
    fetchSubCompartments();
    fetchBoxes();
    fetchItems();
  }, []);

  const fetchSubCompartments = async () => {
    try {
      setLoading(true);
      const response = await SubCompartmentService.getAllSubCompartments();
      setSubCompartments(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching subcompartments:', error);
      toast.error('Failed to fetch subcompartments');
    } finally {
      setLoading(false);
    }
  };

  const fetchBoxes = async () => {
    try {
      const response = await BoxService.getAllBoxes();
      setBoxes(response.data);
    } catch (error) {
      console.error('Error fetching boxes:', error);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await ItemService.getAllItems();
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const handleAddSubCompartment = async (e) => {
    e.preventDefault();
    
    if (!boxId || !subId || !status) {
      toast.error('Please fill in all required fields');
      return;
    }

    // When status is Occupied, itemId is required
    if (status === 'Occupied' && !itemId) {
      toast.error('Item ID is required when status is Occupied');
      return;
    }

    try {
      setLoading(true);
      await SubCompartmentService.createSubCompartment({
        boxId: boxId,
        subId: subId,
        itemId: status === 'Occupied' ? itemId : null,
        status: status
      });
      
      toast.success('SubCompartment added successfully');
      resetForm();
      fetchSubCompartments();
    } catch (error) {
      console.error('Error adding subcompartment:', error);
      toast.error(`Failed to add subcompartment: ${error.response?.data?.message || error.message}`);
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (place, currentStatus) => {
    try {
      // Toggle status between Empty and Occupied
      const newStatus = currentStatus === 'Empty' ? 'Occupied' : 'Empty';
      
      setLoading(true);
      await SubCompartmentService.updateStatus(place, { 
        status: newStatus,
        itemId: newStatus === 'Empty' ? null : itemId  // Clear itemId if setting to Empty
      });
      
      toast.success('Status updated successfully');
      fetchSubCompartments();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      setLoading(false);
    }
  };

  const openDeleteModal = (place) => {
    setPlaceToDelete(place);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setPlaceToDelete(null);
  };

  const handleDeleteSubCompartment = async (place) => {
    try {
      setLoading(true);
      await SubCompartmentService.deleteSubCompartment(place);
      toast.success('SubCompartment deleted successfully');
      fetchSubCompartments();
    } catch (error) {
      console.error('Error deleting subcompartment:', error);
      toast.error('Failed to delete subcompartment');
      setLoading(false);
    } finally {
      closeDeleteModal();
    }
  };

  const resetForm = () => {
    setBoxId('');
    setSubId('');
    setItemId('');
    setStatus('Empty');
  };

  return (
    <div>
      <h2>SubCompartments Management</h2>
      
      <div className="control-panel">
        <form onSubmit={handleAddSubCompartment} className="add-subcom-form">
          <div className="form-group">
            <label className="form-label" htmlFor="boxId">Box ID</label>
            <select
              className="form-input"
              id="boxId"
              value={boxId}
              onChange={(e) => setBoxId(e.target.value)}
              required
            >
              <option value="">Select Box</option>
              {(boxes || []).map((box) => (
                <option key={box.box_id} value={box.box_id}>
                  {box.box_id} 
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label className="form-label" htmlFor="subId">Sub ID</label>
            <input
              className="form-input"
              type="text"
              id="subId"
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              placeholder="e.g., a, b"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label" htmlFor="status">Status</label>
            <select
              className="form-input"
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              required
            >
              <option value="Empty">Empty</option>
              <option value="Occupied">Occupied</option>
            </select>
          </div>
          
          {status === 'Occupied' && (
            <div className="form-group">
              <label className="form-label" htmlFor="itemId">Item</label>
              <select
                className="form-input"
                id="itemId"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                required
              >
                <option value="">Select Item</option>
                {items.map((item) => (
                  <option key={item.item_id} value={item.item_id}>
                    {item.item_id} - {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Adding...' : 'Add SubCompartment'}
          </button>
          
          <button className="btn btn-secondary" type="button" onClick={fetchSubCompartments} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </form>
      </div>
      
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Box ID</th>
              <th>Sub ID</th>
              <th>Item ID</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="loading-cell">
                  <span className="animate-pulse">Loading...</span>
                </td>
              </tr>
            ) : !subCompartments || subCompartments.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-cell">No subcompartments found</td>
              </tr>
            ) : (
              subCompartments.map((subcom) => {
                const itemName = items.find(item => item.item_id === subcom.item_id)?.name || '';
                
                return (
                  <tr key={subcom.subcom_place}>
                    <td>{subcom.subcom_place}</td>
                    <td>{subcom.box_id}</td>
                    <td>{subcom.sub_id}</td>
                    <td>{subcom.item_id ? `${subcom.item_id} - ${itemName}` : 'None'}</td>
                    <td>
                      <span className={`badge ${subcom.status === 'Occupied' ? 'badge-success' : subcom.status === 'reserved' ? 'badge-warning' : 'badge-secondary'}`}>
                        {subcom.status === 'reserved' ? 'ORDERING' : subcom.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button 
                          className="btn btn-warning btn-sm"
                          onClick={() => handleUpdateStatus(subcom.subcom_place, subcom.status)}
                          disabled={subcom.status === 'reserved'}
                        >
                          Toggle Status
                        </button>
                        <button 
                          className="btn btn-error btn-sm"
                          onClick={() => openDeleteModal(subcom.subcom_place)}
                          disabled={subcom.status === 'reserved'}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={() => placeToDelete && handleDeleteSubCompartment(placeToDelete)}
        title="Delete SubCompartment"
      />
    </div>
  );
}

export default SubCompartmentsTab;
