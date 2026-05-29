import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AssemblyControlService from '../services/Assemblycontrol';
import { toast } from 'react-toastify';
import '../components/industrial-ui.css';
import './Assembly.css';
import PageHeader from '../components/PageHeader';
import { useTheme } from '../theme/ThemeContext';
import AssemblyStatusRibbon from './asrs/components/AssemblyStatusRibbon';
import SafetyOverlay from '../components/SafetyOverlay';
import { deepMerge } from '../utils/deepMerge';
import { useModal } from '../hooks/useModal';
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
  const [lastCommandTime, setLastCommandTime] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [plantData, setPlantData] = useState(null);
  const [activeTab, setActiveTab] = useState('monitoring');
  const { activeModal, openModal, closeModal } = useModal();

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
  // Tracks last known full state for delta merging
  const lastDataRef = useRef(null);

  // Fetch historical telemetry on mount
  useEffect(() => {
    const fetchHistory = async () => {
      const response = await AssemblyControlService.getHistoricalTelemetry(250);
      if (response && response.success && response.data && response.data.length > 0) {
        // The data is returned newest first (DESC), so reverse it for the plot (oldest to newest)
        const historyData = response.data.reverse().map((row, index) => {
          // Normalize the raw displacement to match the frontend calculation
          const rawDisp = row.displacement_mm !== null ? row.displacement_mm : 43;
          const dispFloat = Math.max(0, rawDisp - 43);
          return {
            time: index,
            displacement: Math.round(dispFloat)
          };
        });

        plotDataPointsRef.current = historyData;
        plotTimestampRef.current = historyData.length;
        setPlotData([...historyData]);
      }
    };
    fetchHistory();
  }, []);

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
      const msg = JSON.parse(e.data);
      let data;

      if (msg.type === 'snapshot') {
        data = msg.data;
      } else if (msg.type === 'delta') {
        // shallow-merge delta into last known state
        data = deepMerge(lastDataRef.current, msg.data);
      } else {
        // heartbeat — nothing to update
        return;
      }

      lastDataRef.current = data;

      const now = performance.now();

      // Capture telemetry values instantly in refs to bypass React state update lag / throttling
      if (data.position?.displacement_mm !== undefined) {
        targetPositionRef.current = data.position.displacement_mm;
      }
      if (data.assembly?.shaft !== undefined) {
        isShaftRef.current = data.assembly.shaft;
      }
      if (data.assembly?.bearing !== undefined) {
        isBearingRef.current = data.assembly.bearing;
      }

      // Update state immediately on every WebSocket message
      setPlantData(data);
      setIsConnected(data.connected !== false);
      setLastCommand(data.assembly?.bearing ? 'Bearing ON' : 'Bearing OFF');

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
      if (!data.safety?.buzzer && prev.buzzer) toast.dismiss('buzzer-alert');

      prevSafetyRef.current = {
        curtain: data.safety?.curtain || false,
        buzzer: data.safety?.buzzer || false,
      };

      // Continuously collect data points for plotting
      const newPoint = {
        time: plotTimestampRef.current,
        displacement: data.position?.displacement_mm || 0,
        bearing: data.assembly?.bearing ? 1 : 0,
        shaft: data.assembly?.shaft ? 1 : 0,
      };
      // Keep only the last 60 seconds of data
      const now60 = Date.now();
      plotDataPointsRef.current.push({ ...newPoint, ts: now60 });
      // Trim points older than 60s
      while (plotDataPointsRef.current.length > 0 && now60 - plotDataPointsRef.current[0].ts > 60000) {
        plotDataPointsRef.current.shift();
      }
      // Re-index time for Recharts
      plotDataPointsRef.current.forEach((point, index) => { point.time = index; });
      plotTimestampRef.current = plotDataPointsRef.current.length;

      if (now - lastUpdateRef.current > 100) {
        setPlotData([...plotDataPointsRef.current]);
        lastUpdateRef.current = now;
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

  // Refs for tracking position and target continuously
  const targetPositionRef = useRef(43);
  const smoothedPositionRef = useRef(43);
  const isShaftRef = useRef(false);
  const isBearingRef = useRef(false);
  const velocityRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());

  // Unified requestAnimationFrame loop for smooth visual interpolation using a second-order critically damped system
  useEffect(() => {
    let animationFrameId;

    const updatePositionLoop = () => {
      const now = performance.now();
      let dt = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      // Handle cases where the tab goes out of focus or lag spikes happen
      if (dt > 0.1) dt = 0.1;
      if (dt < 0.005) dt = 0.005;

      const target = targetPositionRef.current;
      const prevX = smoothedPositionRef.current;
      const prevV = velocityRef.current;

      // Dynamic critically damped spring frequency:
      // Shaft has smaller target range and slower response profile to eliminate Modbus staircasing.
      const omega = isShaftRef.current ? 4.5 : 6.5;

      // Analytical solution to critically damped spring equation:
      // x''(t) + 2*omega*x'(t) + omega^2*(x(t) - target) = 0
      const x0 = prevX - target;
      const v0 = prevV;
      const expTerm = Math.exp(-omega * dt);
      const A = x0;
      const B = v0 + omega * x0;

      const nextX = target + (A + B * dt) * expTerm;
      const nextV = (B - omega * (A + B * dt)) * expTerm;

      let newVal = nextX;
      // Snap to target if very close and motion has settled
      if (Math.abs(nextX - target) < 0.05 && Math.abs(nextV) < 0.1) {
        newVal = target;
        velocityRef.current = 0;
        smoothedPositionRef.current = target;
      } else {
        velocityRef.current = nextV;
        smoothedPositionRef.current = nextX;
      }

      setSmoothedPosition(newVal);

      // Throttled debug points collection for raw/smoothed canvas graphs
      if (now - lastRenderUpdateRef.current > 60) {
        const workpiece = isBearingRef.current ? 'bearing' : 'shaft';
        setSmoothedDataPoints(points => [...points.slice(-99), {
          value: Math.max(0, newVal - 43),
          workpiece,
          timestamp: Date.now()
        }]);
        lastRenderUpdateRef.current = now;
      }

      animationFrameId = requestAnimationFrame(updatePositionLoop);
    };

    // Initialize frame timer before starting loop
    lastFrameTimeRef.current = performance.now();
    animationFrameId = requestAnimationFrame(updatePositionLoop);
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // Track raw data points for debugging
  useEffect(() => {
    if (!plantData?.position?.displacement_mm) return;
    const workpiece = plantData?.assembly?.bearing ? 'bearing' : 'shaft';
    setRawDataPoints(points => [...points.slice(-99), {
      value: Math.max(0, plantData.position.displacement_mm - 43),
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

  // Close modal on Escape key — handled by useModal hook

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
      setLastCommandTime(new Date().toTimeString().slice(0, 8));
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
      setLastCommandTime(new Date().toTimeString().slice(0, 8));
      toast.success(response.message || 'Shaft command executed');
    } catch (e) {
      toast.error(`Failed to execute Shaft command: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViceOpen = async () => {
    setIsLoading(true);
    try {
      const response = await AssemblyControlService.runCommand('VICE_OPEN');
      setLastCommand('Vice OPEN');
      setLastCommandTime(new Date().toTimeString().slice(0, 8));
      toast.success(response.message || 'Vice open command executed');
    } catch (e) {
      toast.error(`Failed to execute Vice Open command: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViceClose = async () => {
    setIsLoading(true);
    try {
      const response = await AssemblyControlService.runCommand('VICE_CLOSE');
      setLastCommand('Vice CLOSE');
      setLastCommandTime(new Date().toTimeString().slice(0, 8));
      toast.success(response.message || 'Vice close command executed');
    } catch (e) {
      toast.error(`Failed to execute Vice Close command: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViceToggle = async () => {
    const command = plantData?.vice?.close ? 'VICE_OPEN' : 'VICE_CLOSE';
    const label = command === 'VICE_OPEN' ? 'Vice OPEN' : 'Vice CLOSE';
    setIsLoading(true);
    try {
      const response = await AssemblyControlService.runCommand(command);
      setLastCommand(label);
      setLastCommandTime(new Date().toTimeString().slice(0, 8));
      toast.success(response.message || `Vice ${command === 'VICE_OPEN' ? 'open' : 'close'} command executed`);
    } catch (e) {
      toast.error(`Failed to execute Vice command: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isSafetyFault = !!(plantData?.safety?.curtain || plantData?.safety?.buzzer);
  const displacementFloat = smoothedPosition != null ? Math.max(0, smoothedPosition - 43) : 0;
  const displacement = smoothedPosition != null ? Math.round(displacementFloat) : null;
  const isPressActive = displacement !== null && displacement > 7;

  // Dynamic clamping positions based on active workpiece (Bearing: 38px, Shaft: 20px, None: 0px)
  const getJawX = (isLeft) => {
    const isOpen = !plantData?.vice?.close;
    if (isOpen) {
      return isLeft ? -25 : 25;
    }
    // Closed state: clamp workpiece
    if (plantData?.assembly?.bearing) {
      return isLeft ? 13 : -13;
    } else if (plantData?.assembly?.shaft) {
      return isLeft ? 22 : -22;
    } else {
      // Closes completely
      return isLeft ? 32 : -32;
    }
  };

  // Derive status tower light conditions
  const greenActive = isConnected && isWsConnected && !isSafetyFault && !isPressActive;
  const orangeActive = isConnected && isWsConnected && !isSafetyFault && isPressActive;
  const redActive = isSafetyFault || !isConnected || !isWsConnected;

  const tabPanels = {
    monitoring: (
      <div className="asm-body" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left Sidebar: System Status Panel */}
        <aside className="asm-sidebar" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
          {/* Safety Diagnostics Section */}
          <div className="asm-side__section">
            <h3>Safety Diagnostics</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className={`asm-safety-item ${plantData?.safety?.buzzer ? 'asm-safety-item--danger' : ''}`}>
                <span>Emergency Buzzer</span>
                {plantData?.safety?.buzzer ? (
                  <div className="asm-pulse-dot" />
                ) : (
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-disabled)' }}>OFF</span>
                )}
              </div>
              <div className={`asm-safety-item ${plantData?.safety?.curtain ? 'asm-safety-item--danger' : ''}`}>
                <span>Safety Curtain</span>
                {plantData?.safety?.curtain ? (
                  <div className="asm-pulse-dot" />
                ) : (
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-disabled)' }}>CLEAR</span>
                )}
              </div>
            </div>
          </div>

          {/* PLC Signal States */}
          <div className="asm-side__section" style={{ marginTop: '12px' }}>
            <h3>Signal Tower Lights</h3>
            <div className="asm-leds" style={{ marginTop: '8px' }}>
              <div className="asm-led">
                <div className={`asm-led__dot ${plantData?.safety?.lights?.green ? 'asm-led__dot--green' : ''}`} />
                <span className="asm-led__label">Green</span>
              </div>
              <div className="asm-led">
                <div className={`asm-led__dot ${plantData?.safety?.lights?.orange ? 'asm-led__dot--orange' : ''}`} />
                <span className="asm-led__label">Orange</span>
              </div>
              <div className="asm-led">
                <div className={`asm-led__dot ${plantData?.safety?.lights?.red ? 'asm-led__dot--red' : ''}`} />
                <span className="asm-led__label">Red</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Main Panel: Hydraulic Press Assembly */}
        <main className="asm-main" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Unified Press Assembly Schematic card */}
          <div className="asm-viz" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
            <div className="asm-viz__bar" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <span>Hydraulic Press Schematic</span>
              <span className={`asm-workpiece-badge ${plantData?.assembly?.bearing ? 'asm-workpiece-badge--bearing' : plantData?.assembly?.shaft ? 'asm-workpiece-badge--shaft' : ''}`}>
                Active Workpiece: {plantData?.assembly?.bearing ? 'BEARING' : plantData?.assembly?.shaft ? 'SHAFT' : 'NONE'}
              </span>
            </div>

            <div className="asm-press-area" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div className="asm-grid-container">
                {/* Left Column: Piston Diagnostics HUD */}
                <div
                  className="asm-hud-card asm-hud-card--clickable"
                  onClick={() => flushSync(() => openModal("piston"))}
                  style={{ cursor: "pointer" }}
                  title="Click to open detailed diagnostics panel"
                >
                  <div className="asm-hud-header">Piston Diagnostics</div>
                  <div className="asm-val">
                    <div className="asm-val__label">Piston Extension</div>
                    <div
                      className="asm-val__num"
                      style={{
                        color: isPressActive
                          ? (plantData?.assembly?.bearing ? '#ff6b6b' : plantData?.assembly?.shaft ? '#38bdf8' : 'var(--text-primary)')
                          : 'var(--text-primary)'
                      }}
                    >
                      {displacement != null ? displacement : '--'}
                      <span className="asm-val__unit">mm</span>
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Operating State</div>
                    <div className="asm-val__num asm-val__num--sm" style={{
                      color: isSafetyFault
                        ? '#ef4444'
                        : isPressActive
                          ? '#fbbf24'
                          : 'var(--text-secondary)'
                    }}>
                      {isSafetyFault ? 'FAULTED' : isPressActive ? 'PRESS ACTIVE' : 'SYSTEM IDLE'}
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Travel Limit</div>
                    <div className="asm-val__num asm-val__num--sm" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                      Max: {plantData?.assembly?.bearing ? '185' : plantData?.assembly?.shaft ? '135' : '--'} mm
                    </div>
                  </div>
                </div>

                {/* Center Column: Cylindrical machine schematic */}
                <div className="asm-cylinder-wrapper">
                  {/* Left Hydraulic Pipe */}
                  <div className="asm-pipe asm-pipe--left">
                    <div className={`asm-pipe__fluid ${isPressActive
                        ? (plantData?.assembly?.bearing ? 'asm-pipe__fluid--active-bearing' : plantData?.assembly?.shaft ? 'asm-pipe__fluid--active-shaft' : '')
                        : ''
                      }`} />
                  </div>

                  {/* Right Hydraulic Pipe */}
                  <div className="asm-pipe asm-pipe--right">
                    <div className={`asm-pipe__fluid ${isPressActive
                        ? (plantData?.assembly?.bearing ? 'asm-pipe__fluid--active-bearing' : plantData?.assembly?.shaft ? 'asm-pipe__fluid--active-shaft' : '')
                        : ''
                      }`} />
                  </div>

                  {/* Ruler Scale */}
                  <div className="asm-ruler">
                    {[0, 50, 100, 150, 185].map((mark) => (
                      <div key={mark} className="asm-ruler__tick" style={{ top: `${mark}px` }}>
                        <span className="asm-ruler__label">{mark}</span>
                        <div className={`asm-ruler__tick-line ${mark % 50 === 0 ? 'asm-ruler__tick-line--major' : ''}`} />
                      </div>
                    ))}
                    {/* Glowing Ruler Indicator */}
                    <div
                      className="asm-ruler__pointer"
                      style={{
                        top: `${Math.max(0, Math.min(185, displacementFloat))}px`,
                        borderLeftColor: plantData?.assembly?.bearing ? '#ff6b6b' : plantData?.assembly?.shaft ? '#38bdf8' : 'var(--primary)'
                      }}
                    />
                  </div>

                  {/* Top Flange */}
                  <div className="asm-flange">
                    <div className="asm-flange__bolt" />
                    <div className="asm-flange__bolt" />
                  </div>

                  {/* Cylinder walls and piston track */}
                  <div className="asm-cylinder">
                    <div className="asm-cylinder__wall asm-cylinder__wall--left" />
                    <div className="asm-piston-track">
                      <motion.div
                        animate={{
                          height: `${Math.max(0, Math.min(185, displacementFloat))}px`
                        }}
                        transition={{ duration: 0 }}
                        className="asm-piston-rod"
                      />
                    </div>
                    <div className="asm-cylinder__wall asm-cylinder__wall--right" />

                    {/* Press Head */}
                    <motion.div
                      animate={{
                        y: Math.max(0, Math.min(185, displacementFloat))
                      }}
                      transition={{ duration: 0 }}
                      className="asm-press-head"
                    >
                      <div className="asm-press-head__hazard" />
                      <div className="asm-press-head__groove" />
                      {/* Active glow contact strip */}
                      <div
                        className="asm-press-head__glow"
                        style={{
                          backgroundColor: isPressActive
                            ? (plantData?.assembly?.bearing ? '#ff6b6b' : plantData?.assembly?.shaft ? '#38bdf8' : '#dc2626')
                            : 'rgba(255, 255, 255, 0.08)',
                          boxShadow: isPressActive
                            ? `0 0 10px ${plantData?.assembly?.bearing ? '#ff6b6b' : '#38bdf8'}, 0 0 4px ${plantData?.assembly?.bearing ? '#ff6b6b' : '#38bdf8'}`
                            : 'none'
                        }}
                      />
                    </motion.div>
                  </div>

                  {/* Vice assembly */}
                  <div className="asm-vice">
                    {/* Left jaw */}
                    <motion.div
                      animate={{
                        x: getJawX(true)
                      }}
                      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 0.9] }}
                      className="asm-jaw asm-jaw--left"
                    >
                      <div className="asm-jaw__groove" />
                      <div className="asm-jaw__groove" />
                      <div className="asm-jaw__groove" />
                    </motion.div>

                    {/* Right jaw */}
                    <motion.div
                      animate={{
                        x: getJawX(false)
                      }}
                      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 0.9] }}
                      className="asm-jaw asm-jaw--right"
                    >
                      <div className="asm-jaw__groove" />
                      <div className="asm-jaw__groove" />
                      <div className="asm-jaw__groove" />
                    </motion.div>

                    {/* Active Workpiece */}
                    <AnimatePresence>
                      {plantData?.assembly?.bearing && (
                        <motion.div
                          key="bearing"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 200, damping: 20 }}
                          className="asm-workpiece--bearing-item"
                          style={{
                            width: '38px',
                            height: '38px',
                            position: 'absolute',
                            zIndex: 1,
                          }}
                        />
                      )}
                      {plantData?.assembly?.shaft && (
                        <motion.div
                          key="shaft"
                          initial={{ scaleY: 0, opacity: 0 }}
                          animate={{ scaleY: 1, opacity: 1 }}
                          exit={{ scaleY: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 200, damping: 20 }}
                          className="asm-workpiece--shaft-item"
                          style={{
                            width: '20px',
                            height: '52px',
                            position: 'absolute',
                            zIndex: 1,
                            transformOrigin: 'bottom center',
                          }}
                        />
                      )}
                    </AnimatePresence>

                    {/* Center guide line */}
                    <div style={{ width: '1px', height: '70px', background: 'rgba(255,255,255,0.04)', position: 'absolute' }} />
                  </div>
                </div>

                {/* Right Column: Clamp & Workpiece HUD */}
                <div
                  className="asm-hud-card asm-hud-card--clickable"
                  onClick={() => flushSync(() => openModal("clamp"))}
                  style={{ cursor: "pointer" }}
                  title="Click to open detailed diagnostics panel"
                >
                  <div className="asm-hud-header">Clamp & Workpiece</div>
                  <div className="asm-val">
                    <div className="asm-val__label">Vice Jaws Status</div>
                    <div className={`asm-val__num asm-val__num--sm ${plantData?.vice?.close ? 'asm-val__num--glowing-blue' : 'asm-val__num--glowing-green'
                      }`}>
                      {plantData?.vice?.close ? 'CLOSED' : plantData?.vice?.open ? 'OPEN' : 'UNKNOWN'}
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Active Workpiece</div>
                    <div className="asm-val__num asm-val__num--sm" style={{
                      color: plantData?.assembly?.bearing
                        ? '#ff6b6b'
                        : plantData?.assembly?.shaft
                          ? '#38bdf8'
                          : 'var(--text-muted)'
                    }}>
                      {plantData?.assembly?.bearing ? 'BEARING' : plantData?.assembly?.shaft ? 'SHAFT' : 'NONE'}
                    </div>
                  </div>
                  <div className="asm-val">
                    <div className="asm-val__label">Telemetry Feed</div>
                    <div className="asm-val__num asm-val__num--sm" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                      WS: {isWsConnected ? 'LIVE' : 'DISCONNECTED'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action controls panel */}
          <div className="asm-cmd" style={{ marginTop: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <span className="asm-cmd__label">Press Commands:</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="asm-btn asm-btn--bearing"
                onClick={handleBearingToggle}
                disabled={isLoading || isSafetyFault || !isConnected}
              >
                {isLoading ? 'Processing…' : 'Bearing ON'}
              </button>
              <button
                type="button"
                className="asm-btn asm-btn--shaft"
                onClick={handleShaftToggle}
                disabled={isLoading || isSafetyFault || !isConnected}
              >
                {isLoading ? 'Processing…' : 'Shaft ON'}
              </button>
            </div>
            <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
            <span className="asm-cmd__label" style={{ marginRight: 0 }}>Vice:</span>
            <button
              type="button"
              className={`asm-btn asm-btn--vice-toggle ${plantData?.vice?.close ? 'asm-btn--vice-toggle--closed' : 'asm-btn--vice-toggle--open'}`}
              onClick={handleViceToggle}
              disabled={isLoading || isSafetyFault || !isConnected}
              title={plantData?.vice?.close ? 'Vice is CLOSED — click to open' : 'Vice is OPEN — click to close'}
            >
              {isLoading && (lastCommand === 'Vice OPEN' || lastCommand === 'Vice CLOSE')
                ? (lastCommand === 'Vice OPEN' ? 'Opening…' : 'Closing…')
                : plantData?.vice?.close ? 'Close Vice ●' : 'Open Vice ○'}
            </button>
            {lastCommandTime && (
              <span style={{
                fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#475569',
                marginLeft: 'auto', fontWeight: 600
              }}>
                LAST: {lastCommandTime}
              </span>
            )}
          </div>
        </main>
      </div>
    ),
    plots: (
      <div className="asm-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
        {/* Canvas Debug plots */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          flex: 1,
          minHeight: 0
        }}>
          {/* Raw plot card */}
          <div className="asm-viz" style={{ minHeight: '190px', background: 'var(--bg-secondary)' }}>
            <div className="asm-viz__bar" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <span>Real-Time Diagnostic: Raw Signal</span>
              <span className="asm-graph__live" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ff6b6b', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '2px 6px', borderRadius: '2px' }}>
                RAW DISPLACEMENT
              </span>
            </div>
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ position: 'relative', width: '100%', flex: 1, display: 'flex' }}>
                <canvas
                  ref={rawCanvasRef}
                  width={1200}
                  height={250}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    background: '#1a1a1a'
                  }}
                />
                <div style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {rawDataPoints[rawDataPoints.length - 1]?.workpiece === 'bearing' ? '185' : '135'}mm
                </div>
                <div style={{ position: 'absolute', bottom: '4px', left: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-disabled)' }}>0mm</div>

                {rawDataPoints.length > 1 && (() => {
                  const totalTime = (rawDataPoints[rawDataPoints.length - 1].timestamp - rawDataPoints[0].timestamp) / 1000;
                  return (
                    <div style={{ position: 'absolute', bottom: '4px', right: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-disabled)' }}>
                      {totalTime.toFixed(1)}s span
                    </div>
                  );
                })()}

                <div style={{ position: 'absolute', top: '4px', right: '6px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--primary-light)', background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: '2px', border: '1px solid var(--border)' }}>
                  {rawDataPoints[rawDataPoints.length - 1]?.value != null ? `${rawDataPoints[rawDataPoints.length - 1].value.toFixed(1)} mm` : '--'}
                </div>
              </div>
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', gap: '12px' }}>
                <span><span style={{ color: '#ff6b6b' }}>●</span> Bearing (0-185mm)</span>
                <span><span style={{ color: '#4dabf7' }}>●</span> Shaft (0-135mm)</span>
              </div>
            </div>
          </div>

          {/* Smoothed plot card */}
          <div className="asm-viz" style={{ minHeight: '190px', background: 'var(--bg-secondary)' }}>
            <div className="asm-viz__bar" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <span>Real-Time Diagnostic: Filtered Signal</span>
              <span className="asm-graph__live" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#4ade80', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '2px' }}>
                EXPONENTIAL FILTER
              </span>
            </div>
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ position: 'relative', width: '100%', flex: 1, display: 'flex' }}>
                <canvas
                  ref={smoothedCanvasRef}
                  width={1200}
                  height={250}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    background: '#1a1a1a'
                  }}
                />
                <div style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {smoothedDataPoints[smoothedDataPoints.length - 1]?.workpiece === 'bearing' ? '185' : '135'}mm
                </div>
                <div style={{ position: 'absolute', bottom: '4px', left: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-disabled)' }}>0mm</div>

                {smoothedDataPoints.length > 1 && (() => {
                  const totalTime = (smoothedDataPoints[smoothedDataPoints.length - 1].timestamp - smoothedDataPoints[0].timestamp) / 1000;
                  return (
                    <div style={{ position: 'absolute', bottom: '4px', right: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-disabled)' }}>
                      {totalTime.toFixed(1)}s span
                    </div>
                  );
                })()}

                <div style={{ position: 'absolute', top: '4px', right: '6px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#4ade80', background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: '2px', border: '1px solid var(--border)' }}>
                  {smoothedDataPoints[smoothedDataPoints.length - 1]?.value != null ? `${smoothedDataPoints[smoothedDataPoints.length - 1].value.toFixed(1)} mm` : '--'}
                </div>
              </div>
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', gap: '12px' }}>
                <span><span style={{ color: '#ff6b6b' }}>●</span> Bearing (0-185mm)</span>
                <span><span style={{ color: '#4dabf7' }}>●</span> Shaft (0-135mm)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Longer-term Telemetry Recharts Graph */}
        <div className="asm-viz" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
          <div className="asm-viz__bar" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            <span>Displacement History Analytics</span>
            <button
              onClick={handleClearPlot}
              disabled={plotData.length === 0}
              className="asm-btn asm-btn--clear"
              style={{
                background: plotData.length === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(239, 68, 68, 0.1)',
                borderColor: plotData.length === 0 ? 'var(--border)' : 'rgba(239, 68, 68, 0.3)',
                color: plotData.length === 0 ? 'var(--text-disabled)' : '#ef4444'
              }}
            >
              Clear Buffer
            </button>
          </div>

          <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {plotData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={plotData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="time"
                    stroke="var(--text-muted)"
                    tick={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    tick={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-sans)'
                    }}
                    cursor={{ stroke: 'var(--border)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-sans)' }} />
                  <Line
                    type="monotone"
                    dataKey="displacement"
                    stroke="var(--primary)"
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
                fontSize: '11px',
                fontFamily: 'var(--font-mono)'
              }}>
                NO TELEMETRY DATA IN BUFFER. AWAITING OPERATION START...
              </div>
            )}
          </div>
        </div>
      </div>
    )
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
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
              <button
                type="button"
                onClick={handleDisconnect}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-primary)',
                  background: 'var(--primary-dark)',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  opacity: statusLoading ? 0.7 : 1,
                }}
                disabled={statusLoading}
              >
                {statusLoading ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--bg-primary)',
                  background: 'var(--primary)',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  opacity: statusLoading ? 0.7 : 1,
                }}
                disabled={statusLoading}
              >
                {statusLoading ? "Connecting…" : "Connect"}
              </button>
            )}
          </>
        }
      />

      {/* Sub-nav: Tabs — Stitch pattern */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        flexShrink: 0,
        background: 'var(--bg-primary)',
      }}>
        {/* Flat tabs */}
        <div style={{ display: 'flex', gap: '24px' }}>
          {["monitoring", "plots"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: '11px',
                fontWeight: activeTab === tab ? 700 : 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                padding: '10px 0',
                cursor: 'pointer',
                transition: 'color 150ms ease-out',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* 3-LED Status Tower Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 8px',
          background: 'rgba(255,255,255,0.01)',
          borderLeft: '1px solid var(--border)',
          height: '28px'
        }}>
          <span style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginRight: '2px'
          }}>STATUS TOWER:</span>

          {/* RUN LED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="System Connected and Ready">
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '1.5px solid #333',
              background: greenActive
                ? 'radial-gradient(circle, #4ade80, #22c55e)'
                : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
              boxShadow: greenActive
                ? '0 0 8px rgba(74, 222, 128, 0.75), inset 0 1px 1px rgba(255,255,255,0.3)'
                : 'inset 0 1px 2px rgba(0,0,0,0.5)',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: greenActive ? '#4ade80' : 'var(--text-disabled)' }}>RUN</span>
          </div>

          {/* BUSY LED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Press Cycle Active">
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '1.5px solid #333',
              background: orangeActive
                ? 'radial-gradient(circle, #fbbf24, #f59e0b)'
                : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
              boxShadow: orangeActive
                ? '0 0 8px rgba(251, 191, 36, 0.75), inset 0 1px 1px rgba(255,255,255,0.3)'
                : 'inset 0 1px 2px rgba(0,0,0,0.5)',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: orangeActive ? '#fbbf24' : 'var(--text-disabled)' }}>BUSY</span>
          </div>

          {/* FLT LED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Safety Curtain Triggered or Buzzer Active">
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '1.5px solid #333',
              background: redActive
                ? 'radial-gradient(circle, #ef4444, #dc2626)'
                : 'radial-gradient(circle, #1a1a1a, #0a0a0a)',
              boxShadow: redActive
                ? '0 0 8px rgba(239, 68, 68, 0.75), inset 0 1px 1px rgba(255,255,255,0.3)'
                : 'inset 0 1px 2px rgba(0,0,0,0.5)',
              transition: 'all 0.3s ease'
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: redActive ? '#ef4444' : 'var(--text-disabled)' }}>FLT</span>
          </div>
        </div>
      </div>

      {/* Workspace — fills remaining space */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {tabPanels[activeTab]}

        {/* SAFETY INTERRUPT OVERLAY */}
        <SafetyOverlay
          isVisible={isSafetyFault}
          message={
            plantData?.safety?.curtain && plantData?.safety?.buzzer
              ? "Human presence detected (safety curtain breached) & emergency buzzer active."
              : plantData?.safety?.curtain
                ? "Human presence detected in hydraulic station area (safety curtain breached)."
                : "Emergency buzzer active."
          }
          badgeText="Hydraulic Press Operations Locked Out"
        />
      </div>

      {/* BUZZER ALARM VIEWPORT RING IS HANDLED BY SafetyOverlay */}

      {/* Interactive Sensor Pop-Up Overlay */}
      {activeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={() => closeModal()}
        >
          <div
            style={{
              background: "#252932",
              border: "1px solid #323842",
              borderRadius: "4px",
              width: "580px",
              maxWidth: "95%",
              padding: "24px",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: "20px"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => closeModal()}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-secondary)",
                borderRadius: "50%",
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255,255,255,0.08)";
                e.target.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(255,255,255,0.03)";
                e.target.style.color = "var(--text-secondary)";
              }}
            >
              ✕
            </button>

            {/* Modal Header */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: isWsConnected ? "#4ade80" : "#ef4444", boxShadow: `0 0 8px ${isWsConnected ? "#4ade80" : "#ef4444"}` }} />
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  {activeModal === "piston" && "Piston Displacement Diagnostics"}
                  {activeModal === "clamp" && "Vice Clamp & Workpiece Proximity Diagnostics"}
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                {activeModal === "piston" && "Sensor Model: Assembly-LDS-H01 • Linear Displacement Sensor"}
                {activeModal === "clamp" && "Sensor Model: Assembly-PROX-V02 • Vice Proximity Sensors"}
              </p>
            </div>

            {/* Hardware Specifications */}
            <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "12px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.68rem", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Hardware Specifications
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
                <div><span style={{ color: "var(--text-muted)" }}>Target Host:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>192.168.1.58</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>OPC-UA Port:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>4840</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Protocol:</span> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>OPC-UA (TCP)</span></div>
                <div><span style={{ color: "var(--text-muted)" }}>Gateway Status:</span> <span style={{ fontWeight: 700, color: isWsConnected ? "#4ade80" : "#ef4444" }}>{isWsConnected ? "CONNECTED" : "DISCONNECTED"}</span></div>
              </div>
            </div>

            {/* Live Metrics */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.68rem", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Decoded Process Variables
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                {activeModal === "piston" && (
                  <>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Linear Displacement</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>{displacement != null ? displacement : "---"} <span style={{ fontSize: "10px", fontWeight: 600 }}>mm</span></div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Raw Analog Position</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#e1e2ea", marginTop: "4px" }}>{plantData?.position?.displacement_mm != null ? plantData.position.displacement_mm.toFixed(2) : "---"} <span style={{ fontSize: "10px", fontWeight: 600 }}>mm</span></div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Piston State</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#e1e2ea", marginTop: "4px" }}>{displacement != null ? (displacement > 5 ? "EXTENDING" : "RETRACTED") : "---"}</div>
                    </div>
                  </>
                )}
                {activeModal === "clamp" && (
                  <>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Clamp Status</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: plantData?.vice?.close ? "#38bdf8" : "#4ade80", marginTop: "4px" }}>{plantData?.vice?.close ? "CLOSED" : plantData?.vice?.open ? "OPEN" : "---"}</div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Bearing Detected</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: plantData?.assembly?.bearing ? "#ff6b6b" : "#e1e2ea", marginTop: "4px" }}>{plantData?.assembly?.bearing ? "YES" : "NO"}</div>
                    </div>
                    <div style={{ background: "#14161a", border: "1px solid #323842", borderRadius: "4px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Shaft Detected</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: plantData?.assembly?.shaft ? "#38bdf8" : "#e1e2ea", marginTop: "4px" }}>{plantData?.assembly?.shaft ? "YES" : "NO"}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* OPC-UA Direct Nodes Table */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.68rem", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                OPC-UA Telemetry Node Table
              </h4>
              <div style={{ overflowX: "auto", border: "1px solid #323842", borderRadius: "4px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", textAlign: "left", fontFamily: "var(--font-mono)" }}>
                  <thead>
                    <tr style={{ background: "#14161a", borderBottom: "1px solid #323842" }}>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "9px" }}>NODE ID (ns=4;s=...)</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "9px" }}>VARIABLE / SYMBOL</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "9px" }}>TYPE</th>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "9px" }}>LIVE VALUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeModal === "piston" && (
                      <>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>|var|CODESYS Control Win V3 x64.Application.GVL.rCylinderPos</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>rCylinderPos</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>REAL</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8", fontWeight: 700 }}>{plantData?.position?.displacement_mm != null ? plantData.position.displacement_mm.toFixed(3) : "---"}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>|var|CODESYS Control Win V3 x64.Application.GVL.bSafetyCurtain</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>bSafetyCurtain</td>
                          <td style={{ padding: "8px 12px", color: "#ef4444" }}>BOOL</td>
                          <td style={{ padding: "8px 12px", color: plantData?.safety?.curtain ? "#ef4444" : "var(--text-muted)" }}>{plantData?.safety?.curtain ? "TRUE" : "FALSE"}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>|var|CODESYS Control Win V3 x64.Application.GVL.bEmergencyBuzzer</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>bEmergencyBuzzer</td>
                          <td style={{ padding: "8px 12px", color: "#ef4444" }}>BOOL</td>
                          <td style={{ padding: "8px 12px", color: plantData?.safety?.buzzer ? "#ef4444" : "var(--text-muted)" }}>{plantData?.safety?.buzzer ? "TRUE" : "FALSE"}</td>
                        </tr>
                      </>
                    )}
                    {activeModal === "clamp" && (
                      <>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>|var|CODESYS Control Win V3 x64.Application.GVL.bViceOpen</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>bViceOpen</td>
                          <td style={{ padding: "8px 12px", color: "#4ade80" }}>BOOL</td>
                          <td style={{ padding: "8px 12px", color: plantData?.vice?.open ? "#4ade80" : "var(--text-muted)" }}>{plantData?.vice?.open ? "TRUE" : "FALSE"}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>|var|CODESYS Control Win V3 x64.Application.GVL.bViceClose</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>bViceClose</td>
                          <td style={{ padding: "8px 12px", color: "#38bdf8" }}>BOOL</td>
                          <td style={{ padding: "8px 12px", color: plantData?.vice?.close ? "#38bdf8" : "var(--text-muted)" }}>{plantData?.vice?.close ? "TRUE" : "FALSE"}</td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #323842" }}>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>|var|CODESYS Control Win V3 x64.Application.GVL.bBearingWorkpiece</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>bBearingWorkpiece</td>
                          <td style={{ padding: "8px 12px", color: "#4ade80" }}>BOOL</td>
                          <td style={{ padding: "8px 12px", color: plantData?.assembly?.bearing ? "#ff6b6b" : "var(--text-muted)" }}>{plantData?.assembly?.bearing ? "TRUE" : "FALSE"}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>|var|CODESYS Control Win V3 x64.Application.GVL.bShaftWorkpiece</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>bShaftWorkpiece</td>
                          <td style={{ padding: "8px 12px", color: "#4ade80" }}>BOOL</td>
                          <td style={{ padding: "8px 12px", color: plantData?.assembly?.shaft ? "#38bdf8" : "var(--text-muted)" }}>{plantData?.assembly?.shaft ? "TRUE" : "FALSE"}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

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
