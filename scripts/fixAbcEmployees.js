// Fixes ABC employees in Firestore by re-uploading them with the same transformation
// that src/data/excelDataLoader.ts applies (projectIds, managerId, division, etc.).
// The original migrateAbcData.js wrote the raw JSON, missing those fields, which made
// the Projects and Org Chart pages crash.
//
// Run from the hrapp/ directory: node scripts/fixAbcEmployees.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_ID = "abc";

// ── Transformation logic (port of src/data/excelDataLoader.ts) ──────────────

const PROJECT_MAP = [
  ["LAGOON 150", "p04"], ["LAGOON 53", "p04"],
  ["LAGOON 61 VILLAS - CIVIL", "p05"], ["LAGOON 61 VILLAS-MEP", "p05"], ["LAGOON 61 VILLAS", "p05"],
  ["DAMAC BAY 2", "p01"], ["EYWA", "p02"], ["W RESIDENCES", "p03"],
  ["SATGURU", "p06"],
  ["EDGE WATER RESIDENCES", "p07"], ["DEIRA ISLANDS", "p07"],
  ["805 VILLAS", "p10"], ["BAM X", "p11"],
  ["13-FARM HOUSES", "p12"], ["13 FARMHOUSE", "p12"],
  ["GREEN PROPERTIES", "p13"], ["JVC", "p13"],
  ["NICE", "p14"], ["DAMAC LAGOONS PHASE-2", "p29"],
  ["TRIA-DSO", "p15"],
  ["API-RACECOURSE", "p16"], ["API RACE", "p16"],
  ["AL BARSHA", "p21"],
  ["CHIC TOWER", "p17"], ["CHIC TOWERS", "p17"],
  ["ELEGANCE TOWER", "p18"],
  ["JABEL ALI VILLAGE 168", "p19"], ["168-VILLA", "p19"], ["168 VILLAS", "p19"],
  ["DEIRA WATER FRONT", "p20"],
  ["PROFICIENT DUCT FACTORY", "p22"],
  ["ALUMINUM FACTORY", "p23"], ["ALUMINIUM FACTORY", "p23"],
  ["NEW FACTORY", "p39"],
  ["STEEL CUT", "p24"],
  ["CAVALLI", "p25"], ["AKSHARA", "p26"], ["TILAL AL GHAF", "p27"],
  ["DUSIT PRINCESS", "p28"], ["DAMAC VILLA - DLP", "p30"], ["BIN SAMEH", "p31"],
  ["BEST BUILDING", "p32"], ["AL ASHRAM", "p33"], ["DAMAC HILLS 106", "p34"],
  ["VERA RESIDENCE", "p35"], ["RICHREIT", "p36"], ["METAC", "p37"],
  ["AL RAHMANIYA", "p38"], ["BATAYEH", "p38"],
];

function mapProjectIds(location) {
  if (!location) return [];
  const upper = location.toUpperCase();
  for (const [pattern, id] of PROJECT_MAP) {
    if (upper.includes(pattern.toUpperCase())) return [id];
  }
  return [];
}

function normalizeStaffType(raw) {
  const u = (raw ?? "").toUpperCase();
  if (u.includes("LABOUR")) return "LABOUR";
  if (u.includes("SENIOR STAFF") || u.includes("STAFF")) return "STAFF";
  return "STAFF";
}

function normalizeDivision(location, designation) {
  const u = ((location ?? "") + " " + (designation ?? "")).toUpperCase();
  if (/\bMEP\b|ELECTRICAL|HVAC|PLUMBING|DUCTING|DUCT FACTORY|ELV/.test(u)) return "MEP";
  if (/CIVIL|VILLA|FARMHOUSE|STADIUM|TOWER|RESIDENCE|VILLAS|PROJECT.*CIVIL|CIVIL.*PROJECT/.test(u)) return "CIVIL";
  if (/FACTORY/.test(u)) return "FACTORY";
  if (/HEAD OFFICE|LOGISTICS|DRIVER|CAMP|HR|ADMIN|MANAGEMENT/.test(u)) return "ADMIN";
  return "GENERAL";
}

function normalizeName(name) {
  return (name ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

function designationLevel(des) {
  const d = (des ?? "").toUpperCase();
  if (/MANAGING[\s-]*DIR|^MD$/.test(d)) return 0;
  if (/DEPUTY.*MD|EXECUTIVE\s*DIR|^COO$|^CFO$|VP\s*PROJECT|PRESIDENT|OPERATIONS\s*DIR/.test(d)) return 1;
  if (/GENERAL\s*MANAGER|PROJECT\s*DIRECTOR|PROJECTS\s*DIRECTOR|ASSISTANT\s*VP|HEAD\s*OF/.test(d)) return 2;
  if (/SENIOR.*PROJECT\s*MANAGER|SENIOR.*CONSTRUCTION\s*MANAGER|SR\.?\s*MANAGER|SENIOR\s*MANAGER/.test(d)) return 3;
  if (/PROJECT\s*MANAGER|CONSTRUCTION\s*MANAGER|TECHNICAL\s*MANAGER|PLANNING\s*MANAGER|FINANCE\s*MANAGER|DIRECTOR|QS\s*MANAGER|QUANTITY.*MANAGER|DIVISION\s*MANAGER/.test(d)) return 4;
  if (/SENIOR.*ENGINEER|SENIOR.*SURVEYOR|SR\.?\s*(ENGINEER|SITE|PROJECT)|SENIOR\s*SITE/.test(d)) return 5;
  if (/PROJECT\s*ENGINEER|SITE\s*ENGINEER|ENGINEER|QUANTITY\s*SURVEYOR|COORDINATOR|INSPECTOR|MANAGER$/.test(d)) return 6;
  if (/SUPERVISOR|FOREMAN|CHARGEHAND|INCHARGE|IN-CHARGE/.test(d)) return 7;
  if (/TECHNICIAN|FITTER|CARPENTER|MASON|PLUMBER|WELDER|ELECTRICIAN|FABRICAT|PAINTER|SCAFFOL|RIGGER|INSULATOR|DUCTMAN|DUCTING|DRAFTSMAN|DRAUGHTSMAN|STORE/.test(d)) return 8;
  if (/HELPER|LABOUR|DRIVER|OPERATOR|CLEANER|WATCHMAN|OFFICE\s*BOY|TYPIST|RECEPTIONIST/.test(d)) return 9;
  return 7;
}

function transformEmployees(rawData) {
  const employees = rawData.map((r) => ({
    id: r.id,
    empId: r.empId,
    name: r.name,
    company: r.company || "Ancient Builders Constructions LLC",
    designation: r.designation || "",
    department: r.department || "",
    workingLocation: r.workingLocation || "",
    division: normalizeDivision(r.workingLocation, r.designation),
    managerId: null,
    projectIds: mapProjectIds(r.workingLocation),
    status: "ACTIVE",
    staffType: normalizeStaffType(r.staffType),
  }));

  const nameIndex = new Map();
  const empIdIndex = new Map();
  const idIndex = new Map();
  employees.forEach((e) => {
    nameIndex.set(normalizeName(e.name), e.id);
    empIdIndex.set(e.empId, e.id);
    idIndex.set(e.id, e);
  });

  // Phase 1: managerId from Line Manager 1 name, fallback LM2 emp ID
  rawData.forEach((r) => {
    const emp = idIndex.get(r.id);
    if (!emp) return;
    if (r.managerName) {
      const mgrid = nameIndex.get(normalizeName(r.managerName));
      if (mgrid && mgrid !== emp.id) { emp.managerId = mgrid; return; }
    }
    if (r.lm2EmpId) {
      const lm2Padded = r.lm2EmpId.trim().padStart(5, "0");
      const mgrid = empIdIndex.get(lm2Padded);
      if (mgrid && mgrid !== emp.id) emp.managerId = mgrid;
    }
  });

  // Phase 2: designation-level fallback within division|project group
  const groups = new Map();
  employees.forEach((e) => {
    const key = `${e.division}|${e.projectIds[0] ?? "general"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });

  groups.forEach((members) => {
    const sorted = [...members].sort(
      (a, b) => designationLevel(a.designation) - designationLevel(b.designation),
    );
    const levelRep = new Map();
    sorted.forEach((e) => {
      const lv = designationLevel(e.designation);
      if (!levelRep.has(lv)) levelRep.set(lv, e.id);
    });
    sorted.forEach((e) => {
      if (e.managerId !== null) return;
      const myLevel = designationLevel(e.designation);
      for (let l = myLevel - 1; l >= 0; l--) {
        const repId = levelRep.get(l);
        if (repId && repId !== e.id) { e.managerId = repId; return; }
      }
    });
  });

  return employees;
}

// ── Firestore operations ─────────────────────────────────────────────────────

async function deleteAllEmployees() {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
  if (snap.size === 0) return;
  console.log(`Deleting ${snap.size} existing employee docs...`);
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`  ... deleted ${Math.min(i + 400, snap.docs.length)}/${snap.docs.length}`);
  }
}

async function uploadEmployees(employees) {
  console.log(`Uploading ${employees.length} transformed employee docs...`);
  for (let i = 0; i < employees.length; i += 400) {
    const batch = writeBatch(db);
    employees.slice(i, i + 400).forEach((e) => {
      batch.set(doc(db, "tenants", TENANT_ID, "employees", e.id), e);
    });
    await batch.commit();
    console.log(`  ... uploaded ${Math.min(i + 400, employees.length)}/${employees.length}`);
  }
}

async function run() {
  const file = path.join(__dirname, "..", "src", "data", "excelEmployees.json");
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const rawData = JSON.parse(raw);

  console.log(`Transforming ${rawData.length} raw employees...`);
  const employees = transformEmployees(rawData);
  const withManager = employees.filter((e) => e.managerId !== null).length;
  const withProject = employees.filter((e) => e.projectIds.length > 0).length;
  console.log(`  ${withManager}/${employees.length} have a managerId`);
  console.log(`  ${withProject}/${employees.length} have a projectIds[0]\n`);

  await deleteAllEmployees();
  await uploadEmployees(employees);

  console.log("\n✅  Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
