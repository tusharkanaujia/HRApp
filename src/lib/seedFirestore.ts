import { doc, setDoc, writeBatch, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { loadExcelEmployees } from '../data/excelDataLoader';
import { seedProjects } from '../data/seedData';
import { seedUsers } from '../data/seedUsers';

export async function migrateABCToFirestore(): Promise<void> {
  const tenantId = 'abc';

  // Idempotency check
  const existing = await getDoc(doc(db, 'tenants', tenantId));
  if (existing.exists()) return;

  console.log('[WeHive] First-run: migrating ABC data to Firestore…');

  // Tenant profile
  await setDoc(doc(db, 'tenants', tenantId), {
    name: 'Ancient Builders Construction Group',
    subdomain: tenantId,
    primaryColor: '#2563eb',
    logoUrl: '',
    createdAt: new Date().toISOString(),
  });

  // Users (small — write individually)
  for (const user of seedUsers) {
    await setDoc(doc(db, 'tenants', tenantId, 'users', user.id), { ...user });
  }

  // Projects (small — write individually)
  for (const project of seedProjects) {
    await setDoc(doc(db, 'tenants', tenantId, 'projects', project.id), { ...project });
  }

  // Employees — batched writes (Firestore limit: 500 ops per batch)
  const employees = loadExcelEmployees();
  const CHUNK = 400;
  for (let i = 0; i < employees.length; i += CHUNK) {
    const batch = writeBatch(db);
    employees.slice(i, i + CHUNK).forEach(emp => {
      batch.set(doc(db, 'tenants', tenantId, 'employees', emp.id), { ...emp });
    });
    await batch.commit();
  }

  console.log(`[WeHive] Migration complete — ${employees.length} employees uploaded`);
}
