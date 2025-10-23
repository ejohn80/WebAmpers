import {initializeApp} from "firebase/app";
import {getAuth} from "firebase/auth";
import {getFirestore} from "firebase/firestore";
import {getStorage} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDHfDsGy2RAStpKsEfNa-Xx4DUWQ0RV6es",
  authDomain: "webamp-e8f7b.firebaseapp.com",
  projectId: "webamp-e8f7b",
  appId: "1:602045977933:web:1e7ae7627d1ba72c185304",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
