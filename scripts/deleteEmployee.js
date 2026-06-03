// Delete an employee doc from Firestore. Use this to clean up test data.
// Usage: node scripts/deleteEmployee.js <tenantId> <docId>

import { doc, deleteDoc, getDoc } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const [, , tenantId, empDocId] = process.argv;
if (!tenantId || !empDocId) {
  console.error("Usage: node scripts/deleteEmployee.js <tenantId> <docId>");
  process.exit(1);
}

const ref = doc(db, "tenants", tenantId, "employees", empDocId);
const snap = await getDoc(ref);
if (!snap.exists()) { console.error(`${empDocId} not found in ${tenantId}`); process.exit(1); }
console.log(`Deleting ${empDocId} (${snap.data().name})...`);
await deleteDoc(ref);
console.log("Done.");
process.exit(0);
