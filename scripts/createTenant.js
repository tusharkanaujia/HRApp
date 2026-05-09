// One-off script to provision a new WeHive tenant in Firestore.
// Run from the hrapp/ directory: node scripts/createTenant.js

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCHRF1pkAPX1FjZCD8q5lk7OR1ZLDrZJwI',
  authDomain: 'hrapp-1febc.firebaseapp.com',
  projectId: 'hrapp-1febc',
  storageBucket: 'hrapp-1febc.firebasestorage.app',
  messagingSenderId: '626901174765',
  appId: '1:626901174765:web:3851b736eff63b4b863fe4',
};

// ── Tenant config ────────────────────────────────────────────────────────────
const TENANT = {
  id:           'mbm',
  name:         'MBM Gulf',
  subdomain:    'mbm',
  primaryColor: '#0d9488',   // teal
  logoUrl:      '',
};

const ADMIN_USERS = [
  { id: 'mbm_u001', username: 'obaid.syed', password: 'hr@2024', name: 'Obaid Syed', role: 'ADMIN' },
];
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

async function run() {
  // Guard: don't overwrite an existing tenant
  const existing = await getDoc(doc(db, 'tenants', TENANT.id));
  if (existing.exists()) {
    console.log(`⚠️  Tenant "${TENANT.id}" already exists — aborting to avoid overwrite.`);
    process.exit(0);
  }

  // Create tenant profile
  await setDoc(doc(db, 'tenants', TENANT.id), {
    name:         TENANT.name,
    subdomain:    TENANT.subdomain,
    primaryColor: TENANT.primaryColor,
    logoUrl:      TENANT.logoUrl,
    createdAt:    new Date().toISOString(),
  });
  console.log(`✓  Tenant profile created: ${TENANT.name}`);

  // Create admin users
  for (const user of ADMIN_USERS) {
    await setDoc(doc(db, 'tenants', TENANT.id, 'users', user.id), { ...user });
    console.log(`✓  User created: ${user.username} (${user.role})`);
  }

  console.log(`\n✅  Done! Tenant "${TENANT.id}" is ready.`);
  console.log(`   App URL (local):  http://localhost:5176  (set VITE_TENANT_SLUG=mbm)`);
  console.log(`   App URL (live):   https://mbm.wehive.co.uk  (after DNS setup)`);
  process.exit(0);
}

run().catch(err => { console.error('❌  Error:', err.message); process.exit(1); });
