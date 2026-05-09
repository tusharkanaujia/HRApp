// One-off script to add a user to an existing WeHive tenant.
// Edit TENANT_ID + USER below, then: node scripts/addUser.js

import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./lib/firebase.js";

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
