// Print one employee's stored fields. Usage: node scripts/peekEmployee.js <tenantId> <docId>
import { doc, getDoc } from "firebase/firestore";
import { db } from "./lib/firebase.js";
const [, , tenantId, empDocId] = process.argv;
const snap = await getDoc(doc(db, "tenants", tenantId, "employees", empDocId));
if (!snap.exists()) { console.error("Not found"); process.exit(1); }
console.log(JSON.stringify(snap.data(), null, 2));
process.exit(0);
