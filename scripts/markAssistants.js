// Marks the three Executive/Personal Assistants so the org chart draws them to
// the SIDE of the person they support instead of as a normal report.
//   e60 Malak Benoudjafer (EA to MD)   e97 Rhizalyn (EA to ED)   e31 Jeramie (EA to CEO)
//
//   node scripts/markAssistants.js            -> dry-run
//   node scripts/markAssistants.js --apply     -> backup + write
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "abc";
const APPLY = process.argv.includes("--apply");
const IDS = ["e60", "e97", "e31"];

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const snap = await getDocs(collection(db, "tenants", TENANT, "employees"));
  const byId = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  for (const id of IDS) {
    const e = byId.get(id);
    console.log(e ? `  ${id} | ${e.name} | ${e.designation} | assistant: ${e.assistant === true} -> true` : `  ${id} MISSING`);
  }
  if (!APPLY) { console.log("\nDry-run. Re-run with --apply to write."); process.exit(0); }

  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-25-pre-assistants");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "firestore_employees.json"),
    JSON.stringify(snap.docs.map((d) => ({ _id: d.id, ...d.data() })), null, 2), "utf8");
  console.log(`  backup -> ${outDir}`);

  const batch = writeBatch(db);
  for (const id of IDS) if (byId.has(id)) batch.set(doc(db, "tenants", TENANT, "employees", id), { assistant: true }, { merge: true });
  await batch.commit();
  console.log("\n✅ Marked 3 assistants.");
  process.exit(0);
}
run().catch((e) => { console.error("❌", e); process.exit(1); });
