import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import AssemblyControlService from '../services/Assemblycontrol';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '../components/industrial-ui.css';
import PageHeader from '../components/PageHeader';
import { useTheme } from '../theme/ThemeContext';
import AssemblyStatusRibbon from './asrs/components/AssemblyStatusRibbon';
// recharts imports kept for future graph tab (currently commented out in render)
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function Assembly() {
  const { resolved: theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [lastCommand, setLastCommand] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [plantData, setPlantData] = useState(null);
  const [activeTab, setActiveTab] = useState('monitoring');

  // Smoothed position state for animation
  const [smoothedPosition, setSmoothedPosition] = useState(43);

  // Debug data tracking for graphs (last 100 points)
  const [rawDataPoints, setRawDataPoints] = useState([]);
  const [smoothedDataPoints, setSmoothedDataPoints] = useState([]);

  // WebSocket plot tracking
  const [plotData, setPlotData] = useState([]);
  const plotTimestampRef = useRef(0);
  const plotDataPointsRef = useRef([]);

  // Canvas refs for real-time plotting
  const rawCanvasRef = useRef(null);
  const smoothedCanvasRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const lastRenderUpdateRef = useRef(0);

  // Track previous safety state for edge-triggered toast alerts
  const prevSafetyRef = useRef({ curtain: false, buzzer: false });

  // ====== BEGIN: REAL HYDRAULIC DATA WEBSOCKET USAGE ======
  // WebSocket ref so reconnect logic can replace it without tearing down the effect
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const connectWS = useCallback(() => {
    // Derive WS base from VITE_WS_URL env var if set; otherwise use Vite proxy path.
    // In dev: Vite proxies /api/control/assembly/ws/** → ws://localhost:8000
    // In prod: set VITE_WS_URL=ws://your-server:8000 in frontend/.env
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
    const wsUrl = `${wsBase}/api/control/assembly/ws/hydraulic-data`;

    console.log('[Assembly] Connecting to hydraulic WS:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Assembly] Hydraulic WebSocket connected');
      setIsWsConnected(true);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      const now = performance.now();
      
      // Update data references for continuous data streams
      if (now - lastUpdateRef.current > 100) {
        setPlantData(data);
        setIsConnected(data.connected !== false);
        setLastCommand(data.assembly?.bearing ? 'Bearing ON' : 'Bearing OFF');
        lastUpdateRef.current = now;
      }

      // Edge-triggered safety alerts — only toast on rising edge (false → true)
      const prev = prevSafetyRef.current;
      if (data.safety?.curtain && !prev.curtain) {
        toast.error('⚠️ SAFETY CURTAIN TRIGGERED — Human presence detected!', {
          toastId: 'curtain-alert',
          autoClose: false,
          closeOnClick: false,
        });
      }
      if (data.safety?.buzzer && !prev.buzzer) {
        toast.error('🔔 BUZZER ACTIVE — Emergency condition!', {
          toastId: 'buzzer-alert',
          autoClose: false,
          closeOnClick: false,
        });
      }
      // Dismiss alerts when condition clears
      if (!data.safety?.curtain && prev.curtain) toast.dismiss('curtain-alert');
      if (!data.safety?.buzzer  && prev.buzzer)  toast.dismiss('buzzer-alert');

      prevSafetyRef.current = {
        curtain: data.safety?.curtain || false,
        buzzer:  data.safety?.buzzer  || false,
      };

      // Continuously collect data points for plotting
      const newPoint = {
        time: plotTimestampRef.current,
        displacement: data.position?.displacement_mm || 0,
        bearing: data.assembly?.bearing ? 1 : 0,
        shaft:   data.assembly?.shaft   ? 1 : 0,
      };
      plotDataPointsRef.current.push(newPoint);
      plotTimestampRef.current += 1;

      // Keep last 500 points for performance
      if (plotDataPointsRef.current.length > 500) {
        plotDataPointsRef.current.shift();
        plotDataPointsRef.current.forEach((point, index) => { point.time = index; });
        plotTimestampRef.current = plotDataPointsRef.current.length;
      }

      if (now - lastUpdateRef.current > 100) {
         setPlotData([...plotDataPointsRef.current]);
      }
    };

    ws.onerror = (err) => {
      console.error('[Assembly] Hydraulic WebSocket error', err);
      setIsWsConnected(false);
    };

    ws.onclose = () => {
      console.warn('[Assembly] Hydraulic WebSocket closed, reconnecting in 3s...');
      setIsWsConnected(false);
      // Exponential backoff not needed for a local LAN connection — 3 s flat retry
      reconnectTimerRef.current = setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) connectWS();
      }, 3000);
    };
  }, []);

  useEffect(() => {
    connectWS();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connectWS]);
  // ====== END: REAL HYDRAULIC DATA WEBSOCKET USAGE ======

  // Exponential smoothing filter for position data
  useEffect(() => {
    if (!plantData?.position?.displacement_mm) return;

    const targetPosition = plantData.position.displacement_mm;
    const smoothingFactor = 0.08; // Lower = smoother (reduced from 0.15 for more fluid motion)

    const smoothInterval = setInterval(() => {
      setSmoothedPosition(prev => {
        const diff = targetPosition - prev;
        // If very close to target, snap to it
        if (Math.abs(diff) < 0.1) return targetPosition;
        // Otherwise, move towards target gradually
        const newVal = prev + diff * smoothingFactor;

        // Debug: Track data points, throttle React state updates to ~16fps
        const now = performance.now();
        if (now - lastRenderUpdateRef.current > 60) {
          const workpiece = plantData?.assembly?.bearing ? 'bearing' : 'shaft';
          setSmoothedDataPoints(points => [...points.slice(-99), { value: newVal - 43, workpiece, timestamp: Date.now() }]);
          lastRenderUpdateRef.current = now;
        }

        return newVal;
      });
    }, 16); // ~60fps

    return () => clearInterval(smoothInterval);
  }, [plantData?.position?.displacement_mm, plantData?.assembly?.bearing]);

  // Track raw data points for debugging
  useEffect(() => {
    if (!plantData?.position?.displacement_mm) return;
    const workpiece = plantData?.assembly?.bearing ? 'bearing' : 'shaft';
    setRawDataPoints(points => [...points.slice(-99), {
      value: plantData.position.displacement_mm - 43,
      workpiece,
      timestamp: Date.now()
    }]);
  }, [plantData?.position?.displacement_mm, plantData?.assembly?.bearing]);

  // Real-time canvas plotting for raw data
  useEffect(() => {
    const canvas = rawCanvasRef.current;
    if (!canvas || rawDataPoints.length < 2) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = (width / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Determine time range
    const timeRange = rawDataPoints[rawDataPoints.length - 1].timestamp - rawDataPoints[0].timestamp;
    const startTime = rawDataPoints[0].timestamp;
    const maxVal = rawDataPoints[rawDataPoints.length - 1].workpiece === 'bearing' ? 185 : 135;

    // Draw data line
    ctx.strokeStyle = rawDataPoints[rawDataPoints.length - 1].workpiece === 'bearing' ? '#ff6b6b' : '#4dabf7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    rawDataPoints.forEach((point, idx) => {
      const x = timeRange > 0 ? ((point.timestamp - startTime) / timeRange) * width : 0;
      const y = height - (point.value / maxVal) * height;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

  }, [rawDataPoints]);

  // Real-time canvas plotting for smoothed data
  useEffect(() => {
    const canvas = smoothedCanvasRef.current;
    if (!canvas || smoothedDataPoints.length < 2) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = (width / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Determine time range
    const timeRange = smoothedDataPoints[smoothedDataPoints.length - 1].timestamp - smoothedDataPoints[0].timestamp;
    const startTime = smoothedDataPoints[0].timestamp;
    const maxVal = smoothedDataPoints[smoothedDataPoints.length - 1].workpiece === 'bearing' ? 185 : 135;

    // Draw data line
    ctx.strokeStyle = smoothedDataPoints[smoothedDataPoints.length - 1].workpiece === 'bearing' ? '#ff6b6b' : '#4dabf7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    smoothedDataPoints.forEach((point, idx) => {
      const x = timeRange > 0 ? ((point.timestamp - startTime) / timeRange) * width : 0;
      const y = height - (point.value / maxVal) * height;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

  }, [smoothedDataPoints]);

  const handleConnect = async () => {
    setStatusLoading(true);
    try {
      const res = await AssemblyControlService.connect();
      if (res.success) {
        setIsConnected(true);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error('Failed to connect');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setStatusLoading(true);
    try {
      const res = await AssemblyControlService.disconnect();
      if (res.success) {
        setIsConnected(false);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error('Failed to disconnect');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleClearPlot = () => {
    setPlotData([]);
    plotDataPointsRef.current = [];
    plotTimestampRef.current = 0;
  };

  const handleBearingToggle = async () => {
    setIsLoading(true);
    try {
      const response = await AssemblyControlService.runCommand('BEARING_ON');
      setLastCommand('Bearing ON');
      toast.success(response.message || 'Bearing command executed');
    } catch (e) {
      toast.error(`Failed to execute Bearing command: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShaftToggle = async () => {
    setIsLoading(true);
    try {
      const response = await AssemblyControlService.runCommand('SHAFT_ON');
      setLastCommand('Shaft ON');
      toast.success(response.message || 'Shaft command executed');
    } catch (e) {
      toast.error(`Failed to execute Shaft command: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="asrs-inventory module-layout">
      <PageHeader
        title="Assembly"
        subtitle="Hydraulic station"
        actions={
          <>
            <AssemblyStatusRibbon
              plcConnected={isConnected}
              wsConnected={isWsConnected}
              plantData={plantData}
              smoothedPosition={smoothedPosition}
            />
            {isConnected ? (
              <button type="button" onClick={handleDisconnect} className="btn btn-error btn-sm" disabled={statusLoading}>
                {statusLoading ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : (
              <button type="button" onClick={handleConnect} className="btn btn-success btn-sm" disabled={statusLoading}>
                {statusLoading ? "Connecting…" : "Connect"}
              </button>
            )}
          </>
        }
      />

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="assembly-layout" style={{ flex: 1, minHeight: 0 }}>
          {/* Left Sidebar: System Status Panel */}
          <aside className="assembly-sidebar" style={{ overflowY: 'auto' }}>
            {/* System Indicators - Horizontal LED Bar */}
            <div className="sidebar-section" style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '1rem'
            }}>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                marginBottom: 12,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'
              }}>
                System Indicators
              </div>

              {/* Horizontal LED Layout */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                gap: '1rem',
                padding: '0.5rem 0'
              }}>
                {/* Green LED */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '2px solid #444',
                    background: plantData?.safety?.lights?.green
                      ? 'radial-gradient(circle, #4ade80, #22c55e)'
                      : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
                    boxShadow: plantData?.safety?.lights?.green
                      ? '0 0 12px rgba(74, 222, 128, 0.6), inset 0 1px 2px rgba(255,255,255,0.3)'
                      : 'inset 0 1px 3px rgba(0,0,0,0.5)',
                    transition: 'all 0.3s ease'
                  }} />

                </div>

                {/* Yellow/Orange LED */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '2px solid #444',
                    background: plantData?.safety?.lights?.orange
                      ? 'radial-gradient(circle, #fbbf24, #f59e0b)'
                      : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
                    boxShadow: plantData?.safety?.lights?.orange
                      ? '0 0 12px rgba(251, 191, 36, 0.6), inset 0 1px 2px rgba(255,255,255,0.3)'
                      : 'inset 0 1px 3px rgba(0,0,0,0.5)',
                    transition: 'all 0.3s ease'
                  }} />

                </div>

                {/* Red LED */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '2px solid #444',
                    background: plantData?.safety?.lights?.red
                      ? 'radial-gradient(circle, #ef4444, #dc2626)'
                      : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
                    boxShadow: plantData?.safety?.lights?.red
                      ? '0 0 12px rgba(239, 68, 68, 0.6), inset 0 1px 2px rgba(255,255,255,0.3)'
                      : 'inset 0 1px 3px rgba(0,0,0,0.5)',
                    transition: 'all 0.3s ease'
                  }} />

                </div>
              </div>
            </div>

            {/* Safety - Danger Indicators */}
            <div className="sidebar-section">
              <div style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 8 }}>Safety Status</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Buzzer - Red when active (danger alert) */}
                <div style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: plantData?.safety?.buzzer ? 'rgba(220, 38, 38, 0.15)' : 'var(--bg-primary)',
                  border: `1px solid ${plantData?.safety?.buzzer ? '#dc2626' : 'var(--border)'}`,
                  color: plantData?.safety?.buzzer ? '#dc2626' : 'var(--text-muted)'
                }}>
                  <span>Buzzer</span>
                  {plantData?.safety?.buzzer && (
                    <motion.div
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#dc2626'
                      }}
                    />
                  )}
                </div>

                {/* Curtain - Red when triggered (person detected) */}
                <div style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: plantData?.safety?.curtain ? 'rgba(220, 38, 38, 0.15)' : 'var(--bg-primary)',
                  border: `1px solid ${plantData?.safety?.curtain ? '#dc2626' : 'var(--border)'}`,
                  color: plantData?.safety?.curtain ? '#dc2626' : 'var(--text-muted)'
                }}>
                  <span>Curtain</span>
                  {plantData?.safety?.curtain && (
                    <motion.div
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#dc2626'
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* Right Main Panel: Hydraulic Press Assembly */}
          <main className="assembly-main" style={{ minHeight: 0 }}>
            {/* Unified Press Assembly - Single Mechanical Unit */}
            <div className="main-section" style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '1.5rem',
              position: 'relative',
              flexShrink: 0,
              minHeight: '620px',
              overflow: 'hidden'
            }}>
              {/* Header with Workpiece Context */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Hydraulic Press Assembly
                </div>

                {/* Workpiece Indicator (Context, Not Control) */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.8rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px'
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Workpiece
                  </div>
                  <div style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    letterSpacing: '0.05em'
                  }}>
                    {plantData?.assembly?.bearing ? 'BEARING' : plantData?.assembly?.shaft ? 'SHAFT' : 'NONE'}
                  </div>
                </div>
              </div>

              {/* Unified Press Assembly - Hero in Center, Status Rail on Left */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr',
                gap: '2.25rem',
                alignItems: 'start',
                opacity: (plantData?.safety?.curtain || plantData?.safety?.buzzer) ? 0.3 : 1,
                transition: 'opacity 0.3s ease',
                pointerEvents: (plantData?.safety?.curtain || plantData?.safety?.buzzer) ? 'none' : 'auto'
              }}>
                {/* LEFT: Status Rail (Monitoring Only - Quiet) */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '1rem 0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem'
                }}>
                  {/* Extension Readout */}
                  <div>
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600
                    }}>
                      Extension
                    </div>
                    <div style={{
                      fontSize: '1.75rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.02em'
                    }}>
                      {smoothedPosition != null
                        ? Math.round(smoothedPosition - 43)
                        : '--'
                      }
                      <span style={{ fontSize: '1rem', marginLeft: '0.25rem', color: 'var(--text-muted)' }}>
                        mm
                      </span>
                    </div>
                  </div>

                  {/* Workpiece Indicator - Passive Label */}
                  <div>
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600
                    }}>
                      Workpiece
                    </div>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      letterSpacing: '0.02em'
                    }}>
                      {plantData?.assembly?.bearing ? 'Bearing' : plantData?.assembly?.shaft ? 'Shaft' : 'None'}
                    </div>
                  </div>

                  {/* Vice Status - Passive */}
                  <div>
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600
                    }}>
                      Vice
                    </div>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      letterSpacing: '0.02em'
                    }}>
                      {plantData?.vice?.close ? 'Closed' : plantData?.vice?.open ? 'Open' : 'Unknown'}
                    </div>
                  </div>

                  {/* System State - Passive */}
                  <div>
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600
                    }}>
                      State
                    </div>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      color: (plantData?.position?.displacement_mm ?? 43) > 50
                        ? '#4ade80'
                        : 'var(--text-primary)',
                      letterSpacing: '0.02em'
                    }}>
                      {(plantData?.position?.displacement_mm ?? 43) > 50 ? 'Active' : 'Idle'}
                    </div>
                  </div>
                </div>

                {/* CENTER & RIGHT: Mechanical Visualization (Hero) + Controls */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1rem'
                }}>
                  {/* Hydraulic Cylinder & Vice Assembly - Visual Hero */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transform: 'scale(1)',
                    transformOrigin: 'top center',
                    marginBottom: '0'
                  }}>
                    {/* Hydraulic Cylinder & Piston */}
                    <div style={{
                      width: '200px',
                      height: '300px',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}>
                      {/* Mounting Flange (Top) */}
                      <div style={{
                        width: '120px',
                        height: '20px',
                        background: '#1a1a1a',
                        border: '2px solid #555',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        zIndex: 10,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                      }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#666', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }} />
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#666', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }} />
                      </div>

                      {/* Cylinder Body - Two Parallel Green Rectangles */}
                      <div style={{
                        width: '120px',
                        height: '260px',
                        position: 'relative',
                        display: 'flex',
                        justifyContent: 'space-between'
                      }}>
                        {/* Left Cylinder Wall */}
                        <div style={{
                          width: '28px',
                          height: '100%',
                          background: 'linear-gradient(to right, #2d4a2d, #3a5a3a)',
                          border: '2px solid #3a5a3a',
                          borderRadius: '4px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3), inset 2px 0 4px rgba(0,0,0,0.2)'
                        }} />

                        {/* Center Space for Piston Rod */}
                        <div style={{
                          width: '36px',
                          height: '100%',
                          position: 'relative',
                          display: 'flex',
                          justifyContent: 'center'
                        }}>
                          {/* Piston Rod (Extends downward) */}
                          <motion.div
                            animate={{
                              height: (plantData?.safety?.curtain || plantData?.safety?.buzzer)
                                ? `${Math.max(0, Math.min(185, (smoothedPosition - 43)) * 0.85)}px`
                                : `${Math.max(0, Math.min(185, (smoothedPosition - 43)) * 0.85)}px`
                            }}
                            transition={{
                              duration: 0,
                              ease: "linear"
                            }}
                            style={{
                              width: '36px',
                              background: 'linear-gradient(to right, #a8a8a8, #c8c8c8, #a8a8a8)',
                              border: '1px solid #888',
                              position: 'relative',
                              borderRadius: '2px',
                              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)'
                            }}
                          >
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: '1px',
                              height: '100%',
                              background: 'rgba(255,255,255,0.15)'
                            }} />
                          </motion.div>
                        </div>

                        {/* Right Cylinder Wall */}
                        <div style={{
                          width: '28px',
                          height: '100%',
                          background: 'linear-gradient(to left, #2d4a2d, #3a5a3a)',
                          border: '2px solid #3a5a3a',
                          borderRadius: '4px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3), inset -2px 0 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>

                      {/* Press Head (Moves with rod) */}
                      <motion.div
                        animate={{
                          y: (plantData?.safety?.curtain || plantData?.safety?.buzzer)
                            ? Math.max(0, Math.min(185, (smoothedPosition - 43)) * 0.85)
                            : Math.max(0, Math.min(185, (smoothedPosition - 43)) * 0.85)
                        }}
                        transition={{
                          duration: 0,
                          ease: "linear"
                        }}
                        style={{
                          width: '110px',
                          height: '36px',
                          background: 'linear-gradient(to bottom, #6b2e2e, #4a2020)',
                          border: '2px solid #8b3a3a',
                          borderRadius: '4px',
                          position: 'absolute',
                          top: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 3px 8px rgba(0,0,0,0.5)'
                        }}
                      >
                        <div style={{
                          width: '85%',
                          height: '4px',
                          background: '#666',
                          borderRadius: '2px',
                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)'
                        }} />
                      </motion.div>
                    </div>

                    {/* Vice Jaws - Directly Below Press */}
                    <div style={{
                      width: '180px',
                      height: '100px',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '0.5rem'
                    }}>
                      {/* Left Jaw */}
                      <motion.div
                        animate={{
                          x: (plantData?.safety?.curtain || plantData?.safety?.buzzer)
                            ? (plantData?.vice?.close ? 0 : -25)
                            : (plantData?.vice?.close ? 0 : -25)
                        }}
                        transition={{
                          duration: (plantData?.safety?.curtain || plantData?.safety?.buzzer) ? 0 : 0.8,
                          ease: [0.25, 0.1, 0.25, 0.9],
                          type: "tween"
                        }}
                        style={{
                          width: '40px',
                          height: '85px',
                          background: 'linear-gradient(to right, #2a2a2a, #3a3a3a)',
                          border: '2px solid #555',
                          borderRadius: '3px',
                          position: 'absolute',
                          left: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          padding: '10px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                        }}
                      >
                        <div style={{ width: '100%', height: '3px', background: '#666', borderRadius: '1px' }} />
                        <div style={{ width: '100%', height: '3px', background: '#666', borderRadius: '1px' }} />
                        <div style={{ width: '100%', height: '3px', background: '#666', borderRadius: '1px' }} />
                      </motion.div>

                      {/* Right Jaw */}
                      <motion.div
                        animate={{
                          x: (plantData?.safety?.curtain || plantData?.safety?.buzzer)
                            ? (plantData?.vice?.close ? 0 : 25)
                            : (plantData?.vice?.close ? 0 : 25)
                        }}
                        transition={{
                          duration: (plantData?.safety?.curtain || plantData?.safety?.buzzer) ? 0 : 0.8,
                          ease: [0.25, 0.1, 0.25, 0.9],
                          type: "tween",
                          delay: (plantData?.safety?.curtain || plantData?.safety?.buzzer) ? 0 : 0.08
                        }}
                        style={{
                          width: '40px',
                          height: '85px',
                          background: 'linear-gradient(to left, #2a2a2a, #3a3a3a)',
                          border: '2px solid #555',
                          borderRadius: '3px',
                          position: 'absolute',
                          right: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          padding: '10px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                        }}
                      >
                        <div style={{ width: '100%', height: '3px', background: '#666', borderRadius: '1px' }} />
                        <div style={{ width: '100%', height: '3px', background: '#666', borderRadius: '1px' }} />
                        <div style={{ width: '100%', height: '3px', background: '#666', borderRadius: '1px' }} />
                      </motion.div>

                      {/* Workpiece zone centerline */}
                      <div style={{
                        width: '2px',
                        height: '70px',
                        background: 'rgba(255,255,255,0.08)',
                        position: 'absolute'
                      }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* SAFETY INTERRUPT OVERLAY - ACCESS DENIED Style */}
              {(plantData?.safety?.curtain || plantData?.safety?.buzzer) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: `
                      linear-gradient(0deg, rgba(220, 38, 38, 0.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(220, 38, 38, 0.03) 1px, transparent 1px),
                      #000000
                    `,
                    backgroundSize: '40px 40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1.5rem',
                    flexWrap: 'wrap',
                    borderRadius: '6px',
                    zIndex: 10,
                    border: '2px solid #dc2626',
                    boxShadow: 'inset 0 0 100px rgba(220, 38, 38, 0.2)',
                    padding: '1.5rem'
                  }}
                >
                  {/* Warning Triangle - Left Side */}
                  <motion.div
                    animate={{
                      opacity: [1, 0.7, 1]
                    }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" />
                      <circle cx="12" cy="17" r="0.5" fill="#dc2626" />
                    </svg>
                  </motion.div>

                  {/* Text Content - Right Side */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    alignItems: 'flex-start'
                  }}>
                    {/* Main Title */}
                    <motion.div
                      animate={{ opacity: [1, 0.8, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                      style={{
                        fontSize: 'clamp(2rem, 3.6vw, 3rem)',
                        fontWeight: 900,
                        color: '#dc2626',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                        fontFamily: 'monospace',
                        textShadow: '0 0 20px rgba(220, 38, 38, 0.8), 0 0 40px rgba(220, 38, 38, 0.5)',
                        lineHeight: 1.2
                      }}
                    >
                      SAFETY<br />INTERRUPT
                    </motion.div>

                    {/* Subtext */}
                    <div style={{
                      fontSize: 'clamp(0.95rem, 1.8vw, 1.1rem)',
                      fontWeight: 600,
                      color: '#fca5a5',
                      fontFamily: 'monospace',
                      letterSpacing: '0.05em',
                      maxWidth: '560px',
                      lineHeight: 1.5
                    }}>
                      {plantData?.safety?.curtain
                        ? 'Human presence detected in machine area'
                        : 'Emergency condition active'
                      }
                    </div>

                    {/* Status Bar */}
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#dc2626',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginTop: '0.5rem',
                      padding: '0.6rem 1.2rem',
                      background: 'rgba(220, 38, 38, 0.1)',
                      border: '2px solid #dc2626',
                      borderRadius: '0',
                      fontFamily: 'monospace',
                      boxShadow: '0 0 15px rgba(220, 38, 38, 0.3)'
                    }}>
                      ■ MOTION HALTED · AWAITING CLEARANCE
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Controls */}
            <div className="main-section" style={{ padding: '0.75rem 1.5rem', flexShrink: 0 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 8 }}>Controls</div>
              <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-success"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1.2rem' }}
                  onClick={handleBearingToggle}
                  disabled={isLoading}
                >
                  {isLoading ? 'Processing…' : 'Bearing ON'}
                </button>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1.2rem' }}
                  onClick={handleShaftToggle}
                  disabled={isLoading}
                >
                  {isLoading ? 'Processing…' : 'Shaft ON'}
                </button>

              </div>
            </div>

          </main>
        </div>
      </div>

      {/* Graphs Tab Content - COMMENTED OUT
      <motion.div
        key={activeTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '2rem',
          display: activeTab === 'graphs' ? 'flex' : 'none',
          flexDirection: 'column',
          gap: '1.5rem'
        }}
      >
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1.5rem',
          backgroundColor: 'var(--bg-secondary)',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: '600',
              margin: 0,
              color: 'var(--text-primary)'
            }}>
              Extension Graph
              <span style={{
                marginLeft: '0.5rem',
                fontSize: '0.75rem',
                color: '#4ade80',
                fontWeight: '500'
              }}>
                [LIVE]
              </span>
            </h3>
            <button
              onClick={handleClearPlot}
              disabled={plotData.length === 0}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                backgroundColor: plotData.length === 0 ? '#6b7280' : '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: plotData.length === 0 ? 'not-allowed' : 'pointer',
                opacity: plotData.length === 0 ? 0.5 : 1
              }}
            >
              Clear Data
            </button>
          </div>

          {plotData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={plotData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="time"
                  label={{ value: 'Time (seconds)', position: 'bottom', offset: 10 }}
                  stroke="var(--text-muted)"
                />
                <YAxis
                  label={{ value: 'Displacement (mm)', angle: -90, position: 'insideLeft' }}
                  stroke="var(--text-muted)"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)'
                  }}
                  cursor={{ stroke: 'var(--border)' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="displacement"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  name="Extension (mm)"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '1rem'
            }}>
              Streaming live hydraulic data...
            </div>
          )}
        </div>
      </motion.div>
      */}

      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        closeOnClick
        pauseOnHover
        draggable
        theme={theme}
      />

      {/* DEBUG: Temporary Data Visualization */}
      {/* <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'rgba(20, 20, 20, 0.95)',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '16px',
        width: '600px',
        zIndex: 9999
      }}>
        <div style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
          DEBUG: Real-Time Position Data (Development Only)
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>Raw Data (displacement_mm - 43) vs Time</div>
          <div style={{ position: 'relative' }}>
            <canvas 
              ref={rawCanvasRef}
              width={568}
              height={100}
              style={{ 
                border: '1px solid #444',
                display: 'block'
              }}
            />
            <div style={{ position: 'absolute', top: '2px', left: '4px', fontSize: '9px', color: '#aaa' }}>
              {rawDataPoints[rawDataPoints.length - 1]?.workpiece === 'bearing' ? '185' : '135'}mm
            </div>
            <div style={{ position: 'absolute', bottom: '2px', left: '4px', fontSize: '9px', color: '#666' }}>0mm</div>
            
            {rawDataPoints.length > 1 && (() => {
              const totalTime = (rawDataPoints[rawDataPoints.length - 1].timestamp - rawDataPoints[0].timestamp) / 1000;
              return (
                <>
                  <div style={{ position: 'absolute', bottom: '2px', left: '4px', fontSize: '9px', color: '#666' }}>0s</div>
                  <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '9px', color: '#666' }}>{totalTime.toFixed(1)}s</div>
                </>
              );
            })()}
            
            <div style={{ position: 'absolute', top: '2px', right: '4px', fontSize: '10px', color: '#fff', background: 'rgba(0,0,0,0.7)', padding: '2px 4px', borderRadius: '2px' }}>
              {rawDataPoints[rawDataPoints.length - 1]?.value.toFixed(1)}mm
            </div>
          </div>
          <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>
            <span style={{ color: '#ff6b6b' }}>● Bearing (0-185mm)</span> | <span style={{ color: '#4dabf7' }}>● Shaft (0-135mm)</span>
          </div>
        </div>
        
        <div>
          <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>Smoothed Data (exponential filter) vs Time</div>
          <div style={{ position: 'relative' }}>
            <canvas 
              ref={smoothedCanvasRef}
              width={568}
              height={100}
              style={{ 
                border: '1px solid #444',
                display: 'block'
              }}
            />
            <div style={{ position: 'absolute', top: '2px', left: '4px', fontSize: '9px', color: '#aaa' }}>
              {smoothedDataPoints[smoothedDataPoints.length - 1]?.workpiece === 'bearing' ? '185' : '135'}mm
            </div>
            <div style={{ position: 'absolute', bottom: '2px', left: '4px', fontSize: '9px', color: '#666' }}>0mm</div>
            
            {smoothedDataPoints.length > 1 && (() => {
              const totalTime = (smoothedDataPoints[smoothedDataPoints.length - 1].timestamp - smoothedDataPoints[0].timestamp) / 1000;
              return (
                <>
                  <div style={{ position: 'absolute', bottom: '2px', left: '4px', fontSize: '9px', color: '#666' }}>0s</div>
                  <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '9px', color: '#666' }}>{totalTime.toFixed(1)}s</div>
                </>
              );
            })()}
            
            <div style={{ position: 'absolute', top: '2px', right: '4px', fontSize: '10px', color: '#fff', background: 'rgba(0,0,0,0.7)', padding: '2px 4px', borderRadius: '2px' }}>
              {smoothedDataPoints[smoothedDataPoints.length - 1]?.value.toFixed(1)}mm
            </div>
          </div>
          <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>
            <span style={{ color: '#ff6b6b' }}>● Bearing (0-185mm)</span> | <span style={{ color: '#4dabf7' }}>● Shaft (0-135mm)</span>
          </div>
        </div>
      </div> */}
    </div>
  );
}
