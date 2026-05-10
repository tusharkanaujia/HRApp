import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import StatusBadge from '../components/StatusBadge';
import AddEmployeeModal from '../components/AddEmployeeModal';
import { useAuth } from '../hooks/useAuth';
import {
  ArrowLeft, Pencil, GitBranch, Briefcase, MapPin, Calendar, Building2,
  User, IdCard, Users as UsersIcon, FolderOpen, Clock, ExternalLink,
} from 'lucide-react';
import type { ActivityAction } from '../types';

const DIV_STYLE: Record<string, string> = {
  CIVIL: 'bg-amber-100 text-amber-700',
  MEP: 'bg-purple-100 text-purple-700',
  FACTORY: 'bg-emerald-100 text-emerald-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  GENERAL: 'bg-slate-100 text-slate-600',
};

const TYPE_COLORS: Record<string, string> = {
  CIVIL: 'bg-amber-100 text-amber-700',
  MEP: 'bg-purple-100 text-purple-700',
  FACTORY: 'bg-blue-100 text-blue-700',
  GENERAL: 'bg-slate-100 text-slate-600',
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  ON_HOLD: 'bg-orange-100 text-orange-700',
};

const ACTION_META: Record<ActivityAction, { label: string; color: string }> = {
  ADD_EMPLOYEE:     { label: 'Added',           color: 'bg-emerald-100 text-emerald-700' },
  EDIT_EMPLOYEE:    { label: 'Edited',          color: 'bg-blue-100 text-blue-700' },
  DELETE_EMPLOYEE:  { label: 'Deleted',         color: 'bg-red-100 text-red-600' },
  CHANGE_HIERARCHY: { label: 'Hierarchy',       color: 'bg-purple-100 text-purple-700' },
  ADD_PROJECT:      { label: 'Project Added',   color: 'bg-teal-100 text-teal-700' },
  EDIT_PROJECT:     { label: 'Project Edited',  color: 'bg-sky-100 text-sky-700' },
  DELETE_PROJECT:   { label: 'Project Deleted', color: 'bg-orange-100 text-orange-700' },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-slate-700">{value && value.trim() ? value : <span className="text-slate-300">—</span>}</p>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEdit } = useAuth();

  const employees = useSelector((s: RootState) => s.employees.list);
  const projects = useSelector((s: RootState) => s.projects.list);
  const activityLog = useSelector((s: RootState) => s.activity.log);

  const [showEdit, setShowEdit] = useState(false);

  const employee = useMemo(() => employees.find(e => e.id === id), [employees, id]);
  const manager = useMemo(
    () => (employee?.managerId ? employees.find(e => e.id === employee.managerId) : null),
    [employee, employees]
  );
  const reports = useMemo(
    () => (employee ? employees.filter(e => e.managerId === employee.id) : []),
    [employee, employees]
  );
  const assignedProjects = useMemo(
    () => (employee ? projects.filter(p => employee.projectIds.includes(p.id)) : []),
    [employee, projects]
  );
  const history = useMemo(
    () => activityLog.filter(a => a.entityType === 'employee' && a.entityId === id),
    [activityLog, id]
  );

  if (!employee) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate('/employees')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft size={14} /> Back to Employees
        </button>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-slate-500">Employee not found.</p>
        </div>
      </div>
    );
  }

  const initials = employee.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="p-8 max-w-6xl">
      {/* Top bar */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">{employee.name}</h1>
                <p className="text-slate-500 text-sm mt-0.5">{employee.designation}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                    {employee.empId}
                  </span>
                  <StatusBadge status={employee.status} />
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${DIV_STYLE[employee.division] ?? 'bg-slate-100 text-slate-600'}`}>
                    {employee.division}
                  </span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                    {employee.staffType}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/org-chart?emp=${employee.id}`)}
                  className="flex items-center gap-1.5 text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-2 rounded-lg"
                >
                  <GitBranch size={14} /> Org Chart
                </button>
                {canEdit && (
                  <button
                    onClick={() => setShowEdit(true)}
                    className="flex items-center gap-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 px-3 py-2 rounded-lg"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Employment */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
              <Briefcase size={15} className="text-slate-400" /> Employment
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-4">
              <Field label="Company" value={employee.company} />
              <Field label="Department" value={employee.department} />
              <Field label="Working Location" value={employee.workingLocation} />
              <Field label="Date of Joining" value={employee.doj} />
              <Field label="Shift" value={employee.shift} />
              <Field label="Accommodation" value={employee.accommodation} />
            </div>
          </section>

          {/* Personal */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
              <User size={15} className="text-slate-400" /> Personal
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-4">
              <Field label="Nationality" value={employee.nationality} />
              <Field label="Passport Number" value={employee.passportNumber} />
              <Field label="Employee ID" value={employee.empId} />
            </div>
            {employee.remarks && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">Remarks</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{employee.remarks}</p>
              </div>
            )}
          </section>

          {/* Projects */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="flex items-center justify-between text-sm font-semibold text-slate-700 mb-4">
              <span className="flex items-center gap-2">
                <FolderOpen size={15} className="text-slate-400" />
                Assigned Projects
              </span>
              <span className="text-xs font-medium text-slate-400">{assignedProjects.length}</span>
            </h2>
            {assignedProjects.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No projects assigned</p>
            ) : (
              <div className="space-y-2">
                {assignedProjects.map(p => (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/org-chart?view=project&project=${p.id}`)}
                    className="border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 rounded-xl p-4 cursor-pointer group transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[p.type] ?? 'bg-slate-100 text-slate-600'}`}>
                            {p.type}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PROJECT_STATUS_COLORS[p.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {p.status.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{p.code}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                          {p.location && (
                            <span className="flex items-center gap-1"><MapPin size={11} /> {p.location}</span>
                          )}
                          {(p.startDate || p.endDate) && (
                            <span className="flex items-center gap-1">
                              <Calendar size={11} />
                              {p.startDate ?? '—'} {p.endDate ? `→ ${p.endDate}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <ExternalLink size={14} className="text-slate-300 group-hover:text-blue-500 flex-shrink-0 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* History */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="flex items-center justify-between text-sm font-semibold text-slate-700 mb-4">
              <span className="flex items-center gap-2">
                <Clock size={15} className="text-slate-400" />
                History
              </span>
              <span className="text-xs font-medium text-slate-400">{history.length}</span>
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No activity recorded for this employee</p>
            ) : (
              <ol className="relative border-l border-slate-100 ml-2 space-y-4 pl-5">
                {history.map(entry => {
                  const meta = ACTION_META[entry.action];
                  return (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[26px] top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-200" />
                      <div className="flex items-start gap-3 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.color}`}>
                          {meta.label}
                        </span>
                        <p className="text-xs text-slate-500 flex-1 min-w-0 break-words">
                          {entry.details ?? <span className="text-slate-300">No details</span>}
                        </p>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {entry.userName} · {formatTime(entry.timestamp)}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Manager */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
              <Building2 size={15} className="text-slate-400" /> Reports To
            </h2>
            {manager ? (
              <Link
                to={`/employees/${manager.id}`}
                className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-slate-50"
              >
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs flex-shrink-0">
                  {manager.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{manager.name}</p>
                  <p className="text-xs text-slate-400 truncate">{manager.designation}</p>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-slate-400 py-2">No manager assigned</p>
            )}
          </section>

          {/* Direct reports */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="flex items-center justify-between text-sm font-semibold text-slate-700 mb-4">
              <span className="flex items-center gap-2">
                <UsersIcon size={15} className="text-slate-400" />
                Direct Reports
              </span>
              <span className="text-xs font-medium text-slate-400">{reports.length}</span>
            </h2>
            {reports.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No direct reports</p>
            ) : (
              <div className="space-y-1">
                {reports.map(r => (
                  <Link
                    key={r.id}
                    to={`/employees/${r.id}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-slate-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-[10px] flex-shrink-0">
                      {r.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">{r.name}</p>
                      <p className="text-xs text-slate-400 truncate">{r.designation}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Quick refs */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
              <IdCard size={15} className="text-slate-400" /> Quick Info
            </h2>
            <div className="space-y-3">
              <Field label="Status" value={employee.status.replace('_', ' ')} />
              <Field label="Staff Type" value={employee.staffType} />
              <Field label="Division" value={employee.division} />
              <Field label="Active Projects" value={String(assignedProjects.filter(p => p.status === 'ACTIVE').length)} />
            </div>
          </section>
        </div>
      </div>

      {showEdit && <AddEmployeeModal employee={employee} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
