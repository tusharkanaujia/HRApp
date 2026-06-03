// Corrects a bad match from the Corporate Organization import: "Ziya Akhtar"
// (Executive Director on the chart) was wrongly merged into the existing
// employee ZIYA MEHDI (e351). They are two different people.
//
// Fix (non-destructive, backed up):
//   1. Create a NEW employee "Ziya Akhtar" (Executive Director), tagged p40,
//      root of her own branch (reports to Board — no manager record).
//   2. Repoint Rhizalyn (e97, "Secretary to ED") -> the new Ziya Akhtar.
//   3. Un-tag ZIYA MEHDI (e351): remove p40 (she is not on the chart).
//
// Run from hrapp/ :
//   node scripts/fixZiyaAkhtar.js            -> dry-run (read-only)
//   node scripts/fixZiyaAkhtar.js --apply    -> backup + write
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "abc";
const APPLY = process.argv.includes("--apply");
const PROJECT_ID = "p40";
const NEW_ID = "ecorp12";
const RHIZALYN_ID = "e97";
const ZIYA_MEHDI_ID = "e351";
const ABC_COMPANY = "Ancient Builders Constructions LLC";

const ref = (id) => doc(db, "tenants", TENANT, "employees", id);

async function backup() {
  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-25-pre-ziya-fix");
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

  const existsNew = await getDoc(ref(NEW_ID));
  const rhiz = await getDoc(ref(RHIZALYN_ID));
  const mehdi = await getDoc(ref(ZIYA_MEHDI_ID));

  if (existsNew.exists()) { console.log(`⚠️  ${NEW_ID} already exists — aborting to avoid overwrite.`); process.exit(1); }
  if (!rhiz.exists()) { console.log(`❌ ${RHIZALYN_ID} (Rhizalyn) not found.`); process.exit(1); }
  if (!mehdi.exists()) { console.log(`❌ ${ZIYA_MEHDI_ID} (Ziya Mehdi) not found.`); process.exit(1); }

  const newZiya = {
    id: NEW_ID,
    empId: "",
    name: "Ziya Akhtar",
    company: ABC_COMPANY,
    designation: "Executive Director",
    department: "Management",
    workingLocation: "HEAD OFFICE",
    division: "ADMIN",
    managerId: null, // root — reports to Board of Directors (no employee record)
    projectIds: [PROJECT_ID],
    status: "ACTIVE",
    staffType: "STAFF",
    remarks: "Imported from Corporate Org Chart v2; unit: Executive (Executive Director). Distinct from ZIYA MEHDI.",
  };

  const mehdiPids = Array.isArray(mehdi.data().projectIds) ? mehdi.data().projectIds : [];
  const mehdiNewPids = mehdiPids.filter((p) => p !== PROJECT_ID);

  console.log("1. CREATE new employee:");
  console.log(`   ${NEW_ID} | ${newZiya.name} | ${newZiya.designation} | projectIds=[${newZiya.projectIds}] | managerId=null`);
  console.log("\n2. REPOINT Rhizalyn (Secretary to ED):");
  console.log(`   ${RHIZALYN_ID} ${rhiz.data().name}: managerId ${rhiz.data().managerId} -> ${NEW_ID} (Ziya Akhtar)`);
  console.log("\n3. UN-TAG Ziya Mehdi (not on chart):");
  console.log(`   ${ZIYA_MEHDI_ID} ${mehdi.data().name}: projectIds [${mehdiPids}] -> [${mehdiNewPids}]`);

  if (!APPLY) { console.log("\nDry-run. Re-run with --apply to write (backup taken first)."); process.exit(0); }

  console.log("\nBacking up…");
  await backup();

  const batch = writeBatch(db);
  batch.set(ref(NEW_ID), newZiya);
  batch.set(ref(RHIZALYN_ID), { managerId: NEW_ID }, { merge: true });
  batch.set(ref(ZIYA_MEHDI_ID), { projectIds: mehdiNewPids }, { merge: true });
  await batch.commit();

  console.log("\n✅ Done. Ziya Akhtar created & tagged; Rhizalyn repointed; Ziya Mehdi un-tagged.");
  process.exit(0);
}

run().catch((e) => { console.error("❌", e); process.exit(1); });
