import { useSelector } from 'react-redux';
import type { RootState } from '../store';

export function useAuth() {
  const { users, currentUserId } = useSelector((s: RootState) => s.auth);
  const currentUser = users.find(u => u.id === currentUserId) ?? null;
  return {
    currentUser,
    isLoggedIn: currentUser !== null,
    isAdmin:  currentUser?.role === 'ADMIN',
    canEdit:  currentUser?.role === 'ADMIN' || currentUser?.role === 'EDITOR',
  };
}
