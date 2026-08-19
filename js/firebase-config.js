// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  child,
  remove,
  update,
  off,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsC9bjxuhysJ6AyouCS1kcyHNg0Dpic1c",
  authDomain: "agenda-token.firebaseapp.com",
  databaseURL: "https://agenda-token-default-rtdb.firebaseio.com",
  projectId: "agenda-token",
  storageBucket: "agenda-token.firebasestorage.app",
  messagingSenderId: "105039555180",
  appId: "1:105039555180:web:38478ee7d4c2a1f6330649",
  measurementId: "G-V4447X9MD5",
};

// Blocage absolu de toute boîte de confirmation grise native du navigateur
window.confirm = function (msg) {
  console.warn("Native confirm blocked:", msg);
  return false;
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

export {
  app,
  auth,
  database,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
  ref,
  onValue,
  set,
  get,
  child,
  remove,
  update,
  off,
};
