// Shared Firebase init for provisioning scripts.

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCHRF1pkAPX1FjZCD8q5lk7OR1ZLDrZJwI",
  authDomain: "hrapp-1febc.firebaseapp.com",
  projectId: "hrapp-1febc",
  storageBucket: "hrapp-1febc.firebasestorage.app",
  messagingSenderId: "626901174765",
  appId: "1:626901174765:web:3851b736eff63b4b863fe4",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
