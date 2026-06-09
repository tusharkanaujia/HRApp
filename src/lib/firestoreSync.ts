import type { Middleware } from '@reduxjs/toolkit';
import { doc, setDoc, deleteDoc, getDocs, writeBatch, collection } from 'firebase/firestore';
import { db } from './firebase';
import type { Employee } from '../types';

let currentTenantId = '';
export function setTenantId(id: string) { currentTenantId = id; }

const ref = (sub: string, id: string) =>
  doc(db, 'tenants', currentTenantId, sub, id);

// Firestore rejects fields whose value is `undefined`. Strip them before write.
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

// Avoid importing RootState here — it would create a circular dependency:
// firestoreSync → store/index (for RootState) → firestoreSync (for middleware)
// Instead we cast getState() locally.
type StoreWithEmployees = { employees: { list: Employee[] } };

export const firestoreMiddleware: Middleware =
  store => next => (action: unknown) => {
    const { type, payload } = action as { type: string; payload: unknown };

    // Capture employees BEFORE Redux updates (needed for deleteEmployee's direct-report unlinking)
    const preEmployees = (store.getState() as StoreWithEmployees).employees.list;

    const result = next(action);

    if (!currentTenantId) return result;

    switch (type) {
      // ── Employees ─────────────────────────────────────────────────────────
      case 'employees/addEmployee':
      case 'employees/updateEmployee':
        setDoc(ref('employees', (payload as Employee).id), stripUndefined(payload as Record<string, unknown>))
          .catch(console.error);
        break;

      case 'employees/deleteEmployee': {
        const empId = payload as string;
        deleteDoc(ref('employees', empId)).catch(console.error);
        preEmployees
          .filter(e => e.managerId === empId)
          .forEach(e =>
            setDoc(ref('employees', e.id), { managerId: null }, { merge: true }).catch(console.error),
          );
        break;
      }

      // ── Projects ──────────────────────────────────────────────────────────
      case 'projects/addProject':
      case 'projects/updateProject':
        setDoc(ref('projects', (payload as { id: string }).id), stripUndefined(payload as Record<string, unknown>))
          .catch(console.error);
        break;

      case 'projects/deleteProject':
        deleteDoc(ref('projects', payload as string)).catch(console.error);
        // Cascade — drop the saved chart layout so a future project at the
        // same id starts clean.
        deleteDoc(ref('projectLayouts', payload as string)).catch(console.error);
        break;

      // ── Project chart layouts ─────────────────────────────────────────────
      case 'projectLayouts/saveProjectLayout':
        setDoc(
          ref('projectLayouts', (payload as { id: string }).id),
          stripUndefined(payload as Record<string, unknown>),
        ).catch(console.error);
        break;

      case 'projectLayouts/clearProjectLayout':
        deleteDoc(ref('projectLayouts', payload as string)).catch(console.error);
        break;

      // ── Appearance (tenant-wide color overrides) ──────────────────────────
      // Single doc at config/appearance — write the full slice state with
      // merge so partial updates round-trip correctly.
      case 'appearance/setDivisionColor':
      case 'appearance/setDepartmentColor':
      case 'appearance/setProjectColor': {
        const state = store.getState() as { appearance: Record<string, unknown> };
        setDoc(
          doc(db, 'tenants', currentTenantId, 'config', 'appearance'),
          stripUndefined(state.appearance as Record<string, unknown>),
          { merge: true },
        ).catch(console.error);
        break;
      }

      // ── Corporate chart edits (single doc at config/corporateChart) ──────────
      // Full replace (no merge) so removed cards / cleared overrides persist.
      case 'corporateChart/setCorporateFont':
      case 'corporateChart/setCardOverride':
      case 'corporateChart/addCorporateCard':
      case 'corporateChart/updateAddedCard':
      case 'corporateChart/deleteCorporateCard':
      case 'corporateChart/addCorporateEdge':
      case 'corporateChart/removeCorporateEdge':
      case 'corporateChart/replaceCorporateChart':
      case 'corporateChart/resetCorporateChart': {
        const state = store.getState() as { corporateChart: Record<string, unknown> };
        setDoc(
          doc(db, 'tenants', currentTenantId, 'config', 'corporateChart'),
          stripUndefined(state.corporateChart as Record<string, unknown>),
        ).catch(console.error);
        break;
      }

      // ── Users ─────────────────────────────────────────────────────────────
      case 'auth/addUser':
        setDoc(ref('users', (payload as { id: string }).id), stripUndefined(payload as Record<string, unknown>))
          .catch(console.error);
        break;

      case 'auth/removeUser':
        deleteDoc(ref('users', payload as string)).catch(console.error);
        break;

      case 'auth/setUserRole':
        setDoc(
          ref('users', (payload as { userId: string }).userId),
          { role: (payload as { role: string }).role },
          { merge: true },
        ).catch(console.error);
        break;

      case 'auth/setUserDisabled':
        setDoc(
          ref('users', (payload as { userId: string }).userId),
          { disabled: (payload as { disabled: boolean }).disabled },
          { merge: true },
        ).catch(console.error);
        break;

      case 'auth/disableUserByEmpId': {
        // Need to look up user by empId in current state, then write to that doc
        const empId = (payload as { empId: string }).empId;
        const disabled = (payload as { disabled: boolean }).disabled;
        const state = store.getState() as { auth: { users: Array<{ id: string; empId?: string }> } };
        const user = state.auth.users.find(u => u.empId === empId);
        if (user) {
          setDoc(ref('users', user.id), { disabled }, { merge: true }).catch(console.error);
        }
        break;
      }

      // ── Activity ──────────────────────────────────────────────────────────
      case 'activity/addActivity':
        setDoc(ref('activity', (payload as { id: string }).id), stripUndefined(payload as Record<string, unknown>))
          .catch(console.error);
        break;

      case 'activity/clearActivity': {
        const tid = currentTenantId;
        (async () => {
          const snap = await getDocs(collection(db, 'tenants', tid, 'activity'));
          if (snap.empty) return;
          for (let i = 0; i < snap.docs.length; i += 499) {
            const batch = writeBatch(db);
            snap.docs.slice(i, i + 499).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        })().catch(console.error);
        break;
      }
    }

    return result;
  };
