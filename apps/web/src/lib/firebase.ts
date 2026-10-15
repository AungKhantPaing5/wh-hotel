import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

export function auth() {
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) throw new Error('Sign-in is not configured. Add Firebase settings and rebuild the website.');
  const app = getApps()[0] || initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  return getAuth(app);
}

export async function api(path: string, init: RequestInit = {}, authenticated = false) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const current = auth().currentUser;
    if (!current) throw new Error('Please sign in first.');
    headers.set('Authorization', `Bearer ${await current.getIdToken()}`);
  }
  const response = await fetch(`/api/${path}`, { ...init, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Request failed.');
  return data;
}
