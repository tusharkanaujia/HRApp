import { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import { addEmployee, updateEmployee } from '../store/employeesSlice';
import type { Employee, Division, EmployeeStatus, StaffType } from '../types';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  employee?: Employee; // when provided, modal is in edit mode
}

export default function AddEmployeeModal({ onClose, employee }: Props) {
  const dispatch = useDispatch();
  const employees = useSelector((s: RootState) => s.employees.list);
  const projects = useSelector((s: RootState) => s.projects.list);

  const isEdit = !!employee;

  const companies   = useMemo(() => [...new Set(employees.map(e => e.company).filter(Boolean))].sort(), [employees]);
  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))].sort(), [employees]);

  const [form, setForm] = useState({
    name:           employee?.name           ?? '',
    empId:          employee?.empId          ?? '',
    company:        employee?.company        ?? 'Ancient Builders Constructions LLC',
    designation:    employee?.designation    ?? '',
    department:     employee?.department     ?? '',
    workingLocation:employee?.workingLocation?? '',
    division:       employee?.division       ?? ('CIVIL' as Division),
    managerId:      employee?.managerId      ?? '',
    projectIds:     employee?.projectIds     ?? ([] as string[]),
    status:         employee?.status         ?? ('ACTIVE' as EmployeeStatus),
    staffType:      employee?.staffType      ?? ('STAFF' as StaffType),
    nationality:    employee?.nationality    ?? '',
    doj:            employee?.doj            ?? '',
    shift:          employee?.shift          ?? '',
    accommodation:  employee?.accommodation  ?? '',
    passportNumber: employee?.passportNumber ?? '',
    remarks:        employee?.remarks        ?? '',
  });

  // Initialise manager search input with the existing manager's name
  const [managerSearch, setManagerSearch] = useState(() => {
    if (!employee?.managerId) return '';
    return employees.find(e => e.id === employee.managerId)?.name ?? '';
  });

  const filteredManagers = employees
    .filter(e => e.name.toLowerCase().includes(managerSearch.toLowerCase()) && e.id !== employee?.id)
    .slice(0, 8);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const toggleProject = (id: string) =>
    setForm(f => ({
      ...f,
      projectIds: f.projectIds.includes(id)
        ? f.projectIds.filter(p => p !== id)
        : [...f.projectIds, id],
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp: Employee = {
      ...form,
      id:        isEdit ? employee!.id : `e${Date.now()}`,
      managerId: form.managerId || null,
    };
    dispatch(isEdit ? updateEmployee(emp) : addEmployee(emp));
    onClose();
  };

  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
  const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const selectedManager = form.managerId ? employees.find(e => e.id === form.managerId) : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {isEdit ? 'Edit Employee' : 'Add New Employee'}
            </h2>
            {isEdit && (
              <p className="text-xs text-slate-400 mt-0.5">
                #{employee.empId} · {employee.name}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Name + ID */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input required className={inputCls} value={form.name} onChange={set('name')} placeholder="Employee name" />
            </div>
            <div>
              <label className={labelCls}>Employee ID *</label>
              <input required className={inputCls} value={form.empId} onChange={set('empId')} placeholder="e.g. 10200" />
            </div>
          </div>

          {/* Company + Designation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Company *</label>
              <select className={inputCls} value={form.company} onChange={set('company')}>
                {companies.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Designation *</label>
              <input required className={inputCls} value={form.designation} onChange={set('designation')} placeholder="Job title" />
            </div>
          </div>

          {/* Department + Division */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Department *</label>
              <select className={inputCls} value={form.department} onChange={set('department')}>
                <option value="">Select department...</option>
                {departments.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Division</label>
              <select className={inputCls} value={form.division} onChange={set('division')}>
                {(['CIVIL', 'MEP', 'FACTORY', 'ADMIN', 'GENERAL'] as Division[]).map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Status + Staff Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={set('status')}>
                {(['ACTIVE', 'INACTIVE', 'ON_VACATION', 'RESIGNED', 'VACANT'] as EmployeeStatus[]).map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Staff Type</label>
              <select className={inputCls} value={form.staffType} onChange={set('staffType')}>
                {(['STAFF', 'LABOUR', 'SUPERVISOR'] as StaffType[]).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Manager search */}
          <div>
            <label className={labelCls}>Manager</label>
            <div className="relative">
              <input
                className={inputCls}
                placeholder="Search manager by name..."
                value={managerSearch}
                onChange={e => {
                  setManagerSearch(e.target.value);
                  if (!e.target.value) setForm(f => ({ ...f, managerId: '' }));
                }}
              />
              {managerSearch && filteredManagers.length > 0 && !selectedManager && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 border border-slate-200 rounded-lg bg-white shadow-lg max-h-36 overflow-y-auto">
                  {filteredManagers.map(e => (
                    <button
                      key={e.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, managerId: e.id })); setManagerSearch(e.name); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
                    >
                      <span className="font-medium">{e.name}</span>
                      <span className="text-slate-400 ml-2 text-xs">{e.designation}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedManager && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-0.5">
                  {selectedManager.name} — {selectedManager.designation}
                </span>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => { setForm(f => ({ ...f, managerId: '' })); setManagerSearch(''); }}
                >
                  ✕ clear
                </button>
              </div>
            )}
          </div>

          {/* Nationality + DOJ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nationality</label>
              <input className={inputCls} value={form.nationality} onChange={set('nationality')} />
            </div>
            <div>
              <label className={labelCls}>Date of Joining</label>
              <input type="date" className={inputCls} value={form.doj} onChange={set('doj')} />
            </div>
          </div>

          {/* Shift + Passport */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Shift</label>
              <input className={inputCls} value={form.shift} onChange={set('shift')} placeholder="e.g. DAY" />
            </div>
            <div>
              <label className={labelCls}>Passport Number</label>
              <input className={inputCls} value={form.passportNumber} onChange={set('passportNumber')} />
            </div>
          </div>

          {/* Accommodation + Working Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Accommodation</label>
              <input className={inputCls} value={form.accommodation} onChange={set('accommodation')} />
            </div>
            <div>
              <label className={labelCls}>Working Location</label>
              <input className={inputCls} value={form.workingLocation} onChange={set('workingLocation')} placeholder="e.g. DAMAC BAY 2" />
            </div>
          </div>

          {/* Projects */}
          <div>
            <label className={labelCls}>Assigned Projects</label>
            <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-3">
              {projects.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.projectIds.includes(p.id)}
                    onChange={() => toggleProject(p.id)}
                    className="rounded"
                  />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className={labelCls}>Remarks</label>
            <textarea className={inputCls} rows={2} value={form.remarks} onChange={set('remarks')} />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            {isEdit ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}
