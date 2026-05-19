import sys

file_path = r'd:\CoEDM\frontend\src\pages\asrs\components\BoxesTab.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_content = """// Operations Panel Component - Rendered as a Modal overlay matching Stitch design
function OperationsPanel({ box, ledStates, onClose, onRefresh, operationMode }) {
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [subCompartments, setSubCompartments] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Ref to hold the latest ledStates for use in async operations (like setInterval)
  const ledStatesRef = useRef(ledStates);

  // Update the ref whenever ledStates prop changes
  useEffect(() => {
    ledStatesRef.current = ledStates;
  }, [ledStates]);

  useEffect(() => {
    fetchSubCompartments();
    fetchItems();
  }, [box]);

  const fetchItems = async () => {
    try {
      const ItemService = (await import('../services/itemService')).default;
      const response = await ItemService.getAllItems();
      setItems(response.data || []);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const fetchSubCompartments = async () => {
    try {
      setLoading(true);
      const SubCompartmentService = (await import('../services/subCompartmentService')).default;
      const response = await SubCompartmentService.getAllSubCompartments();

      // Filter subcompartments for this specific box
      const allSubs = response.data || [];
      const boxSubs = allSubs.filter(sub => sub.box_id === box.box_id);
      setSubCompartments(boxSubs);
    } catch (error) {
      console.error('Error fetching subcompartments:', error);
      toast.error('Failed to load subcompartments');
    } finally {
      setLoading(false);
    }
  };

  const handleStoreOperation = async () => {
    if (!selectedSubId) {
      toast.error('Please select a subcompartment');
      return;
    }
    if (!selectedItemId) {
      toast.error('Please select an item to store');
      return;
    }

    try {
      setLoading(true);
      const SubCompartmentService = (await import('../services/subCompartmentService')).default;

      // 1. Send the command
      await SubCompartmentService.addProduct({
        boxId: box.box_id,
        subId: selectedSubId,
        itemId: Number(selectedItemId)
      });

      // 2. Wait for LED to turn OFF (operation completed)
      toast.info('Operation in progress... Shuttle moving', { autoClose: false, toastId: 'store-wait' });

      const waitForLedOff = () => new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timeoutMs = 90000;
        const checkIntervalMs = 500;
        let hasTurnedOn = false;

        const intervalId = setInterval(() => {
          const isLedOn = ledStatesRef.current[box.box_id];

          if (isLedOn) {
            hasTurnedOn = true;
          }

          const elapsed = Date.now() - startTime;

          if (hasTurnedOn && !isLedOn) {
            clearInterval(intervalId);
            resolve();
          }

          if (elapsed > timeoutMs) {
            clearInterval(intervalId);
            reject(new Error('Timeout: LED did not confirm completion'));
          }
        }, checkIntervalMs);
      });

      await waitForLedOff();
      toast.dismiss('store-wait');
      toast.success('Item stored successfully');
      await fetchSubCompartments();
      onRefresh();
      setSelectedSubId(null);
      setSelectedItemId(null);
    } catch (error) {
      console.error('Store operation error:', error);
      toast.dismiss('store-wait');
      toast.error(error.message || 'Failed to store item');
    } finally {
      setLoading(false);
    }
  };

  const handleRetrieveOperation = async () => {
    if (!selectedSubId) {
      toast.error('Please select a subcompartment');
      return;
    }

    const selectedSub = subCompartments.find(s => s.sub_id === selectedSubId);
    if (!selectedSub || !selectedSub.item_id) {
      toast.error('Selected subcompartment has no item');
      return;
    }

    try {
      setLoading(true);
      const SubCompartmentService = (await import('../services/subCompartmentService')).default;
      await SubCompartmentService.retrieveProduct({
        boxId: box.box_id,
        subId: selectedSubId,
        itemId: selectedSub.item_id,
        quantity: 1
      });

      toast.info('Retrieving item... Shuttle moving', { autoClose: false, toastId: 'retrieve-wait' });

      const waitForLedOff = () => new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timeoutMs = 90000;
        const checkIntervalMs = 500;
        let hasTurnedOn = false;

        const intervalId = setInterval(() => {
          const isLedOn = ledStatesRef.current[box.box_id];

          if (isLedOn) {
            hasTurnedOn = true;
          }

          const elapsed = Date.now() - startTime;

          if (hasTurnedOn && !isLedOn) {
            clearInterval(intervalId);
            resolve();
          }

          if (elapsed > timeoutMs) {
            clearInterval(intervalId);
            reject(new Error('Timeout: LED did not confirm completion'));
          }
        }, checkIntervalMs);
      });

      await waitForLedOff();
      toast.dismiss('retrieve-wait');

      toast.success('Item retrieved successfully');
      await fetchSubCompartments();
      onRefresh();
      setSelectedSubId(null);
    } catch (error) {
      console.error('Retrieve operation error:', error);
      toast.dismiss('retrieve-wait');
      toast.error(error.message || 'Failed to retrieve item');
    } finally {
      setLoading(false);
    }
  };

  const filledCount = subCompartments.filter(s => !!s.item_id).length;
  const totalCount = subCompartments.length;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(16, 19, 25, 0.8)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-xl)',
        width: '100%',
        maxWidth: '672px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-tertiary)'
        }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', color: 'var(--text-primary)', fontWeight: 700, margin: 0 }}>
              BOX-{box.row_number}0{box.column_name === 'A' ? '1' : box.column_name === 'B' ? '2' : box.column_name === 'C' ? '3' : box.column_name === 'D' ? '4' : '5'} details
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 0 0' }}>
              Loc: Z-BAY 01, L{box.row_number}-{box.column_name} • {filledCount}/{totalCount || 6} Occupied
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              color: 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Modal Content (2x3 Grid) */}
        <div style={{
          padding: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          background: 'var(--bg-primary)'
        }}>
          {['a', 'b', 'c', 'd', 'e', 'f'].map((label, index) => {
            const sub = subCompartments.find((s) => s.sub_id === label);
            const hasItem = sub?.item_id;
            const isOccupied = !!hasItem;
            const isSelected = selectedSubId === label;

            return (
              <div
                key={label}
                onClick={() => {
                  if (operationMode === 'store' && !isOccupied) setSelectedSubId(label);
                  if (operationMode === 'retrieve' && isOccupied) setSelectedSubId(label);
                }}
                style={{
                  border: isOccupied ? '1px solid var(--status-ok)' : '1px dashed var(--border)',
                  background: isOccupied ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                  borderRadius: '4px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '128px',
                  position: 'relative',
                  opacity: (!isOccupied && operationMode === 'retrieve') || (isOccupied && operationMode === 'store') ? 0.5 : 1,
                  cursor: (operationMode === 'store' && !isOccupied) || (operationMode === 'retrieve' && isOccupied) ? 'pointer' : 'default',
                  outline: isSelected ? '2px solid var(--primary)' : 'none'
                }}
              >
                {isOccupied && (
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'var(--status-ok)', borderRadius: '4px 4px 0 0' }} />
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', marginTop: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                    Sub {box.column_name}{box.row_number}{label}
                  </span>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isOccupied ? 'var(--status-ok)' : 'transparent',
                    border: isOccupied ? 'none' : '1px solid var(--border)',
                    boxShadow: isOccupied ? '0 0 8px rgba(121,218,166,0.8)' : 'none'
                  }} />
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: isOccupied ? 'flex-start' : 'center', justifyContent: isOccupied ? 'flex-end' : 'center', height: '100%' }}>
                  {isOccupied ? (
                    <>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Contents</p>
                      <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.2 }}>{sub.item_name || 'Unknown Item'}</p>
                    </>
                  ) : (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Empty</p>
                  )}
                </div>
                
                {/* Retrieve Button Overlay */}
                {operationMode === 'retrieve' && isOccupied && isSelected && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRetrieveOperation(); }}
                    disabled={loading}
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      background: 'var(--warning)',
                      color: 'var(--bg-primary)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      cursor: 'pointer'
                    }}
                  >
                    Retrieve
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal Actions - Store Mode Only */}
        {operationMode === 'store' && selectedSubId && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <select
              value={selectedItemId || ''}
              onChange={(e) => setSelectedItemId(e.target.value)}
              disabled={loading}
              style={{
                flex: 1,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '8px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)'
              }}
            >
              <option value="">Select item to store...</option>
              {items.map(item => (
                <option key={item.item_id} value={item.item_id}>
                  [{item.item_id}] {item.name}
                </option>
              ))}
            </select>
            
            <button
              onClick={handleStoreOperation}
              disabled={!selectedItemId || loading}
              style={{
                background: 'var(--primary)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                cursor: (!selectedItemId || loading) ? 'not-allowed' : 'pointer',
                opacity: (!selectedItemId || loading) ? 0.5 : 1
              }}
            >
              Execute Store
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
\n"""

# line indices to replace: from 410 to 862
new_lines = lines[:410] + [new_content] + lines[863:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print("Replaced OperationsPanel.")
