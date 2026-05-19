import React, { useState, useEffect, useRef } from 'react';
import BoxDetailsModal from './BoxDetailsModal';
import BoxService from '../services/boxService';
import ConfirmModal from './ConfirmModal';
import ShuttleRail from './ShuttleRail';
import { useLEDMonitoring } from '../hooks/useLEDMonitoring';
import { useOperationShadowState } from '../hooks/useOperationShadowState';
import { toast } from 'react-toastify';

function BoxesTab({ isServerConnected = false }) {

  // Open delete modal for a box
  const openDeleteModal = (boxId) => {
    setBoxToDelete(boxId);
    setIsDeleteModalOpen(true);
  };

  // Close delete modal
  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setBoxToDelete(null);
  };

  // Handle box deletion
  const handleDeleteBox = async (boxId) => {
    try {
      await BoxService.deleteBox(boxId);
      toast.success('Box deleted');
      fetchBoxes();
    } catch (error) {
      toast.error('Failed to delete box');
    } finally {
      closeDeleteModal();
    }
  };
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [boxToDelete, setBoxToDelete] = useState(null);
  const [selectedBox, setSelectedBox] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [operationMode, setOperationMode] = useState('store'); // 'store' | 'retrieve'
  const { ledStates, shuttleState, connected } = useLEDMonitoring();

  // Frontend Operation Shadow State - decouples physical LED truth from visual storytelling
  const {
    getEffectiveLEDState,
    isSourceBlinking,
    visualShuttle,
    operationPhase
  } = useOperationShadowState(ledStates, shuttleState);

  // Debug: Log when WebSocket data changes
  useEffect(() => {
    console.log('[BoxesTab] LED states updated:', ledStates);
  }, [ledStates]);

  useEffect(() => {
    console.log('[BoxesTab] Shuttle state updated:', shuttleState);
  }, [shuttleState]);

  useEffect(() => {
    console.log("BoxesTab useEffect called");
    fetchBoxes();
  }, []);

  const fetchBoxes = async () => {
    console.log("fetchBoxes called");
    try {
      setLoading(true);
      const response = await BoxService.getAllBoxes();

      // Backend now returns { success: true, data: [...] }
      const boxData = response.data.data || response.data;
      setBoxes(boxData);
    } catch (error) {
      if (error.response && error.response.status === 503) {
        toast.error('PLC/OPC UA server is offline or unreachable. Please check the connection.');
      } else {
        toast.error('Failed to fetch boxes');
      }
    } finally {
      setLoading(false);
    }
  };



  return (
    <div style={{
      display: 'flex',
      gap: '1.5rem',
      height: '100%',
      overflow: 'hidden',
      padding: '1rem 1.5rem'
    }}>
      {/* Main Grid View */}
      <div style={{
        flex: '1 1 auto',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <RackView
          boxes={boxes}
          ledStates={ledStates}
          getEffectiveLEDState={getEffectiveLEDState}
          isSourceBlinking={isSourceBlinking}
          setSelectedBox={(b) => {
            setSelectedBox(b);
            setShowDetails(true);
          }}
          shuttle={visualShuttle}
          operationMode={operationMode}
          setOperationMode={setOperationMode}
          operationPhase={operationPhase}
          selectedBoxId={selectedBox?.box_id}
        />
      </div>

      {/* Side Panel - Operations */}
      {showDetails && selectedBox && (
        <OperationsPanel
          box={selectedBox}
          ledStates={ledStates}
          onClose={() => {
            setShowDetails(false);
            setSelectedBox(null);
          }}
          onRefresh={fetchBoxes}
          operationMode={operationMode}
        />
      )}

      {/* Delete confirmation modal (keep this) */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setBoxToDelete(null);
        }}
        onConfirm={() => boxToDelete && handleDeleteBox(boxToDelete)}
        title="Delete Box"
      />
    </div>
  );
}

// Reusable Box Card Component - Industrial Storage Drawer Style
function BoxCard({ box, active, rawLED, onClick, operationMode, isSourceBlinking, isSelected }) {
  if (!box) {
    return (
      <div style={{
        border: '1px dashed var(--border)',
        borderRadius: '4px',
        padding: '8px',
        height: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.5
      }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>EMPTY</span>
      </div>
    );
  }

  const CAPACITY = 6;
  const filledCount = box.filled_count || 0;
  const isEmpty = filledCount === 0;
  const isBlinking = isSourceBlinking;

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--bg-hover)',
        border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
        borderRadius: '4px',
        padding: '8px',
        height: '80px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 150ms',
        boxShadow: isBlinking ? 'inset 0 0 20px rgba(121,218,166,0.15)' : 'none',
        width: '100%'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '14px',
        color: 'var(--text-primary)',
      }}>BOX-{box.row_number}0{box.column_name === 'A' ? '1' : box.column_name === 'B' ? '2' : box.column_name === 'C' ? '3' : box.column_name === 'D' ? '4' : '5'}</span>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: rawLED ? 'var(--status-ok)' : (isEmpty ? 'var(--border)' : 'var(--accent)'),
          boxShadow: rawLED ? '0 0 8px var(--status-ok)' : 'none',
          animation: isBlinking ? 'pulse 1s infinite' : 'none'
        }} />
        {isBlinking && (
          <span style={{ fontSize: '9px', color: 'var(--status-ok)', fontWeight: 700 }}>ACCESS</span>
        )}
      </div>

      {filledCount > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '4px',
          background: 'var(--status-ok)',
          opacity: 0.3
        }} />
      )}
    </button>
  );
}

// Grid View Component with Rack Container structure
function RackView({
  boxes,
  ledStates,
  getEffectiveLEDState,
  isSourceBlinking,
  setSelectedBox,
  shuttle,
  operationMode,
  setOperationMode,
  operationPhase,
  selectedBoxId
}) {
  const columns = ['A', 'B', 'C', 'D', 'E'];
  const rows = [7, 6, 5, 4, 3, 2, 1]; // Render from top to bottom (7 -> 1)

  // Create a map for quick lookup
  const boxMap = {};
  boxes.forEach((b) => {
    boxMap[`${b.column_name}${b.row_number}`] = b;
  });

  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: '4px',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      height: '100%',
      position: 'relative'
    }}>
      {/* Canvas Header */}
      <div style={{
        height: '32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: 'var(--bg-elevated)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>grid_view</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Primary Storage Matrix [Z-BAY 01]
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--bg-hover)', border: '1px solid var(--border)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Occupied</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', border: '1px dashed var(--border)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Empty</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--status-ok)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Shuttle</span>
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div style={{
        flex: 1,
        padding: '16px',
        overflow: 'auto',
        background: 'var(--bg-secondary)',
        backgroundImage: 'radial-gradient(var(--bg-hover) 1px, transparent 0)',
        backgroundSize: '20px 20px',
        backgroundPosition: '-10px -10px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'min-content repeat(5, 1fr)',
          gap: '8px',
          minWidth: '800px',
          width: '100%'
        }}>
          {/* Column Headers */}
          <div style={{ height: '24px' }} /> {/* Corner */}
          {columns.map(col => (
            <div key={col} style={{
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '4px'
            }}>COL {col}</div>
          ))}

          {/* Grid Cells */}
          {rows.map(row => (
            <React.Fragment key={`row-${row}`}>
              {/* Row Label */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                borderRight: '1px solid var(--border)'
              }}>LVL {row}</div>

              {/* Box Slots */}
              {columns.map(col => {
                const id = `${col}${row}`;
                const box = boxMap[id];
                const active = getEffectiveLEDState(id);
                const rawLED = ledStates[id] || false;
                const blinking = isSourceBlinking(id);
                const isSelected = box && box.box_id === selectedBoxId;
                
                // Overlay Shuttle if it's currently at this position
                const hasShuttle = shuttle && shuttle.position === id;

                return (
                  <div key={id} style={{ position: 'relative' }}>
                    <BoxCard
                      box={box}
                      active={active}
                      rawLED={rawLED}
                      isSourceBlinking={blinking}
                      isSelected={isSelected}
                      onClick={() => box && setSelectedBox(box)}
                      operationMode={operationMode}
                    />
                    {hasShuttle && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'var(--bg-primary)',
                        border: '2px solid var(--status-ok)',
                        borderRadius: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 15px rgba(121,218,166,0.2)',
                        zIndex: 10
                      }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--status-ok)', animation: 'pulse 1.5s infinite' }}>forklift</span>
                        <div style={{
                          position: 'absolute',
                          top: '-12px',
                          right: '-12px',
                          background: 'var(--status-ok)',
                          color: '#002112',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--status-ok)',
                          boxShadow: 'var(--shadow-lg)',
                          whiteSpace: 'nowrap',
                          fontWeight: 700
                        }}>
                          MOVING ({id})
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// Operations Panel Component - Side panel for store/retrieve operations
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
      // The operation takes about 60 seconds (30s source->drop + 30s drop->dest)
      toast.info('Operation in progress... Shuttle moving', { autoClose: false, toastId: 'store-wait' });

      const waitForLedOff = () => new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timeoutMs = 90000; // 90 seconds timeout (safe buffer for 60s operation)
        const checkIntervalMs = 500; // Check every 500ms
        let hasTurnedOn = false;

        const intervalId = setInterval(() => {
          const isLedOn = ledStatesRef.current[box.box_id];

          // 1. Detect LED turning ON (Operation Started)
          if (isLedOn) {
            hasTurnedOn = true;
          }

          // 2. Wait for LED to turn OFF (Operation Completed)
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
      toast.dismiss('store-wait'); // Dismiss the waiting toast
      toast.success('Item stored successfully');
      await fetchSubCompartments();
      onRefresh();
      setSelectedSubId(null);
      setSelectedItemId(null);
    } catch (error) {
      console.error('Store operation error:', error);
      toast.dismiss('store-wait'); // Dismiss the waiting toast on error
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

    // Find the selected subcompartment to get item details
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
        quantity: 1 // Always retrieve 1 item from subcompartment
      });

      // 2. Wait for LED to turn OFF (operation completed)
      // The operation takes about 60 seconds (30s dest->collect + 30s collect->drop)
      toast.info('Retrieving item... Shuttle moving', { autoClose: false, toastId: 'retrieve-wait' });

      const waitForLedOff = () => new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timeoutMs = 90000; // 90 seconds timeout
        const checkIntervalMs = 500; // Check every 500ms
        let hasTurnedOn = false;

        const intervalId = setInterval(() => {
          const isLedOn = ledStatesRef.current[box.box_id];

          // 1. Detect LED turning ON (Operation Started)
          if (isLedOn) {
            hasTurnedOn = true;
          }

          // 2. Wait for LED to turn OFF (Operation Completed)
          // Only finish if we saw it turn ON first, OR if we've waited a sensible grace period (e.g. 5s) 
          // and it's still OFF (maybe we missed the blip or it's a simulation artifact)
          const elapsed = Date.now() - startTime;
          const gracePeriodOver = elapsed > 5000;

          if (hasTurnedOn && !isLedOn) {
            clearInterval(intervalId);
            resolve();
          }
          // Fallback: If 5 seconds passed and it NEVER turned on, maybe we missed it? 
          // But user says it takes 30s to arrive. So we should NOT resolve early.
          // We will stick to strict "Wait for ON". If it never turns on, we timeout (correct behavior for failed op).

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

  const filledCount = subCompartments.filter(s => s.status === 'Occupied').length;
  const totalCount = subCompartments.length;

  return (
    <div style={{
      width: '380px',
      flexShrink: 0,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Header */}
      <div style={{
        padding: '1.25rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-secondary)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h3 style={{
              margin: 0,
              fontSize: '1.125rem',
              fontWeight: '700',
              color: 'var(--text-primary)'
            }}>
              Box {box.box_id}
            </h3>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: '700',
              color: operationMode === 'store' ? 'var(--primary)' : 'var(--warning)',
              background: operationMode === 'store' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(234, 179, 8, 0.1)',
              padding: '4px 10px',
              borderRadius: '12px',
              border: `1px solid ${operationMode === 'store' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {operationMode === 'store' ? 'Store' : 'Retrieve'}
            </span>
          </div>
          <p style={{
            margin: 0,
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            {filledCount}/{totalCount} Occupied
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: '0.25rem',
            lineHeight: 1,
            transition: 'color 0.15s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          ×
        </button>
      </div>
      {/* Subcompartments Grid */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '1rem'
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '200px',
            color: 'var(--text-muted)'
          }}>
            Loading...
          </div>
        ) : (
          <>
            {/* Item Selector for Store Mode */}
            {operationMode === 'store' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Select Item
                </label>
                <select
                  value={selectedItemId || ''}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">-- Choose an item --</option>
                  {items.map(item => (
                    <option key={item.item_id} value={item.item_id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.75rem'
            }}>
              {['a', 'b', 'c', 'd', 'e', 'f'].map((label) => {
                const sub = subCompartments.find((s) => s.sub_id === label);
                const hasItem = sub?.item_id;
                const isOccupied = !!hasItem;
                const isSelected = selectedSubId === label;

                // Filter based on mode
                const canStore = operationMode === 'store' && !hasItem;
                const canRetrieve = operationMode === 'retrieve' && hasItem;
                const isVisible = canStore || canRetrieve;

                if (!isVisible) return null;

                // Mode-specific colors - darker shades
                const modeColors = operationMode === 'retrieve'
                  ? {
                    background: isSelected ? 'rgba(5, 150, 105, 0.35)' : 'rgba(5, 150, 105, 0.2)',
                    borderColor: isSelected ? 'rgb(5, 150, 105)' : 'rgba(5, 150, 105, 0.6)',
                    boxShadow: isSelected ? '0 0 0 1px rgba(5, 150, 105, 0.7)' : 'none'
                  }
                  : {
                    background: isSelected ? 'rgba(234, 88, 12, 0.35)' : 'rgba(234, 88, 12, 0.2)',
                    borderColor: isSelected ? 'rgb(234, 88, 12)' : 'rgba(234, 88, 12, 0.6)',
                    boxShadow: isSelected ? '0 0 0 1px rgba(234, 88, 12, 0.7)' : 'none'
                  };

                return (
                  <div
                    key={label}
                    onClick={() => setSelectedSubId(label)}
                    style={{
                      padding: '1rem',
                      background: modeColors.background,
                      border: '1px solid',
                      borderColor: modeColors.borderColor,
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      boxShadow: modeColors.boxShadow
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = 'var(--border-dark)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = isOccupied ? 'rgba(5, 150, 105, 0.3)' : 'var(--border)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <span style={{
                        fontWeight: '700',
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)'
                      }}>
                        {label.toUpperCase()}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: '600',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        background: isOccupied
                          ? 'rgba(5, 150, 105, 0.15)'
                          : 'rgba(156, 163, 175, 0.15)',
                        color: isOccupied ? 'var(--success)' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        {isOccupied ? 'OCCUPIED' : 'EMPTY'}
                      </span>
                    </div>
                    {isOccupied && sub?.item_name && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        marginTop: '0.25rem'
                      }}>
                        {sub.item_name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Action Footer */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-secondary)'
      }}>
        <button
          onClick={operationMode === 'store' ? handleStoreOperation : handleRetrieveOperation}
          disabled={!selectedSubId || (operationMode === 'store' && !selectedItemId) || loading}
          className="btn btn-primary"
          style={{
            width: '100%',
            opacity: (selectedSubId && (operationMode === 'retrieve' || selectedItemId)) ? 1 : 0.5
          }}
        >
          {loading ? 'Processing...' : operationMode === 'store' ? 'Store Item' : 'Retrieve Item'}
        </button>
      </div>
    </div>
  );
}

export default BoxesTab;
