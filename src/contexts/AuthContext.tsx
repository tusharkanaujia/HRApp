import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { toAuthEmail } from '../lib/authEmail';
import { useTenant } from './TenantContext';

interface AuthContextValue {
  firebaseUser: User | null;
  authLoading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  authLoading: true,
  signIn: async () => {},
  signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { tenantId } = useTenant();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() =>
    onAuthStateChanged(auth, u => {
      setFirebaseUser(u);
      setAuthLoading(false);
    }),
  []);

  const signIn = async (username: string, password: string) => {
    await signInWithEmailAndPassword(auth, toAuthEmail(username, tenantId), password);
  };
  const signOutUser = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ firebaseUser, authLoading, signIn, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
