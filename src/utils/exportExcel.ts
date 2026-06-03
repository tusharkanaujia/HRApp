import * as XLSX from 'xlsx';
import type { Employee } from '../types';

export function exportEmployeesToExcel(
  employees: Employee[],
  managerNameById: Map<string, string>,
  filename = 'employees.xlsx',
): void {
  const rows = employees.map(e => ({
    'Emp ID': e.empId,
    'Name': e.name,
    'Designation': e.designation,
    'Department': e.department,
    'Division': e.division,
    'Company': e.company,
    'Working Location': e.workingLocation ?? '',
    'Status': e.status,
    'Staff Type': e.staffType,
    'Manager': e.managerId ? (managerNameById.get(e.managerId) ?? '') : '',
    'Project IDs': e.projectIds.join(', '),
    'Nationality': e.nationality ?? '',
    'DOJ': e.doj ?? '',
    'Shift': e.shift ?? '',
    'Accommodation': e.accommodation ?? '',
    'Passport': e.passportNumber ?? '',
    'Remarks': e.remarks ?? '',
    'Last Working Date': e.lastWorkingDate ?? '',
    'Termination Reason': e.terminationReason ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-size columns based on content length
  const maxWidths: Record<string, number> = {};
  rows.forEach(row => {
    Object.entries(row).forEach(([k, v]) => {
      const len = String(v ?? '').length;
      maxWidths[k] = Math.max(maxWidths[k] ?? k.length, len);
    });
  });
  ws['!cols'] = Object.keys(rows[0] ?? {}).map(k => ({ wch: Math.min(maxWidths[k] + 2, 50) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, filename);
}
