// Wires the FULL reporting hierarchy from "Corporate Chart v2.pdf" into the ABC
// tenant by setting managerId per the chart's drawn connector lines.
//
// This OVERWRITES existing managers for the matched people (VPs, PDs, PMs, CFO,
// dept/support heads). Roots (Board/MD have no record) are left untouched.
// Edge table uses the verified doc ids from the Corporate Organization import.
//
//   node scripts/wireV2Hierarchy.js            -> dry-run (read-only)
//   node scripts/wireV2Hierarchy.js --apply    -> backup + write
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "abc";
const APPLY = process.argv.includes("--apply");

// child id, child label, parent id, parent label, branch
const EDGES = [
  // ── Ziya Akhtar (ED) branch ─────────────────────────────────────────────
  ["e97",     "Rhizalyn (Sec to ED)",      "ecorp12", "Ziya Akhtar",   "Executive"],
  // ── CEO direct line ─────────────────────────────────────────────────────
  ["e31",     "Jeramie Pantas (Sec)",      "ecorp01", "Harish Wadkar", "Executive"],
  ["ecorp02", "Liam Column",               "ecorp01", "Harish Wadkar", "Operations"],
  // Department Heads (no named head -> report to CEO)
  ["ecorp06", "Raid",                      "ecorp01", "Harish Wadkar", "Dept: Legal"],
  ["e86",     "Saeed Al Falasi",           "ecorp01", "Harish Wadkar", "Dept: Public Relations"],
  ["e154",    "Fadi",                      "ecorp01", "Harish Wadkar", "Dept: Factory"],
  ["ecorp07", "Rajesh Nair",               "ecorp01", "Harish Wadkar", "Dept: HR"],
  // Shared Services (-> CEO)
  ["e411",    "Mohit Kumar (CFO)",         "ecorp01", "Harish Wadkar", "Shared Svc: Finance"],
  ["ecorp08", "Pooja (Fit Outs)",          "ecorp01", "Harish Wadkar", "Shared Svc: Interiors"],
  ["ecorp09", "Manoj Kumar",               "ecorp01", "Harish Wadkar", "Shared Svc: Stores"],
  ["e402",    "Mohd. Yousuff",             "ecorp01", "Harish Wadkar", "Shared Svc: Procurement"],
  ["ecorp10", "Abdullah",                  "ecorp01", "Harish Wadkar", "Shared Svc: IT"],
  // Project Support (-> CEO)
  ["e23",     "Pooja Chavan",              "ecorp01", "Harish Wadkar", "Proj Support: BD"],
  ["e416",    "Lokesh Kumar",              "ecorp01", "Harish Wadkar", "Proj Support: Commercial"],
  ["ecorp11", "Rajesh (BD & Est.)",        "ecorp01", "Harish Wadkar", "Proj Support: Tender"],
  ["e401",    "Satya Addala (CCO)",        "ecorp01", "Harish Wadkar", "Proj Support: Cost Control"],
  ["e59",     "Ghulsan Kumar",             "ecorp01", "Harish Wadkar", "Proj Support: Planning"],
  // ── Operations -> VPs ───────────────────────────────────────────────────
  ["e418",    "Gajendra Kumar (VP)",       "ecorp02", "Liam Column",   "Operations"],
  ["e423",    "Uma Shankar (VP)",          "ecorp02", "Liam Column",   "Operations"],
  // ── Gajendra (VP) -> projects ───────────────────────────────────────────
  ["e323",    "Krishnamohan Rao",          "e418",    "Gajendra Kumar","Project: LAGOON"],
  ["e45",     "Abu Jalala",                "e418",    "Gajendra Kumar","Project: 13 Farm House"],
  ["ecorp03", "Punyamurthi",               "e418",    "Gajendra Kumar","Project: W Residences"],
  ["e189",    "Philip Watson",             "e418",    "Gajendra Kumar","Project: Bay 2"],
  // ── Uma (VP) -> projects ────────────────────────────────────────────────
  ["e251",    "Abdul Kader",               "e423",    "Uma Shankar",   "Project: Deira Islands"],
  ["ecorp04", "Prabhu",                    "e423",    "Uma Shankar",   "Project: Eywa"],
  // ── Project Managers -> their Project Director ──────────────────────────
  ["e186",    "Parth",                     "e189",    "Philip Watson", "Project: Bay 2"],
  ["ecorp05", "Jagdeshian",                "e251",    "Abdul Kader",   "Project: Deira Islands"],
  ["e301",    "Andrew Samuel",             "ecorp04", "Prabhu",        "Project: Eywa"],
  ["e247",    "Akram",                     "ecorp04", "Prabhu",        "Project: Eywa"],
];

async function backup() {
  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-25-pre-v2-hierarchy");
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of ["employees", "projects"]) {
    const snap = await getDocs(collection(db, "tenants", TENANT, name));
    fs.writeFileSync(path.join(outDir, `firestore_${name}.json`),
      JSON.stringify(snap.docs.map((d) => ({ _id: d.id, ...d.data() })), null, 2), "utf8");
  }
  console.log(`  backup -> ${outDir}`);
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const snap = await getDocs(collection(db, "tenants", TENANT, "employees"));
  const byId = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const nm = (id) => byId.get(id)?.name ?? "(missing!)";

  const errors = [];
  const writes = [];
  console.log("V2 REPORTING LINES (child -> manager):");
  for (const [cid, clabel, pid, plabel, branch] of EDGES) {
    if (!byId.has(cid)) { errors.push(`child ${cid} (${clabel}) not found`); continue; }
    if (!byId.has(pid)) { errors.push(`parent ${pid} (${plabel}) not found`); continue; }
    const cur = byId.get(cid).managerId ?? null;
    const changed = cur !== pid;
    const curName = cur ? nm(cur) : "—";
    console.log(`  [${changed ? "SET " : "ok  "}] ${clabel.padEnd(24)} -> ${plabel.padEnd(16)} ${changed ? `(was: ${curName})` : ""}`);
    if (changed) writes.push([cid, pid]);
  }

  if (errors.length) { console.log("\n❌ ID errors:\n  " + errors.join("\n  ")); process.exit(1); }

  // Cycle check on the resulting graph (only for nodes we touch + their chain)
  const futureMgr = (id) => {
    const w = writes.find((e) => e[0] === id);
    return w ? w[1] : (byId.get(id)?.managerId ?? null);
  };
  for (const [cid] of writes) {
    const seen = new Set();
    let cur = cid;
    while (cur) {
      if (seen.has(cur)) { console.log(`\n❌ Cycle detected at ${cur} (${nm(cur)})`); process.exit(1); }
      seen.add(cur);
      cur = futureMgr(cur);
    }
  }

  console.log(`\n${writes.length} edge(s) to write; ${EDGES.length - writes.length} already correct. No cycles.`);

  if (!APPLY) { console.log("\nDry-run. Re-run with --apply to write (backup taken first)."); process.exit(0); }

  console.log("\nBacking up…");
  await backup();
  // batch (29 max — well under 500)
  const batch = writeBatch(db);
  for (const [cid, pid] of writes) batch.set(doc(db, "tenants", TENANT, "employees", cid), { managerId: pid }, { merge: true });
  await batch.commit();
  console.log(`\n✅ Wrote ${writes.length} manager edges — full v2 hierarchy applied.`);
  process.exit(0);
}

run().catch((e) => { console.error("❌", e); process.exit(1); });
