// Repoint Liam Column (Operations Director, ecorp02) to report directly to the
// Board of Directors (ecorp13) instead of the CEO (ecorp01).
//
// This makes the Corporate Organization chart show Operations as a top-level
// column beside the ED and CEO, matching the original A3 layout.
//
// Run from hrapp/ :
//   node scripts/moveLiamToBoard.js            -> dry-run (read-only)
//   node scripts/moveLiamToBoard.js --apply     -> backup + write
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "abc";
const APPLY = process.argv.includes("--apply");

const LIAM_ID = "ecorp02";   // Liam Column — Operations Director
const BOARD_ID = "ecorp13";  // Board of Directors (root)

const ref = (id) => doc(db, "tenants", TENANT, "employees", id);

async function backup() {
  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-31-pre-liam-to-board");
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

  const liam = await getDoc(ref(LIAM_ID));
  const board = await getDoc(ref(BOARD_ID));

  if (!liam.exists()) { console.log(`❌ ${LIAM_ID} (Liam) not found.`); process.exit(1); }
  if (!board.exists()) { console.log(`❌ ${BOARD_ID} (Board) not found.`); process.exit(1); }

  const cur = liam.data().managerId ?? null;
  console.log("REPOINT Operations Director:");
  console.log(`   ${LIAM_ID} ${liam.data().name} (${liam.data().designation}): managerId ${cur} -> ${BOARD_ID} (${board.data().name})`);

  if (cur === BOARD_ID) { console.log("\n✓ Already reporting to the Board — nothing to do."); process.exit(0); }

  if (!APPLY) { console.log("\nDry-run. Re-run with --apply to write (backup taken first)."); process.exit(0); }

  console.log("\nBacking up…");
  await backup();

  const batch = writeBatch(db);
  batch.set(ref(LIAM_ID), { managerId: BOARD_ID }, { merge: true });
  await batch.commit();

  console.log(`\n✅ Done. ${liam.data().name} now reports to the Board of Directors.`);
  process.exit(0);
}

run().catch((e) => { console.error("❌", e); process.exit(1); });
