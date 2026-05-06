import { NavLink } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Users, FolderOpen, GitBranch, LayoutDashboard, LogOut, UserCog, Shield, Eye, Pencil } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../store/authSlice';
import type { UserRole } from '../types';

const links = [
  { to: '/',           label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/employees',  label: 'Employees',  Icon: Users },
  { to: '/projects',   label: 'Projects',   Icon: FolderOpen },
  { to: '/org-chart',  label: 'Org Chart',  Icon: GitBranch },
];

const ROLE_BADGE: Record<UserRole, { label: string; cls: string; Icon: React.ElementType }> = {
  ADMIN:  { label: 'Admin',  cls: 'bg-purple-500/20 text-purple-300', Icon: Shield },
  EDITOR: { label: 'Editor', cls: 'bg-blue-500/20   text-blue-300',   Icon: Pencil },
  VIEWER: { label: 'Viewer', cls: 'bg-slate-500/20  text-slate-400',  Icon: Eye },
};

export default function Sidebar() {
  const dispatch = useDispatch();
  const { currentUser, isAdmin } = useAuth();

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">
            ABC
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">HR Manager</p>
            <p className="text-xs text-slate-400">Construction Group</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {isAdmin && (
          <NavLink
            to="/users"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <UserCog size={18} />
            Users
          </NavLink>
        )}
      </nav>

      {/* Current user + logout */}
      {currentUser && (
        <div className="px-4 py-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {currentUser.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{currentUser.username}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            {(() => {
              const { label, cls, Icon } = ROLE_BADGE[currentUser.role];
              return (
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${cls}`}>
                  <Icon size={9} /> {label}
                </span>
              );
            })()}
            <button
              onClick={() => dispatch(logout())}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
