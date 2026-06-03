import type { Employee } from '../types';
import { isPastLastWorkingDate } from './termination';

export const NODE_W = 220;
export const NODE_H = 120;
const H_GAP = 28;
const V_GAP = 56;
export const LEVEL_H = NODE_H + V_GAP;
// Compact "assistant" (EA/PA) card, rendered to the side of its manager.
export const ASSIST_W = 168;
export const ASSIST_H = 86;

export interface LayoutNode {
  employee: Employee;
  x: number;
  y: number;
  isAncestor: boolean;
  isFocal: boolean;
  childCount: number;
  isExpanded: boolean;
  isAssistant?: boolean;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  fx: number; fy: number;
  tx: number; ty: number;
  assistant?: boolean;
}

export function buildChildrenMap(employees: Employee[]): Map<string, Employee[]> {
  const map = new Map<string, Employee[]>();
  for (const emp of employees) {
    // Assistants (EA/PA) are not laid out as normal reports — they're attached
    // to the side of their manager, so keep them out of the descendant tree.
    if (emp.managerId && !emp.assistant) {
      if (!map.has(emp.managerId)) map.set(emp.managerId, []);
      map.get(emp.managerId)!.push(emp);
    }
  }
  return map;
}

function subtreeWidth(
  id: string,
  childrenMap: Map<string, Employee[]>,
  expanded: Set<string>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  if (!expanded.has(id)) { cache.set(id, NODE_W); return NODE_W; }
  const children = childrenMap.get(id) ?? [];
  if (children.length === 0) { cache.set(id, NODE_W); return NODE_W; }
  let total = 0;
  for (let i = 0; i < children.length; i++) {
    total += subtreeWidth(children[i].id, childrenMap, expanded, cache);
    if (i < children.length - 1) total += H_GAP;
  }
  const result = Math.max(NODE_W, total);
  cache.set(id, result);
  return result;
}

function assignPositions(
  id: string,
  cx: number,
  cy: number,
  childrenMap: Map<string, Employee[]>,
  expanded: Set<string>,
  out: Map<string, { x: number; y: number }>,
  cache: Map<string, number>,
) {
  out.set(id, { x: cx, y: cy });
  if (!expanded.has(id)) return;
  const children = childrenMap.get(id) ?? [];
  if (children.length === 0) return;
  const childWidths = children.map(c => subtreeWidth(c.id, childrenMap, expanded, cache));
  const totalW = childWidths.reduce((sum, w, i) => sum + w + (i < children.length - 1 ? H_GAP : 0), 0);
  let startX = cx - totalW / 2;
  for (let i = 0; i < children.length; i++) {
    const cw = childWidths[i];
    assignPositions(children[i].id, startX + cw / 2, cy + LEVEL_H, childrenMap, expanded, out, cache);
    startX += cw + H_GAP;
  }
}

export function computeLayout(
  focalId: string,
  employees: Employee[],
  expanded: Set<string>,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; childrenMap: Map<string, Employee[]> } {
  // Hide employees whose termination last-day has already passed; their
  // direct reports become orphans for chart purposes (kept in data, just
  // not drawn beneath the terminated node).
  const visible = employees.filter(e => !isPastLastWorkingDate(e));
  const empMap = new Map<string, Employee>(visible.map(e => [e.id, e]));
  const childrenMap = buildChildrenMap(visible);

  // Ancestor chain above focal (with cycle guard)
  const ancestors: Employee[] = [];
  const visited = new Set<string>([focalId]);
  let cur = empMap.get(focalId);
  while (cur?.managerId) {
    if (visited.has(cur.managerId)) break;
    const parent = empMap.get(cur.managerId);
    if (!parent) break;
    visited.add(parent.id);
    ancestors.unshift(parent);
    cur = parent;
  }

  // Positions for focal + visible descendants
  const descPos = new Map<string, { x: number; y: number }>();
  const widthCache = new Map<string, number>();
  assignPositions(focalId, 0, 0, childrenMap, expanded, descPos, widthCache);

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  // Ancestor nodes (vertical chain above focal)
  for (let i = 0; i < ancestors.length; i++) {
    const anc = ancestors[i];
    const y = -(ancestors.length - i) * LEVEL_H;
    nodes.push({
      employee: anc, x: 0, y,
      isAncestor: true, isFocal: false,
      childCount: childrenMap.get(anc.id)?.length ?? 0,
      isExpanded: false,
    });
  }

  // Focal + descendants
  for (const [id, pos] of descPos.entries()) {
    const emp = empMap.get(id);
    if (!emp) continue;
    nodes.push({
      employee: emp, x: pos.x, y: pos.y,
      isAncestor: false,
      isFocal: id === focalId,
      childCount: childrenMap.get(id)?.length ?? 0,
      isExpanded: expanded.has(id),
    });
  }

  // Build position index for edge drawing
  const posIndex = new Map<string, { x: number; y: number }>(
    nodes.map(n => [n.employee.id, { x: n.x, y: n.y }])
  );

  // Ancestor chain edges
  for (let i = 0; i < ancestors.length; i++) {
    const from = ancestors[i];
    const toId = i < ancestors.length - 1 ? ancestors[i + 1].id : focalId;
    const fp = posIndex.get(from.id);
    const tp = posIndex.get(toId);
    if (fp && tp) edges.push({ fromId: from.id, toId, fx: fp.x, fy: fp.y, tx: tp.x, ty: tp.y });
  }

  // Descendant edges (only between visible nodes)
  for (const [id, pos] of descPos.entries()) {
    const emp = empMap.get(id);
    if (!emp?.managerId) continue;
    const parentPos = posIndex.get(emp.managerId);
    if (!parentPos) continue;
    edges.push({ fromId: emp.managerId, toId: id, fx: parentPos.x, fy: parentPos.y, tx: pos.x, ty: pos.y });
  }

  // Assistants (EA/PA): attach beside any rendered manager, stacked downward
  // if there is more than one. Skip any already drawn (e.g. when an assistant
  // is itself the focal node).
  const assistantsByMgr = new Map<string, Employee[]>();
  for (const e of visible) {
    if (e.assistant && e.managerId) {
      const arr = assistantsByMgr.get(e.managerId);
      if (arr) arr.push(e); else assistantsByMgr.set(e.managerId, [e]);
    }
  }
  const rendered = new Set(nodes.map(n => n.employee.id));
  const ASSIST_GAP = 26;
  for (const n of [...nodes]) {
    const list = assistantsByMgr.get(n.employee.id);
    if (!list) continue;
    let stack = 0;
    for (const a of list) {
      if (rendered.has(a.id)) continue;
      const ax = n.x + NODE_W / 2 + ASSIST_GAP + ASSIST_W / 2;
      const ay = n.y + stack * (ASSIST_H + 14);
      nodes.push({
        employee: a, x: ax, y: ay,
        isAncestor: false, isFocal: false, childCount: 0, isExpanded: false,
        isAssistant: true,
      });
      edges.push({ fromId: n.employee.id, toId: a.id, fx: n.x, fy: n.y, tx: ax, ty: ay, assistant: true });
      rendered.add(a.id);
      stack++;
    }
  }

  return { nodes, edges, childrenMap };
}
