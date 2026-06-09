// One-time migration: create a Firebase Auth account for every existing user
// doc (using its current plaintext password), record the resulting uid on the
// doc, and delete the plaintext `password` field.
//
// MUST be run inside the temporary open-rules window (it reads users and writes
// docs with the client SDK). Requires the Email/Password provider to be enabled
// in the Firebase console first.
//
//   node scripts/migrateToFirebaseAuth.mjs
//
// Idempotent: re-running signs in to already-created accounts to recover their
// uid, then strips the password.

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCHRF1pkAPX1FjZCD8q5lk7OR1ZLDrZJwI',
  authDomain: 'hrapp-1febc.firebaseapp.com',
  projectId: 'hrapp-1febc',
  storageBucket: 'hrapp-1febc.firebasestorage.app',
  messagingSenderId: '626901174765',
  appId: '1:626901174765:web:3851b736eff63b4b863fe4',
};

const AUTH_EMAIL_DOMAIN = 'wehive.app';
const toAuthEmail = (username, tenantId) =>
  `${String(username).trim().toLowerCase()}@${tenantId}.${AUTH_EMAIL_DOMAIN}`;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const created = [];
const linked = [];
const failed = [];

const tenants = await getDocs(collection(db, 'tenants'));
for (const tDoc of tenants.docs) {
  const t = tDoc.id;
  const usersSnap = await getDocs(collection(db, 'tenants', t, 'users'));
  for (const uDoc of usersSnap.docs) {
    const u = uDoc.data();
    const ref = doc(db, 'tenants', t, 'users', uDoc.id);
    if (!u.username) { failed.push(`${t}/${uDoc.id}: no username`); continue; }
    const email = toAuthEmail(u.username, t);

    let uid = u.authUid;
    if (!uid) {
      if (!u.password) { failed.push(`${email}: no password and no authUid — set password manually`); continue; }
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, u.password);
        uid = cred.user.uid;
        created.push(email);
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
          try {
            const cred = await signInWithEmailAndPassword(auth, email, u.password);
            uid = cred.user.uid;
            linked.push(email);
          } catch (e2) {
            failed.push(`${email}: account exists but password mismatch (${e2.code || e2.message})`);
            continue;
          }
        } else {
          failed.push(`${email}: ${e.code || e.message}`);
          continue;
        }
      }
    }

    await updateDoc(ref, { authUid: uid, password: deleteField() });
  }
}

console.log(`\nCreated: ${created.length}`);
created.forEach(e => console.log(`  + ${e}`));
console.log(`Linked (already existed): ${linked.length}`);
linked.forEach(e => console.log(`  = ${e}`));
if (failed.length) {
  console.log(`\nFAILED: ${failed.length}`);
  failed.forEach(e => console.log(`  ! ${e}`));
  process.exitCode = 1;
} else {
  console.log('\nAll users migrated. Plaintext passwords removed from Firestore.');
}
process.exit(process.exitCode ?? 0);
