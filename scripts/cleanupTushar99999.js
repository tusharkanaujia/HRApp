// Dry-run by default: list employees with empId=99999 named "Tushar".
// Pass --apply to delete.
// Usage:
//   node scripts/cleanupTushar99999.js abc          (dry-run)
//   node scripts/cleanupTushar99999.js abc --apply  (delete)

import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const TENANT_ID = process.argv[2] ?? "abc";
const APPLY = process.argv.includes("--apply");

const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
const targets = snap.docs.filter(d => {
  const data = d.data();
  return data.empId === "99999" && /^tushar\b/i.test((data.name ?? "").trim());
});

console.log(`Found ${targets.length} matching employee docs in "${TENANT_ID}":`);
targets.forEach(d => console.log(`  ${d.id.padEnd(22)} empId=${d.data().empId}  ${d.data().name}`));

if (!APPLY) { console.log("\nDry run. Re-run with --apply to delete."); process.exit(0); }

for (let i = 0; i < targets.length; i += 499) {
  const batch = writeBatch(db);
  for (const d of targets.slice(i, i + 499)) batch.delete(doc(db, "tenants", TENANT_ID, "employees", d.id));
  await batch.commit();
}
console.log(`\nDeleted ${targets.length} employees.`);
process.exit(0);
