// Reports the document count in each subcollection for a tenant.
// Run from the hrapp/ directory: node scripts/checkTenant.js <tenantId>

import { collection, getDocs } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const TENANT_ID = process.argv[2] ?? "abc";

async function run() {
  const subcollections = ["employees", "projects", "users", "activity"];
  console.log(`\nTenant "${TENANT_ID}" data counts:`);
  for (const sub of subcollections) {
    const snap = await getDocs(collection(db, "tenants", TENANT_ID, sub));
    console.log(`  ${sub.padEnd(12)} ${snap.size}`);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
