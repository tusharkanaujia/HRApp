import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, ChevronUp, GripVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Rows3, Columns3,
  StickyNote, Ban, Palette,
  Undo2, Redo2,
  X,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Employee } from '../types';
import { computeLayout, NODE_W, NODE_H, ASSIST_W, ASSIST_H } from '../utils/treeLayout';
import { statusDotColor } from './StatusBadge';
import { isTerminationPending, isOnboardingPending, employeeStateTooltip } from '../utils/termination';
import { useColors } from '../hooks/useColors';
import { useUndoRedo } from '../hooks/useUndoRedo';

interface TreeSnap {
  offsets: Record<string, { dx: number; dy: number }>;
  cardColors: Record<string, string>;
  notes: Record<string, string>;
  font: { family?: string; scale?: number; color?: string };
}

export interface ExportMeta {
  companyName?: string;       // e.g. "Ancient Builders Constructions LLC"
  companyTagline?: string;    // e.g. "with MBM Gulf Electromechanical LLC"
  subjectTag?: string;        // pill (left of subjectTitle) — e.g. "CIVIL" or "EMPLOYEE"
  subjectCode?: string;       // mono code — project code or empId
  subjectTitle?: string;      // big text — project name or focal employee name
  subjectSubtitle?: string;   // smaller line — location or designation/department
  staffCount?: number;
  staffLabel?: string;        // defaults to "staff (incl. line managers)"
}

export interface OrgTreeViewHandle {
  exportToPng: (filename: string, meta?: ExportMeta) => Promise<void>;
  exportToPdf: (filename: string, meta?: ExportMeta) => Promise<void>;
}

interface Props {
  focalId: string;
  employees: Employee[];
  onSelectEmployee?: (id: string) => void;
  // Persisted layout — when provided, the tree seeds its initial state from
  // these and emits onLayoutChange after any user-induced edit (drag, pan,
  // zoom, expand/collapse). The parent is responsible for re-mounting the
  // component (e.g. with a key) when switching layouts.
  initialOffsets?: Record<string, { dx: number; dy: number }>;
  initialExpanded?: string[];
  initialTransform?: { x: number; y: number; scale: number };
  initialCardColors?: Record<string, string>;
  initialNotes?: Record<string, string>;
  initialFont?: { family?: string; scale?: number; color?: string };
  onLayoutChange?: (layout: {
    offsets: Record<string, { dx: number; dy: number }>;
    expanded: string[];
    transform: { x: number; y: number; scale: number };
    cardColors: Record<string, string>;
    notes: Record<string, string>;
    font: { family?: string; scale?: number; color?: string };
  }) => void;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// Preset card background swatches shown in the selection toolbar. The first
// (white) doubles as "reset to default".
const CARD_BG_PRESETS = [
  '#ffffff', '#fee2e2', '#ffedd5', '#fef9c3',
  '#dcfce7', '#dbeafe', '#f3e8ff', '#e2e8f0',
];

const COMPANY_COLORS: Record<string, string> = {
  'Ancient Builders Constructions LLC': '#3b82f6',
  'MBM Gulf Electromechanical LLC': '#14b8a6',
  'Noor Al Yemen Air Condition Cont. Co. LLC': '#f97316',
};

function OrgTreeView({
  focalId,
  employees,
  onSelectEmployee,
  initialOffsets,
  initialExpanded,
  initialTransform,
  initialCardColors,
  initialNotes,
  initialFont,
  onLayoutChange,
}: Props, ref: React.Ref<OrgTreeViewHandle>) {
  const navigate = useNavigate();
  const { divisionColor, departmentColor } = useColors();
  // Controlled = parent is feeding a layout (either to read, to write, or
  // both). When controlled, we skip the focal-change reset and the auto-
  // center, so viewers see the saved layout even as they navigate within it.
  const controlled = !!onLayoutChange || !!initialOffsets || !!initialExpanded || !!initialTransform
    || !!initialCardColors || !!initialNotes || !!initialFont;
  const containerRef = useRef<HTMLDivElement>(null);
  const panZoomRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState(
    () => initialTransform ?? { x: 0, y: 0, scale: 1 },
  );
  const drag = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  // Per-node manual position offsets — drag a card by its grip to rearrange the
  // chart. In controlled mode they're seeded from the saved layout; otherwise
  // they reset when the focal subtree changes.
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>(
    () => initialOffsets ?? {},
  );
  // Single-card drag carries just one id. Group drag (multi-select) carries
  // the starting offsets of every selected card so we can reapply the same
  // delta to all of them on mousemove.
  const nodeDrag = useRef<
    | { kind: 'single'; id: string; startX: number; startY: number; dx: number; dy: number }
    | { kind: 'group'; ids: string[]; startX: number; startY: number; base: Record<string, { dx: number; dy: number }> }
    | null
  >(null);
  // Start expanded from the saved set if provided; otherwise just the focal.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialExpanded && initialExpanded.length ? initialExpanded : [focalId]),
  );
  // Multi-select state — Shift/Ctrl+click on a card adds/removes it; Esc or
  // background click clears. Not persisted with the layout; it's pure UI.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Marquee (rubber-band) — started with Shift+mousedown on the canvas.
  // Coordinates are in container-relative pixels (so the rect tracks the
  // mouse 1:1 even at non-1 scale or non-zero pan). We hold both a ref and
  // state: ref is read by the global mouse handlers (which capture stale
  // closures otherwise), state drives the rendered rectangle.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Per-card background color and free-text note, both keyed by employee id.
  // Seeded from the saved layout in controlled mode; persisted via onLayoutChange.
  const [cardColors, setCardColors] = useState<Record<string, string>>(
    () => initialCardColors ?? {},
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    () => initialNotes ?? {},
  );
  // The note (employee id) currently open in its inline editor, if any.
  const [editingNote, setEditingNote] = useState<string | null>(null);
  // Global card-text font for the whole chart (family / size scale / color).
  const [font, setFont] = useState<{ family?: string; scale?: number; color?: string }>(
    () => initialFont ?? {},
  );
  const [fontOpen, setFontOpen] = useState(false);
  // Press bookkeeping for click-vs-drag on a card body, and additive marquee.
  const cardPress = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const marqueeAdditiveRef = useRef(false);

  // Undo/redo over the editable content (offsets / colors / notes / font).
  // recordEdit() snapshots the pre-edit state; undo/redo restore it. View
  // state (pan/zoom, expand, selection) is intentionally excluded.
  const history = useUndoRedo<TreeSnap>();
  const recordEdit = useCallback(() => {
    history.record({ offsets, cardColors, notes, font });
  }, [history, offsets, cardColors, notes, font]);
  const applySnap = (s: TreeSnap) => {
    setOffsets(s.offsets); setCardColors(s.cardColors); setNotes(s.notes); setFont(s.font);
  };
  const doUndo = useCallback(() => {
    const s = history.undo({ offsets, cardColors, notes, font });
    if (s) applySnap(s);
  }, [history, offsets, cardColors, notes, font]);
  const doRedo = useCallback(() => {
    const s = history.redo({ offsets, cardColors, notes, font });
    if (s) applySnap(s);
  }, [history, offsets, cardColors, notes, font]);
  // For drags we snapshot at drag-start and only commit to history on mouseup
  // if the card actually moved — so a plain click isn't an undo step.
  const preDragSnap = useRef<TreeSnap | null>(null);
  const nodeDragMoved = useRef(false);

  // Reset expansion, manual offsets, and center when focal changes — but only
  // when uncontrolled. In controlled mode the parent owns layout lifecycle.
  useEffect(() => {
    if (controlled) return;
    setExpanded(new Set([focalId]));
    setOffsets({});
    setCardColors({});
    setNotes({});
    setEditingNote(null);
    setFont({});
  }, [focalId, controlled]);

  // Emit layout changes to the parent (debouncing is the parent's job).
  // Skip the very first run so we don't echo the seeded state back. We hold
  // the callback in a ref so changes to its identity (e.g. when the parent
  // re-binds it after auth resolves) don't spuriously re-emit the current
  // state.
  const onLayoutChangeRef = useRef(onLayoutChange);
  useEffect(() => { onLayoutChangeRef.current = onLayoutChange; }, [onLayoutChange]);
  const didMountRef = useRef(false);
  useEffect(() => {
    const cb = onLayoutChangeRef.current;
    if (!cb) return;
    if (!didMountRef.current) { didMountRef.current = true; return; }
    cb({ offsets, expanded: [...expanded], transform, cardColors, notes, font });
  }, [offsets, expanded, transform, cardColors, notes, font]);

  const dxOf = (id: string) => offsets[id]?.dx ?? 0;
  const dyOf = (id: string) => offsets[id]?.dy ?? 0;

  const toggleExpand = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { nodes, edges } = computeLayout(focalId, employees, expanded);

  // Bounding box — use reduce to avoid call-stack limit with large arrays.
  // Includes manual drag offsets so moved cards aren't clipped on export.
  const minX = nodes.reduce((m, n) => Math.min(m, n.x + dxOf(n.employee.id) - NODE_W / 2), Infinity) - 60;
  // A non-empty note extends ~160px past the card's right edge — include it so
  // notes aren't clipped from exports.
  const maxX = nodes.reduce((m, n) => {
    const right = n.x + dxOf(n.employee.id) + NODE_W / 2;
    return Math.max(m, notes[n.employee.id]?.trim() ? right + 160 : right);
  }, -Infinity) + 60;
  const minY = nodes.reduce((m, n) => Math.min(m, n.y + dyOf(n.employee.id) - NODE_H / 2), Infinity) - 60;
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + dyOf(n.employee.id) + NODE_H / 2), -Infinity) + 60;
  const svgW = nodes.length ? maxX - minX : 0;
  const svgH = nodes.length ? maxY - minY : 0;

  const centerOnFocal = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const focalNode = nodes.find(n => n.isFocal);
    setTransform({ x: clientWidth / 2 - (focalNode?.x ?? 0), y: clientHeight / 2 - (focalNode?.y ?? 0), scale: 1 });
  }, [nodes]);

  // Center on load and when focal changes — skip in controlled mode so we
  // don't blow away a saved pan/zoom.
  useEffect(() => {
    if (controlled && initialTransform) return;
    centerOnFocal();
  }, [focalId, controlled, initialTransform]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    // Zoom only with Ctrl/Cmd held — plain scroll is left alone so it doesn't
    // fight selecting/moving cards.
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(t => ({ ...t, scale: Math.max(0.15, Math.min(3, t.scale * factor)) }));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Ctrl/Cmd + drag pans the canvas.
    if (e.ctrlKey || e.metaKey) {
      drag.current = { startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y };
      return;
    }
    // Plain (or Shift) drag on the empty canvas is a marquee selection. Shift
    // is additive; plain replaces (and a plain click on empty space clears).
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const m = { x1: px, y1: py, x2: px, y2: py };
      marqueeRef.current = m;
      marqueeAdditiveRef.current = e.shiftKey;
      setMarquee(m);
    }
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Promote a card press to a drag once the pointer moves past a threshold,
    // so a click (no movement) still selects rather than nudging the card.
    if (cardPress.current && !cardPress.current.moved) {
      if (Math.abs(e.clientX - cardPress.current.startX) > 3 || Math.abs(e.clientY - cardPress.current.startY) > 3) {
        cardPress.current.moved = true;
      }
    }
    if (marqueeRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const updated = { ...marqueeRef.current, x2: e.clientX - rect.left, y2: e.clientY - rect.top };
      marqueeRef.current = updated;
      setMarquee(updated);
      return;
    }
    const nd = nodeDrag.current;
    if (nd) {
      nodeDragMoved.current = true;
      const scale = transform.scale || 1;
      const ddx = (e.clientX - nd.startX) / scale;
      const ddy = (e.clientY - nd.startY) / scale;
      if (nd.kind === 'single') {
        setOffsets(prev => ({
          ...prev,
          [nd.id]: { dx: nd.dx + ddx, dy: nd.dy + ddy },
        }));
      } else {
        setOffsets(prev => {
          const next = { ...prev };
          for (const id of nd.ids) {
            const b = nd.base[id] ?? { dx: 0, dy: 0 };
            next[id] = { dx: b.dx + ddx, dy: b.dy + ddy };
          }
          return next;
        });
      }
      return;
    }
    const d = drag.current;
    if (!d) return;
    setTransform(t => ({ ...t, x: d.tx + e.clientX - d.startX, y: d.ty + e.clientY - d.startY }));
  }, [transform.scale]);

  const onMouseUp = useCallback(() => {
    const m = marqueeRef.current;
    if (m && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const left   = Math.min(m.x1, m.x2) + containerRect.left;
      const right  = Math.max(m.x1, m.x2) + containerRect.left;
      const top    = Math.min(m.y1, m.y2) + containerRect.top;
      const bottom = Math.max(m.y1, m.y2) + containerRect.top;
      // Treat a near-zero marquee as a click on empty canvas.
      const isClick = Math.abs(m.x2 - m.x1) < 3 && Math.abs(m.y2 - m.y1) < 3;
      const additive = marqueeAdditiveRef.current;
      if (isClick) {
        // Plain click on empty space clears; Shift+click leaves selection be.
        if (!additive) setSelected(new Set());
      } else {
        const hit = new Set<string>();
        containerRef.current.querySelectorAll<HTMLElement>('[data-empid]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom) {
            const id = el.getAttribute('data-empid');
            if (id) hit.add(id);
          }
        });
        // Shift = add to selection; plain = replace.
        setSelected(prev => {
          const next = additive ? new Set(prev) : new Set<string>();
          hit.forEach(id => next.add(id));
          return next;
        });
      }
      marqueeRef.current = null;
      setMarquee(null);
    }
    // A card press that never moved is a plain click → select just that card.
    if (cardPress.current) {
      if (!cardPress.current.moved) setSelected(new Set([cardPress.current.id]));
      cardPress.current = null;
    }
    // Commit a moved drag to the undo history (one step per drag).
    if (nodeDrag.current && nodeDragMoved.current && preDragSnap.current) {
      history.record(preDragSnap.current);
    }
    preDragSnap.current = null;
    nodeDragMoved.current = false;
    drag.current = null;
    nodeDrag.current = null;
  }, [history]);

  const startNodeDrag = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    preDragSnap.current = { offsets, cardColors, notes, font };
    nodeDragMoved.current = false;
    // If the grip is on a selected card and there are siblings selected, drag
    // them as a group — otherwise it's a single-card drag.
    if (selected.has(id) && selected.size > 1) {
      const ids = [...selected];
      const base: Record<string, { dx: number; dy: number }> = {};
      for (const sid of ids) base[sid] = { dx: offsets[sid]?.dx ?? 0, dy: offsets[sid]?.dy ?? 0 };
      nodeDrag.current = { kind: 'group', ids, startX: e.clientX, startY: e.clientY, base };
    } else {
      nodeDrag.current = { kind: 'single', id, startX: e.clientX, startY: e.clientY, dx: offsets[id]?.dx ?? 0, dy: offsets[id]?.dy ?? 0 };
    }
  }, [offsets, selected, cardColors, notes, font]);

  const toggleSelected = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Card body press: plain drag moves the card (group if multi-selected),
  // modifier+click toggles selection, plain click (no move) selects it.
  // Clicks on inner buttons (expand / nav / grip) are ignored here.
  const onCardMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelected(id);
      return;
    }
    startNodeDrag(id, e);
    cardPress.current = { id, startX: e.clientX, startY: e.clientY, moved: false };
  }, [toggleSelected, startNodeDrag]);

  // Hierarchy navigation — used by the ↑ (manager) and ↓ (first report)
  // buttons on each card. When uncontrolled, fall back to URL nav.
  const childrenOf = useCallback((empId: string) => {
    return employees.filter(e => e.managerId === empId);
  }, [employees]);
  const navigateUp = useCallback((empId: string) => {
    const e = employees.find(x => x.id === empId);
    if (!e?.managerId) return;
    if (onSelectEmployee) onSelectEmployee(e.managerId);
    else navigate(`/org-chart?emp=${e.managerId}`);
  }, [employees, onSelectEmployee, navigate]);
  const navigateDown = useCallback((empId: string) => {
    const kids = childrenOf(empId);
    if (!kids.length) return;
    const target = kids[0].id;
    if (onSelectEmployee) onSelectEmployee(target);
    else navigate(`/org-chart?emp=${target}`);
  }, [childrenOf, onSelectEmployee, navigate]);

  // Esc clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) for undo/redo. Ignore while typing in a note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo]);

  // ── Alignment / distribution helpers ──────────────────────────────────────
  // Each helper computes new (dx, dy) for every selected card and writes them
  // in one setOffsets call so the layout autosave fires once.
  const applyAlignment = useCallback((mode:
    | 'left' | 'centerH' | 'right'
    | 'top'  | 'centerV' | 'bottom'
    | 'distH' | 'distV'
    | 'row'  | 'column') => {
    if (selected.size < 2) return;
    const items = nodes
      .filter(n => selected.has(n.employee.id))
      .map(n => {
        const w = n.isAssistant ? ASSIST_W : NODE_W;
        const h = n.isAssistant ? ASSIST_H : NODE_H;
        const cx = n.x + (offsets[n.employee.id]?.dx ?? 0);
        const cy = n.y + (offsets[n.employee.id]?.dy ?? 0);
        return { id: n.employee.id, naturalX: n.x, naturalY: n.y, cx, cy, w, h };
      });
    if (items.length < 2) return;

    const lefts   = items.map(i => i.cx - i.w / 2);
    const rights  = items.map(i => i.cx + i.w / 2);
    const tops    = items.map(i => i.cy - i.h / 2);
    const bottoms = items.map(i => i.cy + i.h / 2);

    const minLeft   = Math.min(...lefts);
    const maxRight  = Math.max(...rights);
    const minTop    = Math.min(...tops);
    const maxBottom = Math.max(...bottoms);
    const avgCx     = items.reduce((s, i) => s + i.cx, 0) / items.length;
    const avgCy     = items.reduce((s, i) => s + i.cy, 0) / items.length;

    const next: Record<string, { dx: number; dy: number }> = { ...offsets };
    const setTarget = (id: string, naturalX: number, naturalY: number, targetCx: number, targetCy: number) => {
      next[id] = { dx: targetCx - naturalX, dy: targetCy - naturalY };
    };

    if (mode === 'distH' || mode === 'distV') {
      // Distribute by center — equally space centers between the min and max
      // among the current selection.
      const sorted = mode === 'distH'
        ? [...items].sort((a, b) => a.cx - b.cx)
        : [...items].sort((a, b) => a.cy - b.cy);
      const minC = mode === 'distH' ? sorted[0].cx : sorted[0].cy;
      const maxC = mode === 'distH' ? sorted[sorted.length - 1].cx : sorted[sorted.length - 1].cy;
      const step = (maxC - minC) / (sorted.length - 1);
      sorted.forEach((it, idx) => {
        const target = minC + step * idx;
        if (mode === 'distH') setTarget(it.id, it.naturalX, it.naturalY, target, it.cy);
        else                  setTarget(it.id, it.naturalX, it.naturalY, it.cx, target);
      });
    } else if (mode === 'row' || mode === 'column') {
      // Make-row    = same Y, evenly spaced along X.
      // Make-column = same X, evenly spaced along Y.
      // Line anchored at the average center of the perpendicular axis so the
      // group ends up near where it already was.
      const isRow = mode === 'row';
      const sorted = [...items].sort((a, b) => isRow ? a.cx - b.cx : a.cy - b.cy);
      const meanX = items.reduce((s, i) => s + i.cx, 0) / items.length;
      const meanY = items.reduce((s, i) => s + i.cy, 0) / items.length;
      const step  = isRow
        ? Math.max(...sorted.map(i => i.w)) + 40
        : Math.max(...sorted.map(i => i.h)) + 30;
      const start = (isRow ? meanX : meanY) - ((sorted.length - 1) * step) / 2;
      sorted.forEach((it, idx) => {
        const along = start + idx * step;
        if (isRow) setTarget(it.id, it.naturalX, it.naturalY, along, meanY);
        else       setTarget(it.id, it.naturalX, it.naturalY, meanX, along);
      });
    } else {
      for (const it of items) {
        let tx = it.cx, ty = it.cy;
        if (mode === 'left')    tx = minLeft   + it.w / 2;
        if (mode === 'right')   tx = maxRight  - it.w / 2;
        if (mode === 'centerH') tx = avgCx;
        if (mode === 'top')     ty = minTop    + it.h / 2;
        if (mode === 'bottom')  ty = maxBottom - it.h / 2;
        if (mode === 'centerV') ty = avgCy;
        setTarget(it.id, it.naturalX, it.naturalY, tx, ty);
      }
    }
    recordEdit();
    setOffsets(next);
  }, [selected, nodes, offsets, recordEdit]);

  // ── Card color & notes ─────────────────────────────────────────────────────
  // Apply a background color to every selected card. Passing null (or white,
  // the default) clears the override so the card falls back to plain white.
  const applyCardColor = useCallback((color: string | null) => {
    if (!selected.size) return;
    recordEdit();
    setCardColors(prev => {
      const next = { ...prev };
      for (const id of selected) {
        if (!color || color.toLowerCase() === '#ffffff') delete next[id];
        else next[id] = color;
      }
      return next;
    });
  }, [selected, recordEdit]);

  // Add (or focus) a note beside each selected card. A single selection opens
  // its editor immediately so the user can type right away.
  const addNoteToSelected = useCallback(() => {
    const ids = [...selected];
    if (!ids.length) return;
    recordEdit();
    setNotes(prev => {
      const next = { ...prev };
      for (const id of ids) if (next[id] === undefined) next[id] = '';
      return next;
    });
    if (ids.length === 1) setEditingNote(ids[0]);
  }, [selected, recordEdit]);

  const updateNote = useCallback((id: string, text: string) => {
    setNotes(prev => ({ ...prev, [id]: text }));
  }, []);

  // On blur, drop empty notes so they don't linger as invisible entries.
  const finishNote = useCallback((id: string) => {
    setEditingNote(cur => (cur === id ? null : cur));
    setNotes(prev => {
      if (prev[id]?.trim()) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Note shown to the right of a card. `leftPx` is the card width so the note
  // sits just outside the card's right edge.
  const renderNote = (id: string, leftPx: number) => {
    const text = notes[id];
    if (text === undefined) return null;
    const editing = editingNote === id;
    if (!editing && !text) return null;
    return (
      <div
        className="absolute"
        style={{ left: leftPx + 10, top: 0, width: 150, zIndex: 6 }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {editing ? (
          <textarea
            autoFocus
            value={text}
            rows={3}
            placeholder="Add note…"
            onChange={e => updateNote(id, e.target.value)}
            onBlur={() => finishNote(id)}
            className="w-full text-[10px] leading-snug p-1.5 rounded-md border border-blue-300 bg-white text-slate-700 shadow-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        ) : (
          <div
            onClick={() => { recordEdit(); setEditingNote(id); }}
            title="Click to edit note"
            className="text-[10px] leading-snug p-1.5 rounded-md bg-amber-50 border border-amber-200 text-slate-700 whitespace-pre-wrap break-words cursor-text shadow-sm hover:border-amber-300"
          >
            {text}
          </div>
        )}
      </div>
    );
  };

  // Capture the full pan-zoom content to a canvas via an offscreen clone (doesn't disturb the live view).
  // When `meta` is provided, wraps the tree in a bordered frame with a header (company info)
  // and footer (project info).
  const captureCanvas = useCallback(async (meta?: ExportMeta): Promise<HTMLCanvasElement | null> => {
    const panZoom = panZoomRef.current;
    if (!panZoom || nodes.length === 0) return null;

    const NODE_SCALE = 1.4;
    const PAD = 100;
    const HAS_FRAME = !!meta;
    const HEADER_H = HAS_FRAME ? 130 : 0;
    const FOOTER_H = HAS_FRAME ? 100 : 0;
    const BORDER = HAS_FRAME ? 6 : 0;
    const FRAME_PAD = HAS_FRAME ? 24 : 0; // horizontal breathing room inside the border

    const clone = panZoom.cloneNode(true) as HTMLDivElement;
    clone.style.transform = `translate(${-minX + PAD + FRAME_PAD}px, ${-minY + PAD + HEADER_H}px)`;

    clone.querySelectorAll<HTMLElement>('.truncate').forEach((el) => {
      el.style.textOverflow = 'clip';
      el.style.overflow = 'visible';
      el.style.whiteSpace = 'normal';
      el.style.wordBreak = 'break-word';
    });

    // Drag grips are UI-only — strip them from the exported image.
    clone.querySelectorAll('[data-grip]').forEach((el) => el.remove());

    // html2canvas only reliably renders an <svg> when it has width/height
    // ATTRIBUTES (CSS sizing alone often yields a 0×0 / dropped SVG, which is
    // why connector lines went missing). Mirror the CSS size onto attributes.
    clone.querySelectorAll('svg').forEach((svg) => {
      const ww = parseFloat((svg as SVGElement & { style: CSSStyleDeclaration }).style.width);
      const hh = parseFloat((svg as SVGElement & { style: CSSStyleDeclaration }).style.height);
      if (Number.isFinite(ww)) svg.setAttribute('width', String(ww));
      if (Number.isFinite(hh)) svg.setAttribute('height', String(hh));
    });

    // Enlarge node cards for a crisper export. Only DIV children are nodes —
    // skip the connector <svg> (and any <style>) so it isn't mangled/clipped.
    Array.from(clone.children).forEach((child) => {
      const el = child as HTMLElement;
      if (el.tagName !== 'DIV') return;
      const w = parseFloat(el.style.width);
      const h = parseFloat(el.style.height);
      if (Number.isFinite(w) && w > 50 && w < 400) {
        el.style.width = `${w * NODE_SCALE}px`;
        el.style.height = `${h * NODE_SCALE}px`;
        el.style.left = `${parseFloat(el.style.left) - (w * (NODE_SCALE - 1)) / 2}px`;
        el.style.top = `${parseFloat(el.style.top) - (h * (NODE_SCALE - 1)) / 2}px`;
      }
    });

    // Give cards a crisp outline in the export — box-shadows render poorly in
    // html2canvas, so cards otherwise look border-less. Keep the colored left
    // accent (borderLeft) and add a light hairline on the other three sides.
    clone.querySelectorAll<HTMLElement>('.rounded-xl, .rounded-lg').forEach((el) => {
      el.style.borderTop = '1px solid #e2e8f0';
      el.style.borderRight = '1px solid #e2e8f0';
      el.style.borderBottom = '1px solid #e2e8f0';
      el.style.boxShadow = 'none';
    });

    clone.querySelectorAll<HTMLElement>('p, span').forEach((el) => {
      const cs = window.getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (fs > 0 && fs < 14) el.style.fontSize = `${Math.round(fs * 1.3)}px`;
    });

    const innerW = svgW + PAD * 2 + FRAME_PAD * 2;
    const innerH = svgH + PAD * 2 + HEADER_H + FOOTER_H;
    const totalW = innerW + BORDER * 2;
    const totalH = innerH + BORDER * 2;

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-99999px';
    wrapper.style.top = '0';
    wrapper.style.width = `${totalW}px`;
    wrapper.style.height = `${totalH}px`;
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.backgroundColor = '#ffffff';
    wrapper.style.overflow = 'visible';
    if (HAS_FRAME) {
      wrapper.style.border = `${BORDER}px solid #1e293b`;
    }
    // Carry the global font settings onto the clone so exports match the live
    // view — the injected `.org-tree-fonted` rules are global and apply here.
    wrapper.classList.add('org-tree-fonted');
    if (font.color) wrapper.classList.add('tf-color');
    wrapper.style.setProperty('--tfs', String(font.scale ?? 1));
    wrapper.style.setProperty('--tff', font.family || 'inherit');
    wrapper.style.setProperty('--tfc', font.color || 'inherit');

    if (HAS_FRAME && meta) {
      // ── Header ─────────────────────────────────────────────────────────────
      const header = document.createElement('div');
      header.style.position = 'absolute';
      header.style.left = '0';
      header.style.top = '0';
      header.style.width = '100%';
      header.style.height = `${HEADER_H}px`;
      header.style.boxSizing = 'border-box';
      header.style.padding = '22px 48px';
      header.style.background = 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)';
      header.style.borderBottom = '2px solid #1e293b';
      header.style.display = 'flex';
      header.style.flexDirection = 'column';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'center';
      header.style.textAlign = 'center';

      const eyebrow = document.createElement('div');
      eyebrow.textContent = 'ORGANIZATION CHART';
      eyebrow.style.fontSize = '13px';
      eyebrow.style.letterSpacing = '4px';
      eyebrow.style.color = '#64748b';
      eyebrow.style.fontWeight = '600';
      eyebrow.style.marginBottom = '8px';
      header.appendChild(eyebrow);

      if (meta.companyName) {
        const title = document.createElement('div');
        title.textContent = meta.companyName;
        title.style.fontSize = '30px';
        title.style.fontWeight = '700';
        title.style.color = '#0f172a';
        title.style.lineHeight = '1.15';
        header.appendChild(title);
      }

      if (meta.companyTagline) {
        const sub = document.createElement('div');
        sub.textContent = meta.companyTagline;
        sub.style.fontSize = '14px';
        sub.style.color = '#475569';
        sub.style.marginTop = '6px';
        header.appendChild(sub);
      }

      wrapper.appendChild(header);

      // ── Footer ─────────────────────────────────────────────────────────────
      const footer = document.createElement('div');
      footer.style.position = 'absolute';
      footer.style.left = '0';
      footer.style.bottom = '0';
      footer.style.width = '100%';
      footer.style.height = `${FOOTER_H}px`;
      footer.style.boxSizing = 'border-box';
      footer.style.padding = '18px 48px';
      footer.style.background = '#f1f5f9';
      footer.style.borderTop = '2px solid #1e293b';
      footer.style.display = 'flex';
      footer.style.justifyContent = 'space-between';
      footer.style.alignItems = 'center';

      // Left side — subject title, tag, code, subtitle
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.flexDirection = 'column';

      const line1 = document.createElement('div');
      line1.style.display = 'flex';
      line1.style.alignItems = 'baseline';
      line1.style.gap = '10px';

      if (meta.subjectTag) {
        const pill = document.createElement('span');
        pill.textContent = meta.subjectTag;
        pill.style.fontSize = '11px';
        pill.style.fontWeight = '700';
        pill.style.color = '#fff';
        pill.style.background = '#3b82f6';
        pill.style.padding = '3px 8px';
        pill.style.borderRadius = '4px';
        pill.style.letterSpacing = '0.5px';
        line1.appendChild(pill);
      }
      if (meta.subjectCode) {
        const code = document.createElement('span');
        code.textContent = meta.subjectCode;
        code.style.fontFamily = 'monospace';
        code.style.fontSize = '13px';
        code.style.color = '#64748b';
        line1.appendChild(code);
      }
      if (meta.subjectTitle) {
        const title = document.createElement('span');
        title.textContent = meta.subjectTitle;
        title.style.fontSize = '18px';
        title.style.fontWeight = '700';
        title.style.color = '#0f172a';
        line1.appendChild(title);
      }

      left.appendChild(line1);

      if (meta.subjectSubtitle) {
        const sub = document.createElement('div');
        sub.textContent = meta.subjectSubtitle;
        sub.style.fontSize = '12px';
        sub.style.color = '#64748b';
        sub.style.marginTop = '4px';
        left.appendChild(sub);
      }

      footer.appendChild(left);

      // Right side — staff count & generated date
      const right = document.createElement('div');
      right.style.textAlign = 'right';

      if (typeof meta.staffCount === 'number') {
        const cnt = document.createElement('div');
        const big = document.createElement('span');
        big.textContent = String(meta.staffCount);
        big.style.fontSize = '22px';
        big.style.fontWeight = '700';
        big.style.color = '#0f172a';
        const lbl = document.createElement('span');
        lbl.textContent = ' ' + (meta.staffLabel ?? 'staff (incl. line managers)');
        lbl.style.fontSize = '12px';
        lbl.style.color = '#64748b';
        cnt.appendChild(big);
        cnt.appendChild(lbl);
        right.appendChild(cnt);
      }

      const date = document.createElement('div');
      date.textContent = 'Generated ' + new Date().toLocaleDateString('en-GB', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      date.style.fontSize = '11px';
      date.style.color = '#94a3b8';
      date.style.marginTop = '4px';
      right.appendChild(date);

      footer.appendChild(right);
      wrapper.appendChild(footer);
    }

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      return await html2canvas(wrapper, {
        backgroundColor: HAS_FRAME ? '#ffffff' : '#f8fafc',
        scale: 2,
        width: totalW,
        height: totalH,
        useCORS: true,
        logging: false,
      });
    } finally {
      document.body.removeChild(wrapper);
    }
  }, [minX, minY, svgW, svgH, nodes.length, font]);

  useImperativeHandle(ref, () => ({
    async exportToPng(filename: string, meta?: ExportMeta) {
      const canvas = await captureCanvas(meta);
      if (!canvas) return;
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      link.click();
    },
    async exportToPdf(filename: string, meta?: ExportMeta) {
      const canvas = await captureCanvas(meta);
      if (!canvas) return;
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'pt', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
      pdf.save(filename);
    },
  }), [captureCanvas]);

  if (nodes.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-400">No hierarchy data</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`org-tree-container org-tree-fonted w-full h-full overflow-hidden relative bg-slate-50 ${font.color ? 'tf-color' : ''}`}
      style={{
        ['--tfs' as string]: font.scale ?? 1,
        ['--tff' as string]: font.family || 'inherit',
        ['--tfc' as string]: font.color || 'inherit',
      } as React.CSSProperties}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Global card-text font overrides (family / size scale / color). The
          size rules scale each fixed Tailwind size by --tfs so the relative
          hierarchy is preserved; family/color cascade to card text only. */}
      <style>{`
        .org-tree-fonted [data-empid] p, .org-tree-fonted [data-empid] span { font-family: var(--tff, inherit); }
        .org-tree-fonted [data-empid] .text-\\[8px\\]  { font-size: calc(8px  * var(--tfs, 1)); }
        .org-tree-fonted [data-empid] .text-\\[9px\\]  { font-size: calc(9px  * var(--tfs, 1)); }
        .org-tree-fonted [data-empid] .text-\\[10px\\] { font-size: calc(10px * var(--tfs, 1)); }
        .org-tree-fonted [data-empid] .text-\\[11px\\] { font-size: calc(11px * var(--tfs, 1)); }
        .org-tree-fonted.tf-color [data-empid] p { color: var(--tfc) !important; }
      `}</style>

      {/* Dot grid background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        <defs>
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#cbd5e1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Pan/zoom container */}
      <div
        ref={panZoomRef}
        style={{
          position: 'absolute',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          zIndex: 1,
        }}
      >
        {/* Edges SVG */}
        <svg
          style={{
            position: 'absolute',
            left: minX, top: minY,
            width: svgW, height: svgH,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {edges.map((edge, i) => {
            // Follow any manual drag offsets on the endpoints.
            const efx = edge.fx + dxOf(edge.fromId);
            const efy = edge.fy + dyOf(edge.fromId);
            const etx = edge.tx + dxOf(edge.toId);
            const ety = edge.ty + dyOf(edge.toId);
            if (edge.assistant) {
              // Side connector: short horizontal stub from the manager's right
              // edge to the assistant card's left edge (same level).
              const sx = efx - minX + NODE_W / 2;
              const sy = efy - minY;
              const ex = etx - minX - ASSIST_W / 2;
              const ey = ety - minY;
              return (
                <path key={i} d={`M ${sx} ${sy} L ${ex} ${ey}`}
                  stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
              );
            }
            const fx = efx - minX;
            const fy = efy - minY + NODE_H / 2;
            const tx = etx - minX;
            const ty = ety - minY - NODE_H / 2;
            const midY = (fy + ty) / 2;
            // Squared (elbow) connector: drop from the parent, run across, then
            // drop to the child — with a small rounded radius on the two corners.
            const dx = tx - fx;
            const dir = Math.sign(dx);
            const r = Math.min(10, Math.abs(dx) / 2, Math.abs(midY - fy), Math.abs(ty - midY));
            const d = Math.abs(dx) < 1
              ? `M ${fx} ${fy} L ${tx} ${ty}`
              : `M ${fx} ${fy} L ${fx} ${midY - r} Q ${fx} ${midY} ${fx + dir * r} ${midY}`
                + ` L ${tx - dir * r} ${midY} Q ${tx} ${midY} ${tx} ${midY + r} L ${tx} ${ty}`;
            return (
              <path
                key={i}
                d={d}
                stroke="#94a3b8"
                strokeWidth="1.5"
                fill="none"
              />
            );
          })}
        </svg>

        {/* Node cards */}
        {nodes.map(({ employee: emp, x, y, isFocal, isAncestor, childCount, isExpanded, isAssistant }) => {
          const compColor = COMPANY_COLORS[emp.company] ?? '#64748b';
          const dotColor = statusDotColor(emp.status);
          const hasChildren = childCount > 0;
          const terminating = isTerminationPending(emp);
          const onboarding = isOnboardingPending(emp);
          const ox = x + dxOf(emp.id);
          const oy = y + dyOf(emp.id);

          // Assistant (EA/PA): compact card attached to the side of the manager.
          if (isAssistant) {
            return (
              <div
                key={emp.id}
                data-empid={emp.id}
                title={employeeStateTooltip(emp)}
                onMouseDown={e => e.stopPropagation()}
                style={{ position: 'absolute', left: ox - ASSIST_W / 2, top: oy - ASSIST_H / 2, width: ASSIST_W, height: ASSIST_H, zIndex: 3 }}
              >
                <button
                  data-grip
                  onMouseDown={e => startNodeDrag(emp.id, e)}
                  onClick={e => e.stopPropagation()}
                  className="absolute -top-2 -right-2 z-20 w-5 h-5 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center text-slate-400 hover:text-blue-500 cursor-grab active:cursor-grabbing"
                  title="Drag to reposition"
                >
                  <GripVertical size={11} />
                </button>
                <div
                  className={`w-full h-full rounded-lg bg-white border border-dashed border-slate-300 shadow-sm flex items-center gap-2 px-2 cursor-pointer hover:shadow-md ${
                    selected.has(emp.id) ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  }`}
                  style={{ borderLeft: `3px solid ${compColor}`, ...(cardColors[emp.id] ? { backgroundColor: cardColors[emp.id] } : {}) }}
                  onMouseDown={e => onCardMouseDown(emp.id, e)}
                >
                  <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: compColor }}>
                    {initials(emp.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-slate-700 truncate leading-tight">{emp.name}</p>
                    <p className="text-[9px] text-slate-500 truncate leading-tight">{emp.designation}</p>
                    <span className="text-[8px] text-slate-400 uppercase tracking-wider">Assistant</span>
                  </div>
                </div>
                {renderNote(emp.id, ASSIST_W)}
              </div>
            );
          }

          const hasManager = !!emp.managerId;
          return (
            <div
              key={emp.id}
              data-empid={emp.id}
              title={employeeStateTooltip(emp)}
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: ox - NODE_W / 2,
                top: oy - NODE_H / 2,
                width: NODE_W,
                height: NODE_H,
                zIndex: isFocal ? 10 : 2,
              }}
            >
              <button
                data-grip
                onMouseDown={e => startNodeDrag(emp.id, e)}
                onClick={e => e.stopPropagation()}
                className="absolute -top-2 -right-2 z-20 w-5 h-5 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center text-slate-400 hover:text-blue-500 cursor-grab active:cursor-grabbing"
                title="Drag to reposition"
              >
                <GripVertical size={11} />
              </button>
              {/* Hierarchy nav: ↑ goes to manager, ↓ to first report. Replaces
                  the previous click-name-to-re-root behavior. */}
              <div className="absolute -top-2 -left-2 z-20 flex gap-0.5">
                <button
                  onClick={e => { e.stopPropagation(); if (hasManager) navigateUp(emp.id); }}
                  disabled={!hasManager}
                  title={hasManager ? 'Focus on manager' : 'No manager'}
                  className="w-5 h-5 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center text-slate-400 hover:text-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); if (hasChildren) navigateDown(emp.id); }}
                  disabled={!hasChildren}
                  title={hasChildren ? `Focus on first report (${childCount})` : 'No reports'}
                  className="w-5 h-5 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center text-slate-400 hover:text-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronDown size={11} />
                </button>
              </div>
              <div
                className={`w-full h-full rounded-xl bg-white shadow-md flex flex-col justify-between px-3 pt-2.5 pb-1.5 transition-shadow hover:shadow-lg cursor-pointer ${
                  selected.has(emp.id) ? 'ring-2 ring-blue-500 ring-offset-2 shadow-blue-200' :
                  terminating ? 'ring-2 ring-red-500 shadow-red-100' :
                  onboarding ? 'ring-2 ring-yellow-400 shadow-yellow-100' :
                  isFocal ? 'ring-2 ring-blue-500 shadow-blue-100' :
                  isAncestor ? 'ring-1 ring-slate-300 opacity-80' : ''
                }`}
                style={{ borderLeft: `4px solid ${compColor}`, ...(cardColors[emp.id] ? { backgroundColor: cardColors[emp.id] } : {}) }}
                onMouseDown={e => onCardMouseDown(emp.id, e)}
              >
                {/* Top: avatar + name */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: compColor }}
                  >
                    {initials(emp.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-semibold text-slate-800 truncate leading-tight">{emp.name}</p>
                      <span className="text-[9px] text-slate-400 font-mono flex-shrink-0">#{emp.empId}</span>
                    </div>
                    <p className="text-[9px] text-slate-500 truncate leading-tight">{emp.designation}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                      {(() => {
                        const dc = departmentColor(emp.department);
                        return (
                          <span
                            className="text-[9px] truncate"
                            style={dc ? { color: dc, fontWeight: 600 } : { color: '#94a3b8' }}
                          >
                            {emp.department}
                          </span>
                        );
                      })()}
                    </div>
                    {emp.workingLocation && (
                      <p className="text-[9px] text-slate-400 truncate leading-tight mt-0.5 italic">{emp.workingLocation}</p>
                    )}
                  </div>
                </div>

                {/* Bottom: division badge + expand/collapse button */}
                <div className="flex items-center justify-between mt-1">
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium text-white"
                    style={{ backgroundColor: divisionColor(emp.division) }}
                  >
                    {emp.division}
                  </span>

                  {hasChildren && !isAncestor && (
                    <button
                      onClick={e => toggleExpand(emp.id, e)}
                      className={`flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                        isExpanded
                          ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={isExpanded ? 'Collapse' : `Expand (${childCount})`}
                    >
                      {isExpanded
                        ? <ChevronDown size={9} />
                        : <ChevronRight size={9} />
                      }
                      {!isExpanded && <span>{childCount}</span>}
                    </button>
                  )}

                  {isFocal && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">YOU</span>
                  )}
                </div>
              </div>
              {renderNote(emp.id, NODE_W)}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-20">
        {[
          { label: '+', title: 'Zoom in', action: () => setTransform(t => ({ ...t, scale: Math.min(3, t.scale * 1.2) })) },
          { label: '−', title: 'Zoom out', action: () => setTransform(t => ({ ...t, scale: Math.max(0.15, t.scale / 1.2) })) },
          { label: '⊙', title: 'Center on focal', action: centerOnFocal },
          { label: '⟲', title: 'Reset card positions', action: () => { recordEdit(); setOffsets({}); } },
        ].map(({ label, title, action }) => (
          <button
            key={label}
            onClick={action}
            title={title}
            className="w-8 h-8 bg-white shadow rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-bold border border-slate-200"
          >
            {label}
          </button>
        ))}
        {/* Undo / redo */}
        <button
          onClick={doUndo}
          disabled={!history.canUndo}
          title="Undo (Ctrl+Z)"
          className="w-8 h-8 bg-white shadow rounded-lg text-slate-600 hover:bg-slate-50 border border-slate-200 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={doRedo}
          disabled={!history.canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="w-8 h-8 bg-white shadow rounded-lg text-slate-600 hover:bg-slate-50 border border-slate-200 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Redo2 size={15} />
        </button>
        {/* Font control */}
        <button
          onClick={() => setFontOpen(o => !o)}
          title="Chart font (family / size / color)"
          className={`w-8 h-8 shadow rounded-lg text-sm font-bold border ${
            fontOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
          }`}
        >
          Aa
        </button>
      </div>

      {/* Font popover */}
      {fontOpen && (
        <div
          className="absolute bottom-4 right-14 z-30 bg-white rounded-xl shadow-lg border border-slate-200 p-3 w-56 text-xs"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-600">Chart font</span>
            <button onClick={() => setFontOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
          </div>

          <label className="block text-slate-500 mb-1">Family</label>
          <select
            value={font.family ?? ''}
            onChange={e => { recordEdit(); setFont(f => ({ ...f, family: e.target.value || undefined })); }}
            className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">Default</option>
            <option value="Inter, system-ui, sans-serif">Inter / Sans</option>
            <option value="Arial, Helvetica, sans-serif">Arial</option>
            <option value="'Segoe UI', system-ui, sans-serif">Segoe UI</option>
            <option value="Georgia, 'Times New Roman', serif">Georgia / Serif</option>
            <option value="'Courier New', monospace">Monospace</option>
          </select>

          <label className="block text-slate-500 mb-1">Size · {Math.round((font.scale ?? 1) * 100)}%</label>
          <input
            type="range" min={0.7} max={1.6} step={0.05}
            value={font.scale ?? 1}
            onChange={e => { recordEdit(); setFont(f => ({ ...f, scale: parseFloat(e.target.value) })); }}
            className="w-full mb-2"
          />

          <label className="block text-slate-500 mb-1">Text color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={font.color ?? '#1e293b'}
              onChange={e => { recordEdit(); setFont(f => ({ ...f, color: e.target.value })); }}
              className="w-8 h-7 rounded border border-slate-200 cursor-pointer"
            />
            <button
              onClick={() => { recordEdit(); setFont(f => ({ ...f, color: undefined })); }}
              className="text-slate-500 hover:text-red-500 px-1.5 py-1 rounded hover:bg-slate-100"
            >
              Default color
            </button>
          </div>

          <button
            onClick={() => { recordEdit(); setFont({}); }}
            className="mt-3 w-full text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md py-1 hover:bg-slate-50"
          >
            Reset font
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow border border-slate-100 p-3 z-20 text-xs space-y-1">
        <p className="font-semibold text-slate-600 mb-1.5">Division</p>
        {(['CIVIL','MEP','FACTORY','ADMIN','GENERAL'] as const).map(div => (
          <div key={div} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: divisionColor(div) }} />
            <span className="text-slate-500">{div}</span>
          </div>
        ))}
      </div>

      {/* Marquee (Shift+drag selection rectangle) */}
      {marquee && (
        <div
          className="absolute pointer-events-none z-25"
          style={{
            left:   Math.min(marquee.x1, marquee.x2),
            top:    Math.min(marquee.y1, marquee.y2),
            width:  Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
            background: 'rgba(59, 130, 246, 0.10)',
            border:     '1px dashed #3b82f6',
          }}
        />
      )}

      {/* Hint */}
      <div className="absolute top-4 right-4 text-xs text-slate-400 bg-white/80 rounded px-2 py-1 z-20">
        Ctrl+Drag pan · Ctrl+Scroll zoom · Drag card to move · Drag canvas to select · Shift+Drag adds · Ctrl+Z undo
      </div>

      {/* Selection toolbar — color + note for any selection; alignment for 2+ */}
      {selected.size >= 1 && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white rounded-xl shadow-lg border border-slate-200 px-2 py-1.5 flex items-center gap-1"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <span className="text-[11px] font-semibold text-slate-500 px-1.5">
            {selected.size} selected
          </span>
          <span className="w-px h-5 bg-slate-200" />
          {/* Card background color: presets, custom picker, and clear */}
          <div className="flex items-center gap-1 px-0.5" title="Card background color">
            {CARD_BG_PRESETS.map(color => (
              <button
                key={color}
                onClick={() => applyCardColor(color)}
                title={color === '#ffffff' ? 'Default (white)' : color}
                className="w-5 h-5 rounded-full border border-slate-300 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
              />
            ))}
            <label
              className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600 cursor-pointer relative"
              title="Custom color"
            >
              <Palette size={14} />
              <input
                type="color"
                onChange={e => applyCardColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
            <button
              onClick={() => applyCardColor(null)}
              title="Clear color"
              className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500"
            >
              <Ban size={14} />
            </button>
          </div>
          <span className="w-px h-5 bg-slate-200" />
          {/* Add / edit a text note beside the selected card(s) */}
          <button
            onClick={addNoteToSelected}
            title="Add a text note next to the card"
            className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600"
          >
            <StickyNote size={14} />
          </button>
          {selected.size >= 2 && (
            <>
              <span className="w-px h-5 bg-slate-200" />
              {/* Quick-arrange: stack horizontally or vertically in one click */}
              {([
                { mode: 'row',    icon: Rows3,    title: 'Arrange in a horizontal row' },
                { mode: 'column', icon: Columns3, title: 'Arrange in a vertical column' },
              ] as const).map(({ mode, icon: Icon, title }) => (
                <button
                  key={mode}
                  onClick={() => applyAlignment(mode)}
                  title={title}
                  className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600"
                >
                  <Icon size={14} />
                </button>
              ))}
              <span className="w-px h-5 bg-slate-200" />
              {([
                { mode: 'left',    icon: AlignStartVertical,    title: 'Align left edges' },
                { mode: 'centerH', icon: AlignCenterVertical,   title: 'Align horizontal centers' },
                { mode: 'right',   icon: AlignEndVertical,      title: 'Align right edges' },
                { mode: 'top',     icon: AlignStartHorizontal,  title: 'Align top edges' },
                { mode: 'centerV', icon: AlignCenterHorizontal, title: 'Align vertical centers' },
                { mode: 'bottom',  icon: AlignEndHorizontal,    title: 'Align bottom edges' },
              ] as const).map(({ mode, icon: Icon, title }) => (
                <button
                  key={mode}
                  onClick={() => applyAlignment(mode)}
                  title={title}
                  className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600"
                >
                  <Icon size={14} />
                </button>
              ))}
              {selected.size >= 3 && (
                <>
                  <span className="w-px h-5 bg-slate-200" />
                  {([
                    { mode: 'distH', icon: AlignHorizontalDistributeCenter, title: 'Distribute horizontally' },
                    { mode: 'distV', icon: AlignVerticalDistributeCenter,   title: 'Distribute vertically' },
                  ] as const).map(({ mode, icon: Icon, title }) => (
                    <button
                      key={mode}
                      onClick={() => applyAlignment(mode)}
                      title={title}
                      className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600"
                    >
                      <Icon size={14} />
                    </button>
                  ))}
                </>
              )}
            </>
          )}
          <span className="w-px h-5 bg-slate-200" />
          <button
            onClick={() => setSelected(new Set())}
            title="Clear selection (Esc)"
            className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default forwardRef(OrgTreeView);
