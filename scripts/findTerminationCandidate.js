// List managers with the most direct reports (so the red border is visible on the chart).
// Usage: node scripts/findTerminationCandidate.js [tenantId]

import { collection, getDocs } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const TENANT_ID = process.argv[2] ?? "abc";

async function run() {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
  const emps = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const reportCount = new Map();
  for (const e of emps) {
    if (e.managerId) reportCount.set(e.managerId, (reportCount.get(e.managerId) ?? 0) + 1);
  }

  const ranked = emps
    .map(e => ({ ...e, reports: reportCount.get(e.id) ?? 0 }))
    .filter(e => e.status === "ACTIVE" && e.reports >= 2 && e.reports <= 6)
    .sort((a, b) => b.reports - a.reports);

  console.log(`\nCandidates in "${TENANT_ID}" (ACTIVE, 2-6 reports):`);
  ranked.slice(0, 15).forEach(e => {
    console.log(`  ${e.id.padEnd(20)} #${(e.empId ?? "").padEnd(8)} ${(e.name ?? "").padEnd(32)} ${e.reports} reports  ${e.designation ?? ""}`);
  });
  process.exit(0);
}

run().catch(err => { console.error("Error:", err.message); process.exit(1); });
