import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getCart, getCartCount } from '../store/cartStore';
import { getUser, clearAuth } from '../store/cartStore';

const EMOJI_ICONS = { '☀️': 'light', '🌙': 'dark' };

export default function Navbar({ onCartOpen, cartCount: externalCount }) {
  const navigate = useNavigate();
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
      <div className="container">
        <div className="navbar-inner">
          <Link to="/" className="navbar-brand">
            🏭 <span>CoEDM</span> Store
          </Link>

          <div className="navbar-actions">
            {user ? (
              <>
                <Link to="/orders" className="nav-link">My Orders</Link>
                <button className="nav-link" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-link">Login</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Sign Up</Link>
              </>
            )}

            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            <button className="btn btn-ghost btn-sm cart-btn" onClick={onCartOpen}>
              🛒 Cart
              {externalCount > 0 && (
                <span className="cart-count">{externalCount}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
