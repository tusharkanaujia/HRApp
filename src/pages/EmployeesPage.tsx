import { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { RootState } from '../store';
import AddEmployeeModal from '../components/AddEmployeeModal';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { Plus, Search, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { exportEmployeesToExcel } from '../utils/exportExcel';
import { employeeStateTooltip } from '../utils/termination';

const PAGE_SIZE = 50;

const DIV_STYLE: Record<string, string> = {
  CIVIL: 'bg-amber-100 text-amber-700',
  MEP: 'bg-purple-100 text-purple-700',
  FACTORY: 'bg-emerald-100 text-emerald-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  GENERAL: 'bg-slate-100 text-slate-600',
};

function companyShort(c: string) {
  if (c.includes('Ancient')) return 'ABC';
  if (c.includes('MBM')) return 'MBM';
  if (c.includes('Noor')) return 'NYA';
  return c.slice(0, 4).toUpperCase();
}

export default function EmployeesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canEdit } = useAuth();
  const employees = useSelector((s: RootState) => s.employees.list);
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState('');
  const [filterDept, setFilterDept] = useState(searchParams.get('dept') ?? '');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') ?? '');
  const [filterDivision, setFilterDivision] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [page, setPage] = useState(1);

  // Keep URL in sync so links from dashboard land on the right filters
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (filterDept)   next.set('dept',   filterDept);   else next.delete('dept');
    if (filterStatus) next.set('status', filterStatus); else next.delete('status');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDept, filterStatus]);

  // Derive unique filter options from actual data
  const departments = useMemo(() => {
    const s = new Set(employees.map(e => e.department).filter(Boolean));
    return [...s].sort();
  }, [employees]);

  const companies = useMemo(() => {
    const s = new Set(employees.map(e => e.company).filter(Boolean));
    return [...s].sort();
  }, [employees]);

  const locations = useMemo(() => {
    const s = new Set(employees.map(e => e.workingLocation).filter(Boolean));
    return [...s].sort();
  }, [employees]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return employees.filter(e => {
      const matchQ = !q || e.name.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q) || e.empId.includes(q);
      const matchDept = !filterDept || e.department === filterDept;
      const matchCompany = !filterCompany || e.company === filterCompany;
      const matchStatus = !filterStatus || e.status === filterStatus;
      const matchDiv = !filterDivision || e.division === filterDivision;
      const matchLoc = !filterLocation || e.workingLocation === filterLocation;
      return matchQ && matchDept && matchCompany && matchStatus && matchDiv && matchLoc;
    });
  }, [employees, query, filterDept, filterCompany, filterStatus, filterDivision, filterLocation]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetPage = () => setPage(1);

  const handleExport = () => {
    const managerNameById = new Map(employees.map(e => [e.id, e.name]));
    const stamp = new Date().toISOString().slice(0, 10);
    exportEmployeesToExcel(filtered, managerNameById, `employees-${stamp}.xlsx`);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employees</h1>
          <p className="text-slate-400 text-sm mt-0.5">{filtered.length} of {employees.length} employees</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Download filtered employees as Excel"
          >
            <FileDown size={16} /> Export ({filtered.length})
          </button>
          {canEdit && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              <Plus size={16} /> Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search name, designation, ID..."
            value={query}
            onChange={e => { setQuery(e.target.value); resetPage(); }}
          />
        </div>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={filterDivision}
          onChange={e => { setFilterDivision(e.target.value); resetPage(); }}
        >
          <option value="">All Divisions</option>
          {['CIVIL', 'MEP', 'FACTORY', 'ADMIN', 'GENERAL'].map(d => <option key={d}>{d}</option>)}
        </select>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={filterDept}
          onChange={e => { setFilterDept(e.target.value); resetPage(); }}
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d}>{d}</option>)}
        </select>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={filterCompany}
          onChange={e => { setFilterCompany(e.target.value); resetPage(); }}
        >
          <option value="">All Companies</option>
          {companies.map(c => <option key={c}>{c}</option>)}
        </select>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={filterLocation}
          onChange={e => { setFilterLocation(e.target.value); resetPage(); }}
        >
          <option value="">All Locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); resetPage(); }}
        >
          <option value="">All Statuses</option>
          {['ACTIVE', 'ONBOARDING', 'INACTIVE', 'RESIGNED', 'TERMINATED', 'ABSCONDED'].map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['ID', 'Name', 'Designation', 'Department', 'Location', 'Company', 'Division', 'Status', 'Start Date'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {paginated.map(emp => (
              <tr
                key={emp.id}
                onClick={() => navigate(`/employees/${emp.id}`)}
                className="hover:bg-slate-50 cursor-pointer"
                title={employeeStateTooltip(emp)}
              >
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{emp.empId}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs flex-shrink-0">
                      {emp.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{emp.name}</p>
                      <p className="text-xs text-slate-400">{emp.nationality}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-40 truncate">{emp.designation}</td>
                <td className="px-4 py-3 text-slate-500 max-w-36 truncate">{emp.department}</td>
                <td className="px-4 py-3 text-slate-400 max-w-40 truncate text-xs">{emp.workingLocation}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                    {companyShort(emp.company)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${DIV_STYLE[emp.division] ?? 'bg-slate-100 text-slate-600'}`}>
                    {emp.division}
                  </span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={emp.status} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{emp.doj || <span className="text-slate-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400">No employees match the filters</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-400">
            Page {safePage} of {totalPages} · {filtered.length} results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-slate-600 w-16 text-center">{safePage} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {showModal && <AddEmployeeModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
