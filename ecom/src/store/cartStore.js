// Simple cart store using localStorage
const CART_KEY = 'coedm_cart';
const TOKEN_KEY = 'coedm_ecom_token';
const USER_KEY  = 'coedm_ecom_user';

export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function addToCart(product, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => i.item_id === product.item_id);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + qty, product.available_qty);
  } else {
    cart.push({ ...product, quantity: qty });
  }
  saveCart(cart);
  return cart;
}

export function removeFromCart(item_id) {
  const cart = getCart().filter(i => i.item_id !== item_id);
  saveCart(cart);
  return cart;
}

export function updateQty(item_id, qty) {
  const cart = getCart().map(i =>
    i.item_id === item_id ? { ...i, quantity: Math.max(1, qty) } : i
  );
  saveCart(cart);
  return cart;
}

export function clearCart() {
  localStorage.removeItem(CART_KEY);
}

export function cartTotal(cart) {
  return cart.reduce((s, i) => s + i.price * i.quantity, 0);
}

export function getCartCount(cart) {
  return cart.reduce((s, i) => s + i.quantity, 0);
}

// ── Auth helpers ──────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
  catch { return null; }
}

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}
