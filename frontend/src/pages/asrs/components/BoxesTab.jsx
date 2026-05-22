import React, { useState, useEffect, useRef } from 'react';
import BoxDetailsModal from './BoxDetailsModal';
import BoxService from '../services/boxService';
import ConfirmModal from './ConfirmModal';
import ShuttleRail from './ShuttleRail';

import { useLEDMonitoring } from '../hooks/useLEDMonitoring';
import { useOperationShadowState } from '../hooks/useOperationShadowState';
import { toast } from 'react-toastify';

function BoxesTab({ isServerConnected = false, ledStates = {}, shuttleState = null, ledConnected = false }) {

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
  const [subcompartments, setSubcompartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [boxToDelete, setBoxToDelete] = useState(null);
  const [selectedBox, setSelectedBox] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const connected = ledConnected;

  // Ref to hold the latest ledStates for use in background async polling intervals
  const ledStatesRef = useRef(ledStates);
  useEffect(() => {
    ledStatesRef.current = ledStates;
  }, [ledStates]);

  const handleStoreOperation = async (boxId, subId, itemId) => {
    // 1. Immediately minimize the bottom sheet
    setShowDetails(false);
    setSelectedBox(null);

    try {
      const SubCompartmentService = (await import('../services/subCompartmentService')).default;

      // 2. Dispatch API request
      await SubCompartmentService.addProduct({
        boxId,
        subId,
        itemId: Number(itemId)
      });

      // 3. Show persistent background transition toast
      toast.info('Store operation initiated. Shuttle dispatching...', { autoClose: false, toastId: 'store-wait' });

      // 4. Background transaction tracker
      const startTime = Date.now();
      const timeoutMs = 90000;
      const checkIntervalMs = 500;
      let hasTurnedOn = false;

      const intervalId = setInterval(() => {
        const isLedOn = ledStatesRef.current[boxId];

        // Detect LED turning on (Operation Started / Carriage at target)
        if (isLedOn) {
          hasTurnedOn = true;
        }

        const elapsed = Date.now() - startTime;

        // Reconcile and finish when LED turns off
        if (hasTurnedOn && !isLedOn) {
          clearInterval(intervalId);
          toast.dismiss('store-wait');
          toast.success('Item stored successfully');
          fetchBoxes();
        }

        if (elapsed > timeoutMs) {
          clearInterval(intervalId);
          toast.dismiss('store-wait');
          toast.error('Timeout: LED did not confirm completion');
        }
      }, checkIntervalMs);

    } catch (error) {
      console.error('Store operation error:', error);
      toast.dismiss('store-wait');
      toast.error(error.message || 'Failed to store item');
    }
  };

  const handleRetrieveOperation = async (boxId, subId, itemId) => {
    // 1. Immediately minimize the bottom sheet
    setShowDetails(false);
    setSelectedBox(null);

    try {
      const SubCompartmentService = (await import('../services/subCompartmentService')).default;

      // 2. Dispatch API request
      await SubCompartmentService.retrieveProduct({
        boxId,
        subId,
        itemId,
        quantity: 1
      });

      // 3. Show persistent background transition toast
      toast.info('Retrieve operation initiated. Shuttle dispatching...', { autoClose: false, toastId: 'retrieve-wait' });

      // 4. Background transaction tracker
      const startTime = Date.now();
      const timeoutMs = 90000;
      const checkIntervalMs = 500;
      let hasTurnedOn = false;

      const intervalId = setInterval(() => {
        const isLedOn = ledStatesRef.current[boxId];

        // Detect LED turning on (Operation Started / Carriage at target)
        if (isLedOn) {
          hasTurnedOn = true;
        }

        const elapsed = Date.now() - startTime;

        // Reconcile and finish when LED turns off
        if (hasTurnedOn && !isLedOn) {
          clearInterval(intervalId);
          toast.dismiss('retrieve-wait');
          toast.success('Item retrieved successfully');
          fetchBoxes();
        }

        if (elapsed > timeoutMs) {
          clearInterval(intervalId);
          toast.dismiss('retrieve-wait');
          toast.error('Timeout: LED did not confirm completion');
        }
      }, checkIntervalMs);

    } catch (error) {
      console.error('Retrieve operation error:', error);
      toast.dismiss('retrieve-wait');
      toast.error(error.message || 'Failed to retrieve item');
    }
  };

  const handleHomeShuttle = async () => {
    try {
      const API_BASE = `${import.meta.env.VITE_API_URL || "/api"}/control/asrs`;
      const res = await fetch(`${API_BASE}/home`, { method: "POST" });
      if (res.ok) {
        toast.info("Resetting shuttle to Home (A7)…");
      } else {
        toast.error("Failed to reset shuttle");
      }
    } catch {
      toast.error("Failed to reset shuttle");
    }
  };

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
      const [boxResponse, subResponse] = await Promise.all([
        BoxService.getAllBoxes(),
        import('../services/subCompartmentService').then(m => m.default.getAllSubCompartments())
      ]);

      const boxData = boxResponse.data?.data || boxResponse.data || boxResponse;
      setBoxes(boxData);

      const subData = subResponse.data?.data || subResponse.data || subResponse;
      setSubcompartments(subData);
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
      flexDirection: 'column',
      gap: '1rem',
      height: '100%',
      overflow: 'hidden',
      padding: '1rem 1.5rem',
      position: 'relative'
    }}>
      {/* Inject slideUp and fadeIn keyframes styles */}
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>

      {/* Main Grid View */}
      <div style={{
        flex: '1 1 auto',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <RackView
          boxes={boxes}
          subcompartments={subcompartments}
          ledStates={ledStates}
          getEffectiveLEDState={getEffectiveLEDState}
          isSourceBlinking={isSourceBlinking}
          setSelectedBox={(b) => {
            setSelectedBox(b);
            setShowDetails(true);
          }}
          shuttle={visualShuttle}
          operationPhase={operationPhase}
          selectedBoxId={selectedBox?.box_id}
          onHomeShuttle={handleHomeShuttle}
        />
      </div>

      {/* Sleek Bottom Panel - Operations */}
      {showDetails && selectedBox && (
        <OperationsPanel
          box={selectedBox}
          ledStates={ledStates}
          onClose={() => {
            setShowDetails(false);
            setSelectedBox(null);
          }}
          onRefresh={fetchBoxes}
          onStore={handleStoreOperation}
          onRetrieve={handleRetrieveOperation}
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

// Reusable Box Card Component - Industrial Storage Drawer Style with Capacity Visuals & Availability Highlighting
function BoxCard({ box, boxSubs = [], active, rawLED, onClick, isSourceBlinking, isSelected }) {
  if (!box) {
    return (
      <div style={{
        border: '1px dashed var(--border)',
        borderRadius: '4px',
        padding: '8px',
        height: '84px',
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
  const filledCount = boxSubs.filter(s => s.status === 'Occupied').length;
  const isEmpty = filledCount === 0;
  const isFull = filledCount === CAPACITY;
  const isBlinking = isSourceBlinking;

  // Compute highlight color based on percentage of subcompartment occupation
  const getHighlightColor = () => {
    if (isEmpty) return '#ef4444'; // Red if empty
    if (isFull) return '#10b981'; // Green if full
    if (filledCount <= 2) return '#f97316'; // Orange
    return '#eab308'; // Yellow
  };

  const highlightColor = getHighlightColor();

  const borderStyle = isSelected 
    ? '2px solid var(--primary)' 
    : `1px solid ${highlightColor}aa`;

  const shadowStyle = isSelected 
    ? `0 0 12px ${highlightColor}44`
    : `0 0 8px ${highlightColor}15`;

  const subLabels = ['a', 'b', 'c', 'd', 'e', 'f'];

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--bg-hover)',
        border: borderStyle,
        borderRadius: '4px',
        padding: '6px 8px',
        height: '84px',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'stretch',
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: shadowStyle,
        opacity: 1.0,
        width: '100%',
        overflow: 'hidden',
        gap: '6px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-elevated)';
        if (!isSelected) {
          e.currentTarget.style.borderColor = highlightColor;
          e.currentTarget.style.boxShadow = `0 0 12px ${highlightColor}33`;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)';
        if (!isSelected) {
          e.currentTarget.style.borderColor = `${highlightColor}aa`;
          e.currentTarget.style.boxShadow = shadowStyle;
        }
      }}
    >
      {/* Left Column: Metadata */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flex: 1,
        overflow: 'hidden',
        height: '100%'
      }}>
        {/* Row 1: Box ID and LED dot */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '4px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            color: isSelected ? 'var(--primary-light)' : 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            BOX-{box.row_number}0{box.column_name === 'A' ? '1' : box.column_name === 'B' ? '2' : box.column_name === 'C' ? '3' : box.column_name === 'D' ? '4' : '5'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            {isBlinking && (
              <span style={{ fontSize: '7px', color: 'var(--status-ok)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>ACC</span>
            )}
            <div style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: rawLED ? 'var(--status-ok)' : (isEmpty ? 'var(--border)' : 'var(--accent)'),
              boxShadow: rawLED ? '0 0 6px var(--status-ok)' : 'none',
              animation: isBlinking ? 'pulse 1s infinite' : 'none'
            }} />
          </div>
        </div>

        {/* Row 2: numeric representation */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: isEmpty ? 'var(--text-disabled)' : 'var(--text-secondary)',
          fontWeight: 600,
          lineHeight: 1.1
        }}>
          {filledCount}/6 UNITS
        </div>

        {/* Row 3: status badge */}
        <div>
          <span style={{
            fontSize: '8px',
            fontFamily: 'var(--font-mono)',
            padding: '1px 4px',
            borderRadius: '2px',
            background: `${highlightColor}12`,
            color: highlightColor,
            fontWeight: 700,
            border: `1px solid ${highlightColor}25`,
            letterSpacing: '0.02em',
            display: 'inline-block'
          }}>
            {isFull ? 'FULL' : isEmpty ? 'EMPTY' : 'PARTIAL'}
          </span>
        </div>
      </div>

      {/* Right Column: Vertical 3x2 minimap */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '3px',
        width: '24px',
        height: '100%',
        flexShrink: 0
      }}>
        {subLabels.map((label) => {
          const sub = boxSubs.find(s => s.sub_id === label);
          const isOccupied = sub?.status === 'Occupied';
          const cellColor = isOccupied ? '#10b981' : '#ef4444';
          
          return (
            <div
              key={label}
              title={`Sub ${label.toUpperCase()}: ${isOccupied ? 'Occupied' : 'Empty'}`}
              style={{
                borderRadius: '1px',
                background: cellColor,
                transition: 'background 250ms ease-out',
                boxShadow: isOccupied ? '0 0 4px rgba(16,185,129,0.3)' : 'none'
              }}
            />
          );
        })}
      </div>
    </button>
  );
}

// Grid View Component with Rack Container structure
function RackView({
  boxes,
  subcompartments = [],
  ledStates,
  getEffectiveLEDState,
  isSourceBlinking,
  setSelectedBox,
  shuttle,
  operationPhase,
  selectedBoxId,
  onHomeShuttle
}) {
  const columns = ['A', 'B', 'C', 'D', 'E'];
  const rows = [1, 2, 3, 4, 5, 6, 7]; // Render from top to bottom (1 -> 7)

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
          <button
            type="button"
            onClick={onHomeShuttle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--primary-dark)',
              border: '1px solid var(--primary)',
              color: 'var(--primary-light)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '3px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              transition: 'all 150ms ease-out',
              marginRight: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary)';
              e.currentTarget.style.color = 'var(--bg-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--primary-dark)';
              e.currentTarget.style.color = 'var(--primary-light)';
            }}
            title="Dispatch shuttle to Home A7"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>home</span>
            Home Shuttle
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Full</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#ef4444' }} />
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
        paddingBottom: selectedBoxId ? '370px' : '16px',
        transition: 'padding-bottom 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'auto',
        background: 'var(--bg-secondary)',
        backgroundImage: 'radial-gradient(var(--bg-hover) 1px, transparent 0)',
        backgroundSize: '20px 20px',
        backgroundPosition: '-10px -10px'
      }}>
        <div 
          id="asrs-rack-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'min-content repeat(5, 1fr)',
            gap: '8px',
            minWidth: '800px',
            width: '100%',
            position: 'relative'
          }}
        >
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

          {/* Row 0 / Handoff Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            color: '#06b6d4',
            borderRight: '1px solid var(--border)',
            whiteSpace: 'nowrap'
          }}>HANDOFF</div>

          {/* Column A Row 0 (Handoff Zone) */}
          <div 
            id="asrs-cell-DROP_OFF"
            style={{ 
              position: 'relative',
              background: 'linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(6,182,212,0.02) 100%)',
              border: '2px dashed #06b6d4',
              borderRadius: '4px',
              height: '84px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 10px rgba(6,182,212,0.15)',
              overflow: 'hidden',
              width: '100%'
            }}
          >
            {/* Caution stripes at top of Handoff Station */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'repeating-linear-gradient(45deg, #06b6d4, #06b6d4 10px, transparent 10px, transparent 20px)'
            }} />
            <span className="material-symbols-outlined" style={{ color: '#06b6d4', fontSize: '20px', marginBottom: '2px' }}>swap_horiz</span>
            <span style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: '#06b6d4',
              letterSpacing: '0.05em'
            }}>HANDOFF ZONE</span>
            <span style={{
              fontSize: '7px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-disabled)',
              marginTop: '1px'
            }}>[A0 DOCK]</span>
          </div>

          {/* Spacer rails for Column B to E in Row 0 */}
          <div style={{ gridColumn: 'span 4', display: 'flex', alignItems: 'center', paddingLeft: '16px' }}>
            <div style={{
              width: '100%',
              height: '2px',
              background: 'repeating-linear-gradient(90deg, var(--border) 0, var(--border) 8px, transparent 8px, transparent 16px)',
              opacity: 0.4
            }} />
          </div>

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
                
                // Get subcompartments for this specific box
                const boxSubs = subcompartments.filter(s => s.box_id === id);
                
                return (
                  <div key={id} id={`asrs-cell-${id}`} style={{ position: 'relative' }}>
                    <BoxCard
                      box={box}
                      boxSubs={boxSubs}
                      active={active}
                      rawLED={rawLED}
                      isSourceBlinking={blinking}
                      isSelected={isSelected}
                      onClick={() => box && setSelectedBox(box)}
                    />
                  </div>
                );
              })}
            </React.Fragment>
          ))}

          {/* Visual Shuttle Carriage Motion Overlay */}
          <ShuttleRail shuttle={shuttle} />
        </div>
      </div>
    </div>
  );
}

function OperationsPanel({ box, ledStates, onClose, onRefresh, onStore, onRetrieve }) {
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [subCompartments, setSubCompartments] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [loading, setLoading] = useState(false);

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

  const handleStore = async () => {
    if (!selectedSubId) {
      toast.error('Please select a subcompartment');
      return;
    }
    if (!selectedItemId) {
      toast.error('Please select an item to store');
      return;
    }
    setLoading(true);
    await onStore(box.box_id, selectedSubId, selectedItemId);
    setLoading(false);
  };

  const handleRetrieve = async () => {
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

    setLoading(true);
    await onRetrieve(box.box_id, selectedSubId, selectedSub.item_id);
    setLoading(false);
  };

  const filledCount = subCompartments.filter(s => s.status === 'Occupied').length;
  const totalCount = 6;
  const isEmpty = filledCount === 0;
  const isFull = filledCount === totalCount;

  const getStatusInfo = () => {
    if (isEmpty) return { color: '#ef4444', text: '#ffffff', name: 'EMPTY' };
    if (isFull) return { color: '#10b981', text: '#ffffff', name: 'FULL' };
    if (filledCount <= 2) return { color: '#f97316', text: '#ffffff', name: 'PARTIAL' };
    return { color: '#eab308', text: '#1c1917', name: 'PARTIAL' };
  };

  const statusInfo = getStatusInfo();
  
  const colName = box.column_name;
  const colNum = colName === 'A' ? '1' : colName === 'B' ? '2' : colName === 'C' ? '3' : colName === 'D' ? '4' : '5';
  const boxName = `BOX-${box.row_number}0${colNum}`;

  const selectedSub = subCompartments.find(s => s.sub_id === selectedSubId);
  const isSelectedOccupied = selectedSub ? !!selectedSub.item_id : false;

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '350px',
      background: 'var(--bg-elevated)',
      borderTop: '1px solid var(--border)',
      boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '12px',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      {/* Top Ribbon Header */}
      <div style={{
        padding: '12px 16px',
        background: statusInfo.color,
        color: statusInfo.text,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '48px',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>inventory_2</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.05em'
          }}>
            {boxName} • {statusInfo.name} ({filledCount}/{totalCount} OCCUPIED)
          </span>
        </div>
        
        <button
          onClick={onClose}
          style={{
            color: 'inherit',
            background: 'rgba(0,0,0,0.08)',
            border: 'none',
            padding: '4px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 150ms ease-out'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.15)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
        </button>
      </div>

      {/* Main Panel Content */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        background: 'var(--bg-primary)'
      }}>
        {/* Left Side: 2x3 Grid of Subcompartments */}
        <div style={{
          flex: '1 1 50%',
          padding: '16px',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          overflowY: 'auto'
        }}>
          <h4 style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '10px',
            fontWeight: 700
          }}>Select Subcompartment Slot</h4>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            maxWidth: '340px',
            width: '100%',
            margin: '0 auto'
          }}>
            {['a', 'b', 'c', 'd', 'e', 'f'].map((label) => {
              const sub = subCompartments.find((s) => s.sub_id === label);
              const isOccupied = sub ? !!sub.item_id : false;
              const isSelected = selectedSubId === label;

              return (
                <div
                  key={label}
                  onClick={() => {
                    setSelectedSubId(label);
                    if (!isOccupied) {
                      setSelectedItemId(null);
                    }
                  }}
                  style={{
                    border: isSelected
                      ? '2px solid var(--primary)'
                      : isOccupied
                        ? '1px solid #10b981'
                        : '1px dashed var(--border)',
                    background: isSelected
                      ? 'var(--bg-hover)'
                      : isOccupied
                        ? 'rgba(16,185,129,0.04)'
                        : 'var(--bg-secondary)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '80px',
                    cursor: 'pointer',
                    transition: 'all 150ms ease-out',
                    position: 'relative',
                    boxShadow: isSelected ? '0 0 10px rgba(249,115,22,0.15)' : 'none'
                  }}
                >
                  {isOccupied && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: '#10b981', borderRadius: '6px 6px 0 0' }} />
                  )}
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: isSelected ? 'var(--primary-light)' : 'var(--text-secondary)',
                      fontWeight: 700
                    }}>
                      SUB-{box.column_name}{box.row_number}{label.toUpperCase()}
                    </span>
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isOccupied ? '#10b981' : 'transparent',
                      border: isOccupied ? 'none' : '1px solid var(--border)',
                      boxShadow: isOccupied ? '0 0 6px #10b981' : 'none'
                    }} />
                  </div>
                  
                  <div style={{
                    fontSize: '10px',
                    color: isOccupied ? 'var(--text-primary)' : 'var(--text-disabled)',
                    fontWeight: isOccupied ? 600 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '4px'
                  }}>
                    {isOccupied ? (sub.item_name || 'Item') : 'EMPTY'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Binary Tab Changing UI */}
        <div style={{
          flex: '1 1 50%',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: 'var(--bg-secondary)',
          overflowY: 'auto'
        }}>
          {!selectedSubId ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: 'var(--text-muted)',
              height: '100%',
              gap: '8px'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '36px', opacity: 0.4 }}>click_to_select</span>
              <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, fontWeight: 700 }}>
                SELECT A SLOT TO OPERATE
              </p>
              <p style={{ fontSize: '11px', margin: 0, maxWidth: '260px' }}>
                Binary subcompartment logic determines actions automatically: empty slots allow storing, occupied slots allow retrieving.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              justifyContent: 'space-between',
              animation: 'fadeIn 0.25s ease-out'
            }}>
              <div>
                {/* Active Tab Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '8px',
                  marginBottom: '16px'
                }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    SLOT: {box.column_name}{box.row_number}{selectedSubId.toUpperCase()}
                  </span>
                  
                  <span style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    background: isSelectedOccupied ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: isSelectedOccupied ? '#10b981' : '#ef4444',
                    border: `1px solid ${isSelectedOccupied ? '#10b98133' : '#ef444433'}`,
                    fontWeight: 700
                  }}>
                    {isSelectedOccupied ? 'OCCUPIED' : 'EMPTY'}
                  </span>
                </div>

                {/* Binary Tab Content */}
                {!isSelectedOccupied ? (
                  /* Store Tab Panel */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                      Slot is empty. Select an inventory item below to dispatch the shuttle for a <strong>Store</strong> operation.
                    </p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Inventory Product
                      </label>
                      <select
                        value={selectedItemId || ''}
                        onChange={(e) => setSelectedItemId(e.target.value)}
                        disabled={loading}
                        style={{
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          padding: '10px',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          width: '100%',
                          outline: 'none',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        <option value="">Select item...</option>
                        {items.map(item => (
                          <option key={item.item_id} value={item.item_id}>
                            [{item.item_id}] {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  /* Retrieve Tab Panel */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                      Slot is occupied. Click retrieve to dispatch the shuttle to execute a <strong>Retrieve</strong> operation.
                    </p>
                    
                    <div style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Current Contents
                      </span>
                      <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>
                        {selectedSub?.item_name || 'Unknown Item'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        ITEM ID: #{selectedSub?.item_id}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button Container */}
              <div style={{ marginTop: '16px' }}>
                {!isSelectedOccupied ? (
                  <button
                    onClick={handleStore}
                    disabled={!selectedItemId || loading}
                    style={{
                      background: 'var(--primary)',
                      color: 'var(--bg-primary)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      width: '100%',
                      cursor: (!selectedItemId || loading) ? 'not-allowed' : 'pointer',
                      opacity: (!selectedItemId || loading) ? 0.5 : 1,
                      transition: 'all 150ms ease-out',
                      boxShadow: selectedItemId && !loading ? '0 4px 12px rgba(249,115,22,0.2)' : 'none'
                    }}
                  >
                    {loading ? 'Executing Store...' : 'Execute Store'}
                  </button>
                ) : (
                  <button
                    onClick={handleRetrieve}
                    disabled={loading}
                    style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      width: '100%',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.5 : 1,
                      transition: 'all 150ms ease-out',
                      boxShadow: !loading ? '0 4px 12px rgba(239,68,68,0.2)' : 'none'
                    }}
                  >
                    {loading ? 'Executing Retrieve...' : 'Execute Retrieve'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BoxesTab;
