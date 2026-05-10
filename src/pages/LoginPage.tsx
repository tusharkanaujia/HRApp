import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { login } from '../store/authSlice';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../contexts/TenantContext';
import type { RootState } from '../store';

export default function LoginPage() {
  const dispatch = useDispatch();
  const { isLoggedIn } = useAuth();
  const users = useSelector((s: RootState) => s.auth.users);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const { tenant } = useTenant();
  const initials = tenant?.name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? 'WH';
  const color = tenant?.primaryColor ?? '#2563eb';
  const logoSrc = tenant?.logoUrl?.trim() || (tenant?.id ? `/tenants/${tenant.id}/logo.png` : null);
  const [logoFailed, setLogoFailed] = useState(false);

  if (isLoggedIn) return <Navigate to="/" replace />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const match = users.find(u => u.username === username.trim() && u.password === password);
    if (!match) { setError('Invalid username or password.'); return; }
    setError('');
    dispatch(login({ username: username.trim(), password }));
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {logoSrc && !logoFailed ? (
            <img
              src={logoSrc}
              alt={tenant?.name ?? 'WeHive'}
              onError={() => setLogoFailed(true)}
              className="inline-block w-14 h-14 rounded-2xl object-contain bg-white mb-4 p-1"
            />
          ) : (
            <div
              className="inline-flex w-14 h-14 rounded-2xl items-center justify-center font-bold text-xl text-white mb-4"
              style={{ backgroundColor: color }}
            >
              {initials}
            </div>
          )}
          <h1 className="text-xl font-bold text-white">WeHive</h1>
          <p className="text-slate-400 text-sm mt-1">{tenant?.name ?? 'HR Management'}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-2xl space-y-4">
          <h2 className="text-slate-800 font-semibold text-base">Sign in</h2>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
            <input
              type="password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
            />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
