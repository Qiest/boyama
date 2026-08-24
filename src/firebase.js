import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDlb4gwTuDaM1ZICkEBhxcd1y5-1W1-Kns",
  authDomain: "boyama-9e0b5.firebaseapp.com",
  projectId: "boyama-9e0b5",
  storageBucket: "boyama-9e0b5.firebasestorage.app",
  messagingSenderId: "75070230192",
  appId: "1:75070230192:web:990653af27882263a5f575",
  measurementId: "G-XQ8PKM55TV"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

enableMultiTabIndexedDbPersistence(db).catch(() => {});

export async function ensureAnonymousAuth() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}
