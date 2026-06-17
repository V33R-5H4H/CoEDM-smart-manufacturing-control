import { useState, useEffect } from 'react';
import ItemService from '../services/itemService';
import BoxService from '../services/boxService';
import SubCompartmentService from '../services/subCompartmentService';
import { toast } from 'react-toastify';

function OperationsTab() {
  const [activeOperation, setActiveOperation] = useState(null);
  const [items, setItems] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [availableBoxes, setAvailableBoxes] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedBox, setSelectedBox] = useState('');
  const [subId, setSubId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [availableItems, setAvailableItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [systemBusy, setSystemBusy] = useState(false); // Global ASRS operation lock

  useEffect(() => {
    fetchItems();
    fetchBoxes();
    fetchAvailableItems();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await ItemService.getAllItems();
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error('Failed to load items. Backend may be unavailable.');
    }
  };

  const fetchBoxes = async () => {
    try {
      const response = await BoxService.getAllBoxes();
      setBoxes(response.data);
    } catch (error) {
      console.error('Error fetching boxes:', error);
      toast.error('Failed to load boxes. Backend may be unavailable.');
    }
  };

  const fetchAvailableBoxes = async () => {
    try {
      const response = await BoxService.getBoxesWithEmptyCompartments();
      setAvailableBoxes(response.data);
    } catch (error) {
      console.error('Error fetching available boxes:', error);
      toast.error('Failed to load available boxes. Backend may be unavailable.');
    }
  };

  const fetchAvailableItems = async () => {
    try {
      const response = await ItemService.getAvailableItems();
      setAvailableItems(response.data);
    } catch (error) {
      console.error('Error fetching available items:', error);
      toast.error('Failed to load available items. Backend may be unavailable.');
    }
  };

  const showAddProductOptions = () => {
    setActiveOperation('add');
    setResult(null);
    fetchAvailableBoxes(); // Fetch boxes with empty compartments when selecting add operation
  };

  const showRetrieveProductOptions = () => {
    setActiveOperation('retrieve');
    fetchAvailableItems();
    setResult(null);
  };

  const showItemLocationsOptions = () => {
    setActiveOperation('locations');
    setResult(null);
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    
    if (!selectedItem || !selectedBox || !subId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setSystemBusy(true); // 🔒 Lock the system
      
      // Convert values properly to ensure they match the expected types
      const payload = {
        itemId: Number(selectedItem),
        boxId: selectedBox,
        subId: subId.toString()
      };
      
      console.log('Sending payload:', payload); // Debug the payload
      
      const response = await SubCompartmentService.addProduct(payload);
      
      // Get item name for the result display
      const itemName = items.find(item => item.item_id === Number(selectedItem))?.name || 'Unknown';
      
      setResult({
        success: true,
        message: 'Product added successfully!',
        details: {
          item: itemName,
          location: `${selectedBox}${subId}`,
          status: 'Occupied',
          action: response.data.action
        }
      });
      
      toast.success('Product added successfully');
      
      // Reset form fields
      setSubId('');
      setSelectedBox('');
      
      // Refresh available boxes after adding a product
      fetchAvailableBoxes();
      
    } catch (error) {
      console.error('Error handling add product:', error);
      const errorMsg = error.response?.status === 429 
        ? 'AS/RS is currently busy with another operation. Please wait.'
        : 'Failed to add product. Backend may be unavailable.';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
      setSystemBusy(false); // 🔓 Unlock the system
    }
  };

  const handleRetrieveProduct = async (e) => {
    e.preventDefault();
    
    if (!selectedItem || !quantity || quantity < 1) {
      toast.error('Please select an item and enter a valid quantity');
      return;
    }

    try {
      setLoading(true);
      setSystemBusy(true); //Lock the system
      
      const response = await SubCompartmentService.retrieveProduct({
        itemId: parseInt(selectedItem),
        quantity: parseInt(quantity)
      });
      
      // Get item name for the result display
      const itemName = items.find(item => item.item_id === parseInt(selectedItem))?.name || 'Unknown';
      
      setResult({
        success: true,
        message: `Successfully retrieved ${quantity} item(s)!`,
        details: {
          item: itemName,
          quantity: response.data.quantity,
          locations: response.data.locations.map(loc => ({
            place: loc.subcom_place,
            displayLoc: `${loc.column_name}${loc.row_number}${loc.sub_id}`
          }))
        }
      });
      
      toast.success(`Successfully retrieved ${quantity} item(s)!`);
      
      // Refresh available items
      fetchAvailableItems();
    } catch (error) {
      console.error('Error retrieving product:', error);
      const errorMsg = error.response?.status === 429 
        ? 'AS/RS is currently busy with another operation. Please wait.'
        : error.response?.data?.message || error.message;
      setResult({
        success: false,
        message: `Failed to retrieve product: ${errorMsg}`
      });
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
      setSystemBusy(false); // 🔓 Unlock the system
    }
  };

  const fetchItemLocations = async (e) => {
    e.preventDefault();
    
    if (!selectedItem) {
      toast.error('Please select an item');
      return;
    }

    try {
      setLoading(true);
      const response = await ItemService.getItemLocations(selectedItem);
      const itemName = items.find(item => item.item_id === parseInt(selectedItem))?.name || 'Unknown';
      
      if (response.data.length === 0) {
        setResult({
          success: true,
          message: `No locations found for ${itemName}`,
          details: { 
            item: itemName,
            count: 0,
            locations: []
          }
        });
      } else {
        setResult({
          success: true,
          message: `Found ${response.data.length} location(s) for ${itemName}`,
          details: { 
            item: itemName,
            count: response.data.length,
            locations: response.data.map(loc => ({
              place: loc.subcom_place,
              displayLoc: `${loc.column_name}${loc.row_number}${loc.sub_id}`
            }))
          }
        });
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching item locations:', error);
      setResult({
        success: false,
        message: `Failed to fetch locations: ${error.response?.data?.message || error.message}`
      });
      toast.error(`Error: ${error.response?.data?.message || error.message}`);
      setLoading(false);
    }
  };

  const renderOptions = () => {
    switch (activeOperation) {
      case 'add':
        return (
          <form onSubmit={handleAddProduct} className="operation-form" style={{ opacity: systemBusy ? 0.5 : 1 }}>
            <fieldset disabled={systemBusy} style={{ border: 'none', padding: 0, margin: 0 }}>
              <h3>Add Product Options</h3>
              
              <div className="form-group">
                <label className="form-label" htmlFor="productType">Select Product Type</label>
                <select
                  className="form-input"
                  id="productType"
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  required
                >
                  <option value="">Select Product</option>
                  {(!items || items.length === 0) ? (
                    <option value="">No items available</option>
                  ) : (
                    items.map((item) => (
                      <option key={item.item_id} value={item.item_id}>
                        {item.name} (ID: {item.item_id})
                      </option>
                    ))
                  )}
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="boxId">Box ID</label>
                <select
                  className="form-input"
                  id="boxId"
                  value={selectedBox}
                  onChange={(e) => setSelectedBox(e.target.value)}
                  required
                >
                  <option value="">Select Box</option>
                  {(availableBoxes && availableBoxes.length > 0) ? (
                    availableBoxes.map((box) => (
                      <option key={box.box_id} value={box.box_id}>
                        {box.column_name}{box.row_number}
                      </option>
                    ))
                  ) : (
                    <option value="">No boxes available</option>
                  )}
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="subCompartmentId">Sub Compartment ID</label>
                <input
                  className="form-input"
                  type="text"
                  id="subCompartmentId"
                  value={subId}
                  onChange={(e) => setSubId(e.target.value)}
                  placeholder="e.g., a, b"
                  required
                />
              </div>
              
              <button className="btn btn-primary" type="submit" disabled={loading || systemBusy}>
                {loading ? 'Processing...' : 'Add Product to Storage'}
              </button>
            </fieldset>
          </form>
        );
        
      case 'retrieve':
        return (
          <form onSubmit={handleRetrieveProduct} className="operation-form" style={{ opacity: systemBusy ? 0.5 : 1 }}>
            <fieldset disabled={systemBusy} style={{ border: 'none', padding: 0, margin: 0 }}>
              <h3>Retrieve Product Options</h3>
              
              {(!availableItems || availableItems.length === 0) ? (
                <p style={{ color: 'var(--text-secondary)' }}>No products available for retrieval.</p>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Select Product Type to Retrieve</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {(availableItems || []).map((item) => (
                        <div key={item.item_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            id={`product-${item.item_id}`}
                            name="retrieveProduct"
                            value={item.item_id}
                            onChange={() => setSelectedItem(item.item_id)}
                            style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                            required
                          />
                          <label htmlFor={`product-${item.item_id}`} style={{ cursor: 'pointer', margin: 0 }}>
                            {item.name} (Available: {item.available_count})
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="quantity">Quantity to Retrieve</label>
                    <input
                      className="form-input"
                      type="number"
                      id="quantity"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                  </div>

                  <button className="btn btn-primary" type="submit" disabled={loading || systemBusy}>
                    {loading ? 'Processing...' : 'Retrieve Product'}
                  </button>
                </>
              )}
            </fieldset>
          </form>
        );
        
      case 'locations':
        return (
          <form onSubmit={fetchItemLocations} className="operation-form" style={{ opacity: systemBusy ? 0.5 : 1 }}>
            <fieldset disabled={systemBusy} style={{ border: 'none', padding: 0, margin: 0 }}>
              <h3>Item Storage Details</h3>
              
              <div className="form-group">
                <label className="form-label" htmlFor="itemForLocations">Select Item</label>
                <select
                  className="form-input"
                  id="itemForLocations"
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  required
                >
                  <option value="">Select Item</option>
                  {(!items || items.length === 0) ? (
                    <option value="">No items available</option>
                  ) : (
                    items.map((item) => (
                      <option key={item.item_id} value={item.item_id}>
                        {item.name} (ID: {item.item_id})
                      </option>
                    ))
                  )}
                </select>
              </div>
              
              <button className="btn btn-primary" type="submit" disabled={loading || systemBusy}>
                {loading ? 'Finding Locations...' : 'Show Locations'}
              </button>
            </fieldset>
          </form>
        );
        
      default:
        return <p style={{ color: 'var(--text-secondary)' }}>Select an operation from the buttons above.</p>;
    }
  };

  const renderResults = () => {
    if (!result) return null;
    
    return (
      <div className="card" style={{ 
        marginTop: '1.5rem',
        borderLeft: `4px solid ${result.success ? 'var(--success)' : 'var(--error)'}` 
      }}>
        <h3 style={{ marginBottom: '1rem' }}>Results</h3>
        <p style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '1rem' }}>{result.message}</p>
        
        {result.details && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {result.details.item && (
              <p><strong>Item:</strong> {result.details.item}</p>
            )}
            
            {result.details.location && (
              <p><strong>Location:</strong> <span className="badge badge-primary">{result.details.location}</span></p>
            )}
            
            {result.details.status && (
              <p><strong>Status:</strong> <span className="badge badge-success">{result.details.status}</span></p>
            )}
            
            {result.details.action && (
              <p><strong>Note:</strong> {result.details.action === 'updated' ? 'Updated empty place to occupied' : 'Added to new place'}</p>
            )}
            
            {result.details.quantity && (
              <p><strong>Quantity:</strong> {result.details.quantity}</p>
            )}
            
            {result.details.locations && result.details.locations.length > 0 && (
              <>
                <p><strong>Locations:</strong></p>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {result.details.locations.map((location, index) => (
                    <li key={location.place} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-secondary">{index + 1}</span>
                      <span>{location.displayLoc} (ID: {location.place})</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            
            {activeOperation === 'retrieve' && (
              <p style={{ marginTop: '0.5rem', fontSize: '1.075rem', color: 'var(--text-secondary)' }}>
                <strong>Retrieval Strategy:</strong> Column-wise (A1→A7, then B1→B7, etc.)
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      <h2>Operations</h2>
      
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button 
          className={`btn ${activeOperation === 'add' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={showAddProductOptions}
          disabled={systemBusy}
        >
          Add Product
        </button>
        <button 
          className={`btn ${activeOperation === 'retrieve' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={showRetrieveProductOptions}
          disabled={systemBusy}
        >
          Retrieve Product
        </button>
        <button 
          className={`btn ${activeOperation === 'locations' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={showItemLocationsOptions}
          disabled={systemBusy}
        >
          View Item Locations
        </button>
      </div>
      
      <div className="card">
        {renderOptions()}
      </div>
      
      <div>
        {renderResults()}
      </div>

      {/* 🔒 AS/RS Operation Lock Overlay */}
      {systemBusy && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--surface)',
            padding: '2rem 3rem',
            borderRadius: '12px',
            border: '2px solid var(--primary)',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem',
              animation: 'spin 2s linear infinite'
            }}>⚙️</div>
            <h3 style={{ 
              color: 'var(--primary)', 
              marginBottom: '0.5rem',
              fontSize: '1.7rem'
            }}>AS/RS Operation In Progress</h3>
            <p style={{ 
              color: 'var(--text-secondary)',
              margin: 0,
              fontSize: '1rem'
            }}>Please wait while the system processes your request...</p>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default OperationsTab;
