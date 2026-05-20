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
    <div className="app-container">
      {/* Main Content */}
      <main className="main-content">
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

      {/* Bottom Header — Stitch M3 Horizontal Nav (below the main window) */}
      <header className="bottom-header">
        {/* Brand Header */}
        <div className="bottom-header-brand">
          <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '22px' }}>factory</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{
              fontSize: '15px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              lineHeight: 1.1
            }}>CoEDM</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-muted)',
              letterSpacing: '0.02em',
              lineHeight: 1
            }}>v4.2.0-STABLE</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="bottom-header-nav">
          <NavItem to="/" icon="dashboard" label="Dashboard" />
          <NavItem to="/asrs" icon="inventory_2" label="AS/RS" />
          <NavItem to="/triac" icon="precision_manufacturing" label="Smart TRIAC" />
          <NavItem to="/mirac" icon="settings_input_component" label="Smart MIRAC" />
          <NavItem to="/assembly" icon="factory" label="Assembly Station" />
        </nav>

        {/* Status Header info */}
        <div className="bottom-header-status">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: 'var(--status-ok)',
              boxShadow: '0 0 6px var(--status-ok)',
              animation: 'pulse 2s infinite'
            }} />
            <span style={{
              fontSize: '10px', 
              fontWeight: 600,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>SYS_OP_NORMAL</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-muted)'
          }}>PING: 12ms</div>
        </div>
      </header>
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
        marginRight: '8px'
      }}>{icon}</span>
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>{label}</span>
    </NavLink>
  );
}
