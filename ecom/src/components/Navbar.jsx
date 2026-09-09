import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getUser, clearAuth } from '../store/cartStore';
import { 
  Sun, Moon, ShoppingBag, Package, LogOut, User, ClipboardList, Layers, 
  Cpu, Sparkles, ChevronDown, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Navbar({ onCartOpen, cartCount }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState(
    localStorage.getItem('ecom_theme') || 'scada-industrial'
  );
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const user = getUser();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ecom_theme', theme);
  }, [theme]);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const themes = [
    { id: 'scada-industrial', label: 'SCADA Industrial', icon: <Cpu size={14} className="text-primary" /> },
    { id: 'dark',             label: 'Slate Dark',       icon: <Moon size={14} /> },
    { id: 'light',            label: 'Executive Light',  icon: <Sun size={14} /> }
  ];

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <Link to="/" className="navbar-brand">
            <Package className="text-primary" size={28} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="nav-text" style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                CoEDM Store
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                Smart Manufacturing MES
              </span>
            </div>
          </Link>

          <Link
            to="/configure"
            className="nav-link"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 700, fontSize: '0.88rem',
              color: location.pathname === '/configure' ? 'var(--primary)' : 'var(--text-secondary)'
            }}
          >
            <Layers size={16} /> <span className="nav-text">Sub-Assembly Configurator</span>
          </Link>
        </div>

        <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user ? (
            <>
              {user.is_admin && (
                <Link to="/admin" className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 700 }}>
                  <User size={16} /> <span className="nav-text">Fulfillment Admin</span>
                </Link>
              )}
              <Link to="/orders" className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardList size={16} /> <span className="nav-text">My Orders</span>
              </Link>
              <button className="nav-link" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LogOut size={16} /> <span className="nav-text">{user.full_name}</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-ghost" style={{ padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: '0.88rem' }}>
              B2B Login
            </Link>
          )}

          {/* 3-way Theme Selector */}
          <div style={{ position: 'relative' }}>
            <button 
              className="btn-icon" 
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              style={{
                borderRadius: 'var(--radius-md)', padding: '6px 12px', width: 'auto',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700,
                border: '1px solid var(--border)', background: 'var(--bg-secondary)'
              }}
              title="Switch UI Theme"
            >
              {theme === 'scada-industrial' ? <Cpu size={16} className="text-primary" /> : theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              <span style={{ fontSize: '0.75rem' }}>{theme === 'scada-industrial' ? 'SCADA' : theme === 'dark' ? 'Dark' : 'Light'}</span>
              <ChevronDown size={12} />
            </button>

            <AnimatePresence>
              {themeMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 6,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', padding: 6, minWidth: 170,
                    boxShadow: 'var(--shadow-lg)', zIndex: 100
                  }}
                >
                  {themes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setTheme(t.id); setThemeMenuOpen(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 4, fontSize: '0.82rem', fontWeight: 600,
                        background: theme === t.id ? 'var(--surface-hover)' : 'transparent',
                        color: theme === t.id ? 'var(--primary)' : 'var(--text-primary)',
                        textAlign: 'left', border: 'none', cursor: 'pointer'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {t.icon} {t.label}
                      </span>
                      {theme === t.id && <Check size={14} className="text-primary" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button className="btn-icon cart-btn" onClick={onCartOpen} title="Open cart" style={{ borderRadius: 'var(--radius-md)' }}>
            <ShoppingBag size={20} />
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}
