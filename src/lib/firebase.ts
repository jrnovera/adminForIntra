import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDfxLrPo_G1Ej4vkp8zjDXOydCd519yKio",
  authDomain: "intara-app.firebaseapp.com",
  projectId: "intara-app",
  storageBucket: "intara-app.firebasestorage.app",
  messagingSenderId: "799559628705",
  appId: "1:799559628705:web:6170a56d12120463e9bde0",
  measurementId: "G-19GZ8NBSVT"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
