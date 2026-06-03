import type { EmployeeStatus } from '../types';

const config: Record<EmployeeStatus, { label: string; classes: string }> = {
  ACTIVE:     { label: 'Active',     classes: 'bg-emerald-100 text-emerald-700' },
  ONBOARDING: { label: 'Onboarding', classes: 'bg-yellow-100 text-yellow-700' },
  INACTIVE:   { label: 'Inactive',   classes: 'bg-slate-200 text-slate-600' },
  RESIGNED:   { label: 'Resigned',   classes: 'bg-orange-100 text-orange-700' },
  TERMINATED: { label: 'Terminated', classes: 'bg-red-600 text-white' },
  ABSCONDED:  { label: 'Absconded',  classes: 'bg-zinc-800 text-white' },
};

export default function StatusBadge({ status }: { status: EmployeeStatus }) {
  const { label, classes } = config[status] || config.ACTIVE;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

export function statusDotColor(status: EmployeeStatus): string {
  const map: Record<EmployeeStatus, string> = {
    ACTIVE: '#10b981',
    ONBOARDING: '#eab308',
    INACTIVE: '#94a3b8',
    RESIGNED: '#f97316',
    TERMINATED: '#dc2626',
    ABSCONDED: '#27272a',
  };
  return map[status] || '#10b981';
}
