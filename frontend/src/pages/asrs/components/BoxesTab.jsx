import React, { useState, useEffect, useRef } from 'react';
import BoxDetailsModal from './BoxDetailsModal';
import BoxService from '../services/boxService';
import ConfirmModal from './ConfirmModal';

import { useLEDMonitoring } from '../hooks/useLEDMonitoring';
import { useOperationShadowState } from '../hooks/useOperationShadowState';
import { toast } from 'react-toastify';

function BoxesTab({ isServerConnected = false, ledStates = {}, shuttleState = null, ledConnected = false, operationMode: propOperationMode }) {

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
  const [localOperationMode, setLocalOperationMode] = useState('store');
  const operationMode = propOperationMode !== undefined ? propOperationMode : localOperationMode;
  const setOperationMode = propOperationMode !== undefined ? () => {} : setLocalOperationMode;
  const connected = ledConnected;

  // Frontend Operation Shadow State - decouples physical LED truth from visual storytelling
  const {
    getEffectiveLEDState,
    isSourceBlinking,
    visualShuttle,
    operationPhase,
    pendingOperation
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
          pendingOperation={pendingOperation}
          shuttleState={shuttleState}
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

// Reusable Box Card Component - Industrial Storage Drawer Style with Capacity Visuals & Availability Highlighting
function BoxCard({ box, active, rawLED, onClick, operationMode, isSourceBlinking, isSelected, isWorking }) {
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
  const isFull = filledCount === CAPACITY;
  const isBlinking = isSourceBlinking;

  // Determine availability based on current operation mode
  const isAvailable = operationMode === 'store' ? !isFull : !isEmpty;

  // Compute color based on capacity level for premium dashboard look
  const getCapacityColor = () => {
    if (isEmpty) return 'var(--text-disabled)';
    if (isFull) return 'var(--status-error)'; // Red when full
    if (filledCount >= 4) return 'var(--status-warn)'; // Orange/amber when almost full
    return 'var(--status-ok)'; // Green when low-to-mid capacity
  };

  // Base background
  const baseBackground = isWorking
    ? 'linear-gradient(135deg, rgba(35, 12, 12, 0.95), rgba(20, 8, 8, 0.95))'
    : 'var(--bg-hover)';

  // Availability highlight styles
  const borderStyle = isWorking
    ? '1px solid rgba(239, 68, 68, 0.9)'
    : isSelected 
      ? '1px solid var(--primary)' 
      : isAvailable 
        ? (operationMode === 'store' 
            ? '1px solid rgba(121, 218, 166, 0.6)'  // Emerald green border for store-available
            : '1px solid rgba(235, 165, 80, 0.6)')   // Amber orange border for retrieve-available
        : '1px solid var(--border)';

  const shadowStyle = isWorking
    ? '0 0 15px rgba(239, 68, 68, 0.35), inset 0 0 10px rgba(239, 68, 68, 0.1)'
    : isBlinking 
      ? 'inset 0 0 20px rgba(121,218,166,0.15)' 
      : isSelected 
        ? '0 0 8px rgba(188,199,221,0.2)' 
        : isAvailable 
          ? (operationMode === 'store'
              ? '0 0 8px rgba(121, 218, 166, 0.15)' 
              : '0 0 8px rgba(235, 165, 80, 0.15)')
          : 'none';

  const opacityStyle = isWorking ? 1.0 : (isAvailable ? 1.0 : 0.35);

  return (
    <button
      onClick={onClick}
      style={{
        background: baseBackground,
        border: borderStyle,
        borderRadius: '4px',
        padding: '8px',
        height: '80px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 150ms ease-out',
        boxShadow: shadowStyle,
        opacity: opacityStyle,
        width: '100%'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isWorking
          ? 'linear-gradient(135deg, rgba(45, 15, 15, 0.95), rgba(25, 10, 10, 0.95))'
          : 'var(--bg-elevated)';
        if (!isSelected && !isWorking) {
          e.currentTarget.style.borderColor = isAvailable
            ? (operationMode === 'store' ? 'rgba(121, 218, 166, 0.8)' : 'rgba(235, 165, 80, 0.8)')
            : 'var(--border-lighter)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBackground;
        if (!isSelected && !isWorking) {
          e.currentTarget.style.borderColor = isAvailable
            ? (operationMode === 'store' ? 'rgba(121, 218, 166, 0.6)' : 'rgba(235, 165, 80, 0.6)')
            : 'var(--border)';
        }
      }}
    >
      {/* Top row: Box ID and LED dot */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          fontWeight: 700,
          color: isWorking
            ? '#ff8080'
            : isSelected
              ? 'var(--primary-light)'
              : 'var(--text-primary)',
        }}>
          BOX-{box.row_number}0{box.column_name === 'A' ? '1' : box.column_name === 'B' ? '2' : box.column_name === 'C' ? '3' : box.column_name === 'D' ? '4' : '5'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isWorking ? (
            <span style={{ 
              fontSize: '8.5px', 
              color: '#ef4444', 
              fontWeight: 900, 
              fontFamily: 'var(--font-mono)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              padding: '1.5px 5px',
              borderRadius: '2.5px',
              background: 'rgba(239, 68, 68, 0.12)',
              letterSpacing: '0.06em',
              animation: 'pulse 1.2s infinite'
            }}>
              ACTIVE
            </span>
          ) : isAvailable && (
            <span style={{ 
              fontSize: '8px', 
              color: operationMode === 'store' ? 'var(--status-ok)' : 'var(--status-warn)', 
              fontWeight: 800, 
              fontFamily: 'var(--font-mono)',
              border: `1px solid ${operationMode === 'store' ? 'rgba(121, 218, 166, 0.3)' : 'rgba(235, 165, 80, 0.3)'}`,
              padding: '1px 4px',
              borderRadius: '2px',
              background: operationMode === 'store' ? 'rgba(121, 218, 166, 0.08)' : 'rgba(235, 165, 80, 0.08)',
              letterSpacing: '0.05em'
            }}>
              {operationMode === 'store' ? 'STORE OK' : 'STOCK'}
            </span>
          )}
          {isBlinking && (
            <span style={{ fontSize: '9px', color: 'var(--status-ok)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>ACCESS</span>
          )}
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isWorking
              ? '#ef4444'
              : rawLED 
                ? 'var(--status-ok)' 
                : (isEmpty ? 'var(--border)' : 'var(--accent)'),
            boxShadow: isWorking
              ? '0 0 10px #ef4444'
              : rawLED 
                ? '0 0 8px var(--status-ok)' 
                : 'none',
            animation: (isWorking || isBlinking) ? 'pulse 1s infinite' : 'none'
          }} />
        </div>
      </div>

      {/* Middle row: visual segmented progress representing 6 slots */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', margin: '2px 0' }}>
        <div style={{ display: 'flex', gap: '3px', width: '100%' }}>
          {Array.from({ length: CAPACITY }).map((_, idx) => {
            const isFilled = idx < filledCount;
            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  height: '6px',
                  borderRadius: '1px',
                  background: isFilled ? getCapacityColor() : 'rgba(255,255,255,0.05)',
                  border: isFilled ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  transition: 'background 200ms'
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom row: numeric representation / status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: isEmpty ? 'var(--text-disabled)' : 'var(--text-secondary)'
        }}>
          {filledCount} / {CAPACITY} UNITS
        </span>
        {isFull ? (
          <span style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            padding: '1px 4px',
            borderRadius: '2px',
            background: 'rgba(255, 180, 171, 0.15)',
            color: 'var(--status-error)',
            fontWeight: 700
          }}>
            FULL
          </span>
        ) : isEmpty ? (
          <span style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            padding: '1px 4px',
            borderRadius: '2px',
            background: 'rgba(255, 255, 255, 0.05)',
            color: 'var(--text-muted)',
            fontWeight: 500
          }}>
            EMPTY
          </span>
        ) : (
          <span style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            padding: '1px 4px',
            borderRadius: '2px',
            background: 'rgba(121, 218, 166, 0.08)',
            color: 'var(--status-ok)',
            fontWeight: 500
          }}>
            ACTIVE
          </span>
        )}
      </div>
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
  selectedBoxId,
  pendingOperation,
  shuttleState
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
                
                // Determine if this box is currently undergoing store or retrieve operation
                const isWorking = box && (
                  (pendingOperation && pendingOperation.targetCell === id) ||
                  (shuttleState?.command && shuttleState.command.startsWith(id)) ||
                  rawLED
                );

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
                      isWorking={isWorking}
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
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
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
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', margin: 0 }}>Contents</p>
                      <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.2, margin: 0 }}>{sub.item_name || 'Unknown Item'}</p>
                    </>
                  ) : (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>Empty</p>
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

export default BoxesTab;
