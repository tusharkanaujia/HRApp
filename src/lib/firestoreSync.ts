import type { Middleware } from '@reduxjs/toolkit';
import { doc, setDoc, deleteDoc, getDocs, writeBatch, collection } from 'firebase/firestore';
import { db } from './firebase';
import type { Employee } from '../types';

let currentTenantId = '';
export function setTenantId(id: string) { currentTenantId = id; }

const ref = (sub: string, id: string) =>
  doc(db, 'tenants', currentTenantId, sub, id);

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
        setDoc(ref('employees', (payload as Employee).id), { ...(payload as object) })
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
        setDoc(ref('projects', (payload as { id: string }).id), { ...(payload as object) })
          .catch(console.error);
        break;

      case 'projects/deleteProject':
        deleteDoc(ref('projects', payload as string)).catch(console.error);
        break;

      // ── Users ─────────────────────────────────────────────────────────────
      case 'auth/addUser':
        setDoc(ref('users', (payload as { id: string }).id), { ...(payload as object) })
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

      case 'auth/changePassword':
        setDoc(
          ref('users', (payload as { userId: string }).userId),
          { password: (payload as { password: string }).password },
          { merge: true },
        ).catch(console.error);
        break;

      // ── Activity ──────────────────────────────────────────────────────────
      case 'activity/addActivity':
        setDoc(ref('activity', (payload as { id: string }).id), { ...(payload as object) })
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
