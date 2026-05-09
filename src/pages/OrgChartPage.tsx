import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import OrgTreeView from '../components/OrgTreeView';
import OrgByProject from '../components/OrgByProject';
import StatusBadge from '../components/StatusBadge';
import AddEmployeeModal from '../components/AddEmployeeModal';
import { useAuth } from '../hooks/useAuth';
import type { Employee } from '../types';
import { Search, ChevronRight, Briefcase, User, GitBranch, FolderOpen, Pencil } from 'lucide-react';

export default function OrgChartPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'hierarchy' | 'project'>(
    searchParams.get('view') === 'project' ? 'project' : 'hierarchy',
  );
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const { canEdit } = useAuth();
  const employees = useSelector((s: RootState) => s.employees.list);
  const projects = useSelector((s: RootState) => s.projects.list);

  const focalId = searchParams.get('emp') || employees[0]?.id || '';
  const initialProjectId = searchParams.get('project') ?? undefined;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const focal = employees.find(e => e.id === focalId);
  const selected = selectedId ? employees.find(e => e.id === selectedId) : focal;

  const results = query.length > 1
    ? employees.filter(e => e.name.toLowerCase().includes(query.toLowerCase()) || e.designation.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  // Ancestor chain for breadcrumb (with cycle guard)
  const ancestors = useMemo(() => {
    const chain: typeof employees = [];
    const seen = new Set<string>(focal ? [focal.id] : []);
    let cur = focal;
    while (cur?.managerId) {
      if (seen.has(cur.managerId)) break;
      const parent = employees.find(e => e.id === cur!.managerId);
      if (!parent) break;
      seen.add(parent.id);
      chain.unshift(parent);
      cur = parent;
    }
    return chain;
  }, [focal, employees]);

  const selectedProjects = selected ? projects.filter(p => selected.projectIds.includes(p.id)) : [];
  const directReports = selected ? employees.filter(e => e.managerId === selected.id) : [];

  return (
    <div className="flex flex-col h-full">
      {/* View mode toggle */}
      <div className="flex-shrink-0 bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-2">
        <button
          onClick={() => setViewMode('hierarchy')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'hierarchy' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <GitBranch size={14} /> Hierarchy
        </button>
        <button
          onClick={() => setViewMode('project')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'project' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <FolderOpen size={14} /> By Project
        </button>
      </div>

      {viewMode === 'project' && (
        <div className="flex-1 min-h-0">
          <OrgByProject employees={employees} projects={projects} initialProjectId={initialProjectId} />
        </div>
      )}

      {viewMode === 'hierarchy' && (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-72 flex-shrink-0 border-r border-slate-100 bg-white flex flex-col h-full">
        {/* Search */}
        <div className="p-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Find Employee</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          {results.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
              {results.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => { setSearchParams({ emp: emp.id }); setQuery(''); setSelectedId(null); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0"
                >
                  <p className="font-medium text-slate-700 truncate">{emp.name}</p>
                  <p className="text-xs text-slate-400 truncate">{emp.designation}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ancestor breadcrumb */}
        {focal && (
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Hierarchy Path</p>
            <div className="space-y-1">
              {ancestors.map((anc, i) => (
                <div key={anc.id} className="flex items-center gap-1">
                  <span style={{ marginLeft: i * 8 }} className="text-slate-300 text-xs">└</span>
                  <button
                    onClick={() => setSearchParams({ emp: anc.id })}
                    className="text-xs text-blue-600 hover:underline truncate"
                  >
                    {anc.name}
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-1">
                <span style={{ marginLeft: ancestors.length * 8 }} className="text-slate-300 text-xs">└</span>
                <span className="text-xs font-semibold text-slate-800 truncate">{focal.name}</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected employee detail */}
        {selected && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {selected.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">{selected.name}</p>
                  <p className="text-xs text-slate-400">{selected.empId}</p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => setEditEmployee(selected)}
                    className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg flex-shrink-0"
                    title="Edit employee"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <StatusBadge status={selected.status} />
            </div>

            <div className="space-y-2 text-sm">
              {[
                ['Designation', selected.designation],
                ['Department', selected.department],
                ['Division', selected.division],
                ['Company', selected.company.split(' ').slice(0, 2).join(' ')],
                ['Nationality', selected.nationality],
                ['DOJ', selected.doj],
                ['Shift', selected.shift],
                ['Accommodation', selected.accommodation],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-400 w-24 flex-shrink-0 text-xs">{k}</span>
                  <span className="text-slate-700 text-xs break-words">{v}</span>
                </div>
              ))}
            </div>

            {/* Projects */}
            {selectedProjects.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Briefcase size={11} /> Projects ({selectedProjects.length})
                </p>
                <div className="space-y-1">
                  {selectedProjects.map(p => (
                    <div key={p.id} className="text-xs bg-slate-50 rounded-lg px-2 py-1.5">
                      <p className="font-medium text-slate-700">{p.name}</p>
                      <p className="text-slate-400">{p.type}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Direct reports */}
            {directReports.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <User size={11} /> Direct Reports ({directReports.length})
                </p>
                <div className="space-y-1">
                  {directReports.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setSearchParams({ emp: r.id }); setSelectedId(null); }}
                      className="w-full text-left text-xs bg-slate-50 hover:bg-blue-50 rounded-lg px-2 py-1.5 flex items-center justify-between group"
                    >
                      <div>
                        <p className="font-medium text-slate-700">{r.name}</p>
                        <p className="text-slate-400">{r.designation}</p>
                      </div>
                      <ChevronRight size={12} className="text-slate-300 group-hover:text-blue-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selected.remarks && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Remarks</p>
                <p className="text-xs text-slate-500 bg-amber-50 rounded-lg p-2">{selected.remarks}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tree area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center gap-2 text-sm">
          <span className="text-slate-400">Org Chart</span>
          {focal && (
            <>
              <ChevronRight size={14} className="text-slate-300" />
              <span className="font-medium text-slate-700">{focal.name}</span>
              <span className="text-slate-400 text-xs">— {focal.designation}</span>
            </>
          )}
        </div>

        {/* Tree */}
        <div className="flex-1 min-h-0">
          {focalId && employees.length > 0 ? (
            <OrgTreeView
              focalId={focalId}
              employees={employees}
              onSelectEmployee={id => {
                setSelectedId(id);
                if (id !== focalId) {
                  // Don't change focal - just highlight selected in sidebar
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">
              Search for an employee to view their hierarchy
            </div>
          )}
        </div>
      </div>
    </div>
      )}

      {editEmployee && (
        <AddEmployeeModal employee={editEmployee} onClose={() => setEditEmployee(null)} />
      )}
    </div>
  );
}
