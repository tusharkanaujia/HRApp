import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { useAuthContext } from '../contexts/AuthContext';
import { usernameFromEmail } from '../lib/authEmail';

export function useAuth() {
  const users = useSelector((s: RootState) => s.auth.users);
  const { firebaseUser } = useAuthContext();

  // Match the signed-in Firebase user to its directory entry: by authUid first
  // (written at migration / account creation), falling back to the username
  // encoded in the email local-part.
  const currentUser = firebaseUser
    ? users.find(u => u.authUid === firebaseUser.uid)
        ?? users.find(u => u.username === usernameFromEmail(firebaseUser.email))
        ?? null
    : null;

  return {
    currentUser,
    isLoggedIn: !!firebaseUser,
    isAdmin:  currentUser?.role === 'ADMIN',
    canEdit:  currentUser?.role === 'ADMIN' || currentUser?.role === 'EDITOR',
  };
}
