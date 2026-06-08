import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { setAuth } from '../store/cartStore';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, UserPlus, AlertCircle, Package } from 'lucide-react';

export default function Auth({ mode = 'login', onAuthChange }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';

  const [form, setForm] = useState({ email: '', full_name: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [currentMode, setCurrentMode] = useState(mode);
  const isRegister = currentMode === 'register';
  const isForgot = currentMode === 'forgot';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (isForgot) {
      try {
        const res = await fetch('/api/ecom/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to send reset link');
        
        // Log demo link for user convenience (testing only)
        if (data.demo_link) console.log("Demo Reset Link:", data.demo_link);
        
        setSuccess(data.message);
      } catch (err) {
        setError(err.message === 'Failed to fetch' ? 'Server offline. Please try again.' : err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

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
      setError(err.message === 'Failed to fetch' ? 'Server offline. Please try again.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ 
      position: 'relative', 
      overflow: 'hidden',
      minHeight: 'calc(100vh - 73px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      background: 'var(--bg-secondary)'
    }}>
      {/* Background Decor */}
      <div style={{
        position: 'absolute', top: '10%', left: '20%', width: '40%', height: '40%',
        background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
        opacity: 0.05, filter: 'blur(80px)', zIndex: 0
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', right: '20%', width: '40%', height: '40%',
        background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
        opacity: 0.05, filter: 'blur(80px)', zIndex: 0
      }} />

      <motion.div 
        className="glass-panel"
        style={{ 
          width: '100%', maxWidth: 440, padding: 40, position: 'relative', 
          zIndex: 1, boxShadow: 'var(--shadow-lg)', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)' 
        }}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, type: 'spring', bounce: 0.2 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={32} />
          </div>
        </div>
        
        {/* Toggle Tabs */}
        {!isForgot && (
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 4, marginBottom: 32 }}>
            <button onClick={() => setCurrentMode('login')} type="button" style={{ 
              flex: 1, textAlign: 'center', padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              background: !isRegister ? 'var(--bg-card)' : 'transparent',
              boxShadow: !isRegister ? 'var(--shadow-sm)' : 'none',
              color: !isRegister ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600, transition: 'all 0.2s'
            }}>Login</button>
            <button onClick={() => setCurrentMode('register')} type="button" style={{ 
              flex: 1, textAlign: 'center', padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              background: isRegister ? 'var(--bg-card)' : 'transparent',
              boxShadow: isRegister ? 'var(--shadow-sm)' : 'none',
              color: isRegister ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600, transition: 'all 0.2s'
            }}>Sign Up</button>
          </div>
        )}

        <div className="auth-title" style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>
          {isForgot ? 'Reset Password' : isRegister ? 'Create an Account' : 'Welcome back'}
        </div>
        <div className="auth-sub" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 32 }}>
          {isForgot 
            ? 'Enter your email and we will send you a reset link.'
            : isRegister
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
          
          {!isForgot && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                {!isRegister && (
                  <button type="button" onClick={() => setCurrentMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    Forgot password?
                  </button>
                )}
              </div>
              <input className="form-input" type="password" placeholder="••••••••" style={{ marginTop: 8 }}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required minLength={6} />
            </div>
          )}

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{
                  background: 'var(--error-bg)', color: 'var(--error)',
                  padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 4
                }}>
                  <AlertCircle size={18} /> {error}
                </div>
              </motion.div>
            )}
            
            {success && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{
                  background: 'var(--success-bg, rgba(22,163,74,0.1))', color: 'var(--success, #16a34a)',
                  padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--success-border, rgba(22,163,74,0.2))',
                  fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 4
                }}>
                  {success}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
            style={{ marginTop: 8, width: '100%', display: 'flex', justifyContent: 'center', padding: '12px 24px' }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: 'transparent', borderTopColor: 'currentColor' }} /> : 
             isForgot ? 'Send Reset Link' : isRegister ? <><UserPlus size={18} /> Sign Up</> : <><LogIn size={18} /> Sign In</>}
          </button>
          
          {isForgot && (
            <button type="button" onClick={() => setCurrentMode('login')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textAlign: 'center', width: '100%', marginTop: 8 }}>
              Back to login
            </button>
          )}
        </form>
      </motion.div>
    </div>
  );
}
