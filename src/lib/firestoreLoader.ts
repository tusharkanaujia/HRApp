import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import type { AppDispatch } from '../store';
import { setEmployees } from '../store/employeesSlice';
import { setProjects } from '../store/projectsSlice';
import { setUsers } from '../store/authSlice';
import { setActivityLog } from '../store/activitySlice';
import type { Employee, Project, AppUser, ActivityEntry } from '../types';

export function subscribeToTenantData(
  tenantId: string,
  dispatch: AppDispatch,
  onReady: () => void,
): () => void {
  const base = (sub: string) => collection(db, 'tenants', tenantId, sub);
  const flags = { emp: false, proj: false, users: false };
  const tryReady = () => {
    if (flags.emp && flags.proj && flags.users) onReady();
  };
  const unsubs: Array<() => void> = [];

  unsubs.push(
    onSnapshot(base('employees'), snap => {
      dispatch(setEmployees(snap.docs.map(d => ({ ...d.data(), id: d.id } as Employee))));
      if (!flags.emp) { flags.emp = true; tryReady(); }
    }),
  );

  unsubs.push(
    onSnapshot(base('projects'), snap => {
      dispatch(setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project))));
      if (!flags.proj) { flags.proj = true; tryReady(); }
    }),
  );

  unsubs.push(
    onSnapshot(base('users'), snap => {
      dispatch(setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as AppUser))));
      if (!flags.users) { flags.users = true; tryReady(); }
    }),
  );

  unsubs.push(
    onSnapshot(
      query(base('activity'), orderBy('timestamp', 'desc'), limit(500)),
      snap => {
        dispatch(setActivityLog(snap.docs.map(d => ({ ...d.data(), id: d.id } as ActivityEntry))));
      },
    ),
  );

  return () => unsubs.forEach(u => u());
}
