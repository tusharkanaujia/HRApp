// Backs up the ABC tenant's employees + projects from Firestore into a local
// JSON snapshot, so it can be restored later by restoreAbc.js.
//
// Run from the hrapp/ directory:
//   node scripts/backupAbc.js              -> default snapshot folder
//   node scripts/backupAbc.js <folder>     -> custom output folder

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_ID = "abc";

const argFolder = process.argv[2];
const defaultFolder = path.join(
  __dirname,
  "..",
  "..",
  "snapshots",
  "2026-05-14-pre-emp13may",
);
const outDir = argFolder ? path.resolve(argFolder) : defaultFolder;

async function dumpCollection(name) {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, name));
  const docs = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  const outFile = path.join(outDir, `firestore_${name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(docs, null, 2), "utf8");
  console.log(`✓  ${name}: ${docs.length} docs -> ${outFile}`);
  return docs.length;
}

async function run() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  console.log(`Backup folder: ${outDir}\n`);

  const empCount = await dumpCollection("employees");
  const projCount = await dumpCollection("projects");

  const manifest = {
    tenantId: TENANT_ID,
    createdAt: new Date().toISOString(),
    counts: { employees: empCount, projects: projCount },
  };
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log("\n✅  Backup complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
