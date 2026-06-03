import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../contexts/ToastContext';
import { getToastEnabled } from '../utils/activityNotifications';
import type { ActivityAction, ActivityEntry } from '../types';

// Headless component — mounted once inside Layout. Watches the Redux activity
// log for new entries and pops a toast per new entry.
//
//  • For the actor (whose user id matches the entry): a short "Saved" toast.
//  • For everyone else with editor-or-higher access (and toasts enabled): the
//    full "X did Y" toast.
//  • Entries that existed at mount time are never toasted.

const ACTION_LABEL: Record<ActivityAction, string> = {
  ADD_EMPLOYEE:       'Employee added',
  EDIT_EMPLOYEE:      'Employee edited',
  DELETE_EMPLOYEE:    'Employee deleted',
  CHANGE_HIERARCHY:   'Org change',
  TERMINATE_EMPLOYEE: 'Employment ended',
  ADD_PROJECT:        'Project added',
  EDIT_PROJECT:       'Project edited',
  DELETE_PROJECT:     'Project deleted',
};

const ACTION_KIND: Record<ActivityAction, 'info' | 'success' | 'warn'> = {
  ADD_EMPLOYEE: 'success',
  EDIT_EMPLOYEE: 'info',
  DELETE_EMPLOYEE: 'warn',
  CHANGE_HIERARCHY: 'info',
  TERMINATE_EMPLOYEE: 'warn',
  ADD_PROJECT: 'success',
  EDIT_PROJECT: 'info',
  DELETE_PROJECT: 'warn',
};

export default function ActivityToastBridge() {
  const { currentUser, canEdit } = useAuth();
  const { pushToast } = useToast();
  const log = useSelector((s: RootState) => s.activity.log);

  // Mount-time threshold — anything with timestamp <= this is pre-existing.
  const mountTsRef = useRef<string>(new Date().toISOString());
  const toastedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;

    const fresh: ActivityEntry[] = log.filter(e =>
      e.timestamp > mountTsRef.current && !toastedIdsRef.current.has(e.id)
    );
    if (fresh.length === 0) return;

    const watchOthers = canEdit && getToastEnabled(currentUser.id);

    // Show oldest-first so the newest sits on top of the stack.
    for (const entry of [...fresh].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
      toastedIdsRef.current.add(entry.id);

      if (entry.userId === currentUser.id) {
        // Actor: brief confirmation, no counter contribution.
        pushToast({
          kind: 'success',
          title: 'Saved',
          message: ACTION_LABEL[entry.action] ?? entry.action,
          ttlMs: 1800,
        });
        continue;
      }

      if (!watchOthers) continue;

      const title = `${ACTION_LABEL[entry.action] ?? entry.action} · ${entry.entityName}`;
      const message = entry.details
        ? `by ${entry.userName} — ${entry.details}`
        : `by ${entry.userName}`;
      pushToast({ kind: ACTION_KIND[entry.action] ?? 'info', title, message });
    }
  }, [log, canEdit, currentUser, pushToast]);

  return null;
}
