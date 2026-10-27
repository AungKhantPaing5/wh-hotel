export type SessionUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
  mustChangePassword?: boolean;
  reload: () => Promise<void>;
  getIdToken: (force?: boolean) => Promise<string>;
};
type Session = {
  currentUser: SessionUser | null;
  listeners: Set<(u: SessionUser | null) => void>;
  ready: Promise<void>;
  scope: string;
  authStateReady: () => Promise<void>;
};
const sessions = new Map<string, Session>();
function emit(s: Session, u: any) {
  s.currentUser = u
    ? { ...u, reload: () => refresh(s), getIdToken: async () => "" }
    : null;
  for (const cb of s.listeners) cb(s.currentUser);
}
async function refresh(s: Session) {
  try {
    const r = await request("auth/session", {}, s.scope);
    emit(s, r.user);
  } catch {
    emit(s, null);
  }
}
export function auth(scope = "[DEFAULT]"): Session {
  const key = scope === "wn-admin" ? "admin" : "customer";
  let s = sessions.get(key);
  if (!s) {
    s = {
      currentUser: null,
      listeners: new Set(),
      scope: key,
      ready: Promise.resolve(),
      authStateReady: () => s!.ready,
    };
    sessions.set(key, s);
    s.ready = refresh(s);
  }
  return s;
}
async function request(
  path: string,
  init: RequestInit = {},
  scope = "customer",
) {
  const headers = new Headers(init.headers);
  headers.set("X-WN-Scope", scope);
  headers.set("X-WN-Request", "1");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.message === "string" ? data.message : "Request failed.",
    );
  return data;
}
export async function api(
  path: string,
  init: RequestInit = {},
  authenticated = false,
  scope = "[DEFAULT]",
) {
  const s = auth(scope);
  if (authenticated) {
    await s.ready;
    if (!s.currentUser) throw new Error("Please sign in first.");
  }
  return request(path, init, s.scope);
}
export function onAuthStateChanged(
  s: Session,
  cb: (u: SessionUser | null) => void,
) {
  s.listeners.add(cb);
  void s.ready.then(() => cb(s.currentUser));
  return () => {
    s.listeners.delete(cb);
  };
}
export async function signInWithEmailAndPassword(
  s: Session,
  email: string,
  password: string,
) {
  await s.ready;
  const r = await request(
    "auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password, scope: s.scope, web: true }),
    },
    s.scope,
  );
  emit(s, r.user);
  return { user: s.currentUser! };
}
export async function createUserWithEmailAndPassword(
  s: Session,
  email: string,
  password: string,
  phone: string,
) {
  await s.ready;
  const r = await request(
    "auth/signup",
    {
      method: "POST",
      body: JSON.stringify({ email, password, phone, web: true }),
    },
    s.scope,
  );
  emit(s, r.user);
  return { user: s.currentUser! };
}
export async function signOut(s: Session) {
  await request("auth/logout", { method: "POST" }, s.scope);
  emit(s, null);
}
export async function sendPasswordResetEmail(s: Session, email: string) {
  return request(
    "auth/reset-request",
    { method: "POST", body: JSON.stringify({ email }) },
    s.scope,
  );
}
