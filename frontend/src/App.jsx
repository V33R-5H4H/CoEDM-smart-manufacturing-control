import React, { Suspense, lazy } from "react";
import { Routes, Route, NavLink } from "react-router-dom";

// Lazy load page components to improve initial load performance (LCP)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Asrs = lazy(() => import("./pages/asrs/Dashboard"));
const Mirac = lazy(() => import("./pages/Mirac"));
const Triac = lazy(() => import("./pages/Triac"));
const Assembly = lazy(() => import("./pages/Assembly"));
const TestingStation = lazy(() => import("./pages/TestingStation"));
const Amr = lazy(() => import("./pages/Amr"));
const Cobot = lazy(() => import("./pages/Cobot"));

export default function App() {
  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      {/* Inject custom bottom-nav styling */}
      <style>{`
        .bottom-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 60px;
          background: rgba(19, 27, 46, 0.85);
          backdrop-filter: blur(12px);
          border-top: 1px solid var(--border);
          padding: 0 24px;
          z-index: 100;
          box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
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
          background: rgba(245, 246, 247, 0.08);
          color: var(--primary-light);
          border: 1px solid rgba(245, 246, 247, 0.25);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
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
          box-shadow: 0 0 8px var(--status-ok);
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
          <NavItem to="/mirac" icon="settings_input_component" label="Smart MIRAC" />
          <NavItem to="/triac" icon="precision_manufacturing" label="Smart TRIAC" />
          <NavItem to="/assembly" icon="factory" label="Assembly" />
          <NavItem to="/testing-station" icon="fact_check" label="Testing Station" />
          <NavItem to="/amr" icon="local_shipping" label="AMR" />
          <NavItem to="/cobot" icon="smart_toy" label="Cobot" />
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
