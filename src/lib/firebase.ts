import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAenYluN8p69uK-46heBNk6FwSCwsQw9y4",
  authDomain: "swiftcare-bd842.firebaseapp.com",
  projectId: "swiftcare-bd842",
  storageBucket: "swiftcare-bd842.firebasestorage.app",
  messagingSenderId: "209622156815",
  appId: "1:209622156815:web:4ddb254e4043c978fe857a"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
