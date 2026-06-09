import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCHRF1pkAPX1FjZCD8q5lk7OR1ZLDrZJwI',
  authDomain: 'hrapp-1febc.firebaseapp.com',
  projectId: 'hrapp-1febc',
  storageBucket: 'hrapp-1febc.firebasestorage.app',
  messagingSenderId: '626901174765',
  appId: '1:626901174765:web:3851b736eff63b4b863fe4',
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Keep the session across reloads/tabs (Firebase manages the token; no manual
// localStorage session needed).
setPersistence(auth, browserLocalPersistence).catch(console.error);

// A separate, named Firebase app used only for admin-driven account creation.
// `createUserWithEmailAndPassword` signs the *creating* app in as the new user;
// running it on this secondary app keeps the admin's own session intact.
export function getSecondaryAuth() {
  const secondary = getApps().find(a => a.name === 'secondary')
    ?? initializeApp(firebaseConfig, 'secondary');
  return getAuth(secondary);
}
