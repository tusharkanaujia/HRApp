import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Users, FolderOpen, GitBranch, LayoutDashboard, LogOut, UserCog,
  Shield, Eye, Pencil, ClipboardList, ChevronLeft, ChevronRight, Settings, Bell, BellOff, Palette,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../contexts/TenantContext';
import { logout } from '../store/authSlice';
import type { UserRole } from '../types';
import { useActivityBadge } from '../hooks/useActivityBadge';
import { getToastEnabled, setToastEnabled } from '../utils/activityNotifications';

const links = [
  { to: '/',          label: 'Dashboard', Icon: LayoutDashboard, key: 'dashboard' },
  { to: '/employees', label: 'Employees', Icon: Users,           key: 'employees' },
  { to: '/projects',  label: 'Projects',  Icon: FolderOpen,      key: 'projects' },
  { to: '/org-chart', label: 'Org Chart', Icon: GitBranch,       key: 'org' },
  { to: '/activity',  label: 'Activity',  Icon: ClipboardList,   key: 'activity' },
] as const;

const ROLE_BADGE: Record<UserRole, { label: string; cls: string; Icon: React.ElementType }> = {
  ADMIN:  { label: 'Admin',  cls: 'bg-purple-500/20 text-purple-300', Icon: Shield },
  EDITOR: { label: 'Editor', cls: 'bg-blue-500/20   text-blue-300',   Icon: Pencil },
  VIEWER: { label: 'Viewer', cls: 'bg-slate-500/20  text-slate-400',  Icon: Eye },
};

const COLLAPSE_KEY = 'wehive:sidebar-collapsed';

export default function Sidebar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentUser, isAdmin, canEdit } = useAuth();
  const { tenant } = useTenant();
  const initials = tenant?.name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? 'WH';
  const color = tenant?.primaryColor ?? '#2563eb';
  const logoSrc = tenant?.logoUrl?.trim() || (tenant?.id ? `/tenants/${tenant.id}/logo.png` : null);
  const [logoFailed, setLogoFailed] = useState(false);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const { count: activityCount, markSeen: markActivitySeen } = useActivityBadge();
  const [toastsOn, setToastsOn] = useState<boolean>(() =>
    currentUser ? getToastEnabled(currentUser.id) : true
  );
  useEffect(() => {
    if (currentUser) setToastsOn(getToastEnabled(currentUser.id));
  }, [currentUser?.id]);
  const toggleToasts = () => {
    if (!currentUser) return;
    const next = !toastsOn;
    setToastEnabled(currentUser.id, next);
    setToastsOn(next);
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const userInitials = currentUser
    ? currentUser.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '';

  return (
    <aside
      className={`bg-slate-900 text-white flex flex-col flex-shrink-0 h-screen sticky top-0 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo + collapse button */}
      <div className={`border-b border-slate-700 ${collapsed ? 'px-2 py-4' : 'px-6 py-5'} flex items-center justify-between`}>
        <div className="flex items-center gap-3 min-w-0">
          {logoSrc && !logoFailed ? (
            <img
              src={logoSrc}
              alt={tenant?.name ?? 'WeHive'}
              onError={() => setLogoFailed(true)}
              className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 flex-shrink-0"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
              style={{ backgroundColor: color }}
            >
              {initials}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight break-words">{tenant?.name ?? 'Construction Group'}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">on WeHive</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-slate-400 hover:text-white p-1 rounded"
            title="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="self-center mt-2 text-slate-400 hover:text-white p-1 rounded"
          title="Expand sidebar"
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* Nav */}
      <nav className={`flex-1 py-4 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        {links.map(({ to, label, Icon, key }) => {
          const isActivity = key === 'activity';
          const badge = isActivity && activityCount > 0 ? activityCount : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? `${label}${badge ? ` (${badge} new)` : ''}` : undefined}
              onClick={() => { if (isActivity) markActivitySeen(); }}
              className={({ isActive }) =>
                `relative flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="relative">
                <Icon size={18} />
                {badge > 0 && collapsed && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1">{label}</span>
                  {badge > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Current user + popover menu */}
      {currentUser && (
        <div className="border-t border-slate-700 relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-4 hover:bg-slate-800 transition-colors`}
            title={collapsed ? currentUser.name : undefined}
          >
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {userInitials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium text-white truncate">{currentUser.name}</p>
                {(() => {
                  const { label, cls, Icon } = ROLE_BADGE[currentUser.role];
                  return (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${cls}`}>
                      <Icon size={9} /> {label}
                    </span>
                  );
                })()}
              </div>
            )}
            {!collapsed && <Settings size={14} className="text-slate-400 flex-shrink-0" />}
          </button>

          {menuOpen && (
            <div
              className={`absolute bottom-full mb-2 ${collapsed ? 'left-full ml-2' : 'left-3 right-3'} bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50 min-w-52`}
            >
              {canEdit && (
                <button
                  onClick={toggleToasts}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  title="Show toast notifications when others make changes"
                >
                  <span className="flex items-center gap-2">
                    {toastsOn ? <Bell size={14} /> : <BellOff size={14} />}
                    Toast notifications
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${toastsOn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600 text-slate-300'}`}>
                    {toastsOn ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => { setMenuOpen(false); navigate('/users'); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left border-t border-slate-700"
                >
                  <UserCog size={14} /> Users
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => { setMenuOpen(false); navigate('/appearance'); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left border-t border-slate-700"
                >
                  <Palette size={14} /> Appearance
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); dispatch(logout()); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left border-t border-slate-700"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
