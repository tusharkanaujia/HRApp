import { collection, getDocs } from "firebase/firestore";
import { db } from "./lib/firebase.js";
const TENANT_ID = process.argv[2] ?? "abc";
const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
const rows = snap.docs.map(d => ({ id: d.id, empId: d.data().empId ?? "", name: d.data().name ?? "" }));
const numeric = rows.filter(r => /^\d+$/.test(r.empId)).sort((a, b) => parseInt(b.empId) - parseInt(a.empId));
console.log(`Top numeric empIds in "${TENANT_ID}":`);
numeric.slice(0, 10).forEach(r => console.log(`  ${r.empId.padEnd(10)} ${r.id.padEnd(20)} ${r.name}`));
process.exit(0);
