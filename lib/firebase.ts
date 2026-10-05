import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAJoktBdUX6-_V9QVmIDT9ME7UpBaGG6Dw",
  authDomain: "bike-service-reminder.firebaseapp.com",
  projectId: "bike-service-reminder",
  storageBucket: "bike-service-reminder.appspot.com", // ✅ corrected
  messagingSenderId: "1027481915828",
  appId: "1:1027481915828:web:ccfe34de3c3a191660e2e1",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

export const db = getFirestore(app);
