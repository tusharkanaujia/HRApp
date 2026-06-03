import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateEmployee } from '../store/employeesSlice';
import { addActivity } from '../store/activitySlice';
import { disableUserByEmpId } from '../store/authSlice';
import { makeActivity } from '../utils/activityHelpers';
import { useAuth } from '../hooks/useAuth';
import type { Employee, EmployeeStatus, EndEmploymentType } from '../types';
import { X, UserX, LogOut, AlertTriangle } from 'lucide-react';

interface Props {
  employee: Employee;
  onClose: () => void;
}

interface EndTypeOption {
  value: EndEmploymentType;
  status: EmployeeStatus;
  label: string;
  hint: string;
  Icon: React.ElementType;
  accent: string;
  ring: string;
}

const END_TYPES: EndTypeOption[] = [
  {
    value: 'RESIGN',
    status: 'RESIGNED',
    label: 'Resign',
    hint: 'Employee resigned voluntarily.',
    Icon: LogOut,
    accent: 'border-orange-300 bg-orange-50 text-orange-700',
    ring: 'ring-orange-300',
  },
  {
    value: 'TERMINATE',
    status: 'TERMINATED',
    label: 'Terminate',
    hint: 'Company-initiated separation.',
    Icon: UserX,
    accent: 'border-red-300 bg-red-50 text-red-700',
    ring: 'ring-red-300',
  },
  {
    value: 'ABSCOND',
    status: 'ABSCONDED',
    label: 'Abscond',
    hint: 'Employee left without notice / cannot be reached.',
    Icon: AlertTriangle,
    accent: 'border-zinc-400 bg-zinc-100 text-zinc-800',
    ring: 'ring-zinc-400',
  },
];

function prefillType(emp: Employee): EndEmploymentType {
  if (emp.endEmploymentType) return emp.endEmploymentType;
  if (emp.status === 'RESIGNED')  return 'RESIGN';
  if (emp.status === 'ABSCONDED') return 'ABSCOND';
  return 'TERMINATE';
}

export default function EndEmploymentModal({ employee, onClose }: Props) {
  const dispatch = useDispatch();
  const { currentUser } = useAuth();

  const today = new Date().toISOString().slice(0, 10);

  const [endType, setEndType] = useState<EndEmploymentType>(() => prefillType(employee));
  const [lastWorkingDate, setLastWorkingDate] = useState(employee.lastWorkingDate ?? today);
  const [comments, setComments] = useState(employee.terminationReason ?? '');

  const selected = END_TYPES.find(t => t.value === endType)!;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastWorkingDate) return;

    const next: Employee = {
      ...employee,
      status: selected.status,
      lastWorkingDate,
      terminationReason: comments.trim() || undefined,
      terminatedBy: currentUser?.id ?? undefined,
      terminatedByName: currentUser?.name ?? undefined,
      terminatedAt: new Date().toISOString(),
      endEmploymentType: endType,
    };

    dispatch(updateEmployee(next));

    const detailParts = [
      `${selected.label} · ${employee.status} → ${selected.status}`,
      `Last day: ${lastWorkingDate}`,
    ];
    if (comments.trim()) detailParts.push(`Comments: ${comments.trim()}`);
    dispatch(addActivity(
      makeActivity('TERMINATE_EMPLOYEE', 'employee', employee.id, employee.name, currentUser, detailParts.join(' · '))
    ));

    // Revoke login access for the employee (if they have a user account).
    if (employee.empId) {
      dispatch(disableUserByEmpId({ empId: employee.empId, disabled: true }));
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <selected.Icon size={18} className={selected.accent.split(' ').find(c => c.startsWith('text-'))} />
            <h2 className="text-lg font-semibold text-slate-800">End Employment</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className={`border rounded-lg p-3 text-xs ${selected.accent}`}>
            <p className="font-medium">{employee.name} <span className="opacity-70">· #{employee.empId}</span></p>
            <p className="mt-0.5 opacity-80">
              They will be hidden from the org chart after their last working day.
              {employee.empId && ' Their login (if any) will be disabled immediately.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">End Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {END_TYPES.map(opt => {
                const active = opt.value === endType;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEndType(opt.value)}
                    className={`flex flex-col items-center gap-1 border rounded-lg px-2 py-2 text-xs transition ${
                      active
                        ? `${opt.accent} ring-2 ${opt.ring}`
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <opt.Icon size={16} />
                    <span className="font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{selected.hint}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Last Working Date *</label>
            <input
              type="date"
              required
              value={lastWorkingDate}
              onChange={e => setLastWorkingDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Comments</label>
            <textarea
              rows={3}
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Optional notes — shown on hover and on the employee page."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900"
            >
              Confirm · {selected.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
