import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  connectAuthEmulator,
} from "firebase/auth";

export function auth(scope = "[DEFAULT]") {
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY)
    throw new Error(
      "Sign-in is not configured. Add Firebase settings and rebuild the website.",
    );
  const existing = getApps().find((app) => app.name === scope);
  const app =
    existing ||
    initializeApp(
      {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      },
      scope,
    );
  const instance =
    !existing && scope === "wn-admin"
      ? initializeAuth(app, { persistence: inMemoryPersistence })
      : getAuth(app);
  if (
    process.env.NEXT_PUBLIC_LOCAL_TEST === "true" &&
    !instance.emulatorConfig
  ) {
    if (
      typeof window === "undefined" ||
      !["localhost", "127.0.0.1"].includes(window.location.hostname)
    )
      throw new Error("Local testing must run on localhost.");
    // Mock reCAPTCHA only inside the explicitly localhost-only emulator branch.
    instance.settings.appVerificationDisabledForTesting = true;
    connectAuthEmulator(instance, "http://127.0.0.1:9099", {
      disableWarnings: false,
    });
  }
  return instance;
}

export async function api(
  path: string,
  init: RequestInit = {},
  authenticated = false,
  scope = "[DEFAULT]",
) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (authenticated) {
    const current = auth(scope).currentUser;
    if (!current) throw new Error("Please sign in first.");
    headers.set("Authorization", `Bearer ${await current.getIdToken()}`);
  }
  const response = await fetch(`/api/${path}`, { ...init, headers });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.message === "string" ? data.message : "Request failed.",
    );
  return data;
}
