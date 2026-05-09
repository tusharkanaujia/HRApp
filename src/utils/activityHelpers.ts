import type { Employee, Project, ActivityEntry, ActivityAction, AppUser } from '../types';

// ── employee diff ────────────────────────────────────────────────────────────

export function employeeChanges(old: Employee, next: Employee, allEmployees: Employee[]): string[] {
  const empName = (id: string | null) =>
    id ? (allEmployees.find(e => e.id === id)?.name ?? id) : 'None';

  const changes: string[] = [];
  if (old.name        !== next.name)        changes.push(`Name: "${old.name}" → "${next.name}"`);
  if (old.designation !== next.designation) changes.push(`Designation: "${old.designation}" → "${next.designation}"`);
  if (old.status      !== next.status)      changes.push(`Status: ${old.status} → ${next.status}`);
  if (old.department  !== next.department)  changes.push(`Dept: ${old.department} → ${next.department}`);
  if (old.company     !== next.company)     changes.push(`Company: ${old.company.split(' ')[0]} → ${next.company.split(' ')[0]}`);
  if (old.division    !== next.division)    changes.push(`Division: ${old.division} → ${next.division}`);
  if (old.managerId   !== next.managerId)   changes.push(`Manager: ${empName(old.managerId)} → ${empName(next.managerId)}`);

  const added   = next.projectIds.filter(id => !old.projectIds.includes(id)).length;
  const removed = old.projectIds.filter(id => !next.projectIds.includes(id)).length;
  if (added)   changes.push(`+${added} project${added   > 1 ? 's' : ''}`);
  if (removed) changes.push(`−${removed} project${removed > 1 ? 's' : ''}`);

  return changes;
}

// ── project diff ─────────────────────────────────────────────────────────────

export function projectChanges(old: Project, next: Project): string[] {
  const changes: string[] = [];
  if (old.name     !== next.name)     changes.push(`Name: "${old.name}" → "${next.name}"`);
  if (old.code     !== next.code)     changes.push(`Code: ${old.code} → ${next.code}`);
  if (old.type     !== next.type)     changes.push(`Type: ${old.type} → ${next.type}`);
  if (old.status   !== next.status)   changes.push(`Status: ${old.status} → ${next.status}`);
  if (old.location !== next.location) changes.push(`Location: ${old.location ?? '—'} → ${next.location ?? '—'}`);
  return changes;
}

// ── factory ──────────────────────────────────────────────────────────────────

export function makeActivity(
  action: ActivityAction,
  entityType: 'employee' | 'project',
  entityId: string,
  entityName: string,
  actor: AppUser | null,
  details?: string,
): ActivityEntry {
  return {
    id:         `a${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp:  new Date().toISOString(),
    userId:     actor?.id   ?? 'unknown',
    userName:   actor?.name ?? 'Unknown',
    action,
    entityType,
    entityId,
    entityName,
    details: details || undefined,
  };
}
