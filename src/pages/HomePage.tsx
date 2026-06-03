import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../store';
import {
  Users, FolderOpen, Building2, UserPlus, UserX, CheckCircle2,
  CircleDashed, CircleCheck, Search,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { employeeStateTooltip } from '../utils/termination';

const DIV_COLORS: Record<string, string> = {
  CIVIL:   '#f59e0b',
  MEP:     '#8b5cf6',
  FACTORY: '#10b981',
  ADMIN:   '#3b82f6',
  GENERAL: '#64748b',
};

export default function HomePage() {
  const navigate = useNavigate();
  const employees = useSelector((s: RootState) => s.employees.list);
  const projects = useSelector((s: RootState) => s.projects.list);
  const [query, setQuery] = useState('');

  // ── Employee KPIs ──────────────────────────────────────────────────────────
  const totalEmployees = employees.length;
  const activeCount = employees.filter(e => e.status === 'ACTIVE').length;
  const onboardingCount = employees.filter(e => e.status === 'ONBOARDING').length;
  const terminatedCount = employees.filter(e => e.status === 'TERMINATED').length;

  // ── Department KPIs ────────────────────────────────────────────────────────
  const departments = useMemo(() => {
    const counts = new Map<string, { count: number; divs: Record<string, number> }>();
    for (const e of employees) {
      if (!e.department) continue;
      const cur = counts.get(e.department) ?? { count: 0, divs: {} };
      cur.count += 1;
      cur.divs[e.division] = (cur.divs[e.division] ?? 0) + 1;
      counts.set(e.department, cur);
    }
    return [...counts.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [employees]);

  // ── Project KPIs ───────────────────────────────────────────────────────────
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === 'ACTIVE').length;
  const completedProjects = projects.filter(p => p.status === 'COMPLETED').length;

  const topProjects = useMemo(() => {
    const empById = new Map(employees.map(e => [e.id, e]));
    const ranked = projects
      .map(p => {
        const assigned = employees.filter(e => e.projectIds.includes(p.id));
        // Project Manager = senior assigned employee with no other assigned manager,
        // or the assigned employee whose designation contains "MANAGER" / "DIRECTOR".
        const pm =
          assigned.find(e => /director|head/i.test(e.designation)) ??
          assigned.find(e => /project manager|senior project manager/i.test(e.designation)) ??
          assigned.find(e => /manager/i.test(e.designation)) ??
          assigned.find(e => !e.managerId || !empById.has(e.managerId)) ??
          assigned[0];
        return { ...p, count: assigned.length, pm };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return ranked;
  }, [projects, employees]);

  // ── Search results ────────────────────────────────────────────────────────
  const results = query.length > 1
    ? employees.filter(e =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.designation.toLowerCase().includes(query.toLowerCase()) ||
        e.empId.includes(query)
      ).slice(0, 8)
    : [];

  const kpi = (label: string, value: number, Icon: React.ElementType, color: string, onClick?: () => void) => (
    <button
      key={label}
      onClick={onClick}
      disabled={!onClick}
      className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow text-left disabled:cursor-default"
    >
      <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </button>
  );

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">HR Dashboard</h1>
        <p className="text-slate-500 mt-1">Ancient Builders Constructions LLC · MBM Gulf Electromechanical LLC</p>
      </div>

      {/* ── Row 1: Employee KPIs ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Employees</h2>
        <div className="grid grid-cols-4 gap-4">
          {kpi('Total',       totalEmployees,  Users,        'bg-blue-500',    () => navigate('/employees'))}
          {kpi('Active',      activeCount,     CheckCircle2, 'bg-emerald-500', () => navigate('/employees?status=ACTIVE'))}
          {kpi('Yet to Join', onboardingCount, UserPlus,     'bg-yellow-500',  () => navigate('/employees?status=ONBOARDING'))}
          {kpi('Terminated',  terminatedCount, UserX,        'bg-red-600',     () => navigate('/employees?status=TERMINATED'))}
        </div>
      </section>

      {/* ── Row 2: Department grid ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">By Department</h2>
          <span className="text-xs text-slate-400">{departments.length} departments</span>
        </div>
        {departments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center text-slate-400 text-sm">
            No department data yet
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {departments.map(d => {
              const pct = totalEmployees ? Math.round((d.count / totalEmployees) * 100) : 0;
              const topDiv = Object.entries(d.divs).sort((a, b) => b[1] - a[1])[0]?.[0];
              const divColor = DIV_COLORS[topDiv ?? 'GENERAL'] ?? '#64748b';
              return (
                <button
                  key={d.name}
                  onClick={() => navigate(`/employees?dept=${encodeURIComponent(d.name)}`)}
                  className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-left hover:shadow-md transition-shadow group"
                  style={{ borderLeft: `4px solid ${divColor}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 leading-tight group-hover:text-blue-600 truncate">
                      {d.name}
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium flex-shrink-0">{pct}%</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{d.count}</p>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {Object.entries(d.divs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([div, cnt]) => (
                      <span
                        key={div}
                        className="text-[9px] px-1.5 py-0.5 rounded text-white font-medium"
                        style={{ backgroundColor: DIV_COLORS[div] ?? '#64748b' }}
                      >
                        {div} {cnt}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Row 3: Projects ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Projects</h2>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="grid grid-cols-3 gap-4 lg:col-span-1 lg:grid-cols-1">
            {kpi('Total',     totalProjects,     FolderOpen,    'bg-purple-500', () => navigate('/projects'))}
            {kpi('Active',    activeProjects,    CircleDashed,  'bg-emerald-500', () => navigate('/projects'))}
            {kpi('Completed', completedProjects, CircleCheck,   'bg-blue-500',    () => navigate('/projects'))}
          </div>
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Top Projects by Headcount</h3>
              <button onClick={() => navigate('/projects')} className="text-xs text-blue-600 hover:underline">
                See all →
              </button>
            </div>
            {topProjects.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No projects yet</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {topProjects.map(p => (
                  <li key={p.id}>
                    <button
                      onClick={() => navigate(`/org-chart?view=project&project=${p.id}`)}
                      className="w-full flex items-center gap-3 py-2.5 hover:bg-slate-50 px-2 -mx-2 rounded-lg text-left group"
                    >
                      <Building2 size={14} className="text-slate-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600">{p.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {p.pm ? `PM: ${p.pm.name} — ${p.pm.designation}` : 'No project manager assigned'}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 rounded-full px-2 py-0.5 flex-shrink-0">
                        {p.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 max-w-3xl">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Find Employee</h2>
        <p className="text-slate-400 text-xs mb-4">Search by name, designation, or employee ID</p>
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            placeholder="Start typing..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        {results.length > 0 && (
          <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
            {results.map(emp => {
              const tip = employeeStateTooltip(emp);
              return (
                <button
                  key={emp.id}
                  onClick={() => navigate(`/employees/${emp.id}`)}
                  title={tip}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center justify-between group border-b border-slate-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                      {emp.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{emp.name}</p>
                      <p className="text-xs text-slate-400">{emp.designation} · {emp.department}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={emp.status} />
                    <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100">Open →</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {query.length > 1 && results.length === 0 && (
          <p className="text-center text-slate-400 text-sm mt-4">No employees found for "{query}"</p>
        )}
      </section>
    </div>
  );
}
