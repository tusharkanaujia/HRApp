// Imports the "Corporate Organization Chart - All Companies - March 2025.xlsx"
// (a *visual* org chart, read spatially — not a data table) into the ABC tenant.
//
// What it does (NON-DESTRUCTIVE — never deletes existing docs):
//   1. Creates Project p40 "Corporate Organization" (the "tag").
//   2. Creates new employee docs for chart people not already in the tenant.
//   3. Adds p40 to projectIds[] of every chart person (union, no dupes).
//   4. Sets managerId per the chart's reporting lines (only where the chart
//      defines a parent; root nodes are left untouched).
//
// Matching is an EXPLICIT hand-resolved table (see CHART below) — no fuzzy
// auto-matching, because several names collide with unrelated employees.
//
// Run from hrapp/ :
//   node scripts/tagCorporateOrg.js            -> dry-run (read-only, prints plan)
//   node scripts/tagCorporateOrg.js --apply    -> backup + write to Firestore
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_ID = "abc";
const APPLY = process.argv.includes("--apply");
// --edges=all (default) | explicit | none  — controls which managerId edges are written
const EDGE_MODE = (process.argv.find((a) => a.startsWith("--edges="))?.split("=")[1]) ?? "all";
const writeEdge = (edge) => EDGE_MODE === "all" || (EDGE_MODE === "explicit" && edge === "explicit");
// --wire-new : only set managerId on the already-created ecorp* nodes to their
// chart parent (connects the new layer; never touches existing employees' managers).
const WIRE_NEW = process.argv.includes("--wire-new");
const PROJECT_ID = "p40";
const ABC_COMPANY = "Ancient Builders Constructions LLC";

// ── The chart, hand-transcribed from the spreadsheet ─────────────────────────
// key      : internal handle for parent references
// name     : display name exactly as on the card
// title    : designation on the card
// nat      : 2-letter code printed on the card ("" if none)
// unit     : grouping box the card sits in
// parent   : chart key of the manager, or null (root / not drawn)
// match    : EXACT existing full name in the tenant, or null => create new
// edge     : "explicit" (drawn/labelled) or "inferred" (from vertical band)
const CHART = [
  // Top
  { key: "harish",   name: "Harish Wadkar",        title: "CEO",                          nat: "",   unit: "Executive",        parent: null,        match: null, edge: "" },
  { key: "ziya",     name: "Ziya Akhtar",          title: "Executive Director",           nat: "",   unit: "Executive",        parent: null,        match: "ZIYA MEHDI", edge: "" },
  { key: "malak",    name: "Malak Benoudjafer",    title: "PA to MD",                     nat: "",   unit: "Board / Head Office", parent: null,     match: "MALAK SANA BENOUDJAFER", edge: "" },
  { key: "rhizalyn", name: "Rhizalyn",             title: "Secretary to ED",              nat: "",   unit: "Executive",        parent: "ziya",      match: "RHIZALYN ROBERTO MORAGA", edge: "explicit" },
  { key: "jeramie",  name: "Jeramie Pantas",       title: "Secretary to CEO",             nat: "",   unit: "Executive",        parent: "harish",    match: "JERAMIE MORAN PANTAS", edge: "explicit" },
  { key: "liam",     name: "Liam Column",          title: "Operations Director",          nat: "",   unit: "Operations",       parent: "harish",    match: null, edge: "inferred" },
  // Vice Presidents
  { key: "gajendra", name: "Gajendra Kumar",       title: "Vice President",               nat: "",   unit: "Department Heads", parent: "harish",    match: "GAJENDRA KUMAR MAHADEVAIAH", edge: "inferred" },
  { key: "uma",      name: "Uma Shankar",          title: "Vice President",               nat: "",   unit: "Department Heads", parent: "harish",    match: "UMA SHANKAR SINGH KANIYALAL KRISHNAN KRISHNAN", edge: "inferred" },
  // Project Directors  -> Operations Director
  { key: "krishna",  name: "Krishnamohan Rao",     title: "Project Director",             nat: "IN", unit: "Project: LAGOON (53,61&65)", parent: "liam", match: "KRISHNAMOHAN RAO KOLLI KOLLI MAHA LAXMAYYA", edge: "inferred" },
  { key: "abujalala",name: "Abu Jalala",           title: "Project Manager",              nat: "IN", unit: "Project: 13 Farm House", parent: "liam",  match: "MAHMOUD A A ABUJALALA HANIYA", edge: "inferred" },
  { key: "punya",    name: "Punyamurthi",          title: "Project Director",             nat: "IN", unit: "Project: W Residences", parent: "liam",   match: null, edge: "inferred" },
  { key: "philip",   name: "Philip Watson",        title: "Project Director",             nat: "BR", unit: "Project: Bay 2", parent: "liam",          match: "PHILIP JAMES WATSON", edge: "inferred" },
  { key: "abdulk",   name: "Abdul Kader",          title: "Project Director",             nat: "IN", unit: "Project: Deira Islands", parent: "liam",  match: "ABDELKADER HAMMADI", edge: "inferred" },
  { key: "prabhu",   name: "Prabhu",               title: "Project Director",             nat: "IN", unit: "Project: Eywa", parent: "liam",           match: null, edge: "inferred" },
  // Project Managers -> their Project Director
  { key: "parth",    name: "Parth",                title: "Project Manager",              nat: "IN", unit: "Project: Bay 2", parent: "philip",        match: "PARTH YOGESHKUMAR PARIKH YOGESHKUMAR RANCHODLAL", edge: "explicit" },
  { key: "jagdesh",  name: "Jagdeshian",           title: "Project Manager",              nat: "IN", unit: "Project: Deira Islands", parent: "abdulk", match: null, edge: "explicit" },
  { key: "andrew",   name: "Andrew Samuel",        title: "Project Manager",              nat: "IN", unit: "Project: Eywa", parent: "prabhu",         match: "ANDREW SAMUEL DEVASAHAYAM", edge: "explicit" },
  { key: "akram",    name: "Akram",                title: "Project Manager",              nat: "IN", unit: "Project: Eywa", parent: "prabhu",         match: "AKRAM MORSY AHMAD ELSAID", edge: "explicit" },
  // Department heads (Head Office)  -> CEO  [inferred: no specific VP labelled]
  { key: "raid",     name: "Raid",                 title: "Manager - Legal",              nat: "",   unit: "Legal", parent: "harish",                 match: null, edge: "inferred" },
  { key: "saeed",    name: "Saeed Al Falasi",      title: "GRO Manager",                  nat: "UE", unit: "Public Relations", parent: "harish",      match: "SAEED OBAID DHAEN ALHUWAIDI ALFALASI", edge: "inferred" },
  { key: "fadi",     name: "Fadi",                 title: "Divisional Manager",           nat: "IN", unit: "Factory", parent: "harish",               match: "FADI S S SAADEDDIN MANAL", edge: "inferred" },
  { key: "rajeshnair",name: "Rajesh Nair",         title: "Director - HR",                nat: "IN", unit: "Human Resources", parent: "harish",       match: null, edge: "inferred" },
  { key: "rockey",   name: "Rockey Vibin",         title: "Sr. HSE Manager",              nat: "IN", unit: "HSE", parent: "harish",                   match: "ROCKEY VIBIN JOSEPH", edge: "inferred" },
  { key: "anil",     name: "Anil",                 title: "QA/QC Manager",                nat: "IN", unit: "Quality Control", parent: "harish",       match: "ANIL KUMAR JAISWAL LALJEE JAISWAL", edge: "inferred" },
  { key: "anoop",    name: "Anoop David",          title: "Technical Manager",            nat: "IN", unit: "Technical", parent: "harish",             match: "ANOOP JOHN DAVID", edge: "inferred" },
  // Shared Services -> CEO  [inferred]
  { key: "mohit",    name: "Mohit Kumar",          title: "CFO",                          nat: "IN", unit: "Accounts & Finance", parent: "harish",    match: "MOHIT KUMAR AGARWAL", edge: "inferred" },
  { key: "pooja_int",name: "Pooja",               title: "PD - Fit Outs",                nat: "IN", unit: "Interiors", parent: "harish",             match: null, edge: "inferred" },
  { key: "manoj",    name: "Manoj Kumar",          title: "Manager - Stores",             nat: "IN", unit: "Stores", parent: "harish",                match: null, edge: "inferred" },
  { key: "yousuff",  name: "Mohd. Yousuff",        title: "Director - Proc & Estimation", nat: "IN", unit: "Procurement", parent: "harish",           match: "MOHAMED YOUSUFF KHAN MUDAVAN FAZAL", edge: "inferred" },
  { key: "abdullah", name: "Abdullah",             title: "Manager - IT",                 nat: "IN", unit: "IT", parent: "harish",                    match: null, edge: "inferred" },
  // Project Support -> CEO  [inferred]
  { key: "poojachavan",name: "Pooja Chavan",       title: "Sr. Exe - Com. & BD",          nat: "IN", unit: "BD - Approvals", parent: "harish",        match: "POOJA PRITHVIRAJ CHAVAN PRITHVIRAJ BAJIRAO CHAVAN", edge: "inferred" },
  { key: "lokesh",   name: "Lokesh Kumar",         title: "Director - Commercial",        nat: "IN", unit: "Commercial", parent: "harish",            match: "LOKESHKUMAR PALANIVELU PALANIVELU", edge: "inferred" },
  { key: "rajesh_te",name: "Rajesh",              title: "Director - BD & Estimation",   nat: "IN", unit: "Tender & Estimation", parent: "harish",   match: null, edge: "inferred" },
  { key: "satya",    name: "Satya Addala",         title: "CCO",                          nat: "IN", unit: "Cost Control / Commercials", parent: "harish", match: "VENKATA SATYANARAYANA ADDALA ADDALA PEDA DURGA RAO", edge: "inferred" },
  { key: "ghulsan",  name: "Ghulsan Kumar",        title: "Planning Manager",             nat: "IN", unit: "Planning", parent: "harish",              match: "GULSHAN KUMAR", edge: "inferred" },
  // MBM Gulf branch
  { key: "jaishankar",name: "Jai Shankar",         title: "General Manager",              nat: "",   unit: "MBM Gulf", parent: null,                  match: "GOPALAN JAISHANKAR MANI GOPALAN", edge: "" },
];

const norm = (s) => (s ?? "").toUpperCase().replace(/\s+/g, " ").trim();

async function loadLive() {
  const snap = await getDocs(collection(db, "tenants", TENANT_ID, "employees"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function nextIdSeq(live) {
  let max = 0;
  for (const e of live) {
    const m = /^e(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

async function backup() {
  const outDir = path.join(__dirname, "..", "..", "snapshots", "2026-05-25-pre-corporate-org");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  for (const name of ["employees", "projects"]) {
    const snap = await getDocs(collection(db, "tenants", TENANT_ID, name));
    const docs = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
    fs.writeFileSync(path.join(outDir, `firestore_${name}.json`), JSON.stringify(docs, null, 2), "utf8");
    console.log(`  backup ${name}: ${docs.length} docs`);
  }
  console.log(`  -> ${outDir}`);
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (Firestore will be modified)" : "DRY-RUN (read-only)"}\n`);

  const live = await loadLive();
  console.log(`Live tenant '${TENANT_ID}': ${live.length} employees\n`);
  const liveByName = new Map(live.map((e) => [norm(e.name), e]));
  const liveById = new Map(live.map((e) => [e.id, e]));

  // Resolve matches + assign ids to new nodes (ecorpNN = provenance-tagged ids)
  let seq = 0;
  const keyToId = {};
  const errors = [];
  const resolved = CHART.map((n) => {
    let id, action, liveEmp = null;
    if (n.match) {
      liveEmp = liveByName.get(norm(n.match));
      if (!liveEmp) {
        errors.push(`MATCH not found in live tenant: "${n.name}" -> expected "${n.match}"`);
        id = "(MISSING)";
        action = "ERROR";
      } else {
        id = liveEmp.id;
        action = "match";
      }
    } else {
      id = `ecorp${String(++seq).padStart(2, "0")}`;
      action = "new";
    }
    keyToId[n.key] = id;
    return { ...n, id, action, liveEmp };
  });

  // ── Print resolution table ────────────────────────────────────────────────
  console.log("RESOLUTION (chart card -> tenant employee):");
  for (const r of resolved) {
    const tag = r.action === "new" ? "NEW " : r.action === "match" ? "MTCH" : "ERR!";
    const to = r.action === "match" ? `${r.id} ${r.liveEmp.name}` : r.action === "new" ? `${r.id} (create)` : r.match;
    console.log(`  [${tag}] ${r.name.padEnd(20)} ${r.title.padEnd(28)} -> ${to}`);
  }

  // ── Manager edges ───────────────────────────────────────────────────────────
  console.log("\nREPORTING LINES (child -> manager):");
  const mgrWrites = []; // {id, managerId, who, mgrName, edge, before}
  for (const r of resolved) {
    if (!r.parent) continue;
    const mgrId = keyToId[r.parent];
    const mgrNode = resolved.find((x) => x.key === r.parent);
    const before = r.action === "match" && r.liveEmp ? (r.liveEmp.managerId ? (liveById.get(r.liveEmp.managerId)?.name ?? r.liveEmp.managerId) : "—") : "—(new)";
    mgrWrites.push({ id: r.id, managerId: mgrId, who: r.name, mgrName: mgrNode.name });
    const changeNote = r.action === "match" ? `   (was: ${before})` : "";
    console.log(`  [${r.edge.padEnd(8)}] ${r.name.padEnd(20)} -> ${mgrNode.name}${changeNote}`);
  }

  // ── New employees ────────────────────────────────────────────────────────────
  const newNodes = resolved.filter((r) => r.action === "new");
  console.log(`\nNEW EMPLOYEE DOCS (${newNodes.length}):`);
  for (const r of newNodes) console.log(`  ${r.id}  ${r.name} — ${r.title}  [${r.unit}]`);

  console.log(`\nPROJECT (tag): ${PROJECT_ID} "Corporate Organization"`);
  console.log(`Tag applied to ${resolved.filter((r) => r.action !== "ERROR").length} people via projectIds[].`);

  if (errors.length) {
    console.log("\n❌ Unresolved matches — fix CHART before --apply:");
    errors.forEach((e) => console.log("   " + e));
    if (APPLY) { console.log("\nAborting apply due to errors."); process.exit(1); }
  }

  // ── WIRE-NEW: connect only the new ecorp* nodes to their chart parent ────────
  if (WIRE_NEW) {
    const plan = newNodes
      .filter((r) => r.parent)
      .map((r) => ({ id: r.id, who: r.name, managerId: keyToId[r.parent], mgr: resolved.find((x) => x.key === r.parent) }))
      // skip if already correctly set (e.g. Jagdeshian already -> Abdul Kader)
      .map((p) => ({ ...p, current: liveById.get(p.id)?.managerId ?? null }));

    console.log("\nWIRE-NEW — managerId on new nodes only (existing employees untouched):");
    for (const p of plan) {
      const note = p.current === p.managerId ? "  (already set)" : p.current ? `  (was ${p.current})` : "";
      console.log(`  ${p.id} ${p.who.padEnd(18)} -> ${p.managerId} ${p.mgr.name}${note}`);
    }
    const todo = plan.filter((p) => p.current !== p.managerId);
    console.log(`\n${todo.length} edge(s) to write; ${plan.length - todo.length} already correct.`);

    if (!APPLY) { console.log("\nDry-run. Re-run with --apply --wire-new to write."); process.exit(0); }

    const wb = writeBatch(db);
    for (const p of todo) wb.set(doc(db, "tenants", TENANT_ID, "employees", p.id), { managerId: p.managerId }, { merge: true });
    await wb.commit();
    console.log(`\n✅ Wired ${todo.length} new node(s).`);
    process.exit(0);
  }

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write (a backup is taken first).");
    process.exit(0);
  }

  // ── APPLY ────────────────────────────────────────────────────────────────────
  console.log("\nBacking up tenant before write…");
  await backup();

  const batch = writeBatch(db);

  // 1. Project
  batch.set(doc(db, "tenants", TENANT_ID, "projects", PROJECT_ID), {
    id: PROJECT_ID,
    name: "Corporate Organization",
    code: "CORP",
    type: "GENERAL",
    status: "ACTIVE",
    description: "Corporate organisation chart (All Companies, Mar 2025) — leadership grouping tag.",
  });

  // 2. New employee docs
  for (const r of newNodes) {
    const managerId = r.parent && writeEdge(r.edge) ? keyToId[r.parent] : null;
    batch.set(doc(db, "tenants", TENANT_ID, "employees", r.id), {
      id: r.id,
      empId: "",
      name: r.name,
      company: ABC_COMPANY,
      designation: r.title,
      department: "Management",
      workingLocation: "HEAD OFFICE",
      division: "ADMIN",
      managerId,
      projectIds: [PROJECT_ID],
      status: "ACTIVE",
      staffType: "STAFF",
      remarks: `Imported from Corporate Org Chart (Mar 2025); unit: ${r.unit}${r.nat ? `; code: ${r.nat}` : ""}.`,
    });
  }

  // 3. Matched docs: merge projectIds (union) + managerId (if chart defines parent)
  for (const r of resolved.filter((x) => x.action === "match")) {
    const merge = {};
    const existingPids = Array.isArray(r.liveEmp.projectIds) ? r.liveEmp.projectIds : [];
    if (!existingPids.includes(PROJECT_ID)) merge.projectIds = [...existingPids, PROJECT_ID];
    if (r.parent && writeEdge(r.edge)) merge.managerId = keyToId[r.parent];
    if (Object.keys(merge).length) batch.set(doc(db, "tenants", TENANT_ID, "employees", r.id), merge, { merge: true });
  }

  await batch.commit();
  console.log("\n✅ Applied. Project p40 + new docs created; tags & manager links written.");
  process.exit(0);
}

run().catch((err) => { console.error("❌ Error:", err); process.exit(1); });
