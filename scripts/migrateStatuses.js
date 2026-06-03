// Migrate ON_VACATION and VACANT employees to ACTIVE (statuses removed from the type).
// Usage: node scripts/migrateStatuses.js <tenantId>

import { collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const TENANT_ID = process.argv[2] ?? "abc";

async function run() {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
  const stale = snap.docs.filter(d => {
    const s = d.data().status;
    return s === "ON_VACATION" || s === "VACANT";
  });
  console.log(`Found ${stale.length} employees with ON_VACATION/VACANT in "${TENANT_ID}".`);
  if (stale.length === 0) { process.exit(0); }

  for (let i = 0; i < stale.length; i += 499) {
    const batch = writeBatch(db);
    for (const d of stale.slice(i, i + 499)) {
      batch.set(doc(db, "tenants", TENANT_ID, "employees", d.id), { status: "ACTIVE" }, { merge: true });
    }
    await batch.commit();
  }
  console.log(`Updated ${stale.length} employees → ACTIVE.`);
  process.exit(0);
}
run().catch(err => { console.error(err.message); process.exit(1); });
