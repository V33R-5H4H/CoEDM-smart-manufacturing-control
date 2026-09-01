import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getUser, clearAuth } from '../store/cartStore';
import { Sun, Moon, ShoppingBag, Package, LogOut, User, ClipboardList, Layers } from 'lucide-react';

export default function Navbar({ onCartOpen, cartCount }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState(
    localStorage.getItem('ecom_theme') || 'light'
  );
  const user = getUser();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ecom_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link to="/" className="navbar-brand">
            <Package className="text-primary" size={28} />
            <span className="nav-text">CoEDM Store</span>
          </Link>

          <Link
            to="/configure"
            className="nav-link"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 700, fontSize: '0.9rem',
              color: location.pathname === '/configure' ? 'var(--primary)' : 'var(--text-secondary)'
            }}
          >
            <Layers size={16} /> <span className="nav-text">Assembly Configurator</span>
          </Link>
        </div>

        <div className="navbar-actions">
          {user ? (
            <>
              {user.is_admin && (
                <Link to="/admin" className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 700 }}>
                  <User size={16} /> <span className="nav-text">Admin Panel</span>
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
            <Link to="/login" className="btn btn-ghost" style={{ padding: '8px 16px', borderRadius: 99 }}>
              Login
            </Link>
          )}

          <button className="btn-icon" onClick={toggleTheme} style={{ marginLeft: 8 }} title="Toggle light/dark theme">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          <button className="btn-icon cart-btn" onClick={onCartOpen} title="Open cart">
            <ShoppingBag size={20} />
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}

