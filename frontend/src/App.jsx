import React, { Suspense, lazy } from "react";
import { Routes, Route, NavLink } from "react-router-dom";

// Lazy load page components to improve initial load performance (LCP)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Triac = lazy(() => import("./pages/Triac"));
const Mirac = lazy(() => import("./pages/Mirac"));
const Assembly = lazy(() => import("./pages/Assembly"));
const ASRSDashboard = lazy(() => import("./pages/asrs/Dashboard"));

export default function App() {
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
          font-size: 10px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid transparent;
        }

        .bottom-nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .bottom-nav-item.active {
          background: rgba(249, 115, 22, 0.08);
          color: var(--primary);
          border: 1px solid rgba(249, 115, 22, 0.2);
          box-shadow: 0 0 8px rgba(249, 115, 22, 0.05);
        }

        .bottom-nav-status {
          display: flex;
          align-items: center;
          gap: 16px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-muted);
        }

        .bottom-nav-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--status-ok);
          box-shadow: 0 0 6px var(--status-ok);
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
            <Route path="/asrs" element={<ASRSDashboard />} />
            <Route path="/triac" element={<Triac />} />
            <Route path="/mirac" element={<Mirac />} />
            <Route path="/assembly" element={<Assembly />} />
          </Routes>
        </Suspense>
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        {/* Left Side: Brand Logo */}
        <div className="bottom-nav-brand">
          <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '20px' }}>factory</span>
          <div>
            <span style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              marginRight: '6px'
            }}>CoEDM</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-muted)'
            }}>v4.2.0-STABLE</span>
          </div>
        </div>

        {/* Center: Main Links */}
        <div className="bottom-nav-links">
          <NavItem to="/" icon="dashboard" label="Dashboard" />
          <NavItem to="/asrs" icon="inventory_2" label="AS/RS" />
          <NavItem to="/triac" icon="precision_manufacturing" label="Smart TRIAC" />
          <NavItem to="/mirac" icon="settings_input_component" label="Smart MIRAC" />
          <NavItem to="/assembly" icon="factory" label="Assembly Station" />
        </div>

        {/* Right Side: Status Cluster */}
        <div className="bottom-nav-status">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="bottom-nav-dot" />
            <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>SYS_OP_NORMAL</span>
          </div>
          <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>PING: 12ms</span>
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="material-symbols-outlined" style={{
        fontSize: '18px',
        marginRight: '6px',
        display: 'inline-block',
        verticalAlign: 'middle'
      }}>{icon}</span>
      <span style={{ verticalAlign: 'middle' }}>{label}</span>
    </NavLink>
  );
}
