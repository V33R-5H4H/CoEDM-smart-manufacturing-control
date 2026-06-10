import React, { Suspense, lazy, useState, useEffect } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ThemeToggle from "./components/ThemeToggle";
import { useTheme } from "./theme/ThemeContext";
import MiniStationIcon from "./components/MiniStationIcons";

// Lazy load page components to improve initial load performance (LCP)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Asrs = lazy(() => import("./pages/asrs/Dashboard"));
const Mirac = lazy(() => import("./pages/Mirac"));
const Triac = lazy(() => import("./pages/Triac"));
const Assembly = lazy(() => import("./pages/Assembly"));
const TestingStation = lazy(() => import("./pages/TestingStation"));
const Amr = lazy(() => import("./pages/Amr"));
const Cobot = lazy(() => import("./pages/Cobot"));
const Inspection = lazy(() => import("./pages/Inspection"));

export default function App() {
  const [sysStatus, setSysStatus] = useState("SYS_OP_NORMAL");
  const [pingMs, setPingMs] = useState(null);
  const { resolved } = useTheme();

  useEffect(() => {
    const poll = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch('/api/health');
        const ms = Math.round(performance.now() - t0);
        setPingMs(ms);
        if (res.ok) {
          const data = await res.json();
          setSysStatus(data.status === 'ok' ? 'SYS_OP_NORMAL' : 'SYS_DEGRADED');
        } else {
          setSysStatus('SYS_DEGRADED');
        }
      } catch {
        setSysStatus('SYS_OFFLINE');
        setPingMs(null);
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      {/* Inject custom bottom-nav styling */}
      <style>{`
        .bottom-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 56px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border);
          padding: 0 24px;
          z-index: 100;
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
          flex-shrink: 0;
        }

        .bottom-nav-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .bottom-nav-links {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 100%;
        }

        .bottom-nav-item {
          display: flex;
          align-items: center;
          padding: 6px 14px;
          border-radius: 20px;
          color: var(--text-secondary);
          font-weight: 700;
          text-decoration: none;
          font-size: 13px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .bottom-nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .bottom-nav-item.active {
          background: var(--color-accent-amber-bg, rgba(245, 203, 92, 0.12));
          color: var(--primary);
          border: 1px solid var(--primary);
        }

        .bottom-nav-status {
          display: flex;
          align-items: center;
          gap: 16px;
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--text-muted);
        }

        .bottom-nav-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--status-ok);
          box-shadow: 0 0 6px var(--status-ok);
        }

        .theme-toggle {
          display: flex;
          align-items: center;
          gap: 5px;
          background: none;
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 4px 10px;
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 150ms ease-out;
          font-family: var(--font-mono);
        }

        .theme-toggle:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--primary);
        }

        .theme-toggle-icon {
          font-size: 15px;
        }

        .theme-toggle-label {
          font-size: 13px;
        }
      `}</style>

      {/* Main Content */}
      <main className="main-content" style={{ flex: 1, overflow: 'hidden' }}>
        <Suspense fallback={
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite', fontSize: '24px', marginRight: '8px' }}>sync</span>
            Loading module...
          </div>
        }>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/asrs" element={<Asrs />} />
            <Route path="/mirac" element={<Mirac />} />
            <Route path="/triac" element={<Triac />} />
            <Route path="/assembly" element={<Assembly />} />
            <Route path="/testing-station" element={<TestingStation />} />
            <Route path="/amr" element={<Amr />} />
            <Route path="/cobot" element={<Cobot />} />
            <Route path="/inspection" element={<Inspection />} />
          </Routes>
        </Suspense>
      </main>

      {/* Global Toast Notifications — single instance for all lazy-loaded pages */}
      <ToastContainer position="bottom-right" autoClose={4000} closeOnClick pauseOnHover draggable theme={resolved} />

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        {/* Left Side: Brand Logo */}
        <div className="bottom-nav-brand">
          <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '24px' }}>factory</span>
          <div>
            <span style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              marginRight: '6px'
            }}>CoEDM</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-muted)'
            }}>v4.2.0-STABLE</span>
          </div>
        </div>

        {/* Center: Main Links */}
        <div className="bottom-nav-links">
          <NavItem to="/" icon="dashboard" label="Dashboard" />
          <NavItem to="/asrs" machineType="asrs" label="AS/RS" />
          <NavItem to="/mirac" machineType="mirac" label="Smart MIRAC" />
          <NavItem to="/triac" machineType="triac" label="Smart TRIAC" />
          <NavItem to="/assembly" machineType="assembly" label="Assembly" />
          <NavItem to="/testing-station" machineType="testing" label="Testing Station" />
          <NavItem to="/inspection" machineType="inspection" label="Inspection" />
          <NavItem to="/amr" machineType="amr" label="AMR" />
          <NavItem to="/cobot" machineType="cobot" label="Cobot" />
        </div>

        {/* Right Side: Status Cluster */}
        <div className="bottom-nav-status">
          <ThemeToggle compact />
          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="bottom-nav-dot" style={{
              background: sysStatus === 'SYS_OP_NORMAL' ? 'var(--status-ok)' : sysStatus === 'SYS_DEGRADED' ? '#f59e0b' : '#ef4444',
              boxShadow: `0 0 6px ${sysStatus === 'SYS_OP_NORMAL' ? 'var(--status-ok)' : sysStatus === 'SYS_DEGRADED' ? '#f59e0b' : '#ef4444'}`
            }} />
            <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>{sysStatus}</span>
          </div>
          <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>
            {pingMs !== null ? `PING: ${pingMs}ms` : 'PING: ---'}
          </span>
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, icon, machineType, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
    >
      {machineType ? (
        <span style={{ marginRight: '6px', display: 'inline-flex', alignItems: 'center' }}>
          <MiniStationIcon type={machineType} size={22} color="var(--primary)" />
        </span>
      ) : (
        <span className="material-symbols-outlined" style={{
          fontSize: '22px',
          marginRight: '6px',
          display: 'inline-block',
          verticalAlign: 'middle'
        }}>{icon}</span>
      )}
      <span style={{ verticalAlign: 'middle' }}>{label}</span>
    </NavLink>
  );
}
