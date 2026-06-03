import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import type { ActivityAction } from '../types';
import { Filter } from 'lucide-react';
import { useActivityBadge } from '../hooks/useActivityBadge';

const ACTION_META: Record<ActivityAction, { label: string; color: string }> = {
  ADD_EMPLOYEE:       { label: 'Added Employee',     color: 'bg-emerald-100 text-emerald-700' },
  EDIT_EMPLOYEE:      { label: 'Edited Employee',    color: 'bg-blue-100 text-blue-700' },
  DELETE_EMPLOYEE:    { label: 'Deleted Employee',   color: 'bg-red-100 text-red-600' },
  CHANGE_HIERARCHY:   { label: 'Changed Hierarchy',  color: 'bg-purple-100 text-purple-700' },
  TERMINATE_EMPLOYEE: { label: 'Terminated Employee', color: 'bg-red-600 text-white' },
  ADD_PROJECT:        { label: 'Added Project',      color: 'bg-teal-100 text-teal-700' },
  EDIT_PROJECT:       { label: 'Edited Project',     color: 'bg-sky-100 text-sky-700' },
  DELETE_PROJECT:     { label: 'Deleted Project',    color: 'bg-orange-100 text-orange-700' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ActivityPage() {
  const log = useSelector((s: RootState) => s.activity.log);
  const { markSeen } = useActivityBadge();

  // Clear the unread badge whenever the user opens this page or new activity
  // lands while they're viewing it.
  useEffect(() => { markSeen(); }, [markSeen, log.length]);

  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [query, setQuery] = useState('');

  const users = useMemo(() => {
    const s = new Set(log.map(e => e.userName));
    return [...s].sort();
  }, [log]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return log.filter(entry => {
      const matchAction = !filterAction || entry.action === filterAction;
      const matchUser = !filterUser || entry.userName === filterUser;
      const matchEntity = !filterEntity || entry.entityType === filterEntity;
      const day = entry.timestamp.slice(0, 10);
      const matchFrom = !dateFrom || day >= dateFrom;
      const matchTo = !dateTo || day <= dateTo;
      const matchQ = !q ||
        entry.entityName.toLowerCase().includes(q) ||
        (entry.details ?? '').toLowerCase().includes(q);
      return matchAction && matchUser && matchEntity && matchFrom && matchTo && matchQ;
    });
  }, [log, filterAction, filterUser, filterEntity, dateFrom, dateTo, query]);

  const anyFilter = filterAction || filterUser || filterEntity || dateFrom || dateTo || query;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Activity Log</h1>
          <p className="text-slate-400 text-sm mt-0.5">{filtered.length} of {log.length} entries</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6 space-y-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <input
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search entity or details..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
          >
            <option value="">All Actions</option>
            {(Object.keys(ACTION_META) as ActivityAction[]).map(a => (
              <option key={a} value={a}>{ACTION_META[a].label}</option>
            ))}
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
            value={filterEntity}
            onChange={e => setFilterEntity(e.target.value)}
          >
            <option value="">All Entities</option>
            <option value="employee">Employees</option>
            <option value="project">Projects</option>
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
          >
            <option value="">All Users</option>
            {users.map(u => <option key={u}>{u}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            From
            <input
              type="date"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              max={dateTo || undefined}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            To
            <input
              type="date"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              min={dateFrom || undefined}
            />
          </label>
          {anyFilter && (
            <button
              onClick={() => {
                setFilterAction(''); setFilterUser(''); setFilterEntity('');
                setDateFrom(''); setDateTo(''); setQuery('');
              }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">No activity recorded yet</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => {
            const meta = ACTION_META[entry.action];
            return (
              <div key={entry.id} className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-3.5 flex items-start gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{entry.entityName}</span>
                    {entry.entityType === 'employee' ? ' (employee)' : ' (project)'}
                  </p>
                  {entry.details && (
                    <p className="text-xs text-slate-500 mt-0.5 break-words">{entry.details}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs font-medium text-slate-600">{entry.userName}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{formatTime(entry.timestamp)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
