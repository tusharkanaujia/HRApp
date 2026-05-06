import type { Employee } from '../types';

export const NODE_W = 220;
export const NODE_H = 120;
const H_GAP = 28;
const V_GAP = 56;
export const LEVEL_H = NODE_H + V_GAP;

export interface LayoutNode {
  employee: Employee;
  x: number;
  y: number;
  isAncestor: boolean;
  isFocal: boolean;
  childCount: number;
  isExpanded: boolean;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  fx: number; fy: number;
  tx: number; ty: number;
}

export function buildChildrenMap(employees: Employee[]): Map<string, Employee[]> {
  const map = new Map<string, Employee[]>();
  for (const emp of employees) {
    if (emp.managerId) {
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
  const empMap = new Map<string, Employee>(employees.map(e => [e.id, e]));
  const childrenMap = buildChildrenMap(employees);

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

  return { nodes, edges, childrenMap };
}
