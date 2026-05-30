import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { Employee, Project, ProjectLayout } from '../types';
import type { RootState } from '../store';
import { saveProjectLayout, clearProjectLayout } from '../store/projectLayoutsSlice';
import { useAuth } from '../hooks/useAuth';
import StatusBadge from './StatusBadge';
import OrgTreeView, { type OrgTreeViewHandle, type ExportMeta } from './OrgTreeView';
import { MapPin, Users, ChevronRight, LayoutGrid, GitBranch, Image as ImageIcon, FileText, RotateCcw, Check } from 'lucide-react';

interface Props {
  employees: Employee[];
  projects: Project[];
  initialProjectId?: string;
}

const TYPE_COLORS: Record<string, string> = {
  CIVIL:   'bg-amber-100   text-amber-700',
  MEP:     'bg-purple-100  text-purple-700',
  FACTORY: 'bg-emerald-100 text-emerald-700',
  GENERAL: 'bg-slate-100   text-slate-600',
};

const DIV_COLORS: Record<string, string> = {
  CIVIL:   '#f59e0b',
  MEP:     '#8b5cf6',
  FACTORY: '#10b981',
  ADMIN:   '#3b82f6',
  GENERAL: '#64748b',
};

const COMPANY_COLORS: Record<string, string> = {
  'Ancient Builders Constructions LLC':        '#3b82f6',
  'MBM Gulf Electromechanical LLC':            '#14b8a6',
  'Noor Al Yemen Air Condition Cont. Co. LLC': '#f97316',
};

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function OrgByProject({ employees, projects, initialProjectId }: Props) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { canEdit, currentUser } = useAuth();
  const savedLayouts = useSelector((s: RootState) => s.projectLayouts.list);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjectId ?? projects.find(p => p.status === 'ACTIVE')?.id ?? null,
  );
  const [search, setSearch] = useState('');
  const [rightMode, setRightMode] = useState<'cards' | 'tree'>('cards');
  // tree focal: null means "use computed root"
  const [treeFocalId, setTreeFocalId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
  const treeRef = useRef<OrgTreeViewHandle>(null);
  // Bumped on Reset to force OrgTreeView to remount so the in-memory offsets
  // are dropped (it seeds state from initialOffsets on mount only).
  const [layoutEpoch, setLayoutEpoch] = useState(0);

  // ── Persisted layout for the selected project ──────────────────────────────
  const savedLayout: ProjectLayout | undefined = useMemo(
    () => savedLayouts.find(l => l.id === selectedProjectId),
    [savedLayouts, selectedProjectId],
  );
  // 'idle' = matches what's in Firestore (or nothing saved yet, nothing dirty)
  // 'pending' = local edits not yet flushed
  // 'saving' = write in flight
  // 'saved' = transient confirmation
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<number | null>(null);
  const savedFlashRef = useRef<number | null>(null);

  // Reset tree focal & any pending save whenever the selected project changes
  useEffect(() => {
    setTreeFocalId(null);
    setSaveStatus('idle');
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (savedFlashRef.current) { window.clearTimeout(savedFlashRef.current); savedFlashRef.current = null; }
  }, [selectedProjectId]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (savedFlashRef.current) window.clearTimeout(savedFlashRef.current);
  }, []);

  // Debounced persist — fires ~500ms after the user stops interacting.
  const handleLayoutChange = useCallback((layout: {
    offsets: Record<string, { dx: number; dy: number }>;
    expanded: string[];
    transform: { x: number; y: number; scale: number };
  }) => {
    if (!selectedProjectId || !canEdit) return;
    setSaveStatus('pending');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      setSaveStatus('saving');
      dispatch(saveProjectLayout({
        id: selectedProjectId,
        offsets: layout.offsets,
        expanded: layout.expanded,
        transform: layout.transform,
        updatedAt: new Date().toISOString(),
        updatedByName: currentUser?.name,
      }));
      // Firestore write is fire-and-forget in the middleware; flash 'Saved'
      // after a short delay so the user sees confirmation.
      window.setTimeout(() => {
        setSaveStatus('saved');
        if (savedFlashRef.current) window.clearTimeout(savedFlashRef.current);
        savedFlashRef.current = window.setTimeout(() => setSaveStatus('idle'), 1500);
      }, 250);
    }, 500);
  }, [selectedProjectId, canEdit, dispatch, currentUser?.name]);

  const handleResetLayout = useCallback(() => {
    if (!selectedProjectId || !canEdit) return;
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    dispatch(clearProjectLayout(selectedProjectId));
    setSaveStatus('idle');
    // Force the tree to remount so any in-memory offsets are dropped.
    setLayoutEpoch(e => e + 1);
  }, [selectedProjectId, canEdit, dispatch]);

  // ── Project list with direct-assign counts ──────────────────────────────────
  const projectsWithCount = useMemo(() =>
    projects
      .map(p => ({ ...p, count: employees.filter(e => e.projectIds.includes(p.id)).length }))
      .sort((a, b) => b.count - a.count),
  [projects, employees]);

  const filteredProjects = search
    ? projectsWithCount.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()),
      )
    : projectsWithCount;

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;

  // ── Direct assignees ────────────────────────────────────────────────────────
  const projectEmployees = useMemo(() => {
    if (!selectedProjectId) return [];
    return employees.filter(e => e.projectIds.includes(selectedProjectId));
  }, [selectedProjectId, employees]);

  // Group by department (cards view)
  const byDepartment = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const emp of projectEmployees) {
      const key = emp.department || 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(emp);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [projectEmployees]);

  const divCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const emp of projectEmployees) counts[emp.division] = (counts[emp.division] ?? 0) + 1;
    return counts;
  }, [projectEmployees]);

  // ── Project team for tree view ──────────────────────────────────────────────
  // = direct assignees + their full ancestor chains (LMs are implicitly on the project)
  const projectTree = useMemo(() => {
    if (!selectedProjectId) return { teamEmployees: [], rootId: null };

    const empMap = new Map<string, Employee>(employees.map(e => [e.id, e]));
    const directIds = new Set<string>(projectEmployees.map(e => e.id));
    const teamIds = new Set<string>();

    // Walk up every direct employee's chain
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

    // Roots: team members whose manager is not in the team (or has none)
    const roots = teamEmployees.filter(e => !e.managerId || !teamIds.has(e.managerId));

    // Pick the root that manages the most team members (most central senior)
    const subtreeSize = (id: string, visited = new Set<string>()): number => {
      if (visited.has(id)) return 0;
      visited.add(id);
      return teamEmployees
        .filter(e => e.managerId === id)
        .reduce((sum, c) => sum + 1 + subtreeSize(c.id, visited), 0);
    };

    const bestRoot = roots.length <= 1
      ? roots[0]
      : roots.reduce((best, r) => subtreeSize(r.id) > subtreeSize(best.id) ? r : best, roots[0]);

    return { teamEmployees, rootId: bestRoot?.id ?? null };
  }, [selectedProjectId, projectEmployees, employees]);

  const activeFocalId = treeFocalId ?? projectTree.rootId;

  const handleExport = async (format: 'png' | 'pdf') => {
    if (!treeRef.current || !selectedProject) return;
    const slug = (selectedProject.code || selectedProject.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const filename = `org-${slug || 'project'}.${format}`;

    // Top-2 companies represented in this project's team, ranked by headcount
    const companyCounts = new Map<string, number>();
    for (const e of projectTree.teamEmployees) {
      if (!e.company) continue;
      companyCounts.set(e.company, (companyCounts.get(e.company) ?? 0) + 1);
    }
    const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const companyName = topCompanies[0] ?? 'Organization';
    const companyTagline = topCompanies.length > 1
      ? `with ${topCompanies.slice(1, 3).join(' · ')}`
      : undefined;

    const meta: ExportMeta = {
      companyName,
      companyTagline,
      subjectTag: selectedProject.type,
      subjectCode: selectedProject.code,
      subjectTitle: selectedProject.name,
      subjectSubtitle: selectedProject.location,
      staffCount: projectTree.teamEmployees.length,
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
      {/* ── Left: project list ─────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-slate-100 bg-white flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex-shrink-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Projects</p>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredProjects.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-blue-50 transition-colors flex items-start justify-between gap-2 ${
                selectedProjectId === p.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[p.type]}`}>{p.type}</span>
                  <span className="text-[9px] text-slate-400 font-mono">{p.code}</span>
                </div>
                <p className={`text-xs font-medium truncate ${selectedProjectId === p.id ? 'text-blue-700' : 'text-slate-700'}`}>
                  {p.name}
                </p>
                {p.location && (
                  <p className="text-[10px] text-slate-400 truncate flex items-center gap-0.5 mt-0.5">
                    <MapPin size={9} />{p.location}
                  </p>
                )}
              </div>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${
                p.count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
              }`}>
                {p.count}
              </span>
            </button>
          ))}
          {filteredProjects.length === 0 && (
            <p className="p-4 text-xs text-slate-400 text-center">No projects found</p>
          )}
        </div>
      </div>

      {/* ── Right: roster / tree ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!selectedProject ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a project</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex-shrink-0 bg-white border-b border-slate-100 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_COLORS[selectedProject.type]}`}>
                      {selectedProject.type}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{selectedProject.code}</span>
                    {selectedProject.location && (
                      <span className="text-xs text-slate-400 flex items-center gap-0.5">
                        <MapPin size={10} />{selectedProject.location}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-slate-800">{selectedProject.name}</h2>

                  {/* Division pills */}
                  {Object.keys(divCounts).length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {Object.entries(divCounts).sort((a, b) => b[1] - a[1]).map(([div, cnt]) => (
                        <span
                          key={div}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full text-white font-medium"
                          style={{ backgroundColor: DIV_COLORS[div] ?? '#64748b' }}
                        >
                          <Users size={9} /> {div} {cnt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stats + view toggle */}
                <div className="flex flex-col items-end gap-3 flex-shrink-0">
                  <div className="flex items-end gap-4">
                    <div className="text-right">
                      <p className="text-xl font-bold text-slate-800">{projectEmployees.length}</p>
                      <p className="text-[10px] text-slate-400">direct staff</p>
                    </div>
                    {rightMode === 'tree' && projectTree.teamEmployees.length > projectEmployees.length && (
                      <div className="text-right">
                        <p className="text-xl font-bold text-blue-600">{projectTree.teamEmployees.length}</p>
                        <p className="text-[10px] text-slate-400">incl. LMs</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Export buttons (tree mode only) */}
                    {rightMode === 'tree' && projectTree.teamEmployees.length > 0 && (
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

                    {/* Cards / Tree toggle */}
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
                {projectEmployees.length === 0 ? (
                  <div className="text-center text-slate-400 py-16 text-sm">No employees assigned to this project</div>
                ) : (
                  byDepartment.map(([dept, emps]) => (
                    <div key={dept}>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{dept}</h3>
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
                                    <span
                                      className="text-[9px] px-1.5 py-0.5 rounded font-medium text-white"
                                      style={{ backgroundColor: DIV_COLORS[emp.division] ?? '#64748b' }}
                                    >
                                      {emp.division}
                                    </span>
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
                {projectTree.teamEmployees.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    No employees assigned to this project
                  </div>
                ) : activeFocalId ? (
                  <>
                    <OrgTreeView
                      key={`${selectedProjectId}:${layoutEpoch}`}
                      ref={treeRef}
                      focalId={activeFocalId}
                      employees={projectTree.teamEmployees}
                      onSelectEmployee={id => setTreeFocalId(id)}
                      initialOffsets={savedLayout?.offsets}
                      initialExpanded={savedLayout?.expanded}
                      initialTransform={savedLayout?.transform}
                      onLayoutChange={canEdit ? handleLayoutChange : undefined}
                    />
                    {/* Layout save indicator + reset (editors only). Pinned
                        top-left so it doesn't clash with the tree's built-in
                        controls in the corners. */}
                    {canEdit && (
                      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                        <div className="bg-white/90 backdrop-blur rounded-md shadow border border-slate-100 px-2 py-1 text-[11px] text-slate-500 flex items-center gap-1.5">
                          {saveStatus === 'pending' && <span className="text-amber-600">Editing…</span>}
                          {saveStatus === 'saving' && <span className="text-blue-600">Saving…</span>}
                          {saveStatus === 'saved' && (
                            <><Check size={11} className="text-emerald-600" /><span className="text-emerald-700">Saved</span></>
                          )}
                          {saveStatus === 'idle' && (
                            <span>{savedLayout ? 'Layout saved for this project' : 'Drag cards to save a layout'}</span>
                          )}
                        </div>
                        {savedLayout && (
                          <button
                            onClick={handleResetLayout}
                            className="flex items-center gap-1 bg-white/90 backdrop-blur rounded-md shadow border border-slate-100 px-2 py-1 text-[11px] text-slate-600 hover:text-red-600 hover:border-red-200"
                            title="Discard saved layout for this project"
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
