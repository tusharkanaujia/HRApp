import type { EmployeeStatus } from '../types';

const config: Record<EmployeeStatus, { label: string; classes: string }> = {
  ACTIVE:      { label: 'Active',      classes: 'bg-emerald-100 text-emerald-700' },
  INACTIVE:    { label: 'Inactive',    classes: 'bg-red-100 text-red-700' },
  ON_VACATION: { label: 'On Vacation', classes: 'bg-gray-100 text-gray-600' },
  RESIGNED:    { label: 'Resigned',    classes: 'bg-yellow-100 text-yellow-700' },
  VACANT:      { label: 'Vacant',      classes: 'bg-purple-100 text-purple-700' },
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
    INACTIVE: '#ef4444',
    ON_VACATION: '#9ca3af',
    RESIGNED: '#f59e0b',
    VACANT: '#a855f7',
  };
  return map[status] || '#10b981';
}
