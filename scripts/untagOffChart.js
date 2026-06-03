// Removes the "Corporate Organization" tag (project p40) from the 4 people who
// were tagged from the March Excel but are NOT on the authoritative v2 chart:
//   Rockey Vibin (HSE), Anil (QA/QC), Anoop David (Technical), Jai Shankar (MBM GM).
// Employee records are kept; only p40 is pulled from their projectIds.
//
//   node scripts/untagOffChart.js            -> dry-run (read-only)
//   node scripts/untagOffChart.js --apply    -> backup + write
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "abc";
const APPLY = process.argv.includes("--apply");
const PROJECT_ID = "p40";

// id -> expected name (guard against wrong ids)
const TARGETS = [
  ["e390", "Rockey Vibin (HSE)"],
  ["e42",  "Anil (QA/QC)"],
  ["e10",  "Anoop David (Technical)"],
  ["e407", "Jai Shankar (MBM GM)"],
];

async function backup() {
  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-25-pre-untag-offchart");
  fs.mkdirSync(outDir, { recursive: true });
  const snap = await getDocs(collection(db, "tenants", TENANT, "employees"));
  fs.writeFileSync(path.join(outDir, "firestore_employees.json"),
    JSON.stringify(snap.docs.map((d) => ({ _id: d.id, ...d.data() })), null, 2), "utf8");
  console.log(`  backup -> ${outDir}`);
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const snap = await getDocs(collection(db, "tenants", TENANT, "employees"));
  const byId = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

  const writes = [];
  for (const [id, label] of TARGETS) {
    const e = byId.get(id);
    if (!e) { console.log(`  [MISSING] ${id} (${label})`); continue; }
    const pids = Array.isArray(e.projectIds) ? e.projectIds : [];
    const next = pids.filter((p) => p !== PROJECT_ID);
    const tagged = pids.includes(PROJECT_ID);
    console.log(`  [${tagged ? "UNTAG" : "skip "}] ${id} ${e.name} | [${pids}] -> [${next}]`);
    if (tagged) writes.push([id, next]);
  }

  const total = [...byId.values()].filter((e) => (e.projectIds || []).includes(PROJECT_ID)).length;
  console.log(`\n${writes.length} to untag. p40 count: ${total} -> ${total - writes.length}.`);

  if (!APPLY) { console.log("\nDry-run. Re-run with --apply to write (backup taken first)."); process.exit(0); }

  console.log("\nBacking up…");
  await backup();
  const batch = writeBatch(db);
  for (const [id, next] of writes) batch.set(doc(db, "tenants", TENANT, "employees", id), { projectIds: next }, { merge: true });
  await batch.commit();
  console.log(`\n✅ Untagged ${writes.length} off-chart people from Corporate Organization.`);
  process.exit(0);
}

run().catch((e) => { console.error("❌", e); process.exit(1); });
