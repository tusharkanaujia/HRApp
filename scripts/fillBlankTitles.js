// Fills designation + department (from "Corporate - Org chart.xlsx") for the
// Corporate Organization members whose live records had a BLANK designation,
// so their org-chart cards show their role instead of just a name.
// Only writes where the current designation is empty (purely additive).
//
//   node scripts/fillBlankTitles.js            -> dry-run
//   node scripts/fillBlankTitles.js --apply    -> backup + write
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "abc";
const APPLY = process.argv.includes("--apply");

// id -> [designation, department]  (from the authoritative Excel)
const FILL = {
  e401: ["CCO", "Cost Control/Commercials"],
  e402: ["Director - Procurement", "Procurement"],
  e403: ["HR - Director", "HR"],
  e407: ["General Manager", "MEP"],
  e410: ["IT - Manager", "IT"],
  e411: ["CFO", "Accounts"],
  e416: ["Commercial - Director", "Commercial"],
  e418: ["Vice President", "Civil"],
  e423: ["Vice President", "Civil"],
};

async function backup() {
  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-25-pre-fill-titles");
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
  for (const [id, [desig, dept]] of Object.entries(FILL)) {
    const e = byId.get(id);
    if (!e) { console.log(`  [MISSING] ${id}`); continue; }
    const cur = (e.designation || "").trim();
    if (cur) { console.log(`  [skip — already '${cur}'] ${id} ${e.name}`); continue; }
    console.log(`  [FILL] ${id} ${e.name.slice(0,34).padEnd(34)} desig='${desig}' dept='${dept}' (was dept '${e.department || ""}')`);
    writes.push([id, desig, dept]);
  }
  console.log(`\n${writes.length} to fill.`);

  if (!APPLY) { console.log("\nDry-run. Re-run with --apply to write (backup taken first)."); process.exit(0); }

  console.log("\nBacking up…");
  await backup();
  const batch = writeBatch(db);
  for (const [id, desig, dept] of writes) batch.set(doc(db, "tenants", TENANT, "employees", id), { designation: desig, department: dept }, { merge: true });
  await batch.commit();
  console.log(`\n✅ Filled ${writes.length} titles.`);
  process.exit(0);
}

run().catch((e) => { console.error("❌", e); process.exit(1); });
