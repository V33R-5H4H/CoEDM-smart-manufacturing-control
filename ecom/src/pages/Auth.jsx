import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { setAuth } from '../store/cartStore';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, AlertCircle, Package } from 'lucide-react';

export default function Auth({ mode = 'login', onAuthChange }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';

  const [form, setForm] = useState({ email: '', full_name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isRegister = mode === 'register';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const url = isRegister ? '/api/ecom/auth/register' : '/api/ecom/auth/login';
    const body = isRegister
      ? { email: form.email, full_name: form.full_name, password: form.password }
      : { email: form.email, password: form.password };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Authentication failed');

      setAuth(data.token, { 
        user_id: data.user_id, 
        email: data.email, 
        full_name: data.full_name,
        is_admin: data.is_admin
      });
      onAuthChange?.();
      navigate('/' + redirect.replace(/^\//, ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ 
      position: 'relative', 
      overflow: 'hidden'
    }}>
      {/* Background Decor */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%', width: '50%', height: '50%',
        background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
        opacity: 0.1, filter: 'blur(100px)', zIndex: 0
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%', width: '60%', height: '60%',
        background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
        opacity: 0.05, filter: 'blur(120px)', zIndex: 0
      }} />

      <motion.div 
        className="glass-panel"
        style={{ width: '100%', maxWidth: 440, padding: 40, position: 'relative', zIndex: 1, boxShadow: 'var(--shadow-lg)' }}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, type: 'spring', bounce: 0.2 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={32} />
          </div>
        </div>
        <div className="auth-title" style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 800 }}>
          {isRegister ? 'Create Account' : 'Welcome back'}
        </div>
        <div className="auth-sub" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 32 }}>
          {isRegister
            ? 'Sign up to order precision components.'
            : 'Sign in to access your CoEDM account.'}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" placeholder="John Doe"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                required />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required minLength={6} />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                style={{
                  background: 'var(--error-bg)', color: 'var(--error)',
                  padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8
                }}
              >
                <AlertCircle size={18} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
            style={{ marginTop: 8, width: '100%', display: 'flex', justifyContent: 'center' }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : 
             isRegister ? <><UserPlus size={18} /> Create Account</> : <><LogIn size={18} /> Sign In</>}
          </button>
        </form>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {isRegister ? (
            <>Already have an account? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link></>
          ) : (
            <>No account? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign up</Link></>
          )}
        </div>
      </motion.div>
    </div>
  );
}
