import type { Employee, Division, EmployeeStatus, StaffType } from '../types';
import rawDataJson from './excelEmployees.json';

interface RawEmployee {
  id: string;
  empId: string;
  name: string;
  staffType: string;
  status: string;
  designation: string;
  company: string;
  workingLocation: string; // Working Location from Excel (for project/division mapping)
  department: string;       // Department column (derived, for display)
  managerName: string;      // Line Manager 1 name
  lm2EmpId: string;         // Line Manager 2 emp ID (fallback)
  lm2Name: string;
}

const rawData = rawDataJson as unknown as RawEmployee[];

// ── Working Location → project ID ─────────────────────────────────────────
// Checked against all unique values from the new file
const PROJECT_MAP: [string, string][] = [
  // Lagoon variants (specific first)
  ['LAGOON 150', 'p04'],
  ['LAGOON 53', 'p04'],
  ['LAGOON 61 VILLAS - CIVIL', 'p05'],
  ['LAGOON 61 VILLAS-MEP', 'p05'],
  ['LAGOON 61 VILLAS', 'p05'],
  // Damac Bay 2
  ['DAMAC BAY 2', 'p01'],
  // Eywa
  ['EYWA', 'p02'],
  // W Residence
  ['W RESIDENCES', 'p03'],
  // Satguru
  ['SATGURU', 'p06'],
  // Edge Water / Deira Islands
  ['EDGE WATER RESIDENCES', 'p07'],
  ['DEIRA ISLANDS', 'p07'],
  // 805 Villas / Townhouse
  ['805 VILLAS', 'p10'],
  // Bam-x
  ['BAM X', 'p11'],
  // 13 Farmhouse / Damac Hills 2
  ['13-FARM HOUSES', 'p12'],
  ['13 FARMHOUSE', 'p12'],
  // JVC Green / Green Properties
  ['GREEN PROPERTIES', 'p13'],
  ['JVC', 'p13'],
  // Nice 2 & 3 / Damac Lagoons Phase-2
  ['NICE', 'p14'],
  ['DAMAC LAGOONS PHASE-2', 'p29'],
  // Tria DSO
  ['TRIA-DSO', 'p15'],
  // Api Racecourse
  ['API-RACECOURSE', 'p16'],
  ['API RACE', 'p16'],
  // Al Barsha / API China State
  ['AL BARSHA', 'p21'],
  // Chic Tower
  ['CHIC TOWER', 'p17'],
  ['CHIC TOWERS', 'p17'],
  // Elegance Tower
  ['ELEGANCE TOWER', 'p18'],
  // 168 Jebel Ali Village
  ['JABEL ALI VILLAGE 168', 'p19'],
  ['168-VILLA', 'p19'],
  ['168 VILLAS', 'p19'],
  // Deira Waterfront
  ['DEIRA WATER FRONT', 'p20'],
  // Proficient Duct Factory
  ['PROFICIENT DUCT FACTORY', 'p22'],
  // Aluminium Factory
  ['ALUMINUM FACTORY', 'p23'],
  ['ALUMINIUM FACTORY', 'p23'],
  // New Factory Jebel Ali
  ['NEW FACTORY', 'p39'],
  // Steel Cut & Bend (not in new file but keep for compatibility)
  ['STEEL CUT', 'p24'],
  // New projects from May 2026 file
  ['CAVALLI', 'p25'],
  ['AKSHARA', 'p26'],
  ['TILAL AL GHAF', 'p27'],
  ['DUSIT PRINCESS', 'p28'],
  ['DAMAC VILLA - DLP', 'p30'],
  ['BIN SAMEH', 'p31'],
  ['BEST BUILDING', 'p32'],
  ['AL ASHRAM', 'p33'],
  ['DAMAC HILLS 106', 'p34'],
  ['VERA RESIDENCE', 'p35'],
  ['RICHREIT', 'p36'],
  ['METAC', 'p37'],
  ['AL RAHMANIYA', 'p38'],
  ['BATAYEH', 'p38'],
];

function mapProjectIds(location: string): string[] {
  if (!location) return [];
  const upper = location.toUpperCase();
  for (const [pattern, id] of PROJECT_MAP) {
    if (upper.includes(pattern.toUpperCase())) return [id];
  }
  return [];
}

function normalizeStaffType(raw: string): StaffType {
  const u = (raw ?? '').toUpperCase();
  if (u.includes('LABOUR')) return 'LABOUR';
  if (u.includes('SENIOR STAFF') || u.includes('STAFF')) return 'STAFF';
  return 'STAFF';
}

function normalizeDivision(location: string, designation: string): Division {
  const u = (location + ' ' + designation).toUpperCase();
  if (/\bMEP\b|ELECTRICAL|HVAC|PLUMBING|DUCTING|DUCT FACTORY|ELV/.test(u)) return 'MEP';
  if (/CIVIL|VILLA|FARMHOUSE|STADIUM|TOWER|RESIDENCE|VILLAS|PROJECT.*CIVIL|CIVIL.*PROJECT/.test(u)) return 'CIVIL';
  if (/FACTORY/.test(u)) return 'FACTORY';
  if (/HEAD OFFICE|LOGISTICS|DRIVER|CAMP|HR|ADMIN|MANAGEMENT/.test(u)) return 'ADMIN';
  return 'GENERAL';
}

function normalizeName(name: string): string {
  return (name ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// Designation → numeric level (lower = more senior, used for fallback assignment)
function designationLevel(des: string): number {
  const d = des.toUpperCase();
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

export function loadExcelEmployees(): Employee[] {
  // Build Employee objects
  const employees: Employee[] = rawData.map(r => ({
    id: r.id,
    empId: r.empId,
    name: r.name,
    company: r.company || 'Ancient Builders Constructions LLC',
    designation: r.designation || '',
    department: r.department || '',
    workingLocation: r.workingLocation || '',
    division: normalizeDivision(r.workingLocation, r.designation),
    managerId: null,
    projectIds: mapProjectIds(r.workingLocation),
    status: 'ACTIVE' as EmployeeStatus,
    staffType: normalizeStaffType(r.staffType),
  }));

  // Build lookup maps
  const nameIndex = new Map<string, string>();   // normalized name → id
  const empIdIndex = new Map<string, string>();  // empId → id
  const idIndex = new Map<string, Employee>();   // id → employee

  employees.forEach(e => {
    nameIndex.set(normalizeName(e.name), e.id);
    empIdIndex.set(e.empId, e.id);
    idIndex.set(e.id, e);
  });

  // Phase 1: assign managerId from Line Manager 1 name (direct from Excel)
  rawData.forEach(r => {
    const emp = idIndex.get(r.id);
    if (!emp) return;
    if (r.managerName) {
      const mgrid = nameIndex.get(normalizeName(r.managerName));
      if (mgrid && mgrid !== emp.id) {
        emp.managerId = mgrid;
        return;
      }
    }
    // Fallback: use LM2 emp ID if LM1 name didn't resolve
    if (r.lm2EmpId) {
      const lm2Padded = r.lm2EmpId.trim().padStart(5, '0');
      const mgrid = empIdIndex.get(lm2Padded);
      if (mgrid && mgrid !== emp.id) {
        emp.managerId = mgrid;
      }
    }
  });

  // Phase 2: designation-level fallback for any still without a manager
  const groups = new Map<string, Employee[]>();
  employees.forEach(e => {
    const key = `${e.division}|${e.projectIds[0] ?? 'general'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });

  groups.forEach(members => {
    const sorted = [...members].sort(
      (a, b) => designationLevel(a.designation) - designationLevel(b.designation)
    );
    const levelRep = new Map<number, string>();
    sorted.forEach(e => {
      const lv = designationLevel(e.designation);
      if (!levelRep.has(lv)) levelRep.set(lv, e.id);
    });
    sorted.forEach(e => {
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
