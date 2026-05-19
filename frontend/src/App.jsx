import React, { useState, Suspense, lazy } from "react";
import { Routes, Route, NavLink } from "react-router-dom";

// Lazy load page components to improve initial load performance (LCP)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Triac = lazy(() => import("./pages/Triac"));
const Mirac = lazy(() => import("./pages/Mirac"));
const Assembly = lazy(() => import("./pages/Assembly"));
const ASRSDashboard = lazy(() => import("./pages/asrs/Dashboard"));

export default function App() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="app-container">
      {/* Sidebar — Stitch M3 Industrial Nav */}
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}>
        {/* Brand Header */}
        <div className="sidebar-header" style={{
          padding: isCollapsed ? '0' : '0 12px',
          borderBottom: '1px solid var(--border)',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: '8px'
        }}>
          {!isCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '20px' }}>factory</span>
              <div>
                <div style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2
                }}>CoEDM</div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em'
                }}>v4.2.0-STABLE</div>
              </div>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="sidebar-toggle"
            style={{ fontSize: '18px', padding: '8px' }}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {isCollapsed ? "menu" : "close"}
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <NavItem to="/" icon="dashboard" label="Dashboard" isCollapsed={isCollapsed} />
          <NavItem to="/asrs" icon="inventory_2" label="AS/RS" isCollapsed={isCollapsed} />
          <NavItem to="/triac" icon="precision_manufacturing" label="Smart TRIAC" isCollapsed={isCollapsed} />
          <NavItem to="/mirac" icon="settings_input_component" label="Smart MIRAC" isCollapsed={isCollapsed} />
          <NavItem to="/assembly" icon="factory" label="Assembly Station" isCollapsed={isCollapsed} />
        </nav>

        {/* Status Footer */}
        {!isCollapsed && (
          <div style={{
            padding: '12px 12px',
            borderTop: '1px solid var(--border)',
            marginTop: 'auto',
            background: 'var(--bg-tertiary)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: 'var(--status-ok)',
              }} />
              <span style={{
                fontSize: '11px', fontWeight: 600,
                color: 'var(--text-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>SYS_OP_NORMAL</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-muted)'
            }}>SERVER PING: 12ms</div>
          </div>
        )}
      </aside>

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
    </div>
  );
}

function NavItem({ to, icon, label, isCollapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      title={isCollapsed ? label : undefined}
    >
      <span className={`material-symbols-outlined ${to === '/asrs' ? '' : ''}`} style={{
        fontSize: '20px',
        minWidth: '24px',
        textAlign: 'center'
      }}>{icon}</span>
      {!isCollapsed && (
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginLeft: '12px',
          whiteSpace: 'nowrap'
        }}>{label}</span>
      )}
    </NavLink>
  );
}
