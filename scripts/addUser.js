// One-off script to add a user to an existing WeHive tenant.
// Run from the hrapp/ directory: node scripts/addUser.js

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCHRF1pkAPX1FjZCD8q5lk7OR1ZLDrZJwI",
  authDomain: "hrapp-1febc.firebaseapp.com",
  projectId: "hrapp-1febc",
  storageBucket: "hrapp-1febc.firebasestorage.app",
  messagingSenderId: "626901174765",
  appId: "1:626901174765:web:3851b736eff63b4b863fe4",
};

// ── User to add ──────────────────────────────────────────────────────────────
const TENANT_ID = "abc";
const USER = {
  id: "abc_u002",
  username: "manish.gaikwad",
  password: "hr@2026",
  name: "Manisha Gaikwad",
  role: "ADMIN",
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const tenantSnap = await getDoc(doc(db, "tenants", TENANT_ID));
  if (!tenantSnap.exists()) {
    console.log(`❌  Tenant "${TENANT_ID}" does not exist. Create it first.`);
    process.exit(1);
  }

  const userRef = doc(db, "tenants", TENANT_ID, "users", USER.id);
  const existing = await getDoc(userRef);
  if (existing.exists()) {
    console.log(
      `⚠️  User "${USER.id}" already exists in tenant "${TENANT_ID}" — aborting to avoid overwrite.`,
    );
    process.exit(0);
  }

  await setDoc(userRef, { ...USER });
  console.log(`✓  User created: ${USER.username} (${USER.role}) in tenant "${TENANT_ID}"`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
