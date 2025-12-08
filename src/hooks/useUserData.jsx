import {useEffect, useState} from "react";
import {getAuth, onAuthStateChanged} from "firebase/auth";
import {doc, getDoc} from "firebase/firestore";
import {db} from "../firebase/firebase";

/**
 * Custom hook to fetch and sync authenticated user data from Firebase
 * @returns {Object} {userData, loading}
 */
export function useUserData() {
  const [userData, setUserData] = useState(null); // User data from Firestore
  const [loading, setLoading] = useState(true); // Initial loading state

  useEffect(() => {
    const auth = getAuth();

    // Subscribe to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is authenticated - fetch their data from Firestore
        const docRef = doc(db, "users", user.uid); // Reference to user's document
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          // Combine auth uid with Firestore document data
          setUserData({uid: user.uid, ...docSnap.data()});
        } else {
          // User authenticated but no Firestore document exists
          setUserData(null);
        }
      } else {
        // No user authenticated
        setUserData(null);
      }
      setLoading(false); // Loading complete regardless of auth state
    });

    // Cleanup: unsubscribe from auth state listener on unmount
    return () => unsubscribe();
  }, []); // Empty dependency array - runs once on mount

  return {userData, loading};
}
