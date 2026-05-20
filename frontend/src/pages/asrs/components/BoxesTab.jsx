import React, { useState, useEffect, useRef } from 'react';
import BoxService from '../services/boxService';
import SubCompartmentService from '../services/subCompartmentService';
import ItemService from '../services/itemService';
import ConfirmModal from './ConfirmModal';

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
  const [subcompartmentsMap, setSubcompartmentsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [boxToDelete, setBoxToDelete] = useState(null);
  const [selectedBox, setSelectedBox] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
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

      try {
        const subResponse = await SubCompartmentService.getAllSubCompartments();
        const subData = subResponse.data || subResponse || [];
        const map = {};
        subData.forEach(sub => {
          if (!map[sub.box_id]) {
            map[sub.box_id] = [];
          }
          map[sub.box_id].push(sub);
        });
        setSubcompartmentsMap(map);
      } catch (subError) {
        console.error('Error fetching subcompartments in fetchBoxes:', subError);
      }
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
          operationPhase={operationPhase}
          selectedBoxId={selectedBox?.box_id}
          pendingOperation={pendingOperation}
          shuttleState={shuttleState}
          subcompartmentsMap={subcompartmentsMap}
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
function BoxCard({ box, active, rawLED, onClick, operationMode, isSourceBlinking, isSelected, isWorking, subcompartments = [] }) {
  if (!box) {
    return (
      <div style={{
        border: '1px dashed var(--border)',
        borderRadius: '4px',
        padding: '8px',
        height: '110px',
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

  const isMajorityFilled = filledCount >= 3;
  const boxThemeColor = isMajorityFilled ? 'rgba(121, 218, 166, 0.6)' : 'rgba(239, 68, 68, 0.6)';
  const boxThemeColorHover = isMajorityFilled ? 'rgba(121, 218, 166, 0.85)' : 'rgba(239, 68, 68, 0.85)';
  const boxGlowColor = isMajorityFilled ? 'rgba(121, 218, 166, 0.15)' : 'rgba(239, 68, 68, 0.15)';

  // Base background
  const baseBackground = isWorking
    ? 'linear-gradient(135deg, rgba(35, 12, 12, 0.95), rgba(20, 8, 8, 0.95))'
    : 'var(--bg-hover)';

  // Highlighting styles based on majority subcompartment color (green/red)
  const borderStyle = isWorking
    ? '1px solid rgba(239, 68, 68, 0.9)'
    : isSelected 
      ? '2px solid var(--primary)' 
      : `1px solid ${boxThemeColor}`;

  const shadowStyle = isWorking
    ? '0 0 15px rgba(239, 68, 68, 0.35), inset 0 0 10px rgba(239, 68, 68, 0.1)'
    : isBlinking 
      ? `inset 0 0 20px ${isMajorityFilled ? 'rgba(121,218,166,0.15)' : 'rgba(239,68,68,0.15)'}` 
      : isSelected 
        ? '0 0 8px rgba(188,199,221,0.2)' 
        : `0 0 8px ${boxGlowColor}`;

  const opacityStyle = 1.0;

  return (
    <button
      onClick={onClick}
      style={{
        background: baseBackground,
        border: borderStyle,
        borderRadius: '4px',
        padding: '8px',
        height: '110px',
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
          e.currentTarget.style.borderColor = boxThemeColorHover;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBackground;
        if (!isSelected && !isWorking) {
          e.currentTarget.style.borderColor = boxThemeColor;
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
          ) : isSelected && (
            <span style={{ 
              fontSize: '8px', 
              color: 'var(--primary)', 
              fontWeight: 800, 
              fontFamily: 'var(--font-mono)',
              border: '1px solid rgba(188,199,221,0.3)',
              padding: '1px 4px',
              borderRadius: '2px',
              background: 'rgba(188,199,221,0.08)',
              letterSpacing: '0.05em'
            }}>
              SELECTED
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
                : (isMajorityFilled ? 'var(--status-ok)' : 'var(--status-error)'),
            boxShadow: isWorking
              ? '0 0 10px #ef4444'
              : rawLED 
                ? '0 0 8px var(--status-ok)' 
                : `0 0 6px ${isMajorityFilled ? 'var(--status-ok)' : 'var(--status-error)'}`,
            animation: (isWorking || isBlinking) ? 'pulse 1s infinite' : 'none'
          }} />
        </div>
      </div>

      {/* Middle row: 3x2 grid of subcompartment cells */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '4px',
        width: '100%',
        margin: '4px 0'
      }}>
        {['a', 'b', 'c', 'd', 'e', 'f'].map((label) => {
          const sub = subcompartments.find(s => s.sub_id === label);
          const isOccupied = sub?.item_id || sub?.status === 'Occupied';
          return (
            <div
              key={label}
              style={{
                height: '14px',
                borderRadius: '2px',
                border: isOccupied 
                  ? '1px solid rgba(121, 218, 166, 0.6)' 
                  : '1px solid rgba(239, 68, 68, 0.4)',
                background: isOccupied 
                  ? 'rgba(121, 218, 166, 0.15)' 
                  : 'rgba(239, 68, 68, 0.1)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 4px',
                boxSizing: 'border-box'
              }}
            >
              <span style={{
                fontSize: '7.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: isOccupied ? 'rgba(121, 218, 166, 0.85)' : 'rgba(239, 68, 68, 0.8)',
                lineHeight: 1
              }}>
                {label.toUpperCase()}
              </span>
              <div style={{
                width: '3.5px',
                height: '3.5px',
                borderRadius: '50%',
                background: isOccupied ? 'var(--status-ok)' : 'var(--status-error)',
                boxShadow: isOccupied ? '0 0 3px var(--status-ok)' : '0 0 3px var(--status-error)'
              }} />
            </div>
          );
        })}
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
            background: 'rgba(255, 180, 171, 0.15)',
            color: 'var(--status-error)',
            fontWeight: 700
          }}>
            EMPTY
          </span>
        ) : (
          <span style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            padding: '1px 4px',
            borderRadius: '2px',
            background: isMajorityFilled ? 'rgba(121, 218, 166, 0.12)' : 'rgba(255, 180, 171, 0.15)',
            color: isMajorityFilled ? 'var(--status-ok)' : 'var(--status-error)',
            fontWeight: 700
          }}>
            {isMajorityFilled ? 'ACTIVE' : 'PARTIAL'}
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
  shuttleState,
  subcompartmentsMap = {}
}) {
  const columns = ['A', 'B', 'C', 'D', 'E'];
  const rows = [1, 2, 3, 4, 5, 6, 7]; // Render from top to bottom (1 -> 7)

  // Create a map for quick lookup
  const boxMap = {};
  boxes.forEach((b) => {
    boxMap[`${b.column_name}${b.row_number}`] = b;
  });

  const gridRef = React.useRef(null);
  const cellRefs = React.useRef({});
  const [trolleyPos, setTrolleyPos] = React.useState({ top: 0, left: 0, width: 0, height: 0, visible: false });

  React.useEffect(() => {
    const updateTrolley = () => {
      const activeCol = shuttle?.col;
      const activeRow = shuttle?.row;
      // Default to DROP_OFF if row is 0 or if there is no col/row (like startup)
      const activeId = (activeRow === 0 || activeCol === 'DROP_OFF' || !activeCol) ? 'DROP_OFF' : `${activeCol}${activeRow}`;
      
      const cellEl = cellRefs.current[activeId];
      const gridEl = gridRef.current;
      if (cellEl && gridEl) {
        const cellRect = cellEl.getBoundingClientRect();
        const gridRect = gridEl.getBoundingClientRect();
        setTrolleyPos({
          top: cellRect.top - gridRect.top + gridEl.scrollTop,
          left: cellRect.left - gridRect.left + gridEl.scrollLeft,
          width: cellRect.width,
          height: cellRect.height,
          visible: true
        });
      } else {
        setTrolleyPos(prev => ({ ...prev, visible: false }));
      }
    };

    // Run immediately
    updateTrolley();

    window.addEventListener('resize', updateTrolley);
    const gridEl = gridRef.current;
    if (gridEl) {
      gridEl.addEventListener('scroll', updateTrolley);
    }
    
    // Check multiple times to handle dynamic loading and layout updates
    const timers = [
      setTimeout(updateTrolley, 100),
      setTimeout(updateTrolley, 300),
      setTimeout(updateTrolley, 600),
      setTimeout(updateTrolley, 1000)
    ];

    return () => {
      window.removeEventListener('resize', updateTrolley);
      if (gridEl) {
        gridEl.removeEventListener('scroll', updateTrolley);
      }
      timers.forEach(t => clearTimeout(t));
    };
  }, [shuttle?.col, shuttle?.row, boxes]);

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
      <style>{`
        @keyframes mechanical-hum {
          0% { transform: translateY(0) scaleY(1); }
          25% { transform: translateY(-0.4px) scaleY(0.995); }
          50% { transform: translateY(0.2px) scaleY(1.002); }
          75% { transform: translateY(-0.2px) scaleY(0.998); }
          100% { transform: translateY(0) scaleY(1); }
        }
        @keyframes roller-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes lidar-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

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
      <div 
        ref={gridRef}
        style={{
          flex: 1,
          padding: '16px',
          overflow: 'auto',
          background: 'var(--bg-secondary)',
          backgroundImage: 'radial-gradient(var(--bg-hover) 1px, transparent 0)',
          backgroundSize: '20px 20px',
          backgroundPosition: '-10px -10px',
          position: 'relative'
        }}
      >
        <div style={{
          display: 'flex',
          gap: '24px',
          alignItems: 'stretch',
          minWidth: '950px',
          width: '100%',
          position: 'relative'
        }}>
          {/* Handoff Conveyor / Docking Station */}
          <div 
            ref={el => cellRefs.current['DROP_OFF'] = el}
            style={{
              width: '140px',
              background: 'var(--bg-tertiary)',
              border: '2px dashed var(--border)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              boxSizing: 'border-box',
              position: 'relative',
              boxShadow: 'inset 0 0 15px rgba(0,0,0,0.2)',
              minHeight: '220px',
              alignSelf: 'end',
              marginBottom: '8px'
            }}
          >
            <div style={{
              position: 'absolute',
              top: '12px',
              bottom: '12px',
              width: '40px',
              borderLeft: '2px solid var(--border)',
              borderRight: '2px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              opacity: 0.75
            }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ width: '32px', height: '6px', background: 'var(--border)', borderRadius: '3px', border: '1px solid rgba(0,0,0,0.5)' }} />
              ))}
            </div>

            <div style={{
              zIndex: 1,
              background: 'rgba(15, 23, 42, 0.85)',
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              textAlign: 'center',
              backdropFilter: 'blur(4px)'
            }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--status-ok)', fontSize: '24px' }}>conveyor_belt</span>
              <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Handoff Bay
              </span>
              <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>
                [DROP_OFF]
              </span>
            </div>
          </div>

          {/* Main Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'min-content repeat(5, 1fr)',
            gap: '8px',
            flex: 1
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

                  const boxSubs = box ? (subcompartmentsMap[box.box_id] || []) : [];

                  return (
                    <div key={id} ref={el => cellRefs.current[id] = el} style={{ position: 'relative' }}>
                      <BoxCard
                        box={box}
                        active={active}
                        rawLED={rawLED}
                        isSourceBlinking={blinking}
                        isSelected={isSelected}
                        isWorking={isWorking}
                        onClick={() => box && setSelectedBox(box)}
                        operationMode={operationMode}
                        subcompartments={boxSubs}
                      />
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Smooth-glide Trolley Carriage overlay */}
        {trolleyPos.visible && (
          <div
            style={{
              position: 'absolute',
              top: `${trolleyPos.top}px`,
              left: `${trolleyPos.left}px`,
              width: `${trolleyPos.width}px`,
              height: `${trolleyPos.height}px`,
              pointerEvents: 'none',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'top 2.4s cubic-bezier(0.25, 0.1, 0.25, 1), left 2.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
              boxSizing: 'border-box'
            }}
          >
            {/* The ASRS Mechanical Trolley/Cart Assembly */}
            <div
              style={{
                position: 'absolute',
                bottom: '-8px', // Riding on the bottom cell rail
                width: '94px',
                height: '48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                animation: shuttle?.state === 'moving' ? 'mechanical-hum 0.12s linear infinite' : 'none'
              }}
            >
              {/* 1. Vertical Fork Lifting Prongs (Extends upwards behind the box slot) */}
              <div style={{
                position: 'absolute',
                bottom: '14px',
                width: '76px',
                height: '28px',
                display: 'flex',
                justifyContent: 'space-between',
                zIndex: 1
              }}>
                {/* Left Prong */}
                <div style={{
                  width: '5px',
                  height: '100%',
                  background: 'linear-gradient(90deg, #94a3b8 0%, #cbd5e1 50%, #475569 100%)',
                  border: '1px solid #334155',
                  borderRadius: '2px 2px 0 0',
                  boxShadow: '1px 0 3px rgba(0,0,0,0.3)'
                }} />
                {/* Right Prong */}
                <div style={{
                  width: '5px',
                  height: '100%',
                  background: 'linear-gradient(90deg, #94a3b8 0%, #cbd5e1 50%, #475569 100%)',
                  border: '1px solid #334155',
                  borderRadius: '2px 2px 0 0',
                  boxShadow: '-1px 0 3px rgba(0,0,0,0.3)'
                }} />
              </div>

              {/* 2. Crate / Cargo Box Load (Rendered when carrying or moving) */}
              {/* Only show load if shuttle is busy or moving to show it is transporting item */}
              {(shuttle?.state === 'moving' || shuttle?.state === 'busy') && (
                <div style={{
                  position: 'absolute',
                  bottom: '15px',
                  width: '46px',
                  height: '24px',
                  background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.25) 0%, rgba(234, 179, 8, 0.05) 100%)',
                  border: '1.5px solid #eab308',
                  borderRadius: '3px',
                  boxShadow: '0 0 12px rgba(234, 179, 8, 0.4), inset 0 0 6px rgba(234, 179, 8, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  backdropFilter: 'blur(1px)'
                }}>
                  {/* Crate reinforcing ribs */}
                  <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'space-around', padding: '2px' }}>
                    <div style={{ width: '2px', height: '100%', background: 'rgba(234, 179, 8, 0.5)' }} />
                    <div style={{ width: '2px', height: '100%', background: 'rgba(234, 179, 8, 0.5)' }} />
                    <div style={{ width: '2px', height: '100%', background: 'rgba(234, 179, 8, 0.5)' }} />
                  </div>
                </div>
              )}

              {/* 3. Horizontal Trolley Flatbed Chassis */}
              <div style={{
                width: '100%',
                height: '14px',
                background: 'linear-gradient(180deg, #475569 0%, #1e293b 100%)',
                border: '1.5px solid #64748b',
                borderRadius: '3px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.2)',
                position: 'relative',
                zIndex: 3,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center'
              }}>
                {/* Hazard Warning Stripes on Flatbed Center */}
                <div style={{
                  position: 'absolute',
                  left: '12px',
                  right: '12px',
                  height: '6px',
                  background: 'repeating-linear-gradient(-45deg, #eab308, #eab308 4px, #1e293b 4px, #1e293b 8px)',
                  opacity: 0.85,
                  borderRadius: '1px'
                }} />

                {/* Laser Headlights on bumper tips */}
                <div style={{
                  position: 'absolute',
                  left: '2px',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 0 6px #fff',
                  opacity: shuttle?.state === 'moving' ? 1 : 0.4
                }} />
                <div style={{
                  position: 'absolute',
                  right: '2px',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 0 6px #fff',
                  opacity: shuttle?.state === 'moving' ? 1 : 0.4
                }} />

                {/* Small pulsing status LED */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: shuttle?.state === 'moving' ? '#06b6d4' : '#10b981',
                  boxShadow: `0 0 6px ${shuttle?.state === 'moving' ? '#06b6d4' : '#10b981'}`
                }} />
              </div>

              {/* 4. Roller Wheels underneath (Locked to rail line) */}
              <div style={{
                width: '76px',
                height: '8px',
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0 4px'
              }}>
                {/* Left Wheel */}
                <div style={{
                  width: '12px',
                  height: '12px',
                  marginTop: '-4px',
                  borderRadius: '50%',
                  background: 'conic-gradient(from 0deg, #64748b, #1e293b, #64748b, #0f172a, #64748b)',
                  border: '1.5px solid #020617',
                  boxShadow: '0 2px 3px rgba(0,0,0,0.4)',
                  animation: shuttle?.state === 'moving' ? 'roller-spin 0.3s linear infinite' : 'none'
                }}>
                  {/* Wheel hub */}
                  <div style={{ margin: '3px auto 0 auto', width: '2px', height: '2px', borderRadius: '50%', background: '#cbd5e1' }} />
                </div>
                {/* Right Wheel */}
                <div style={{
                  width: '12px',
                  height: '12px',
                  marginTop: '-4px',
                  borderRadius: '50%',
                  background: 'conic-gradient(from 0deg, #64748b, #1e293b, #64748b, #0f172a, #64748b)',
                  border: '1.5px solid #020617',
                  boxShadow: '0 2px 3px rgba(0,0,0,0.4)',
                  animation: shuttle?.state === 'moving' ? 'roller-spin 0.3s linear infinite' : 'none'
                }}>
                  {/* Wheel hub */}
                  <div style={{ margin: '3px auto 0 auto', width: '2px', height: '2px', borderRadius: '50%', background: '#cbd5e1' }} />
                </div>
              </div>

              {/* 5. Overhead Target Telemetry Badge */}
              <div
                style={{
                  position: 'absolute',
                  top: '-24px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: shuttle?.state === 'moving' ? '#06b6d4' : '#10b981',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '8px',
                  fontWeight: 900,
                  padding: '2px 6px',
                  borderRadius: '3px',
                  border: `1px solid ${shuttle?.state === 'moving' ? 'rgba(6, 182, 212, 0.5)' : 'rgba(16, 185, 129, 0.5)'}`,
                  boxShadow: '0 3px 6px rgba(0,0,0,0.3)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.05em',
                  zIndex: 4,
                  backdropFilter: 'blur(2px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: shuttle?.state === 'moving' ? '#06b6d4' : '#10b981',
                  animation: shuttle?.state === 'moving' ? 'pulse 1s infinite' : 'none'
                }} />
                {shuttle?.row === 0 || shuttle?.col === 'DROP_OFF' || !shuttle?.col ? 'BAY-DROP_OFF' : `BAY-${shuttle.col}${shuttle.row}`}
              </div>
            </div>
          </div>
        )}
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
      const response = await ItemService.getAllItems();
      setItems(response.data || []);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const fetchSubCompartments = async () => {
    try {
      setLoading(true);
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

        {/* Modal Content (3x2 Grid) */}
        <div style={{
          padding: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
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
                onClick={() => setSelectedSubId(label)}
                style={{
                  border: isOccupied ? '1px solid rgba(121, 218, 166, 0.6)' : '1px solid rgba(239, 68, 68, 0.5)',
                  background: isOccupied ? 'rgba(121, 218, 166, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                  borderRadius: '4px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '128px',
                  position: 'relative',
                  cursor: 'pointer',
                  outline: isSelected ? '2px solid var(--primary)' : 'none',
                  transition: 'border-color 150ms, background-color 150ms'
                }}
              >
                <div style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '4px', 
                  background: isOccupied ? 'var(--status-ok)' : 'var(--status-error)', 
                  borderRadius: '4px 4px 0 0' 
                }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', marginTop: '4px' }}>
                  <span style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '12px', 
                    color: isOccupied ? 'rgba(121, 218, 166, 0.85)' : 'rgba(239, 68, 68, 0.8)', 
                    fontWeight: 700 
                  }}>
                    Sub {box.column_name}{box.row_number}{label.toUpperCase()}
                  </span>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isOccupied ? 'var(--status-ok)' : 'var(--status-error)',
                    border: 'none',
                    boxShadow: isOccupied ? '0 0 8px rgba(121,218,166,0.8)' : '0 0 8px rgba(239,68,68,0.8)'
                  }} />
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: isOccupied ? 'flex-start' : 'center', justifyContent: isOccupied ? 'flex-end' : 'center', height: '100%' }}>
                  {isOccupied ? (
                    <>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', margin: 0 }}>Contents</p>
                      <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.2, margin: 0 }}>{sub.item_name || 'Unknown Item'}</p>
                    </>
                  ) : (
                    <p style={{ fontSize: '11px', color: 'var(--status-error)', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Actions - Contextual Bottom Panel */}
        {selectedSubId ? (() => {
          const selectedSub = subCompartments.find((s) => s.sub_id === selectedSubId);
          const isSelectedOccupied = !!selectedSub?.item_id;

          if (isSelectedOccupied) {
            return (
              <div style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                background: 'rgba(239, 68, 68, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Selected subcompartment <strong style={{ color: 'var(--status-error)' }}>{box.column_name}{box.row_number}{selectedSubId.toUpperCase()}</strong> contains: <strong style={{ color: 'var(--text-primary)' }}>{selectedSub.item_name || 'Unknown Item'}</strong>
                </span>
                <button
                  onClick={handleRetrieveOperation}
                  disabled={loading}
                  style={{
                    background: 'var(--status-error)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.2)'
                  }}
                >
                  Execute Retrieve
                </button>
              </div>
            );
          } else {
            return (
              <div style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                background: 'rgba(121, 218, 166, 0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: 'auto' }}>
                  Store item in subcompartment <strong style={{ color: 'var(--status-ok)' }}>{box.column_name}{box.row_number}{selectedSubId.toUpperCase()}</strong>:
                </span>
                <select
                  value={selectedItemId || ''}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  disabled={loading}
                  style={{
                    width: '200px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
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
                    opacity: (!selectedItemId || loading) ? 0.5 : 1,
                    boxShadow: '0 0 8px rgba(121, 218, 166, 0.2)'
                  }}
                >
                  Execute Store
                </button>
              </div>
            );
          }
        })() : (
          <div style={{
            padding: '16px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '12px', color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select a subcompartment from the grid above to perform store/retrieve
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default BoxesTab;
