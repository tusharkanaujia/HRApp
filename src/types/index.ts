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
  workingLocation?: string;
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

export type ActivityAction =
  | 'ADD_EMPLOYEE' | 'EDIT_EMPLOYEE' | 'DELETE_EMPLOYEE' | 'CHANGE_HIERARCHY'
  | 'ADD_PROJECT'  | 'EDIT_PROJECT'  | 'DELETE_PROJECT';

export interface ActivityEntry {
  id: string;
  timestamp: string;       // ISO string
  userId: string;
  userName: string;
  action: ActivityAction;
  entityType: 'employee' | 'project';
  entityId: string;
  entityName: string;
  details?: string;        // human-readable diff, e.g. "Status: ACTIVE → RESIGNED · Manager: Ali → Zeeshan"
}

export interface TreeNode {
  employee: Employee;
  children: TreeNode[];
  x: number;
  y: number;
}

export interface ProjectLayout {
  id: string;                                          // == projectId
  offsets: Record<string, { dx: number; dy: number }>; // per-employee manual offset
  expanded: string[];                                  // expanded employee ids
  transform?: { x: number; y: number; scale: number }; // pan/zoom
  updatedAt?: string;                                  // ISO timestamp
  updatedByName?: string;                              // display name of last editor
}

// Tenant-wide color overrides. Each map holds only the overrides set by an
// admin; lookups fall back to defaults when a key isn't present.
export interface AppearanceConfig {
  divisions?:   Partial<Record<Division, string>>;
  departments?: Record<string, string>;
  projects?:    Record<string, string>; // keyed by project id
  updatedAt?:   string;
  updatedByName?: string;
}
