// Create a test employee (default ONBOARDING, DOJ a week in the future) in Firestore.
// Logs an ADD_EMPLOYEE activity. Use scripts/deleteEmployee.js to undo.
// Usage: node scripts/createTestEmployee.js <tenantId> [name]

import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const TENANT_ID = process.argv[2] ?? "abc";
const NAME = process.argv[3] ?? "TEST ONBOARDING DEMO";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function futureISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function nextEmpId() {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
  let max = 0;
  for (const d of snap.docs) {
    const n = parseInt(d.data().empId ?? "", 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(5, "0");
}

async function run() {
  const empId = await nextEmpId();
  const id = `e${Date.now()}`;
  const doj = futureISO(7);
  const emp = {
    id,
    empId,
    name: NAME,
    company: "Ancient Builders Constructions LLC",
    designation: "Project Engineer",
    department: "Technical & Engineering",
    division: "CIVIL",
    managerId: null,
    projectIds: [],
    status: "ONBOARDING",
    staffType: "STAFF",
    doj,
  };
  await setDoc(doc(db, "tenants", TENANT_ID, "employees", id), emp);
  console.log(`Created ${id} (empId ${empId}, ${NAME}) — status ONBOARDING, joins ${doj}`);

  const aid = `a${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(doc(db, "tenants", TENANT_ID, "activity", aid), {
    id: aid,
    timestamp: new Date().toISOString(),
    userId: "script",
    userName: "Test Script",
    action: "ADD_EMPLOYEE",
    entityType: "employee",
    entityId: id,
    entityName: NAME,
    details: `Joins ${doj} · status ONBOARDING`,
  });
  console.log(`Activity entry written: ${aid}`);
  console.log(`\nOpen: http://localhost:5173/employees/${id}`);
  console.log(`Open: http://localhost:5173/org-chart?emp=${id}`);
  process.exit(0);
}
run().catch(err => { console.error(err.message); process.exit(1); });
