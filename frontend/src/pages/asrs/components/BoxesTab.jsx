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
        width: '100%',
        height: '100%',
        border: '1px dashed var(--border)',
        borderRadius: '4px',
        background: 'var(--bg-tertiary)'
      }} />
    );
  }

  const CAPACITY = 6;
  const fillRatio = Math.min((box.filled_count || 0) / CAPACITY, 1);
  const filledCount = box.filled_count || 0;
  const isFull = filledCount === CAPACITY;
  const isEmpty = filledCount === 0;
  const isBusy = active; // LED state from WebSocket (may be delayed visually)
  const isBlinking = isSourceBlinking; // Frontend-only source departure visual

  // Eligibility based on mode
  const canStore = operationMode === 'store' && filledCount < CAPACITY;
  const canRetrieve = operationMode === 'retrieve' && filledCount > 0;
  const canInteract = canStore || canRetrieve;

  // Color logic
  const isLocked = (operationMode === 'store' && isFull) || (operationMode === 'retrieve' && isEmpty);

  return (
    <div
      onClick={onClick}
      style={{
        width: '100%',
        height: '100%',
        // Background: True white for cells, slight tint for selection
        background: isSelected ? '#fafaff' : 'var(--bg-primary)',
        // Border Strategy: dashed for empty (open slot), solid for filled (container tension)
        border: isEmpty
          ? '1.5px dashed var(--border)' // Empty = available slot
          : isSelected
            ? '2.5px solid #6366f1' // Selection = distinct indigo
            : active
              ? '2.5px solid var(--primary)' // Active = amber
              : isBlinking
                ? '2.5px solid var(--warning)' // Blinking = departure
                : '2px solid var(--text-muted)', // Filled = heavier border
        borderRadius: '6px',
        position: 'relative',
        overflow: 'hidden',
        cursor: canInteract ? 'pointer' : 'default',
        opacity: canInteract || isBusy || isBlinking ? 1 : 0.6,
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        // Shadow: Stronger for selection, elevated for filled, minimal for empty
        boxShadow: isSelected
          ? '0 4px 16px rgba(99, 102, 241, 0.2), 0 2px 6px rgba(0,0,0,0.1)' // Detach from grid
          : active
            ? 'var(--shadow-lg), 0 0 0 1px var(--primary)'
            : isBlinking
              ? 'var(--shadow-lg), 0 0 8px var(--warning)'
              : canInteract
                ? 'var(--shadow)'
                : 'var(--shadow-sm)',
        animation: isBlinking ? 'sourceBlink 0.4s ease-in-out' : 'none'
      }}
      onMouseEnter={(e) => {
        if (!isBlinking && !isSelected) {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-elevated)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isBlinking && !isSelected) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = active
            ? 'var(--shadow-lg), 0 0 0 1px var(--primary)'
            : 'var(--shadow)';
        }
      }}
    >

      {/* Volume-style fill indicator - Stronger visual weight */}
      {filledCount > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${fillRatio * 100}%`,
            background: isLocked
              ? 'rgba(5, 150, 105, 0.18)' // Increased opacity
              : 'rgba(8, 145, 178, 0.18)',
            borderTop: `2px solid ${isLocked ? 'rgba(5, 150, 105, 0.4)' : 'rgba(8, 145, 178, 0.4)'}`, // Stronger border
            borderRadius: '0 0 4px 4px',
            transition: 'height 0.3s ease, background 0.2s ease, border-color 0.2s ease',
            zIndex: 1
          }}
        />
      )}

      {/* Active/Busy state overlay */}
      {isBusy && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(249, 115, 22, 0.08)',
            border: '2px solid var(--primary)',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
            zIndex: 2
          }}
        />
      )}

      {/* Box label and count */}
      <div style={{
        position: 'relative',
        zIndex: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.25rem',
        fontSize: '0.875rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        pointerEvents: 'none'
      }}>
        <div>{box.box_id}</div>
        {filledCount > 0 && (
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 700, // Bolder for numeric contrast
            color: 'var(--text-primary)', // Darker on filled cells
            background: 'var(--bg-elevated)',
            padding: '3px 8px',
            borderRadius: '10px',
            border: '1.5px solid var(--border)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {filledCount}/{CAPACITY}
          </div>
        )}
      </div>

      {/* LED indicator dot - Strong ON/OFF contrast for instant recognition */}
      <div style={{
        position: 'absolute',
        top: '4px',
        right: '4px',
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: rawLED ? 'var(--primary)' : '#d4d4d8', // Very muted grey OFF
        boxShadow: rawLED
          ? '0 0 8px var(--primary), 0 0 3px var(--primary), inset 0 0 2px rgba(255,255,255,0.5)' // Internal halo
          : 'inset 0 0 2px rgba(0,0,0,0.1)',
        zIndex: 4,
        transition: 'all 0.15s ease'
      }} />
    </div>
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
  const rows = [1, 2, 3, 4, 5, 6, 7];

  // Grid Specs matching ShuttleRail.jsx
  // const COL_WIDTH = 120; // Removed fixed width
  const HEADER_COL = 60;
  const GAP = 12;

  const [colWidth, setColWidth] = useState(120);
  const gridRef = useRef(null);

  useEffect(() => {
    if (!gridRef.current) return;

    const updateWidth = () => {
      if (gridRef.current) {
        const containerWidth = gridRef.current.offsetWidth;
        // Available width for 5 columns = Total - Header - (6 gaps: 1 before header? No, grid gap applies between tracks)
        // Tracks: Header | Col A | Col B | ... | Col E
        // Gaps: 1 | 2 | 3 | 4 | 5
        // Wait, grid-template-columns: Header Gap ColA Gap ...
        // Total Gaps = Number of tracks - 1 = 6 - 1 = 5 gaps.
        // Wait, there is a gap between Header and Col A.
        // And gap between A-B, B-C, C-D, D-E.
        // Total 5 gaps?
        // Header (1) + 5 Cols (5) = 6 Tracks.
        // Gaps = 5.
        // Also we have right padding/rail?
        // Let's stick to standard math:
        // Width = Header + 5*Col + 5*Gap.
        // 5*Col = Width - Header - 5*Gap.

        // Safety: ensure it doesn't get too small
        const calculatedWidth = (containerWidth - HEADER_COL - (GAP * 5)) / 5;
        setColWidth(Math.max(80, Math.floor(calculatedWidth)));
      }
    };

    const observer = new ResizeObserver(updateWidth);
    observer.observe(gridRef.current);

    // Initial call
    updateWidth();

    return () => observer.disconnect();
  }, []);

  // Create a map for quick lookup
  const boxMap = {};
  boxes.forEach((b) => {
    boxMap[`${b.column_name}${b.row_number}`] = b;
  });

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      borderRadius: '8px',
      border: '1px solid var(--border)',
      width: '100%',
      // maxWidth: '960px', // Removed to allow full width
      marginLeft: 'auto',
      marginRight: 'auto',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>

      {/* Rack Header - Segmented Control Mode Toggle */}
      <div style={{
        flexShrink: 0,
        padding: '12px 16px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)'
      }}>
        {/* Segmented Control - Apple/Industrial Style */}
        <div style={{
          display: 'inline-flex',
          background: 'var(--bg-tertiary)',
          borderRadius: '8px',
          padding: '3px',
          gap: '2px',
          border: '1px solid var(--border-light)'
        }}>
          <button
            onClick={() => setOperationMode('store')}
            style={{
              height: '38px',
              padding: '0 24px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '0.875rem',
              letterSpacing: '0.02em',
              color: operationMode === 'store' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: operationMode === 'store'
                ? 'var(--bg-elevated)'
                : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              textTransform: 'uppercase',
              boxShadow: operationMode === 'store' ? 'var(--shadow-inset), var(--shadow-sm)' : 'none',
              transform: operationMode === 'store' ? 'scale(0.98)' : 'scale(1)'
            }}
            onMouseEnter={(e) => {
              if (operationMode !== 'store') {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (operationMode !== 'store') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            Store
          </button>
          <button
            onClick={() => setOperationMode('retrieve')}
            style={{
              height: '38px',
              padding: '0 24px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '0.875rem',
              letterSpacing: '0.02em',
              color: operationMode === 'retrieve' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: operationMode === 'retrieve'
                ? 'var(--bg-elevated)'
                : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              textTransform: 'uppercase',
              boxShadow: operationMode === 'retrieve' ? 'var(--shadow-inset), var(--shadow-sm)' : 'none',
              transform: operationMode === 'retrieve' ? 'scale(0.98)' : 'scale(1)'
            }}
            onMouseEnter={(e) => {
              if (operationMode !== 'retrieve') {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (operationMode !== 'retrieve') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            Retrieve
          </button>
        </div>
      </div>

      {/* Rack Body - Grid and Shuttle (Darker canvas = Interactive Surface) */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '1.5rem 1rem',
        background: 'var(--bg-secondary)', // Visibly darker = "This is the interactive zone"
        display: 'flex',
        justifyContent: 'center'
      }}>

        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '2rem', // Reduce gap slightly
          width: '100%' // Ensure full usage
        }}>
          {/* Drop-off Point (isolated) */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            paddingTop: '80px', // Align with Row 1 (Header 40px + Gap + alignment)
            flexShrink: 0 // Prevent shrinking
          }}>
            <div style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Drop-Off
            </div>
            <div style={{
              width: '120px',
              height: '120px',
              background: 'var(--bg-elevated)',
              border: '2px dashed var(--border-dark)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              position: 'relative',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.3s ease'
            }}>
              {/* Icon/Symbol */}
              <div style={{
                fontSize: '2rem',
                color: 'var(--text-muted)'
              }}>
                ⇅
              </div>
              <div style={{
                fontSize: '0.65rem',
                fontWeight: '600',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'
              }}>
                Handoff<br />Station
              </div>
              {/* Status indicator */}
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--status-ok)',
                boxShadow: '0 0 6px var(--status-ok)'
              }} />
            </div>
          </div>

          {/* Grid Container */}
          <div
            ref={gridRef}
            style={{
              position: 'relative',
              marginRight: '20px',
              flexGrow: 1, // Allow growth
              maxWidth: '100%' // Ensure it doesn't overflow parent
            }}
          >

            <div
              id="rack-grid"
              style={{
                display: 'grid',
                // 60px Label + 5xDynamic Slots
                gridTemplateColumns: `${HEADER_COL}px repeat(5, ${colWidth}px)`,
                // 40px Header + 7x80px Shelves
                gridTemplateRows: `40px repeat(7, 80px)`,
                gap: `${GAP}px`,
                position: 'relative',
                zIndex: 1
              }}
            >

              {/* BACKGROUND RAILS - Absolutely positioned BEHIND grid items */}
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: -1,
                pointerEvents: 'none'
              }}>
                {/* Vertical Rails (between columns) */}
                {columns.map((col, i) => (
                  <div key={`v-rail-${i}`} style={{
                    position: 'absolute',
                    // Start after Header Col + (Col Width + Gap) * i
                    left: `${HEADER_COL + (i * (colWidth + GAP)) + GAP / 2 - 1}px`,
                    top: '40px',
                    bottom: 0,
                    width: '2px',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05))',
                    borderLeft: '1px dashed var(--border-dark)'
                  }} />
                ))}

                {/* Right-most Rail */}
                <div style={{
                  position: 'absolute',
                  left: '100%', // Position OUTSIDE the grid
                  marginLeft: '6px', // Gap from the last column
                  top: '40px',
                  bottom: 0,
                  width: '12px',
                  background: 'linear-gradient(90deg, #1e293b, #334155, #1e293b)',
                  borderRadius: '4px',
                  border: '1px solid rgba(0,0,0,0.5)',
                  boxShadow: 'inset 2px 0 4px rgba(0,0,0,0.5)'
                }} />
              </div>

              {/* Column headers */}
              <div></div>
              {columns.map((col) => (
                <div key={col} style={{
                  textAlign: 'center',
                  fontWeight: '800',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  background: 'var(--bg-elevated)',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-sm)',
                  borderBottom: '2px solid var(--border)'
                }}>
                  {col}
                </div>
              ))}

              {/* Rows */}
              {rows.map((row, rowIndex) => (
                <React.Fragment key={`row-frag-${row}`}>
                  {/* Row label */}
                  <div key={`label-${row}`} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '800',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    background: 'var(--bg-elevated)',
                    borderRadius: '4px',
                    borderRight: '2px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {row}
                  </div>

                  {/* Boxes */}
                  {columns.map((col) => {
                    const id = `${col}${row}`;
                    const box = boxMap[id];
                    const active = getEffectiveLEDState(id);
                    const rawLED = ledStates[id] || false;
                    const blinking = isSourceBlinking(id);
                    const isSelected = box && box.box_id === selectedBoxId;

                    return (
                      <div
                        key={id}
                        id={`cell-${id}`}
                        style={{ width: '100%', height: '100%' }}
                      >
                        <div
                          onMouseEnter={(e) => {
                            const canStore = operationMode === 'store' && box && box.filled_count < 6;
                            const canRetrieve = operationMode === 'retrieve' && box && box.filled_count > 0;
                            if (canStore || canRetrieve) {
                              e.currentTarget.style.transform = 'translateY(-3px)';
                              e.currentTarget.style.boxShadow = 'var(--shadow-elevated)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            position: 'relative'
                          }}
                        >
                          <BoxCard
                            box={box}
                            active={active}
                            rawLED={rawLED}
                            isSourceBlinking={blinking}
                            isSelected={isSelected}
                            onClick={() => box && setSelectedBox(box)}
                            operationMode={operationMode}
                          />
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>

            <ShuttleRail
              shuttle={shuttle}
              colWidth={colWidth}
              ledStates={ledStates}
              boxes={boxes}
              getEffectiveLEDState={getEffectiveLEDState}
              isSourceBlinking={isSourceBlinking}
            />
          </div>

          {/* Right Info Panel */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            paddingTop: '40px', // Align with top
            width: '180px'
          }}>
            {/* Stats Group */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>System Specs</div>
              <div>Rows: 7</div>
              <div>Columns: 5</div>
              <div>Capacity: 210 slots</div>
            </div>

            {/* Legend */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Legend</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: operationMode === 'store' ? 'var(--status-idle)' : 'var(--primary)',
                  boxShadow: operationMode === 'store'
                    ? '0 0 4px var(--status-idle)'
                    : '0 0 4px var(--primary)'
                }} />
                <span>{operationMode === 'store' ? 'Capacity' : 'Location'}</span>
              </div>
              {/* Add active state legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--status-ok)',
                  boxShadow: '0 0 6px var(--status-ok)'
                }} />
                <span>Active</span>
              </div>
            </div>

            {/* Operation Status */}
            {operationPhase !== 'IDLE' && (
              <div style={{
                marginTop: '1rem',
                padding: '12px',
                background: 'rgba(249, 115, 22, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(249, 115, 22, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}>
                <div style={{
                  fontSize: '0.65rem',
                  color: 'var(--primary)',
                  fontWeight: '700',
                  textTransform: 'uppercase'
                }}>
                  Status
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  fontWeight: '600'
                }}>
                  {operationPhase === 'ACKNOWLEDGEMENT' && 'Acknowledged'}
                  {operationPhase === 'SOURCE_DEPARTURE' && 'Departing'}
                  {operationPhase === 'PICKUP_TRANSIT' && 'En Route to Drop'}
                  {operationPhase === 'TRANSIT' && 'In Transit'}
                  {operationPhase === 'ARRIVAL' && 'Arriving'}
                </div>
              </div>
            )}
          </div>
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
