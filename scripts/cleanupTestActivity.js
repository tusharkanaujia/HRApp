// Dry-run by default: list activity entries created by the test scripts
// ("Test Script" / "Termination Script") OR referencing known deleted test
// employee IDs. Pass --apply to delete.
//
// Usage:
//   node scripts/cleanupTestActivity.js abc          (dry-run)
//   node scripts/cleanupTestActivity.js abc --apply  (delete)

import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const TENANT_ID = process.argv[2] ?? "abc";
const APPLY = process.argv.includes("--apply");

const TEST_USER_NAMES = new Set(["Test Script", "Termination Script"]);
const TEST_ENTITY_IDS = new Set([
  "e1779314102800", // TEST ONBOARDING DEMO
  "e1779314163693", // Aisha Test Onboarding
  "e1779314894909", // Toast Test Emp 1
  "e1779314898173", // Toast Test Emp 2
]);

const snap = await getDocs(collection(db, "tenants", TENANT_ID, "activity"));
const targets = snap.docs.filter(d => {
  const data = d.data();
  return TEST_USER_NAMES.has(data.userName) || TEST_ENTITY_IDS.has(data.entityId);
});

console.log(`Found ${targets.length} test-activity entries in "${TENANT_ID}":`);
targets.forEach(d => {
  const a = d.data();
  console.log(`  ${d.id.padEnd(22)} ${a.action.padEnd(20)} ${(a.entityName ?? '').padEnd(28)} by ${a.userName}`);
});

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to delete.");
  process.exit(0);
}

for (let i = 0; i < targets.length; i += 499) {
  const batch = writeBatch(db);
  for (const d of targets.slice(i, i + 499)) batch.delete(doc(db, "tenants", TENANT_ID, "activity", d.id));
  await batch.commit();
}
console.log(`\nDeleted ${targets.length} activity entries.`);
process.exit(0);
