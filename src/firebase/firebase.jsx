import {initializeApp} from "firebase/app";
import {getAuth} from "firebase/auth";
import {getFirestore} from "firebase/firestore";
import {getStorage} from "firebase/storage";

// Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDHfDsGy2RAStpKsEfNa-Xx4DUWQ0RV6es",
  authDomain: "webamp-e8f7b.firebaseapp.com",
  projectId: "webamp-e8f7b",
  storageBucket: "webamp-e8f7b.firebasestorage.app",
  appId: "1:602045977933:web:1e7ae7627d1ba72c185304",
};

// Initialize Firebase app instance
const app = initializeApp(firebaseConfig);

// Export Firebase services for use throughout the app
export const db = getFirestore(app); // Firestore database
export const auth = getAuth(app); // Authentication service
export const storage = getStorage(app); // Cloud Storage
