export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface AppUser {
  id: string;
  username: string;
  password: string;
  name: string;
  empId?: string;
  role: UserRole;
  disabled?: boolean;
}

export type EmployeeStatus = 'ACTIVE' | 'ONBOARDING' | 'INACTIVE' | 'RESIGNED' | 'TERMINATED' | 'ABSCONDED';
export type EndEmploymentType = 'RESIGN' | 'TERMINATE' | 'ABSCOND';
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
  lastWorkingDate?: string;     // ISO date (YYYY-MM-DD) — set on end-of-employment
  terminationReason?: string;   // free-text comments, shown on hover in search results
  terminatedBy?: string;        // user id of actor who ended employment
  terminatedByName?: string;    // user display name at time of action
  terminatedAt?: string;        // ISO timestamp the action was recorded
  endEmploymentType?: EndEmploymentType; // which path was taken when ending
  assistant?: boolean;          // EA/PA — drawn to the SIDE of their manager in the org chart, not as a normal report
  photoUrl?: string;            // optional headshot URL — shown in the Corporate org chart avatar
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
  | 'ADD_EMPLOYEE' | 'EDIT_EMPLOYEE' | 'DELETE_EMPLOYEE' | 'CHANGE_HIERARCHY' | 'TERMINATE_EMPLOYEE'
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
  cardColors?: Record<string, string>;                 // per-employee card background color
  notes?: Record<string, string>;                      // per-employee free-text note shown beside the card
  font?: { family?: string; scale?: number; color?: string }; // global card-text font for this chart
  updatedAt?: string;                                  // ISO timestamp
  updatedByName?: string;                              // display name of last editor
}

// ── Corporate org chart in-place edits ──────────────────────────────────────
// Tenant-wide overlay on the fixed A3 Corporate chart: per-card tweaks, extra
// cards, and a global font. Stored as a single doc at config/corporateChart.
export interface CorporateCardOverride {
  bg?: string;        // card background colour
  border?: string;    // top accent-bar colour
  fg?: string;        // card text colour
  img?: string;       // avatar image (URL or data URI) — overrides the headshot/initials
  noPhoto?: boolean;  // text-only: hide the avatar
  label?: string;     // .clabel line
  line1?: string;     // .cname line (bold)
  line2?: string;     // .ctitle line
  hidden?: boolean;   // removed from the chart
  dx?: number;        // manual drag offset (px)
  dy?: number;
}
export interface CorporateAddedCard {
  key: string;        // unique id (generated)
  section: string;    // which section container it lives in
  variant: string;    // cv-* style
  width?: number;
  label?: string;
  line1?: string;
  line2?: string;
  bg?: string;
  border?: string;
  fg?: string;
  img?: string;
  noPhoto?: boolean;  // text-only card (no avatar)
  dx?: number;        // manual drag offset (px)
  dy?: number;
}
export interface CorporateEdge { from: string; to: string; type?: 'normal' | 'side' }
export interface CorporateChartConfig {
  font?: { family?: string; scale?: number; color?: string };
  cards?: Record<string, CorporateCardOverride>;
  added?: CorporateAddedCard[];
  edges?: { added?: CorporateEdge[]; removed?: string[] }; // overlay on the base connector set
  updatedAt?: string;
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
