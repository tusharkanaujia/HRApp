import type { Employee } from '../types';

// Return the next available employee ID string, zero-padded to 5 digits.
// Looks at existing numeric IDs only; non-numeric IDs are ignored.
export function nextEmpId(employees: Employee[]): string {
  let max = 0;
  for (const e of employees) {
    const n = parseInt(e.empId ?? '', 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(5, '0');
}
