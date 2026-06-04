import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { setAuth } from '../store/cartStore';

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

      setAuth(data.token, { user_id: data.user_id, email: data.email, full_name: data.full_name });
      onAuthChange?.();
      navigate('/' + redirect.replace(/^\//, ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ background: 'var(--bg-primary)' }}>
      <div className="card auth-card">
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>🏭</div>
        <div className="auth-title">
          {isRegister ? 'Create Account' : 'Welcome back'}
        </div>
        <div className="auth-sub">
          {isRegister
            ? 'Sign up to order from CoEDM Store'
            : 'Sign in to your CoEDM Store account'}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

          {error && (
            <div style={{
              background: 'var(--error-bg)', color: 'var(--error)',
              padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem', fontWeight: 500,
            }}>
              ⚠ {error}
            </div>
          )}

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
            style={{ marginTop: 4 }}>
            {loading ? '⏳ Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {isRegister ? (
            <>Already have an account? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link></>
          ) : (
            <>No account? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign up</Link></>
          )}
        </div>
      </div>
    </div>
  );
}
