import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { setUserRole, addUser, removeUser, changePassword } from '../store/authSlice';
import type { RootState } from '../store';
import type { UserRole } from '../types';
import { Plus, Trash2, KeyRound, Shield, Eye, Pencil } from 'lucide-react';

const ROLE_STYLES: Record<UserRole, string> = {
  ADMIN:  'bg-purple-100 text-purple-700',
  EDITOR: 'bg-blue-100   text-blue-700',
  VIEWER: 'bg-slate-100  text-slate-600',
};

const ROLE_ICONS: Record<UserRole, React.ElementType> = {
  ADMIN:  Shield,
  EDITOR: Pencil,
  VIEWER: Eye,
};

export default function UsersPage() {
  const { isAdmin, currentUser } = useAuth();
  const dispatch = useDispatch();
  const users = useSelector((s: RootState) => s.auth.users);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('VIEWER');
  const [newEmpId, setNewEmpId] = useState('');
  const [addError, setAddError] = useState('');

  const [changePwFor, setChangePwFor] = useState<string | null>(null);
  const [newPwValue, setNewPwValue] = useState('');

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  if (!isAdmin) return <Navigate to="/" replace />;

  const adminCount = users.filter(u => u.role === 'ADMIN').length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUser.trim() || !newPass.trim()) { setAddError('All fields required.'); return; }
    if (users.find(u => u.username === newUser.trim())) { setAddError('Username already taken.'); return; }
    dispatch(addUser({
      id: `u${Date.now()}`,
      username: newUser.trim(),
      password: newPass,
      name: newName.trim(),
      empId: newEmpId.trim() || undefined,
      role: newRole,
    }));
    setShowAdd(false);
    setNewName(''); setNewUser(''); setNewPass(''); setNewEmpId(''); setNewRole('VIEWER'); setAddError('');
  };

  const handleRemove = (id: string) => {
    const target = users.find(u => u.id === id);
    if (!target) return;
    if (target.role === 'ADMIN' && adminCount <= 1) return;
    dispatch(removeUser(id));
    setConfirmRemove(null);
  };

  const handleRoleChange = (userId: string, role: UserRole) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    if (target.role === 'ADMIN' && role !== 'ADMIN' && adminCount <= 1) return;
    dispatch(setUserRole({ userId, role }));
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPwValue.trim() || !changePwFor) return;
    dispatch(changePassword({ userId: changePwFor, password: newPwValue.trim() }));
    setChangePwFor(null);
    setNewPwValue('');
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-slate-400 text-sm mt-0.5">{users.length} accounts · Admin only</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      {/* Role legend */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 mb-6 flex gap-6 text-sm">
        {(['ADMIN', 'EDITOR', 'VIEWER'] as UserRole[]).map(r => {
          const Icon = ROLE_ICONS[r];
          const desc = r === 'ADMIN' ? 'Manage users + full edit' : r === 'EDITOR' ? 'Add / edit / delete data' : 'Read-only access';
          return (
            <div key={r} className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${ROLE_STYLES[r]}`}>
                <Icon size={10} /> {r}
              </span>
              <span className="text-slate-400 text-xs">{desc}</span>
            </div>
          );
        })}
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['Name', 'Username', 'Emp ID', 'Role', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map(u => {
              const isSelf = u.id === currentUser?.id;
              const isLastAdmin = u.role === 'ADMIN' && adminCount <= 1;
              return (
                <tr key={u.id} className={`hover:bg-slate-50 ${isSelf ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs">
                        {u.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800">{u.name}</span>
                      {isSelf && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">You</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{u.empId ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={isLastAdmin}
                      onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                      className={`text-xs px-2 py-1 rounded font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${ROLE_STYLES[u.role]} ${isLastAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="EDITOR">EDITOR</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setChangePwFor(u.id); setNewPwValue(''); }}
                        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                        title="Change password"
                      >
                        <KeyRound size={14} />
                      </button>
                      {!isSelf && !isLastAdmin && (
                        <button
                          onClick={() => setConfirmRemove(u.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          title="Remove user"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add User modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4">
            <h3 className="font-semibold text-slate-800 mb-4">New User Account</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Full Name</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Smith" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Username</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newUser} onChange={e => setNewUser(e.target.value)} placeholder="john.smith" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Password</label>
                <input type="password" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Emp ID (optional)</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newEmpId} onChange={e => setNewEmpId(e.target.value)} placeholder="10XXX" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Role</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}>
                  <option value="VIEWER">VIEWER — Read-only</option>
                  <option value="EDITOR">EDITOR — Can edit data</option>
                  <option value="ADMIN">ADMIN — Full access</option>
                </select>
              </div>
              {addError && <p className="text-xs text-red-500">{addError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowAdd(false); setAddError(''); }} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {changePwFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4">
            <h3 className="font-semibold text-slate-800 mb-1">Change Password</h3>
            <p className="text-xs text-slate-400 mb-4">For: {users.find(u => u.id === changePwFor)?.name}</p>
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <input
                type="password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="New password"
                value={newPwValue}
                onChange={e => setNewPwValue(e.target.value)}
                autoFocus
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setChangePwFor(null)} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove confirm */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4">
            <h3 className="font-semibold text-slate-800 mb-2">Remove User?</h3>
            <p className="text-sm text-slate-500 mb-6">
              <strong>{users.find(u => u.id === confirmRemove)?.name}</strong> will lose access.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemove(null)} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm">Cancel</button>
              <button onClick={() => handleRemove(confirmRemove)} className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
