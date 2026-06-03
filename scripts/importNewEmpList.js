// Parses the new "Employee Master List (EMP) for organization chart - 13.05.2026.xlsx",
// dedupes employees (file cross-lists them in two sheets), transforms to the
// app's Employee shape, writes src/data/excelEmployees.json, and replaces the
// ABC tenant's employees collection in Firestore.
//
// Run from the hrapp/ directory:
//   node scripts/importNewEmpList.js              -> dry-run (writes JSON, prints stats)
//   node scripts/importNewEmpList.js --apply      -> also pushes to Firestore (deletes + uploads)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_ID = "abc";
const APPLY = process.argv.includes("--apply");

const XLSX_PATH =
  "D:/Programming/React/HRApp/Resource/Employee Master List (EMP) for organization chart -  13.05.2026.xlsx";
const OUT_JSON = path.join(__dirname, "..", "src", "data", "excelEmployees.json");

// ── Project mapping ──────────────────────────────────────────────────────────
// Extended from existing fixAbcEmployees.js; ordered specific→generic.
const PROJECT_MAP = [
  // Lagoon variants (specific first — '153' must precede 'LAGOON 53')
  ["LAGOON 150", "p04"],
  ["LAGOON 153", "p04"],
  ["LAGOON 53 VILLAS", "p04"],
  ["LAGOON 61 VILLAS - CIVIL", "p05"],
  ["LAGOON 61 VILLAS-MEP", "p05"],
  ["LAGOON 61 VILLAS & 65", "p05"],
  ["LAGOON 61 VILLAS", "p05"],
  ["LAGOON 65", "p05"],
  // Damac Bay 2
  ["DAMAC BAY 2", "p01"],
  // Eywa
  ["EYWA", "p02"],
  // W Residence
  ["W RESIDENCES", "p03"],
  // Satguru
  ["SATGURU", "p06"],
  // Edge Water / Deira Islands
  ["EDGE WATER RESIDENCES", "p07"],
  ["DEIRA ISLANDS", "p07"],
  // 805 Villas / Townhouse
  ["805 VILLAS", "p10"],
  // Bam-x
  ["BAM X", "p11"],
  ["BAM - X", "p11"],
  // 13 Farmhouse / Damac Hills 2
  ["13-FARM HOUSES", "p12"],
  ["13 FARMHOUSE", "p12"],
  ["13 FARM HOUSE", "p12"],
  // JVC Green / Green Properties
  ["GREEN PROPERTIES", "p13"],
  ["JVC", "p13"],
  // Nice 2 & 3 / Damac Lagoons Phase-2
  ["DAMAC LAGOONS PHASE-2", "p29"],
  ["NICE 3", "p14"],
  ["NICE", "p14"],
  // Tria DSO
  ["TRIA-DSO", "p15"],
  ["TRIA DSO", "p15"],
  // Api Racecourse
  ["API-RACECOURSE", "p16"],
  ["API RACE", "p16"],
  // Al Barsha / API China State
  ["AL BARSHA", "p21"],
  // Chic Tower
  ["CHIC TOWER", "p17"],
  ["CHIC TOWERS", "p17"],
  // Elegance Tower
  ["ELEGANCE TOWER", "p18"],
  // 168 Jebel Ali Village
  ["JABEL ALI VILLAGE 168", "p19"],
  ["168-VILLA", "p19"],
  ["168 VILLAS", "p19"],
  // Deira Waterfront
  ["DEIRA WATER FRONT", "p20"],
  // Proficient Duct Factory
  ["PROFICIENT DUCT FACTORY", "p22"],
  // Aluminium Factory
  ["ALUMINUM FACTORY", "p23"],
  ["ALUMINIUM FACTORY", "p23"],
  // New Factory Jebel Ali
  ["NEW FACTORY", "p39"],
  // Steel Cut & Bend (kept for compatibility)
  ["STEEL CUT", "p24"],
  // Newer projects
  ["CAVALLI", "p25"],
  ["AKSHARA", "p26"],
  ["TILAL AL GHAF", "p27"],
  ["DUSIT PRINCESS", "p28"],
  ["DAMAC VILLA - DLP", "p30"],
  ["BIN SAMEH", "p31"],
  ["BEST BUILDING", "p32"],
  ["AL ASHRAM", "p33"],
  ["DAMAC HILLS 106", "p34"],
  ["VERA RESIDENCE", "p35"],
  ["RICHREIT", "p36"],
  ["METAC", "p37"],
  ["AL RAHMANIYA", "p38"],
  ["BATAYEH", "p38"],
];

// Locations that mean "no specific project" (admin / camp / logistics / generic)
const NO_PROJECT_PATTERNS = [
  "HEAD OFFICE",
  "DSO OFFICE",
  "LOGISTICS",
  "ALL CAMP",
  "ALL PROJECT",
  "MANY PROJECT",
  "AMAAL", // not in current 39-project list; treat as none for now
];

function mapProjectIds(location) {
  if (!location) return [];
  const upper = location.toUpperCase();
  if (NO_PROJECT_PATTERNS.some((p) => upper.includes(p))) return [];

  // Split on '&' to support multi-project assignments like "X & Y"
  const parts = upper.split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
  const ids = new Set();
  for (const part of parts) {
    for (const [pattern, id] of PROJECT_MAP) {
      if (part.includes(pattern.toUpperCase())) {
        ids.add(id);
        break;
      }
    }
  }
  return [...ids];
}

function normalizeStaffType(designation) {
  // The new file is the org-chart staff list — all rows are STAFF.
  // Keep the function for symmetry with the existing pipeline.
  const u = (designation ?? "").toUpperCase();
  if (/HELPER|LABOUR|WELDER|MASON|CARPENTER|FITTER|PAINTER/.test(u)) return "LABOUR";
  return "STAFF";
}

function normalizeDivision(location, designation) {
  const u = ((location ?? "") + " " + (designation ?? "")).toUpperCase();
  if (/\bMEP\b|ELECTRICAL|HVAC|PLUMBING|DUCTING|DUCT FACTORY|ELV|MECHANICAL/.test(u)) return "MEP";
  if (/CIVIL|VILLA|FARMHOUSE|STADIUM|TOWER|RESIDENCE|VILLAS|STRUCTURAL/.test(u)) return "CIVIL";
  if (/FACTORY/.test(u)) return "FACTORY";
  if (/HEAD OFFICE|LOGISTICS|DSO|DRIVER|CAMP|HR|ADMIN|MANAGEMENT|FINANCE|HSE|PROCUREMENT|IT |LEGAL|SALES|MARKETING|TYPIST|RECEPTIONIST|TRANSLATOR|PRO\b/.test(u)) return "ADMIN";
  return "GENERAL";
}

function deriveDepartment(designation) {
  const d = (designation ?? "").toUpperCase();
  if (/HR\b|TALENT|PAYROLL|COMPENSATION/.test(d)) return "HR";
  if (/HSE|SAFETY/.test(d)) return "HSE";
  if (/QA\/QC|QC\b|QUALITY/.test(d)) return "QA/QC";
  if (/PROCUREMENT|BUYER/.test(d)) return "Procurement";
  if (/PLANNING/.test(d)) return "Planning";
  if (/QUANTITY|QS|ESTIMAT|CONTRACT|COMMERCIAL|COST/.test(d)) return "Commercial";
  if (/FINANCE|ACCOUNT/.test(d)) return "Finance";
  if (/IT |IT$|BUSINESS APPLICATION/.test(d)) return "IT";
  if (/LEGAL|GOVERNMENT|PRO\b|TRANSLATOR|PUBLIC RELATIONS/.test(d)) return "Admin";
  if (/HSE|SAFETY/.test(d)) return "HSE";
  if (/MEP|MECHANICAL|ELECTRICAL|ELV|HVAC|PLUMBING/.test(d)) return "MEP";
  if (/CIVIL|STRUCTURAL/.test(d)) return "Civil";
  if (/FACTORY|WORKSHOP|DUCT/.test(d)) return "Factory";
  if (/LOGISTIC|TRANSPORT|STORE/.test(d)) return "Logistics";
  if (/SECRETARY|RECEPTIONIST|TYPIST|DOCUMENT CONTROLLER|EXECUTIVE ASSISTANT|ADMIN/.test(d)) return "Admin";
  if (/INTERIOR|DESIGNER|DRAUGHTSMAN|DRAFTSMAN|BIM/.test(d)) return "Design";
  if (/SALES|MARKETING|BUSINESS DEVELOPMENT/.test(d)) return "Sales & Marketing";
  if (/MANAGER|DIRECTOR|MD|COO|CFO|VP\b/.test(d)) return "Management";
  return "General";
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
  if (/PROJECT\s*MANAGER|CONSTRUCTION\s*MANAGER|TECHNICAL\s*MANAGER|PLANNING\s*MANAGER|FINANCE\s*MANAGER|DIRECTOR|QS\s*MANAGER|QUANTITY.*MANAGER|DIVISION\s*MANAGER|ESTIMATION\s*MANAGER|HR.*MANAGER|HR\s*OPERATIONS\s*MANAGER|SAFETY\s*MANAGER|HSE\s*MANAGER|QA\/QC\s*MANAGER|COMMERCIAL\s*MANAGER|COST\s*CONTROL\s*MANAGER|PROCUREMENT\s*MANAGER|BUSINESS\s*DEVELOPMENT\s*MANAGER|SALES\s*MANAGER|ELV.*MANAGER|PROJECT\s*HANDOVER\s*MANAGER|ASST\.?\s*MANAGER|ASSISTANT\s*MANAGER/.test(d)) return 4;
  if (/SENIOR.*ENGINEER|SENIOR.*SURVEYOR|SR\.?\s*(ENGINEER|SITE|PROJECT)|SENIOR\s*SITE/.test(d)) return 5;
  if (/PROJECT\s*ENGINEER|SITE\s*ENGINEER|ENGINEER|QUANTITY\s*SURVEYOR|COORDINATOR|INSPECTOR|MANAGER$/.test(d)) return 6;
  if (/SUPERVISOR|FOREMAN|CHARGEHAND|INCHARGE|IN-CHARGE/.test(d)) return 7;
  if (/TECHNICIAN|FITTER|CARPENTER|MASON|PLUMBER|WELDER|ELECTRICIAN|FABRICAT|PAINTER|SCAFFOL|RIGGER|INSULATOR|DUCTMAN|DRAFTSMAN|DRAUGHTSMAN|STORE/.test(d)) return 8;
  if (/HELPER|LABOUR|DRIVER|OPERATOR|CLEANER|WATCHMAN|OFFICE\s*BOY|TYPIST|RECEPTIONIST/.test(d)) return 9;
  return 7;
}

// ── Read Excel ───────────────────────────────────────────────────────────────

function readExcelRows() {
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true });
  const all = [];
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "", raw: false });
    for (const r of rows) {
      all.push({
        empId: (r["Emp ID"] ?? "").toString().trim(),
        name: (r["Employee Name"] ?? "").trim(),
        designation: (r["DESIGNATION"] ?? "").trim(),
        company: (r["Working Company"] ?? "").trim(),
        location: (r["Working Location"] ?? "").trim(),
        managerName: (r["Line Manager 1"] ?? "").trim(),
        mobile: (r["Mobile"] ?? "").trim(),
        remarks: ((r["Remark"] ?? r["Remarks"]) ?? "").trim(),
      });
    }
  }
  return all;
}

function dedupeByEmpId(rows) {
  // The same Emp ID is cross-listed in "Head Office" + "Other Project" sheets
  // when an employee is anchored at HO but assigned to a project.
  // Verified: all duplicates have the same Working Location, so we take first.
  const seen = new Map();
  for (const r of rows) {
    if (!r.empId || !r.name) continue;
    if (!seen.has(r.empId)) seen.set(r.empId, r);
  }
  return [...seen.values()];
}

// Resolve a raw "Line Manager 1" cell to a single best-match name.
// Handles comma-separated values by preferring the first token that exists
// in the employee list; otherwise returns the first non-empty token verbatim
// (which will become a virtual node).
// Treat these as "no manager" sentinels rather than real names
const NULL_MANAGER_SENTINELS = new Set(["-", "--", "N/A", "NA", "NONE", "NIL"]);

function resolveManagerCell(cell, existingNamesNormalized) {
  if (!cell) return "";
  const tokens = cell
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && !NULL_MANAGER_SENTINELS.has(t.toUpperCase()));
  if (tokens.length === 0) return "";
  for (const t of tokens) {
    if (existingNamesNormalized.has(normalizeName(t))) return t;
  }
  return tokens[0];
}

function augmentWithVirtualManagers(rows) {
  // Collect normalized names of real employees
  const realNames = new Set(rows.map((r) => normalizeName(r.name)));

  // First, simplify each row's managerName to a single resolved token
  const resolvedRows = rows.map((r) => ({
    ...r,
    managerName: resolveManagerCell(r.managerName, realNames),
  }));

  // Find managers still not in the employee list — these become virtual nodes
  const virtualByName = new Map(); // normalized name -> display name
  for (const r of resolvedRows) {
    if (!r.managerName) continue;
    const n = normalizeName(r.managerName);
    if (!realNames.has(n) && !virtualByName.has(n)) {
      virtualByName.set(n, r.managerName);
    }
  }

  const virtualRows = [...virtualByName.values()].map((displayName) => ({
    empId: "",
    name: displayName,
    designation: "",
    company: "",
    location: "",
    managerName: "",
    mobile: "",
    remarks: "Virtual node (line manager named in Excel but not present as an employee)",
  }));

  return { rows: [...resolvedRows, ...virtualRows], virtualCount: virtualRows.length };
}

function buildEmployees(rawRows) {
  // Sequential ids matching the existing convention (e1, e2, ...)
  const employees = rawRows.map((r, i) => ({
    id: `e${i + 1}`,
    empId: r.empId,
    name: r.name,
    company: r.company || "Ancient Builders Constructions LLC",
    designation: r.designation || "",
    department: deriveDepartment(r.designation),
    workingLocation: r.location || "",
    division: normalizeDivision(r.location, r.designation),
    managerId: null,
    projectIds: mapProjectIds(r.location),
    status: "ACTIVE",
    staffType: normalizeStaffType(r.designation),
    mobile: r.mobile || "",
    remarks: r.remarks || "",
  }));

  const nameIndex = new Map();
  const idIndex = new Map();
  employees.forEach((e) => {
    nameIndex.set(normalizeName(e.name), e.id);
    idIndex.set(e.id, e);
  });

  // Phase 1: managerId from Line Manager 1 name match.
  // managerName here has already been resolved to a single token by
  // augmentWithVirtualManagers, and any unmatched names have been added
  // as virtual employee rows — so every non-empty managerName should resolve.
  rawRows.forEach((r, i) => {
    const emp = employees[i];
    if (!r.managerName) return;
    const mgrId = nameIndex.get(normalizeName(r.managerName));
    if (mgrId && mgrId !== emp.id) emp.managerId = mgrId;
  });

  // Cycle-breaking. Walk each chain; if we see a node twice, clear the
  // edge that closes the loop (the junior employee's managerId).
  let broken = 0;
  employees.forEach((start) => {
    const seen = new Set([start.id]);
    let cur = start;
    while (cur.managerId) {
      const next = idIndex.get(cur.managerId);
      if (!next) break;
      if (seen.has(next.id)) {
        // cur -> next closes the cycle. Clear the more-junior side.
        const curLv = designationLevel(cur.designation);
        const nextLv = designationLevel(next.designation);
        if (curLv >= nextLv) {
          // cur is junior or equal — keep cur -> next, instead break next's outgoing edge
          // which is the back-edge in the cycle.
          // Actually we need to break ONE edge in the cycle. Pick the edge from
          // the more-junior side: the larger level value.
          // Walk again starting from next, find junior-most node and clear its mgr.
          let walker = next;
          let juniorMost = next;
          const guard = new Set();
          while (walker.managerId && !guard.has(walker.id)) {
            guard.add(walker.id);
            if (designationLevel(walker.designation) > designationLevel(juniorMost.designation)) {
              juniorMost = walker;
            }
            const w = idIndex.get(walker.managerId);
            if (!w || w.id === next.id) break;
            walker = w;
          }
          juniorMost.managerId = null;
        } else {
          cur.managerId = null;
        }
        broken++;
        break;
      }
      seen.add(next.id);
      cur = next;
    }
  });
  if (broken > 0) console.log(`  Broke ${broken} manager-chain cycle(s)`);

  return employees;
}

function alsoWriteRawJson(rawRows) {
  // Persist a "raw"-shaped JSON matching the existing excelEmployees.json
  // schema, so existing tooling (excelDataLoader.ts) can still consume it.
  const raw = rawRows.map((r, i) => ({
    id: `e${i + 1}`,
    empId: r.empId,
    name: r.name,
    staffType: normalizeStaffType(r.designation),
    status: "ACTIVE",
    designation: r.designation || "",
    company: r.company || "Ancient Builders Constructions LLC",
    workingLocation: r.location || "",
    department: deriveDepartment(r.designation),
    managerName: r.managerName || "",
    lm2EmpId: "",
    lm2Name: "",
    mobile: r.mobile || "",
    remarks: r.remarks || "",
  }));
  fs.writeFileSync(OUT_JSON, JSON.stringify(raw, null, 2), "utf8");
  console.log(`✓  Wrote ${raw.length} rows -> ${OUT_JSON}`);
}

async function replaceFirestoreEmployees(employees) {
  // 1. Delete existing
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
  if (snap.size > 0) {
    console.log(`Deleting ${snap.size} existing employee docs...`);
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  // 2. Upload new
  console.log(`Uploading ${employees.length} employee docs...`);
  for (let i = 0; i < employees.length; i += 400) {
    const batch = writeBatch(db);
    employees.slice(i, i + 400).forEach((e) => {
      batch.set(doc(db, "tenants", TENANT_ID, "employees", e.id), e);
    });
    await batch.commit();
  }
  console.log(`✓  Firestore tenants/${TENANT_ID}/employees replaced.`);
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (Firestore will be modified)" : "dry-run (JSON only)"}\n`);

  const rawRows = readExcelRows();
  console.log(`Read ${rawRows.length} total rows from new Excel`);

  const deduped = dedupeByEmpId(rawRows);
  console.log(`Deduped to ${deduped.length} unique employees`);

  const { rows: augmented, virtualCount } = augmentWithVirtualManagers(deduped);
  if (virtualCount > 0) {
    console.log(`Added ${virtualCount} virtual manager node(s) for managers not present as employees`);
  }

  const employees = buildEmployees(augmented);
  const withMgr = employees.filter((e) => e.managerId !== null).length;
  const withProj = employees.filter((e) => e.projectIds.length > 0).length;
  console.log(`  ${withMgr}/${employees.length} have a managerId`);
  console.log(`  ${withProj}/${employees.length} have a projectIds[0]`);

  const byDivision = employees.reduce((acc, e) => {
    acc[e.division] = (acc[e.division] || 0) + 1;
    return acc;
  }, {});
  console.log("  By division:", byDivision);

  const byStaffType = employees.reduce((acc, e) => {
    acc[e.staffType] = (acc[e.staffType] || 0) + 1;
    return acc;
  }, {});
  console.log("  By staffType:", byStaffType);

  // Unmatched locations
  const unmatched = new Set();
  employees.forEach((e) => {
    if (e.projectIds.length === 0 && e.workingLocation) {
      const u = e.workingLocation.toUpperCase();
      if (!NO_PROJECT_PATTERNS.some((p) => u.includes(p))) {
        unmatched.add(e.workingLocation);
      }
    }
  });
  if (unmatched.size > 0) {
    console.log("\n⚠️  Working locations that produced no project mapping:");
    [...unmatched].forEach((l) => console.log("    " + l));
  }

  alsoWriteRawJson(augmented);

  if (APPLY) {
    await replaceFirestoreEmployees(employees);
    console.log("\n✅  Done — Firestore updated.");
  } else {
    console.log("\nDry-run complete. Re-run with --apply to push to Firestore.");
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("❌  Error:", err);
  process.exit(1);
});
