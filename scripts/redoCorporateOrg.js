// REDO the Corporate Organization (p40) from the authoritative clean table
// "Corporate - Org chart.xlsx" (explicit Line Manager column).
//
// Reconciles the live tenant to that file:
//   - matches each chart person to a REAL employee where one exists (fuller
//     names revealed several that were previously created as synthetic nodes),
//   - keeps the 6 genuinely-synthetic nodes (Board, Harish, Liam, Prabhu,
//     Jagdeshian, Manoj Kumar) that have no real record,
//   - DELETES the 7 now-redundant synthetic nodes,
//   - re-tags p40 to exactly the new roster, un-tagging anyone dropped,
//   - sets managerId for every roster member per the file.
// Only projectIds + managerId are written on real employees (master data like
// designation/department is left untouched).
//
//   node scripts/redoCorporateOrg.js            -> dry-run
//   node scripts/redoCorporateOrg.js --apply     -> backup + write
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "abc";
const APPLY = process.argv.includes("--apply");
const P = "p40";
const BOARD = "ecorp13";

// IT Manager (Sheikabdullah/e410): the file leaves Line Manager BLANK.
// Default: leave him under the CEO for a connected chart. Set to null to leave
// him as a loose node, or change as desired.
const IT_PARENT = "ecorp01";

// id -> manager id (or null). Covers all 35 people + Board. `null` = root.
const ROSTER = [
  [BOARD,     null],       // Board of Directors (root)
  ["e60",     BOARD],      // Malak Benoudjafer — EA to MD
  ["e351",    BOARD],      // Ziya Mehdi — Executive Director
  ["ecorp01", BOARD],      // Harish Wadkar — CEO
  ["e97",     "e351"],     // Rhizalyn — EA to ED
  ["e64",     "e351"],     // Raed Adnan Ibrahim Halasah — Legal Manager
  ["e86",     "e351"],     // Saeed Alfalasi — GRO Manager
  ["e154",    "e351"],     // Fadi — Division Mgr (Aluminium Factory)
  ["e403",    "e351"],     // Rajesh Chungath Nair — HR Director
  ["ecorp02", "ecorp01"],  // Liam Column — Operations Director
  ["e31",     "ecorp01"],  // Jeramie Pantas — EA to CEO
  ["e411",    "ecorp01"],  // Mohit Agarwal — CFO
  ["e23",     "ecorp01"],  // Pooja Chavan — Sr Exec Commercial
  ["ecorp09", "ecorp01"],  // Manoj Kumar — Stores Manager (synthetic-keep)
  ["e402",    "ecorp01"],  // Mohamed Yousuff Khan — Director Procurement
  ["e416",    "ecorp01"],  // Lokesh Kumar — Commercial Director
  ["e98",     "ecorp01"],  // Raajeshkannan Subbarayalubabu — Estimation Manager
  ["e401",    "ecorp01"],  // Satya Addala — CCO
  ["e59",     "ecorp01"],  // Ghulsan Kumar — Planning Manager
  ["e407",    "ecorp01"],  // Gopalan Jaishankar — General Manager
  ["e410",    IT_PARENT],  // Sheikabdullah Syed Mohamed — IT Manager (file: blank)
  ["e418",    "ecorp02"],  // Gajendra Kumar — VP
  ["e423",    "ecorp02"],  // Uma Shankar — VP
  ["e189",    "ecorp02"],  // Philip Watson — PD Bay 2
  ["e251",    "ecorp02"],  // Abdul Kader — PD Deira Islands
  ["e390",    "ecorp02"],  // Rockey Vibin — Sr HSE Manager
  ["e298",    "ecorp02"],  // Anil Atmaram Haware — QA/QC Manager
  ["e10",     "ecorp02"],  // Anoop David — Technical Manager
  ["e323",    "e418"],     // Krishnamohan Rao — PD Lagoon
  ["e45",     "e418"],     // Abu Jalala — PM 13 Farm House
  ["e378",    "e418"],     // Punnyamurthy Timiri Nagalingam — PD W Residences
  ["ecorp04", "e423"],     // Prabhu — PD Eywa (synthetic-keep)
  ["e186",    "e189"],     // Parth — PM Bay 2
  ["ecorp05", "e251"],     // Jagdeshian — PM Deira Islands (synthetic-keep)
  ["e301",    "e251"],     // Andrew Samuel — PM Eywa
  ["e247",    "e251"],     // Akram — PM Eywa
];
const ROSTER_IDS = new Set(ROSTER.map((r) => r[0]));
const DELETE_IDS = ["ecorp03", "ecorp06", "ecorp07", "ecorp08", "ecorp10", "ecorp11", "ecorp12"];

async function backup() {
  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-25-pre-redo");
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
  const nm = (id) => byId.get(id)?.name ?? (id === null ? "—(root)" : `${id}?`);

  // validate
  const missing = [...ROSTER_IDS].filter((id) => !byId.has(id));
  if (missing.length) { console.log("❌ roster ids missing in tenant:", missing.join(", ")); process.exit(1); }

  // edges to write
  const edgeWrites = [];
  console.log("ROSTER (member -> manager):");
  for (const [id, mgr] of ROSTER) {
    const cur = byId.get(id).managerId ?? null;
    const needEdge = cur !== mgr;
    const needTag = !(byId.get(id).projectIds || []).includes(P);
    const flag = (needEdge ? "M" : " ") + (needTag ? "T" : " ");
    console.log(`  [${flag}] ${nm(id).slice(0,34).padEnd(34)} ${id.padEnd(8)} -> ${nm(mgr)}${needEdge && cur ? `  (was ${nm(cur)})` : ""}`);
    edgeWrites.push([id, mgr, needEdge, needTag]);
  }

  // untag: currently p40 but not in roster and not being deleted
  const delSet = new Set(DELETE_IDS);
  const untag = [...byId.values()].filter((e) => (e.projectIds || []).includes(P) && !ROSTER_IDS.has(e.id) && !delSet.has(e.id));
  console.log("\nUNTAG (dropped from chart):");
  untag.forEach((e) => console.log(`  ${e.id} ${e.name} | ${e.designation}`));
  if (!untag.length) console.log("  (none)");

  // deletions + dangling manager refs
  console.log("\nDELETE synthetic nodes:");
  DELETE_IDS.forEach((id) => console.log(`  ${id} ${byId.get(id)?.name ?? "(absent)"}`));
  const futureMgr = new Map([...byId].map(([id, e]) => [id, e.managerId ?? null]));
  for (const [id, mgr] of ROSTER) futureMgr.set(id, mgr);
  const dangling = [...byId.values()].filter((e) => !delSet.has(e.id) && delSet.has(futureMgr.get(e.id)));
  console.log("\nDANGLING refs to be cleared (managerId -> null):");
  dangling.forEach((e) => console.log(`  ${e.id} ${e.name} (was -> ${e.managerId})`));
  if (!dangling.length) console.log("  (none)");

  const finalCount = ROSTER_IDS.size;
  console.log(`\nSummary: ${edgeWrites.filter((e)=>e[2]).length} edges, ${edgeWrites.filter((e)=>e[3]).length} tags-added, ${untag.length} untag, ${DELETE_IDS.length} deletes. Final p40 = ${finalCount}.`);

  if (!APPLY) { console.log("\nDry-run. Re-run with --apply to write (backup taken first)."); process.exit(0); }

  console.log("\nBacking up…");
  await backup();
  const ops = [];
  for (const [id, mgr, needEdge, needTag] of edgeWrites) {
    const merge = {};
    if (needEdge) merge.managerId = mgr;
    if (needTag) merge.projectIds = [...(byId.get(id).projectIds || []), P];
    if (Object.keys(merge).length) ops.push(["set", id, merge]);
  }
  for (const e of untag) ops.push(["set", e.id, { projectIds: (e.projectIds || []).filter((p) => p !== P) }]);
  for (const e of dangling) ops.push(["set", e.id, { managerId: null }]);
  for (const id of DELETE_IDS) if (byId.has(id)) ops.push(["del", id]);

  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      const ref = doc(db, "tenants", TENANT, "employees", op[1]);
      if (op[0] === "set") batch.set(ref, op[2], { merge: true });
      else batch.delete(ref);
    }
    await batch.commit();
  }
  console.log(`\n✅ Redo applied (${ops.length} ops). Corporate Organization rebuilt from the new file.`);
  process.exit(0);
}

run().catch((e) => { console.error("❌", e); process.exit(1); });
