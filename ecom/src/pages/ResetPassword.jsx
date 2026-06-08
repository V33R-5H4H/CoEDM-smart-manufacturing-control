import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [form, setForm] = useState({ new_password: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid or missing reset token.');
      return;
    }

    if (form.new_password !== form.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/ecom/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: form.new_password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to reset password');

      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
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

      <motion.div 
        className="glass-panel"
        style={{ 
          width: '100%', maxWidth: 440, padding: 40, position: 'relative', 
          zIndex: 1, boxShadow: 'var(--shadow-lg)', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)' 
        }}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={32} />
          </div>
        </div>

        <div className="auth-title" style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>
          Set New Password
        </div>
        <div className="auth-sub" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 32 }}>
          Please enter your new password below.
        </div>

        {success ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--success)', display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <CheckCircle size={48} />
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Password Updated</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Redirecting to login...</div>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={form.new_password}
                onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                required minLength={6} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={form.confirm_password}
                onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))}
                required minLength={6} />
            </div>

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
            </AnimatePresence>

            <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
              style={{ marginTop: 8, width: '100%', display: 'flex', justifyContent: 'center', padding: '12px 24px' }}>
              {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: 'transparent', borderTopColor: 'currentColor' }} /> : 'Update Password'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
