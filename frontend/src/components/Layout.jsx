import React from 'react';
import { Outlet, Link } from 'react-router-dom';

const Layout = () => {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, var(--bg-950) 0%, var(--bg-900) 100%)',
      color: 'var(--text-primary)'
    }}>
      <header style={{
        background: 'var(--bg-900)',
        padding: '1.5rem 2rem',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: '1400px',
          margin: '0 auto'
        }}>
          <h1 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '700',
            margin: 0,
            letterSpacing: '-0.02em'
          }}>
            Control Portal
          </h1>
          <Link 
            to="/" 
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.875rem',
              fontWeight: '500',
              textDecoration: 'none',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-lg)',
              transition: 'all var(--transition-fast)'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'var(--bg-800)';
              e.target.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
              e.target.style.color = 'var(--text-muted)';
            }}
          >
            Home
          </Link>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;