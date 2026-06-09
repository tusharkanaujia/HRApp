import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../contexts/TenantContext';
import { setUserRole, addUser, removeUser, setUserDisabled } from '../store/authSlice';
import { auth, getSecondaryAuth } from '../lib/firebase';
import { toAuthEmail } from '../lib/authEmail';
import type { RootState } from '../store';
import type { UserRole } from '../types';
import { Plus, Trash2, KeyRound, Shield, Eye, EyeOff, Pencil, X, Sparkles, Lock, Unlock } from 'lucide-react';

function generatePassword(length = 12): string {
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%&*+-?';
  const all = lowers + uppers + digits + symbols;
  // Ensure at least one of each character class.
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const required = [pick(lowers), pick(uppers), pick(digits), pick(symbols)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('');
}

function suggestUsername(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('.');
}

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
  const { tenantId } = useTenant();
  const dispatch = useDispatch();
  const users = useSelector((s: RootState) => s.auth.users);
  const employees = useSelector((s: RootState) => s.employees.list);

  const [showAdd, setShowAdd] = useState(false);
  const [pickedEmpId, setPickedEmpId] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>('VIEWER');
  const [addError, setAddError] = useState('');

  const pickedEmployee = pickedEmpId ? employees.find(e => e.id === pickedEmpId) : null;

  // Employees who don't already have a user account (matched by empId)
  const takenEmpIds = useMemo(() => new Set(users.map(u => u.empId).filter(Boolean)), [users]);
  const availableEmployees = useMemo(
    () => employees.filter(e => e.empId && !takenEmpIds.has(e.empId)),
    [employees, takenEmpIds]
  );
  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return [];
    return availableEmployees
      .filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.empId.includes(q) ||
        e.designation.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [availableEmployees, empSearch]);

  const resetAddForm = () => {
    setPickedEmpId(null); setEmpSearch('');
    setNewUser(''); setNewPass(''); setShowNewPass(false); setNewRole('VIEWER'); setAddError('');
  };

  const [changePwFor, setChangePwFor] = useState<string | null>(null);
  const [newPwValue, setNewPwValue] = useState('');
  const [showPwValue, setShowPwValue] = useState(false);
  const [pwError, setPwError] = useState('');

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  if (!isAdmin) return <Navigate to="/" replace />;

  const adminCount = users.filter(u => u.role === 'ADMIN').length;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickedEmployee)      { setAddError('Pick an employee.');                return; }
    if (!newUser.trim())      { setAddError('Username is required.');            return; }
    if (!newPass.trim())      { setAddError('Password is required.');            return; }
    if (users.find(u => u.username === newUser.trim())) { setAddError('Username already taken.'); return; }
    setAddError('');
    try {
      // Create the Firebase Auth account on a secondary app so this admin's own
      // session is not replaced by the newly-created user.
      const secondary = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondary, toAuthEmail(newUser.trim(), tenantId), newPass);
      const authUid = cred.user.uid;
      await signOut(secondary);
      dispatch(addUser({
        id: `u${Date.now()}`,
        username: newUser.trim(),
        authUid,
        name: pickedEmployee.name,
        empId: pickedEmployee.empId,
        role: newRole,
      }));
      setShowAdd(false);
      resetAddForm();
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : '';
      if (code === 'auth/email-already-in-use') setAddError('That username is already registered.');
      else if (code === 'auth/weak-password')   setAddError('Password too weak (minimum 6 characters).');
      else setAddError('Could not create the account. Please try again.');
    }
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

  const toggleDisabled = (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    // Don't lock out the last remaining admin.
    if (target.role === 'ADMIN' && !target.disabled && adminCount <= 1) return;
    dispatch(setUserDisabled({ userId, disabled: !target.disabled }));
  };

  const closePwModal = () => {
    setChangePwFor(null);
    setNewPwValue('');
    setShowPwValue(false);
    setPwError('');
  };

  // Only the signed-in user can change their own password (Firebase Auth has no
  // client-side way to set another user's password without the Admin SDK).
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPwValue.trim() || !auth.currentUser) return;
    setPwError('');
    try {
      await updatePassword(auth.currentUser, newPwValue.trim());
      closePwModal();
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : '';
      if (code === 'auth/requires-recent-login') setPwError('For security, sign out and back in, then change your password.');
      else if (code === 'auth/weak-password')    setPwError('Password too weak (minimum 6 characters).');
      else setPwError('Could not update password. Please try again.');
    }
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
              {['Name', 'Username', 'Emp ID', 'Role', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map(u => {
              const isSelf = u.id === currentUser?.id;
              const isLastAdmin = u.role === 'ADMIN' && adminCount <= 1;
              return (
                <tr key={u.id} className={`hover:bg-slate-50 ${isSelf ? 'bg-blue-50/40' : ''} ${u.disabled ? 'opacity-60' : ''}`}>
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
                    {u.disabled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700">
                        <Lock size={10} /> Disabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {isSelf && (
                        <button
                          onClick={() => { setChangePwFor(u.id); setNewPwValue(''); setShowPwValue(false); setPwError(''); }}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                          title="Change your password"
                        >
                          <KeyRound size={14} />
                        </button>
                      )}
                      {!isSelf && !(isLastAdmin && !u.disabled) && (
                        <button
                          onClick={() => toggleDisabled(u.id)}
                          className={`p-1.5 rounded-lg ${u.disabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                          title={u.disabled ? 'Re-enable login' : 'Disable login'}
                        >
                          {u.disabled ? <Unlock size={14} /> : <Lock size={14} />}
                        </button>
                      )}
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
            <h3 className="font-semibold text-slate-800 mb-1">New User Account</h3>
            <p className="text-xs text-slate-400 mb-4">Pick an employee, then set their login.</p>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Employee *</label>
                {pickedEmployee ? (
                  <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{pickedEmployee.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        #{pickedEmployee.empId} · {pickedEmployee.designation}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setPickedEmpId(null); setEmpSearch(''); }}
                      className="text-slate-400 hover:text-slate-600 flex-shrink-0"
                      title="Change employee"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Search name, employee ID, designation..."
                      value={empSearch}
                      onChange={e => setEmpSearch(e.target.value)}
                      autoFocus
                    />
                    {empSearch && filteredEmployees.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 border border-slate-200 rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto">
                        {filteredEmployees.map(e => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => {
                              setPickedEmpId(e.id);
                              setEmpSearch('');
                              if (!newUser.trim()) setNewUser(suggestUsername(e.name));
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
                          >
                            <div className="flex items-baseline gap-2">
                              <span className="font-medium text-slate-800">{e.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">#{e.empId}</span>
                            </div>
                            <span className="text-xs text-slate-500">{e.designation}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {empSearch && filteredEmployees.length === 0 && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        No matching employees (all matches may already have a user account).
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Username *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newUser} onChange={e => setNewUser(e.target.value)} placeholder="john.smith" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-600">Password *</label>
                  <button
                    type="button"
                    onClick={() => { setNewPass(generatePassword()); setShowNewPass(true); }}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
                    title="Generate a strong random password"
                  >
                    <Sparkles size={11} /> Generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    className="w-full border border-slate-200 rounded-lg pl-3 pr-9 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title={showNewPass ? 'Hide password' : 'Show password'}
                  >
                    {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {newRole === 'ADMIN' && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Admin accounts have full access — choose a strong password.
                  </p>
                )}
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
                <button type="button" onClick={() => { setShowAdd(false); resetAddForm(); }} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
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
            <h3 className="font-semibold text-slate-800 mb-1">Change Your Password</h3>
            <p className="text-xs text-slate-400 mb-3">For: {users.find(u => u.id === changePwFor)?.name}</p>
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div className="flex items-center justify-end -mb-1">
                <button
                  type="button"
                  onClick={() => { setNewPwValue(generatePassword()); setShowPwValue(true); }}
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
                >
                  <Sparkles size={11} /> Generate
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPwValue ? 'text' : 'password'}
                  className="w-full border border-slate-200 rounded-lg pl-3 pr-9 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="New password"
                  value={newPwValue}
                  onChange={e => setNewPwValue(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwValue(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title={showPwValue ? 'Hide password' : 'Show password'}
                >
                  {showPwValue ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {pwError && <p className="text-xs text-red-500">{pwError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closePwModal}
                  className="flex-1 border border-slate-300 rounded-lg py-2 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
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
