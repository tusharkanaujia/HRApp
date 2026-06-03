// Terminate an employee in Firestore for testing the chart cutoff.
// Backs up the original record to scripts/termination-rollback-<empId>.json so it's reversible.
//
// Usage:  node scripts/terminateEmployee.js <tenantId> <docId> <YYYY-MM-DD> [reason...]
// Example: node scripts/terminateEmployee.js abc e95 2026-06-15 Restructuring

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./lib/firebase.js";
import fs from "node:fs";
import path from "node:path";

const [, , tenantId, empDocId, lastWorkingDate, ...reasonParts] = process.argv;
if (!tenantId || !empDocId || !lastWorkingDate) {
  console.error("Usage: node scripts/terminateEmployee.js <tenantId> <docId> <YYYY-MM-DD> [reason...]");
  process.exit(1);
}
const reason = reasonParts.join(" ") || undefined;

const empRef = doc(db, "tenants", tenantId, "employees", empDocId);
const snap = await getDoc(empRef);
if (!snap.exists()) {
  console.error(`Employee ${empDocId} not found in tenant ${tenantId}`);
  process.exit(1);
}
const original = { id: empDocId, ...snap.data() };

const rollbackPath = path.join("scripts", `termination-rollback-${empDocId}.json`);
fs.writeFileSync(rollbackPath, JSON.stringify(original, null, 2));
console.log(`Backup written: ${rollbackPath}`);

const now = new Date().toISOString();
const updated = {
  ...original,
  status: "TERMINATED",
  lastWorkingDate,
  terminationReason: reason,
  terminatedBy: "script",
  terminatedByName: "Termination Script",
  terminatedAt: now,
};
await setDoc(empRef, updated);
console.log(`Updated employee ${empDocId} (${original.name}) → TERMINATED, last day ${lastWorkingDate}`);

const activityId = `a${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const detailParts = [`Status: ${original.status} → TERMINATED`, `Last day: ${lastWorkingDate}`];
if (reason) detailParts.push(`Reason: ${reason}`);
const activityRef = doc(db, "tenants", tenantId, "activity", activityId);
await setDoc(activityRef, {
  id: activityId,
  timestamp: now,
  userId: "script",
  userName: "Termination Script",
  action: "TERMINATE_EMPLOYEE",
  entityType: "employee",
  entityId: empDocId,
  entityName: original.name,
  details: detailParts.join(" · "),
});
console.log(`Activity entry written: ${activityId}`);
process.exit(0);
