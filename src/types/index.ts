export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface AppUser {
  id: string;
  username: string;
  password: string;
  name: string;
  empId?: string;
  role: UserRole;
}

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_VACATION' | 'RESIGNED' | 'VACANT';
export type StaffType = 'STAFF' | 'LABOUR' | 'SUPERVISOR';
export type Division = 'CIVIL' | 'MEP' | 'FACTORY' | 'ADMIN' | 'GENERAL';
export type ProjectType = 'CIVIL' | 'MEP' | 'FACTORY' | 'GENERAL';
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ON_HOLD';

export interface Employee {
  id: string;
  empId: string;
  name: string;
  company: string;
  designation: string;
  department: string;
  workingLocation: string;
  division: Division;
  managerId: string | null;
  projectIds: string[];
  status: EmployeeStatus;
  nationality?: string;
  doj?: string;
  staffType: StaffType;
  shift?: string;
  accommodation?: string;
  passportNumber?: string;
  remarks?: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  type: ProjectType;
  status: ProjectStatus;
  location?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

export interface TreeNode {
  employee: Employee;
  children: TreeNode[];
  x: number;
  y: number;
}
