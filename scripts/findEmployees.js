// Find employees by name substring. Usage: node scripts/findEmployees.js <tenantId> <substring>
import { collection, getDocs } from "firebase/firestore";
import { db } from "./lib/firebase.js";
const [, , tenantId, needle] = process.argv;
const snap = await getDocs(collection(db, "tenants", tenantId, "employees"));
const q = (needle ?? "").toLowerCase();
const hits = snap.docs.filter(d => (d.data().name ?? "").toLowerCase().includes(q));
console.log(`Matches for "${needle}" in "${tenantId}": ${hits.length}`);
hits.forEach(d => {
  const a = d.data();
  console.log(`  ${d.id.padEnd(22)} empId=${(a.empId ?? "").padEnd(8)} ${(a.name ?? "").padEnd(28)} ${a.designation ?? ""}`);
});
process.exit(0);
