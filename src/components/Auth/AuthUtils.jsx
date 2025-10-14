import { getAuth, signOut } from 'firebase/auth';

export function logout() {
  const auth = getAuth();
  return signOut(auth);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
