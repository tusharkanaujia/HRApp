import type { AppUser } from '../types';

export const seedUsers: AppUser[] = [
  { id: 'u001', username: 'obaid.syed',    password: 'hr@2024', name: 'Obaid Syed',        empId: '10006', role: 'ADMIN'  },
  { id: 'u002', username: 'shujahat.ali',  password: 'hr@2024', name: 'Shujahat Ali',       empId: '10022', role: 'ADMIN'  },
  { id: 'u003', username: 'kennedy.j',     password: 'hr@2024', name: 'Kennedy Joseph',     empId: '10031', role: 'ADMIN'  },
  { id: 'u004', username: 'viewer',        password: 'viewer',  name: 'Read-Only Viewer',               role: 'VIEWER' },
];
