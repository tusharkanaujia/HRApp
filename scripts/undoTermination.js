// Restore an employee from the backup written by terminateEmployee.js.
// Usage: node scripts/undoTermination.js <tenantId> <docId>

import { doc, setDoc } from "firebase/firestore";
import { db } from "./lib/firebase.js";
import fs from "node:fs";
import path from "node:path";

const [, , tenantId, empDocId] = process.argv;
if (!tenantId || !empDocId) {
  console.error("Usage: node scripts/undoTermination.js <tenantId> <docId>");
  process.exit(1);
}

const rollbackPath = path.join("scripts", `termination-rollback-${empDocId}.json`);
if (!fs.existsSync(rollbackPath)) {
  console.error(`Backup not found: ${rollbackPath}`);
  process.exit(1);
}
const original = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
const { id, ...rest } = original;

const empRef = doc(db, "tenants", tenantId, "employees", empDocId);
await setDoc(empRef, rest);
console.log(`Restored employee ${empDocId} (${original.name}) → status=${original.status}`);
fs.unlinkSync(rollbackPath);
console.log(`Deleted backup: ${rollbackPath}`);
process.exit(0);
