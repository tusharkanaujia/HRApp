// Adds a "Board of Directors" top node (matches the v2 chart's top box) and
// re-roots the Corporate Organization's top people under it, so the tagged
// population forms ONE connected tree (needed for a single-PDF chart export).
//
// Roots being unified: Harish Wadkar (ecorp01, CEO), Ziya Akhtar (ecorp12, ED),
// Malak Benoudjafer (e60, PA to MD).
//
//   node scripts/addBoardNode.js            -> dry-run
//   node scripts/addBoardNode.js --apply    -> backup + write
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "abc";
const APPLY = process.argv.includes("--apply");
const PROJECT_ID = "p40";
const BOARD_ID = "ecorp13";
const ROOTS = ["ecorp01", "ecorp12", "e60"]; // Harish, Ziya, Malak

const ref = (id) => doc(db, "tenants", TENANT, "employees", id);

async function backup() {
  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-25-pre-board-node");
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

  if (byId.has(BOARD_ID)) { console.log(`⚠️ ${BOARD_ID} already exists — aborting.`); process.exit(1); }

  const board = {
    id: BOARD_ID,
    empId: "",
    name: "Board of Directors",
    company: "Ancient Builders Constructions LLC",
    designation: "Head Office",
    department: "Management",
    workingLocation: "HEAD OFFICE",
    division: "ADMIN",
    managerId: null,
    projectIds: [PROJECT_ID],
    status: "ACTIVE",
    staffType: "STAFF",
    remarks: "Corporate Org Chart v2 top node (Board of Directors / Head Office).",
  };

  console.log("CREATE:");
  console.log(`  ${BOARD_ID} | Board of Directors | tag p40 | managerId=null (top)`);
  console.log("\nRE-ROOT under Board:");
  for (const id of ROOTS) {
    const e = byId.get(id);
    if (!e) { console.log(`  ❌ ${id} not found`); process.exit(1); }
    console.log(`  ${id} ${e.name} (${e.designation}): managerId ${e.managerId ?? "—"} -> ${BOARD_ID}`);
  }

  // Simulate resulting p40-team roots to confirm a single root
  const future = new Map([...byId].map(([id, e]) => [id, e.managerId ?? null]));
  future.set(BOARD_ID, null);
  for (const id of ROOTS) future.set(id, BOARD_ID);
  const tagged = [...byId.values()].filter((e) => (e.projectIds || []).includes(PROJECT_ID)).map((e) => e.id);
  tagged.push(BOARD_ID);
  const teamSet = new Set();
  for (const id of tagged) { let c = id, g = new Set(); while (c && !g.has(c)) { g.add(c); teamSet.add(c); c = future.get(c) ?? null; } }
  const roots = [...teamSet].filter((id) => { const m = future.get(id); return !m || !teamSet.has(m); });
  console.log(`\nResulting Corporate Org team: ${teamSet.size} nodes; roots: ${roots.map((r) => byId.get(r)?.name ?? r).join(", ")}`);
  console.log(`p40 count: ${tagged.length - 1} -> ${tagged.length}`);

  if (!APPLY) { console.log("\nDry-run. Re-run with --apply to write (backup taken first)."); process.exit(0); }

  console.log("\nBacking up…");
  await backup();
  const batch = writeBatch(db);
  batch.set(ref(BOARD_ID), board);
  for (const id of ROOTS) batch.set(ref(id), { managerId: BOARD_ID }, { merge: true });
  await batch.commit();
  console.log("\n✅ Board of Directors created; Harish, Ziya, Malak re-rooted under it.");
  process.exit(0);
}

run().catch((e) => { console.error("❌", e); process.exit(1); });
