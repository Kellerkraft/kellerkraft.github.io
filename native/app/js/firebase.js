/**
 * Firebase app bootstrap — single source for config, db, and auth.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCovESjJ-1UPTKGdv3tiggabIgJsPZpUJI",
  authDomain: "kellerkraft-gym.firebaseapp.com",
  databaseURL: "https://kellerkraft-gym-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "kellerkraft-gym",
  storageBucket: "kellerkraft-gym.firebasestorage.app",
  messagingSenderId: "694797273142",
  appId: "1:694797273142:web:1cbf492a8356ae554e7097"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getDatabase(firebaseApp);
export const auth = getAuth(firebaseApp);
