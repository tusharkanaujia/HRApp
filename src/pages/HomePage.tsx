import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../store';
import { Users, FolderOpen, Building2, TrendingUp, Search } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';

export default function HomePage() {
  const navigate = useNavigate();
  const employees = useSelector((s: RootState) => s.employees.list);
  const projects = useSelector((s: RootState) => s.projects.list);
  const [query, setQuery] = useState('');

  const active = employees.filter(e => e.status === 'ACTIVE').length;
  const departments = new Set(employees.map(e => e.department)).size;

  const results = query.length > 1
    ? employees.filter(e =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.designation.toLowerCase().includes(query.toLowerCase()) ||
        e.empId.includes(query)
      ).slice(0, 8)
    : [];

  const stats = [
    { label: 'Total Employees', value: employees.length, icon: Users, color: 'bg-blue-500' },
    { label: 'Active', value: active, icon: TrendingUp, color: 'bg-emerald-500' },
    { label: 'Projects', value: projects.length, icon: FolderOpen, color: 'bg-purple-500' },
    { label: 'Departments', value: departments, icon: Building2, color: 'bg-amber-500' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">HR Dashboard</h1>
        <p className="text-slate-500 mt-1">Ancient Builders Constructions LLC · MBM Gulf Electromechanical LLC</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <Icon size={22} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
              <p className="text-sm text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold text-slate-800 text-center mb-2">Find Employee Hierarchy</h2>
        <p className="text-slate-400 text-center text-sm mb-6">Search an employee to view their org chart position</p>

        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            placeholder="Search by name, designation, or employee ID..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {results.length > 0 && (
          <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
            {results.map(emp => (
              <button
                key={emp.id}
                onClick={() => navigate(`/org-chart?emp=${emp.id}`)}
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
                  <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100">View chart →</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {query.length > 1 && results.length === 0 && (
          <p className="text-center text-slate-400 text-sm mt-4">No employees found for "{query}"</p>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-8 grid grid-cols-3 gap-4 max-w-2xl mx-auto">
        {[
          { label: 'View All Employees', path: '/employees', color: 'bg-blue-600' },
          { label: 'Manage Projects', path: '/projects', color: 'bg-purple-600' },
          { label: 'Full Org Chart', path: '/org-chart', color: 'bg-slate-700' },
        ].map(({ label, path, color }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`${color} text-white rounded-xl py-3 text-sm font-medium hover:opacity-90 transition`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
