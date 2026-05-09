// Migrates ABC's employees + projects into Firestore.
// Idempotent: skips collections that already have data.
// Run from the hrapp/ directory: node scripts/migrateAbcData.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_ID = "abc";

// 39 projects — mirrors src/data/seedData.ts seedProjects
const PROJECTS = [
  { id: "p01", name: "Damac Bay 2", code: "DB2", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p02", name: "Eywa Business Bay", code: "EYWA", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p03", name: "W Residence", code: "WRES", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p04", name: "Lagoon 150 Villas", code: "L150", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p05", name: "Lagoon 61 & 65 Villas", code: "L65", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p06", name: "Satguru", code: "SAT", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p07", name: "Deira Islands Tower A", code: "DITA", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p08", name: "Deira Islands Tower B", code: "DITB", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p09", name: "Deira Islands Tower C", code: "DITC", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p10", name: "805 Villas", code: "805V", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p11", name: "Bam-x", code: "BAMX", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p12", name: "13 Farmhouse", code: "13FH", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p13", name: "JWC Green", code: "JWCG", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p14", name: "Nice 2 & 3", code: "N23", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p15", name: "Tria DSO", code: "TRIA", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p16", name: "Api Racecourse", code: "ARC", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p17", name: "Chic Tower", code: "CHIC", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p18", name: "Elegance Tower", code: "ELEG", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p19", name: "168 Jebel Ali Village", code: "168JAV", type: "MEP", status: "ACTIVE", location: "Jebel Ali" },
  { id: "p20", name: "Deira Waterfront", code: "DWF", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p21", name: "Al Barsha", code: "ALBS", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p22", name: "Proficient Duct Factory", code: "PDF", type: "FACTORY", status: "ACTIVE", location: "Jebel Ali" },
  { id: "p23", name: "Aluminium Factory Jebel Ali", code: "AFJA", type: "FACTORY", status: "ACTIVE", location: "Jebel Ali" },
  { id: "p24", name: "Steel Cut & Bend", code: "SCB", type: "FACTORY", status: "ACTIVE", location: "Jebel Ali" },
  { id: "p25", name: "Cavalli Tower", code: "CAVA", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p26", name: "Akshara Studio City", code: "AKSH", type: "MEP", status: "ACTIVE", location: "Dubai" },
  { id: "p27", name: "Tilal Al Ghaf Harmony 3", code: "TAGH", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p28", name: "Dusit Princess", code: "DUSIT", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p29", name: "Damac Lagoons Phase 2 / Nice 3", code: "DLP2", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p30", name: "Damac Villa DLP", code: "DVDLP", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p31", name: "Bin Sameh Car Parking", code: "BSCP", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p32", name: "Best Building Co.", code: "BEST", type: "CIVIL", status: "ACTIVE", location: "Sharjah" },
  { id: "p33", name: "Al Ashram", code: "ALASH", type: "CIVIL", status: "ACTIVE", location: "Sharjah" },
  { id: "p34", name: "Damac Hills 106 Villas", code: "DH106", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p35", name: "Vera Residence", code: "VERA", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p36", name: "Richreit Tower", code: "RICH", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p37", name: "Metac 161 Villas", code: "MET161", type: "CIVIL", status: "ACTIVE", location: "Dubai" },
  { id: "p38", name: "Al Rahmaniya Stadium", code: "ARSTAD", type: "CIVIL", status: "ACTIVE", location: "Sharjah" },
  { id: "p39", name: "New Factory Jebel Ali", code: "NFJA", type: "FACTORY", status: "ACTIVE", location: "Jebel Ali" },
];

async function migrateProjects() {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, "projects"));
  if (snap.size > 0) {
    console.log(`⚠️  Projects already loaded (${snap.size} docs) — skipping.`);
    return;
  }
  const batch = writeBatch(db);
  PROJECTS.forEach((p) => batch.set(doc(db, "tenants", TENANT_ID, "projects", p.id), p));
  await batch.commit();
  console.log(`✓  Projects: ${PROJECTS.length} written`);
}

async function migrateEmployees() {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
  if (snap.size > 0) {
    console.log(`⚠️  Employees already loaded (${snap.size} docs) — skipping.`);
    return;
  }
  const file = path.join(__dirname, "..", "src", "data", "excelEmployees.json");
  // Strip UTF-8 BOM if present
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const employees = JSON.parse(raw);

  const CHUNK = 400;
  for (let i = 0; i < employees.length; i += CHUNK) {
    const batch = writeBatch(db);
    employees.slice(i, i + CHUNK).forEach((e) => {
      batch.set(doc(db, "tenants", TENANT_ID, "employees", e.id), e);
    });
    await batch.commit();
    console.log(`  ... ${Math.min(i + CHUNK, employees.length)}/${employees.length}`);
  }
  console.log(`✓  Employees: ${employees.length} written`);
}

async function run() {
  console.log(`Migrating data for tenant "${TENANT_ID}"\n`);
  await migrateProjects();
  await migrateEmployees();
  console.log("\n✅  Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
