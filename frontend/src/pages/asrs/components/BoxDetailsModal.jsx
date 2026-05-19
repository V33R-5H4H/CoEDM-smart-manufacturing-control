import { useState, useEffect } from 'react';
import './BoxDetailsModal.css';
import SubCompartmentService from '../services/subCompartmentService';
import ItemService from '../services/itemService';
import { toast } from 'react-toastify';

// --- Add Product Dialog ---
function AddProductDialog({ open, onClose, onAdd, boxId, subId, items }) {
  const [selectedItem, setSelectedItem] = useState('');

  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 11000, background: 'rgba(0,0,0,0.2)' }}>
      <div className="modal-container" style={{ width: 340, minHeight: 200 }}>
        <div className="modal-header">
          <h3>Add Product</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div>
            <strong>Box:</strong> {boxId} <br />
            <strong>Slot:</strong> {subId?.toUpperCase()}
          </div>
          <div style={{ marginTop: 16 }}>
            <label htmlFor="item-select">Select Item:</label>
            <select
              id="item-select"
              value={selectedItem}
              onChange={e => setSelectedItem(e.target.value)}
              style={{ width: '100%', marginTop: 8 }}
            >
              <option value="">-- Choose an item --</option>
              {items.map(item => (
                <option key={item.item_id} value={item.item_id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 24 }}
            disabled={!selectedItem}
            onClick={() => {
              onAdd({ boxId, subId, itemId: selectedItem });
              onClose();
            }}
          >
            Add Product
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Retrieve Product Dialog ---
function RetrieveProductDialog({ open, onClose, onRetrieve, boxId, subId, itemDetail }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 11000, background: 'rgba(0,0,0,0.2)' }}>
      <div className="modal-container" style={{ width: 340, minHeight: 200 }}>
        <div className="modal-header">
          <h3>Retrieve Product</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <strong>Box:</strong> {boxId} <br />
            <strong>Slot:</strong> {subId?.toUpperCase()} <br />
            <strong>Item:</strong> {itemDetail?.name || 'Unknown'} <br />
            <strong>Quantity:</strong> 1
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Click confirm to retrieve this product from storage.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => {
                onRetrieve({ itemId: itemDetail.item_id, quantity: 1, subId });
                onClose();
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoxDetailsModal({ box, onClose, openDeleteModal, operationMode = 'store', onRefresh }) {
  const [subs, setSubs] = useState([]);
  const [items, setItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);

  // --- New state for dialogs ---
  const [addDialog, setAddDialog] = useState({ open: false, subId: null });
  const [retrieveDialog, setRetrieveDialog] = useState({ open: false, subId: null, itemDetail: null });

  // --- All available items for selection ---
  const [allItems, setAllItems] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const res = await SubCompartmentService.getAllSubCompartments();
        const arr = Array.isArray(res) ? res : res?.data || [];
        const filtered = arr.filter((s) => s.box_id === box.box_id);

        if (mounted) setSubs(filtered);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [box.box_id]);

  // Load item details for occupied compartments
  useEffect(() => {
    let mounted = true;

    async function loadItems() {
      const itemIds = subs.filter((s) => s.item_id).map((s) => s.item_id);

      if (itemIds.length === 0) {
        if (mounted) setItems({});
        return;
      }

      setItemsLoading(true);

      const map = {};
      for (const id of itemIds) {
        try {
          const res = await ItemService.getItemById(id);
          map[id] = res.data || res;
        } catch {
          map[id] = { item_id: id, item_name: id };
        }
      }

      if (mounted) {
        setItems(map);
        setItemsLoading(false);
      }
    }

    loadItems();
    return () => {
      mounted = false;
    };
  }, [subs]);

  // --- Load all items for selection ---
  useEffect(() => {
    ItemService.getAllItems().then(res => {
      setAllItems(Array.isArray(res) ? res : res?.data || []);
    });
  }, []);

  // --- Add product handler ---
  const handleAddProduct = async ({ boxId, subId, itemId }) => {
    try {
      await SubCompartmentService.addProduct({ boxId, subId, itemId });
      toast.success('Product added successfully');
      // Refresh subcompartments after adding
      const res = await SubCompartmentService.getAllSubCompartments();
      const arr = Array.isArray(res) ? res : res?.data || [];
      setSubs(arr.filter((s) => s.box_id === box.box_id));
      // Refresh boxes to update fill status
      if (onRefresh) onRefresh();
    } catch (err) {
      const errorMsg = err.response?.status === 429
        ? 'AS/RS is currently busy with another operation. Please wait.'
        : 'Failed to add product: ' + (err?.message || 'Unknown error');
      toast.error(errorMsg);
    }
  };

  // --- Retrieve product handler ---
  const handleRetrieveProduct = async ({ itemId, quantity, subId }) => {
    console.log('[RETRIEVE] Starting retrieve operation');
    console.log('[RETRIEVE] Item ID:', itemId);
    console.log('[RETRIEVE] Quantity:', quantity);
    console.log('[RETRIEVE] Box:', box.box_id);
    console.log('[RETRIEVE] Subcompartment:', subId);
    
    const payload = { 
      itemId, 
      quantity,
      boxId: box.box_id,
      subId: subId
    };
    console.log('[RETRIEVE] Payload being sent to API:', JSON.stringify(payload));
    
    try {
      console.log('[RETRIEVE] Calling SubCompartmentService.retrieveProduct...');
      const response = await SubCompartmentService.retrieveProduct(payload);
      console.log('[RETRIEVE] Response received:', response);
      console.log('[RETRIEVE] Response data:', JSON.stringify(response.data, null, 2));
      
      toast.success(`Successfully retrieved ${quantity} item(s) from ${box.box_id}${subId}!`);
      console.log('[RETRIEVE] Success - refreshing subcompartments');
      
      // Refresh subcompartments after retrieving
      const res = await SubCompartmentService.getAllSubCompartments();
      const arr = Array.isArray(res) ? res : res?.data || [];
      setSubs(arr.filter((s) => s.box_id === box.box_id));
      console.log('[RETRIEVE] Subcompartments refreshed');
      // Refresh boxes to update fill status
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[RETRIEVE] Error occurred:', err);
      console.error('[RETRIEVE] Error response:', err.response);
      console.error('[RETRIEVE] Error status:', err.response?.status);
      console.error('[RETRIEVE] Error data:', err.response?.data);
      
      const errorMsg = err.response?.status === 429
        ? 'AS/RS is currently busy with another operation. Please wait.'
        : err.response?.data?.message || err.message || 'Failed to retrieve product';
      console.error('[RETRIEVE] Error message shown to user:', errorMsg);
      toast.error(`Error: ${errorMsg}`);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-container"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <h3>Box {box.box_id}</h3>
              <p className="modal-subtitle">
                Column {box.column_name} · Row {box.row_number}
              </p>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>

          <div className="modal-body">
            <h4>Subcompartments</h4>

            {loading ? (
              <div>Loading…</div>
            ) : (
              <div className="tray">
                <div className="sub-grid">
                  {['a', 'b', 'c', 'd', 'e', 'f'].map((label) => {
                    const sub = subs.find((s) => s.sub_id === label);
                    const hasItem = sub?.item_id;
                    const itemDetail = hasItem ? items[sub.item_id] : null;
                    
                    // Determine clickability based on mode
                    const canStore = operationMode === 'store' && !hasItem;
                    const canRetrieve = operationMode === 'retrieve' && hasItem;
                    const isClickable = canStore || canRetrieve;
                    const isDisabled = !isClickable;
                    
                    const statusClass = hasItem ? 'occupied' : 'empty';
                    
                    // Mode-specific colors - darker shades
                    const modeColors = operationMode === 'retrieve' 
                      ? {
                          background: hasItem ? 'rgba(5, 150, 105, 0.2)' : 'var(--bg-800)',
                          borderColor: hasItem ? 'rgb(5, 150, 105)' : 'var(--border)',
                          boxShadow: hasItem ? '0 0 0 1px rgba(5, 150, 105, 0.5)' : 'none'
                        }
                      : {
                          background: !hasItem ? 'rgba(234, 88, 12, 0.2)' : 'var(--bg-800)',
                          borderColor: !hasItem ? 'rgb(234, 88, 12)' : 'var(--border)',
                          boxShadow: !hasItem ? '0 0 0 1px rgba(234, 88, 12, 0.5)' : 'none'
                        };

                    return (
                      <div
                        key={label}
                        className={`sub-card ${statusClass}`}
                        style={{ 
                          cursor: isClickable ? 'pointer' : 'not-allowed',
                          opacity: isDisabled ? 0.5 : 1,
                          transition: 'all 0.2s ease',
                          background: modeColors.background,
                          borderColor: modeColors.borderColor,
                          boxShadow: modeColors.boxShadow
                        }}
                        onClick={() => {
                          if (isClickable && operationMode === 'store') {
                            setAddDialog({ open: true, subId: label });
                          } else if (isClickable && operationMode === 'retrieve') {
                            setRetrieveDialog({ open: true, subId: label, itemDetail });
                          }
                        }}
                      >
                        <div className="sub-title">
                          <span>Slot {label.toUpperCase()}</span>
                          <span className={`badge ${hasItem ? 'badge-success' : 'badge-secondary'}`}>
                            {hasItem ? 'OCCUPIED' : 'EMPTY'}
                          </span>
                        </div>
                        <div className="sub-info">
                          {hasItem && itemDetail ? (
                            <>
                              <div style={{ fontWeight: 600 }}>{itemDetail.name}</div>
                              <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                {itemDetail.description}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* --- Add Product Dialog --- */}
      <AddProductDialog
        open={addDialog.open}
        onClose={() => setAddDialog({ open: false, subId: null })}
        onAdd={handleAddProduct}
        boxId={box.box_id}
        subId={addDialog.subId}
        items={allItems}
      />
      {/* --- Retrieve Product Dialog --- */}
      <RetrieveProductDialog
        open={retrieveDialog.open}
        onClose={() => setRetrieveDialog({ open: false, subId: null, itemDetail: null })}
        onRetrieve={handleRetrieveProduct}
        boxId={box.box_id}
        subId={retrieveDialog.subId}
        itemDetail={retrieveDialog.itemDetail}
      />
    </>
  );
}

export default BoxDetailsModal;
