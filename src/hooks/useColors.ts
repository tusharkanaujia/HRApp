import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import type { Division, ProjectType } from '../types';

// Defaults baked in — match the hardcoded values that existed before
// per-tenant overrides were possible. Used as fallback when no override
// is set for a given key.
export const DEFAULT_DIVISION_COLORS: Record<Division, string> = {
  CIVIL:   '#f59e0b',
  MEP:     '#8b5cf6',
  FACTORY: '#10b981',
  ADMIN:   '#3b82f6',
  GENERAL: '#64748b',
};

export const DEFAULT_PROJECT_TYPE_COLORS: Record<ProjectType, string> = {
  CIVIL:   '#f59e0b',
  MEP:     '#8b5cf6',
  FACTORY: '#10b981',
  GENERAL: '#64748b',
};

// Stable hash → HSL hue so departments without an explicit color still get
// distinct, deterministic colors instead of all-the-same-gray.
function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
export function defaultDepartmentColor(name: string): string {
  if (!name) return '#64748b';
  return `hsl(${hashHue(name)}, 45%, 55%)`;
}

export function useColors() {
  const appearance = useSelector((s: RootState) => s.appearance);

  // Divisions always resolve to a color — they have built-in defaults.
  const divisionColor = (division: Division | string | undefined): string => {
    if (!division) return '#64748b';
    return appearance.divisions?.[division as Division]
      ?? DEFAULT_DIVISION_COLORS[division as Division]
      ?? '#64748b';
  };

  // Departments only return a color when the admin has set one. Callers
  // decide whether to use a default fallback so the UI doesn't get loud by
  // default (most departments have no override).
  const departmentColor = (name: string | undefined): string | null => {
    if (!name) return null;
    return appearance.departments?.[name] ?? null;
  };

  // Projects: override > fallbackType color > null.
  const projectColor = (
    projectId: string | undefined,
    fallbackType?: ProjectType,
  ): string | null => {
    if (projectId && appearance.projects?.[projectId]) return appearance.projects[projectId];
    if (fallbackType) return DEFAULT_PROJECT_TYPE_COLORS[fallbackType] ?? null;
    return null;
  };

  const projectTypeColor = (type: ProjectType | undefined): string => {
    if (!type) return '#64748b';
    return DEFAULT_PROJECT_TYPE_COLORS[type] ?? '#64748b';
  };

  return { divisionColor, departmentColor, projectColor, projectTypeColor };
}
