import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar';
import CartDrawer from './components/CartDrawer';
import Catalogue from './pages/Catalogue';
import Auth from './pages/Auth';
import Checkout from './pages/Checkout';
import OrderTracking from './pages/OrderTracking';
import MyOrders from './pages/MyOrders';

import { getCartCount, getCart, getUser } from './store/cartStore';

export default function App() {
  const [cartOpen, setCartOpen] = useState(false);
  const [cartCount, setCartCount] = useState(getCartCount(getCart()));

  const refreshCart = () => {
    setCartCount(getCartCount(getCart()));
  };

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('ecom_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const ProtectedRoute = ({ children }) => {
    const user = getUser();
    return user ? children : <Navigate to="/login" replace />;
  };

  return (
    <BrowserRouter>
      <Navbar onCartOpen={() => setCartOpen(true)} cartCount={cartCount} />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCartChange={refreshCart}
      />

      <Routes>
        <Route path="/" element={<Catalogue onCartChange={refreshCart} />} />
        <Route path="/login"    element={<Auth mode="login" onAuthChange={refreshCart} />} />
        <Route path="/register" element={<Auth mode="register" onAuthChange={refreshCart} />} />
        <Route path="/checkout" element={
          <ProtectedRoute><Checkout onCartChange={refreshCart} /></ProtectedRoute>
        } />
        <Route path="/order/:order_id" element={
          <ProtectedRoute><OrderTracking /></ProtectedRoute>
        } />
        <Route path="/orders" element={
          <ProtectedRoute><MyOrders /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
