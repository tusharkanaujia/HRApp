import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { Palette, RotateCcw, Search } from 'lucide-react';
import type { RootState } from '../store';
import type { Division, Project } from '../types';
import {
  setDivisionColor, setDepartmentColor, setProjectColor,
} from '../store/appearanceSlice';
import { useAuth } from '../hooks/useAuth';
import {
  useColors, DEFAULT_DIVISION_COLORS, DEFAULT_PROJECT_TYPE_COLORS,
  defaultDepartmentColor,
} from '../hooks/useColors';

const DIVISIONS: readonly Division[] = ['CIVIL', 'MEP', 'FACTORY', 'ADMIN', 'GENERAL'];

interface ColorRowProps {
  label: string;
  current: string;       // effective color (override or default)
  isOverridden: boolean;
  onChange: (hex: string) => void;
  onReset: () => void;
  sublabel?: string;
}

function ColorRow({ label, current, isOverridden, onChange, onReset, sublabel }: ColorRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg">
      <input
        type="color"
        value={normalizeHex(current)}
        onChange={e => onChange(e.target.value)}
        className="w-10 h-8 rounded border border-slate-200 cursor-pointer flex-shrink-0"
        title="Pick a color"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 truncate">{label}</p>
        {sublabel && <p className="text-[11px] text-slate-400 truncate">{sublabel}</p>}
      </div>
      <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">{current.toUpperCase()}</span>
      <button
        onClick={onReset}
        disabled={!isOverridden}
        title={isOverridden ? 'Reset to default' : 'No override set'}
        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
      >
        <RotateCcw size={13} />
      </button>
    </div>
  );
}

// HSL → hex fallback so <input type="color"> always gets a valid #rrggbb.
function normalizeHex(c: string): string {
  if (c.startsWith('#')) return c.length === 7 ? c : '#64748b';
  if (c.startsWith('hsl')) {
    const m = c.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/);
    if (!m) return '#64748b';
    return hslToHex(+m[1], +m[2] / 100, +m[3] / 100);
  }
  return '#64748b';
}
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function AppearancePage() {
  const dispatch = useDispatch();
  const { isAdmin } = useAuth();
  const appearance = useSelector((s: RootState) => s.appearance);
  const employees = useSelector((s: RootState) => s.employees.list);
  const projects = useSelector((s: RootState) => s.projects.list);
  const { divisionColor } = useColors();

  const [deptSearch, setDeptSearch] = useState('');
  const [projSearch, setProjSearch] = useState('');

  // Unique departments across employees, sorted alphabetically.
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      if (e.department && e.department.trim()) set.add(e.department.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const projectsByName = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Palette size={18} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Appearance</h1>
          <p className="text-sm text-slate-500">Customize colors used across the org chart and project views.</p>
        </div>
      </header>

      {/* Divisions */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Divisions</h2>
          <p className="text-xs text-slate-400 mt-0.5">Five fixed values. Used for division badges on employees.</p>
        </div>
        <div className="p-2">
          {DIVISIONS.map(d => {
            const current = divisionColor(d);
            const overridden = !!appearance.divisions?.[d];
            return (
              <ColorRow
                key={d}
                label={d}
                current={current}
                isOverridden={overridden}
                onChange={hex => dispatch(setDivisionColor({ division: d, color: hex }))}
                onReset={() => dispatch(setDivisionColor({ division: d, color: null }))}
                sublabel={overridden ? `Default: ${DEFAULT_DIVISION_COLORS[d]}` : undefined}
              />
            );
          })}
        </div>
      </section>

      {/* Departments */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-700">Departments</h2>
            <p className="text-xs text-slate-400 mt-0.5">Derived from employee data. Colored department names appear on org-chart cards once you set a color.</p>
          </div>
          <div className="relative flex-shrink-0 w-56">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={deptSearch}
              onChange={e => setDeptSearch(e.target.value)}
              placeholder="Filter departments..."
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="p-2 max-h-96 overflow-y-auto">
          {departments.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No departments found in employee data.</p>
          ) : (
            departments
              .filter(d => !deptSearch || d.toLowerCase().includes(deptSearch.toLowerCase()))
              .map(name => {
                const overridden = !!appearance.departments?.[name];
                const current = overridden
                  ? appearance.departments![name]
                  : defaultDepartmentColor(name);
                return (
                  <ColorRow
                    key={name}
                    label={name}
                    current={current}
                    isOverridden={overridden}
                    onChange={hex => dispatch(setDepartmentColor({ name, color: hex }))}
                    onReset={() => dispatch(setDepartmentColor({ name, color: null }))}
                  />
                );
              })
          )}
        </div>
      </section>

      {/* Projects */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-700">Projects</h2>
            <p className="text-xs text-slate-400 mt-0.5">Per-project accent color. Falls back to project-type color when not set.</p>
          </div>
          <div className="relative flex-shrink-0 w-56">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={projSearch}
              onChange={e => setProjSearch(e.target.value)}
              placeholder="Filter projects..."
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="p-2 max-h-96 overflow-y-auto">
          {projectsByName.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No projects.</p>
          ) : (
            projectsByName
              .filter((p: Project) =>
                !projSearch ||
                p.name.toLowerCase().includes(projSearch.toLowerCase()) ||
                p.code.toLowerCase().includes(projSearch.toLowerCase()),
              )
              .map((p: Project) => {
                const overridden = !!appearance.projects?.[p.id];
                const current = overridden
                  ? appearance.projects![p.id]
                  : DEFAULT_PROJECT_TYPE_COLORS[p.type] ?? '#64748b';
                return (
                  <ColorRow
                    key={p.id}
                    label={p.name}
                    sublabel={`${p.code} · ${p.type}${overridden ? '' : ' (using type default)'}`}
                    current={current}
                    isOverridden={overridden}
                    onChange={hex => dispatch(setProjectColor({ projectId: p.id, color: hex }))}
                    onReset={() => dispatch(setProjectColor({ projectId: p.id, color: null }))}
                  />
                );
              })
          )}
        </div>
      </section>
    </div>
  );
}
