import type { AppUser } from '../types';

// First-run directory entries (roles only — passwords live in Firebase Auth,
// created by the migration / provisioning scripts, never in Firestore).
export const seedUsers: AppUser[] = [
  { id: 'u001', username: 'obaid.syed',    name: 'Obaid Syed',        empId: '10006', role: 'ADMIN'  },
  { id: 'u002', username: 'shujahat.ali',  name: 'Shujahat Ali',       empId: '10022', role: 'ADMIN'  },
  { id: 'u003', username: 'kennedy.j',     name: 'Kennedy Joseph',     empId: '10031', role: 'ADMIN'  },
  { id: 'u004', username: 'viewer',        name: 'Read-Only Viewer',                   role: 'VIEWER' },
];
