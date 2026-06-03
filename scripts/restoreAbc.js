// Restores the ABC tenant's employees + projects in Firestore from a snapshot
// produced by backupAbc.js. Deletes the live collections first so the restore
// is exact (not a merge).
//
// Run from the hrapp/ directory:
//   node scripts/restoreAbc.js              -> default snapshot folder
//   node scripts/restoreAbc.js <folder>     -> custom folder

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_ID = "abc";
const CHUNK = 400;

const argFolder = process.argv[2];
const defaultFolder = path.join(
  __dirname,
  "..",
  "..",
  "snapshots",
  "2026-05-14-pre-emp13may",
);
const inDir = argFolder ? path.resolve(argFolder) : defaultFolder;

async function deleteCollection(name) {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, name));
  if (snap.size === 0) return;
  console.log(`Deleting ${snap.size} ${name} docs...`);
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function uploadCollection(name) {
  const file = path.join(inDir, `firestore_${name}.json`);
  if (!fs.existsSync(file)) {
    console.log(`⚠️  ${file} missing - skipping ${name}.`);
    return;
  }
  const docs = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`Restoring ${docs.length} ${name} docs...`);
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    docs.slice(i, i + CHUNK).forEach((d) => {
      const { _id, ...rest } = d;
      batch.set(doc(db, "tenants", TENANT_ID, name, _id), rest);
    });
    await batch.commit();
  }
  console.log(`✓  ${name}: ${docs.length} restored`);
}

async function run() {
  if (!fs.existsSync(inDir)) {
    console.error(`❌  Snapshot folder does not exist: ${inDir}`);
    process.exit(1);
  }
  console.log(`Restoring from: ${inDir}\n`);

  await deleteCollection("employees");
  await deleteCollection("projects");
  await uploadCollection("projects");
  await uploadCollection("employees");

  console.log("\n✅  Restore complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
