import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { Employee, ProjectLayout } from '../types';
import type { RootState } from '../store';
import { saveProjectLayout, clearProjectLayout } from '../store/projectLayoutsSlice';
import { useAuth } from '../hooks/useAuth';
import { useColors } from '../hooks/useColors';
import StatusBadge from './StatusBadge';
import OrgTreeView, { type OrgTreeViewHandle, type ExportMeta } from './OrgTreeView';
import { Users, ChevronRight, LayoutGrid, GitBranch, Image as ImageIcon, FileText, RotateCcw, Check, Building } from 'lucide-react';

interface Props {
  employees: Employee[];
  initialDepartment?: string;
}

const COMPANY_COLORS: Record<string, string> = {
  'Ancient Builders Constructions LLC':        '#3b82f6',
  'MBM Gulf Electromechanical LLC':            '#14b8a6',
  'Noor Al Yemen Air Condition Cont. Co. LLC': '#f97316',
};

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// Saved layouts are keyed by a sanitized department slug so they don't collide
// with project ids (and never contain a '/', which Firestore doc ids forbid).
const deptLayoutKey = (name: string) => `dept:${name.replace(/[^a-zA-Z0-9]+/g, '_')}`;

export default function OrgByDepartment({ employees, initialDepartment }: Props) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { canEdit, currentUser } = useAuth();
  const { divisionColor, departmentColor } = useColors();
  const savedLayouts = useSelector((s: RootState) => s.projectLayouts.list);

  // ── Department list with headcount ──────────────────────────────────────────
  const departments = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      const d = e.department || 'Unassigned';
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [employees]);

  const [selectedDept, setSelectedDept] = useState<string | null>(
    initialDepartment ?? departments[0]?.name ?? null,
  );
  const [search, setSearch] = useState('');
  const [rightMode, setRightMode] = useState<'cards' | 'tree'>('cards');
  const [treeFocalId, setTreeFocalId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
  const treeRef = useRef<OrgTreeViewHandle>(null);
  const [layoutEpoch, setLayoutEpoch] = useState(0);

  const layoutKey = selectedDept ? deptLayoutKey(selectedDept) : null;
  const savedLayout: ProjectLayout | undefined = useMemo(
    () => savedLayouts.find(l => l.id === layoutKey),
    [savedLayouts, layoutKey],
  );

  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<number | null>(null);
  const savedFlashRef = useRef<number | null>(null);

  useEffect(() => {
    setTreeFocalId(null);
    setSaveStatus('idle');
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (savedFlashRef.current) { window.clearTimeout(savedFlashRef.current); savedFlashRef.current = null; }
  }, [selectedDept]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (savedFlashRef.current) window.clearTimeout(savedFlashRef.current);
  }, []);

  const handleLayoutChange = useCallback((layout: {
    offsets: Record<string, { dx: number; dy: number }>;
    expanded: string[];
    transform: { x: number; y: number; scale: number };
    cardColors: Record<string, string>;
    notes: Record<string, string>;
    font: { family?: string; scale?: number; color?: string };
  }) => {
    if (!layoutKey || !canEdit) return;
    setSaveStatus('pending');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      setSaveStatus('saving');
      dispatch(saveProjectLayout({
        id: layoutKey,
        offsets: layout.offsets,
        expanded: layout.expanded,
        transform: layout.transform,
        cardColors: layout.cardColors,
        notes: layout.notes,
        font: layout.font,
        updatedAt: new Date().toISOString(),
        updatedByName: currentUser?.name,
      }));
      window.setTimeout(() => {
        setSaveStatus('saved');
        if (savedFlashRef.current) window.clearTimeout(savedFlashRef.current);
        savedFlashRef.current = window.setTimeout(() => setSaveStatus('idle'), 1500);
      }, 250);
    }, 500);
  }, [layoutKey, canEdit, dispatch, currentUser?.name]);

  const handleResetLayout = useCallback(() => {
    if (!layoutKey || !canEdit) return;
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    dispatch(clearProjectLayout(layoutKey));
    setSaveStatus('idle');
    setLayoutEpoch(e => e + 1);
  }, [layoutKey, canEdit, dispatch]);

  const filteredDepartments = search
    ? departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : departments;

  // ── Members of the selected department ──────────────────────────────────────
  const deptEmployees = useMemo(() => {
    if (!selectedDept) return [];
    return employees.filter(e => (e.department || 'Unassigned') === selectedDept);
  }, [selectedDept, employees]);

  // Cards view groups members by division.
  const byDivision = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const emp of deptEmployees) {
      const key = emp.division || 'GENERAL';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(emp);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [deptEmployees]);

  const divCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const emp of deptEmployees) counts[emp.division] = (counts[emp.division] ?? 0) + 1;
    return counts;
  }, [deptEmployees]);

  // ── Department team for the tree: members + their full manager chains ────────
  const deptTree = useMemo(() => {
    if (!selectedDept) return { teamEmployees: [] as Employee[], rootId: null as string | null };
    const empMap = new Map<string, Employee>(employees.map(e => [e.id, e]));
    const directIds = new Set<string>(deptEmployees.map(e => e.id));
    const teamIds = new Set<string>();
    for (const id of directIds) {
      const visited = new Set<string>();
      let cur = empMap.get(id);
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        teamIds.add(cur.id);
        cur = cur.managerId ? empMap.get(cur.managerId) : undefined;
      }
    }
    const teamEmployees = employees.filter(e => teamIds.has(e.id));
    const roots = teamEmployees.filter(e => !e.managerId || !teamIds.has(e.managerId));
    const subtreeSize = (id: string, visited = new Set<string>()): number => {
      if (visited.has(id)) return 0;
      visited.add(id);
      return teamEmployees.filter(e => e.managerId === id).reduce((s, c) => s + 1 + subtreeSize(c.id, visited), 0);
    };
    const bestRoot = roots.length <= 1 ? roots[0] : roots.reduce((best, r) => subtreeSize(r.id) > subtreeSize(best.id) ? r : best, roots[0]);
    return { teamEmployees, rootId: bestRoot?.id ?? null };
  }, [selectedDept, deptEmployees, employees]);

  const activeFocalId = treeFocalId ?? deptTree.rootId;

  const handleExport = async (format: 'png' | 'pdf') => {
    if (!treeRef.current || !selectedDept) return;
    const slug = selectedDept.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `org-dept-${slug || 'department'}.${format}`;

    const companyCounts = new Map<string, number>();
    for (const e of deptTree.teamEmployees) {
      if (!e.company) continue;
      companyCounts.set(e.company, (companyCounts.get(e.company) ?? 0) + 1);
    }
    const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const companyName = topCompanies[0] ?? 'Organization';
    const companyTagline = topCompanies.length > 1 ? `with ${topCompanies.slice(1, 3).join(' · ')}` : undefined;

    const meta: ExportMeta = {
      companyName,
      companyTagline,
      subjectTag: 'DEPARTMENT',
      subjectTitle: selectedDept,
      subjectSubtitle: `${deptEmployees.length} in department`,
      staffCount: deptTree.teamEmployees.length,
      staffLabel: 'incl. line managers',
    };

    setExporting(format);
    try {
      if (format === 'png') await treeRef.current.exportToPng(filename, meta);
      else await treeRef.current.exportToPdf(filename, meta);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* ── Left: department list ──────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-slate-100 bg-white flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex-shrink-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Departments</p>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search departments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredDepartments.map(d => (
            <button
              key={d.name}
              onClick={() => setSelectedDept(d.name)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 ${
                selectedDept === d.name ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
              style={selectedDept === d.name ? undefined : { borderLeft: `3px solid ${departmentColor(d.name) ?? '#cbd5e1'}` }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building size={13} className="text-slate-400 flex-shrink-0" />
                <p className={`text-xs font-medium truncate ${selectedDept === d.name ? 'text-blue-700' : 'text-slate-700'}`}>
                  {d.name}
                </p>
              </div>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                d.count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
              }`}>
                {d.count}
              </span>
            </button>
          ))}
          {filteredDepartments.length === 0 && (
            <p className="p-4 text-xs text-slate-400 text-center">No departments found</p>
          )}
        </div>
      </div>

      {/* ── Right: roster / tree ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!selectedDept ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a department</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex-shrink-0 bg-white border-b border-slate-100 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-600">DEPARTMENT</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-800">{selectedDept}</h2>

                  {Object.keys(divCounts).length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {Object.entries(divCounts).sort((a, b) => b[1] - a[1]).map(([div, cnt]) => (
                        <span
                          key={div}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full text-white font-medium"
                          style={{ backgroundColor: divisionColor(div) }}
                        >
                          <Users size={9} /> {div} {cnt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-3 flex-shrink-0">
                  <div className="flex items-end gap-4">
                    <div className="text-right">
                      <p className="text-xl font-bold text-slate-800">{deptEmployees.length}</p>
                      <p className="text-[10px] text-slate-400">in department</p>
                    </div>
                    {rightMode === 'tree' && deptTree.teamEmployees.length > deptEmployees.length && (
                      <div className="text-right">
                        <p className="text-xl font-bold text-blue-600">{deptTree.teamEmployees.length}</p>
                        <p className="text-[10px] text-slate-400">incl. LMs</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {rightMode === 'tree' && deptTree.teamEmployees.length > 0 && (
                      <>
                        <button
                          onClick={() => handleExport('png')}
                          disabled={exporting !== null}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                          title="Download tree as PNG image"
                        >
                          <ImageIcon size={12} /> {exporting === 'png' ? 'Generating…' : 'PNG'}
                        </button>
                        <button
                          onClick={() => handleExport('pdf')}
                          disabled={exporting !== null}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                          title="Download tree as PDF"
                        >
                          <FileText size={12} /> {exporting === 'pdf' ? 'Generating…' : 'PDF'}
                        </button>
                      </>
                    )}

                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setRightMode('cards')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          rightMode === 'cards' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <LayoutGrid size={12} /> Cards
                      </button>
                      <button
                        onClick={() => setRightMode('tree')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          rightMode === 'tree' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <GitBranch size={12} /> Tree
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cards view */}
            {rightMode === 'cards' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {deptEmployees.length === 0 ? (
                  <div className="text-center text-slate-400 py-16 text-sm">No employees in this department</div>
                ) : (
                  byDivision.map(([div, emps]) => (
                    <div key={div}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: divisionColor(div) }} />
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{div}</h3>
                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{emps.length}</span>
                        <div className="flex-1 h-px bg-slate-100" />
                      </div>
                      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                        {emps.map(emp => {
                          const compColor = COMPANY_COLORS[emp.company] ?? '#64748b';
                          return (
                            <div
                              key={emp.id}
                              className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 hover:shadow-md transition-shadow cursor-pointer group"
                              style={{ borderLeft: `3px solid ${compColor}` }}
                              onClick={() => navigate(`/org-chart?emp=${emp.id}`)}
                            >
                              <div className="flex items-start gap-2.5">
                                <div
                                  className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                                  style={{ backgroundColor: compColor }}
                                >
                                  {initials(emp.name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 truncate leading-tight group-hover:text-blue-600">{emp.name}</p>
                                  <p className="text-[10px] text-slate-500 truncate leading-tight">{emp.designation}</p>
                                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <StatusBadge status={emp.status} />
                                  </div>
                                </div>
                                <ChevronRight size={12} className="text-slate-300 group-hover:text-blue-500 flex-shrink-0 mt-1" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tree view */}
            {rightMode === 'tree' && (
              <div className="flex-1 min-h-0 relative">
                {deptTree.teamEmployees.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    No employees in this department
                  </div>
                ) : activeFocalId ? (
                  <>
                    <OrgTreeView
                      key={`${layoutKey}:${layoutEpoch}`}
                      ref={treeRef}
                      focalId={activeFocalId}
                      employees={deptTree.teamEmployees}
                      onSelectEmployee={id => setTreeFocalId(id)}
                      initialOffsets={savedLayout?.offsets}
                      initialExpanded={savedLayout?.expanded}
                      initialTransform={savedLayout?.transform}
                      initialCardColors={savedLayout?.cardColors}
                      initialNotes={savedLayout?.notes}
                      initialFont={savedLayout?.font}
                      onLayoutChange={canEdit ? handleLayoutChange : undefined}
                    />
                    {canEdit && (
                      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                        <div className="bg-white/90 backdrop-blur rounded-md shadow border border-slate-100 px-2 py-1 text-[11px] text-slate-500 flex items-center gap-1.5">
                          {saveStatus === 'pending' && <span className="text-amber-600">Editing…</span>}
                          {saveStatus === 'saving' && <span className="text-blue-600">Saving…</span>}
                          {saveStatus === 'saved' && (
                            <><Check size={11} className="text-emerald-600" /><span className="text-emerald-700">Saved</span></>
                          )}
                          {saveStatus === 'idle' && (
                            <span>{savedLayout ? 'Layout saved for this department' : 'Drag cards to save a layout'}</span>
                          )}
                        </div>
                        {savedLayout && (
                          <button
                            onClick={handleResetLayout}
                            className="flex items-center gap-1 bg-white/90 backdrop-blur rounded-md shadow border border-slate-100 px-2 py-1 text-[11px] text-slate-600 hover:text-red-600 hover:border-red-200"
                            title="Discard saved layout for this department"
                          >
                            <RotateCcw size={11} /> Reset saved layout
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
