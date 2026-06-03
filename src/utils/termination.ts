import type { Employee, EmployeeStatus } from '../types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Statuses that represent an employee whose employment has been ended.
const ENDED_STATUSES: EmployeeStatus[] = ['TERMINATED', 'RESIGNED', 'ABSCONDED'];

export function isEnded(emp: Employee): boolean {
  return ENDED_STATUSES.includes(emp.status);
}

// Employment ended AND last working day is today or in the future. Still
// visible on the org chart (with red border) until the last working day passes.
export function isTerminationPending(emp: Employee): boolean {
  if (!isEnded(emp) || !emp.lastWorkingDate) return false;
  return emp.lastWorkingDate >= todayISO();
}

// Employment ended AND last working day is in the past. Hidden from org chart.
export function isPastLastWorkingDate(emp: Employee): boolean {
  if (!isEnded(emp) || !emp.lastWorkingDate) return false;
  return emp.lastWorkingDate < todayISO();
}

// Tooltip text used on search/list rows for ended employees.
export function terminationTooltip(emp: Employee): string | undefined {
  if (!isEnded(emp)) return undefined;
  const verb = emp.status === 'RESIGNED' ? 'Resigned'
    : emp.status === 'ABSCONDED' ? 'Absconded' : 'Terminated';
  const parts: string[] = [verb];
  if (emp.lastWorkingDate) parts.push(`last day ${emp.lastWorkingDate}`);
  if (emp.terminationReason) parts.push(emp.terminationReason);
  return parts.join(' · ');
}

// Onboarding tooltip — DOJ in the future.
export function isOnboardingPending(emp: Employee): boolean {
  if (emp.status !== 'ONBOARDING') return false;
  if (!emp.doj) return false;
  const today = new Date().toISOString().slice(0, 10);
  return emp.doj > today;
}

export function onboardingTooltip(emp: Employee): string | undefined {
  if (emp.status !== 'ONBOARDING') return undefined;
  return emp.doj ? `Onboarding · joins ${emp.doj}` : 'Onboarding';
}

export function employeeStateTooltip(emp: Employee): string | undefined {
  return terminationTooltip(emp) ?? onboardingTooltip(emp);
}
