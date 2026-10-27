import * as SecureStore from "expo-secure-store";
import { runtime, validateLocalUrl } from "./runtime";
import { apiBase } from "./api";
export interface Identity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  mustChangePassword?: boolean;
}
export interface AuthAdapter {
  subscribe(cb: (u: Identity | null) => void): () => void;
  token(): Promise<string | null>;
  email(
    email: string,
    password: string,
    signup: boolean,
    phone?: string,
  ): Promise<void>;
  reset(email: string): Promise<void>;
  confirmReset(token: string, password: string): Promise<void>;
  changePassword(currentPassword: string, password: string): Promise<void>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}
export const localTestMode = runtime.localTest;
export const authEnabled = true;
let sessionToken: string | null = null,
  identity: Identity | null = null;
const callbacks = new Set<(u: Identity | null) => void>();
const emit = (u: Identity | null) => {
  identity = u;
  callbacks.forEach((cb) => cb(u));
};
async function call(path: string, body?: unknown) {
  const base = runtime.localTest
    ? validateLocalUrl(runtime.apiUrl)
    : apiBase(runtime.apiUrl);
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(`${base}/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-WN-Request": "1",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const d = await r.json();
    if (!r.ok)
      throw Error(
        typeof d.message === "string" ? d.message : "Request failed.",
      );
    return d;
  } finally {
    clearTimeout(timer);
  }
}
async function clear() {
  sessionToken = null;
  await SecureStore.deleteItemAsync("wn.session.v1");
  emit(null);
}
const ready = (async () => {
  try {
    sessionToken = await SecureStore.getItemAsync("wn.session.v1");
    if (sessionToken) {
      const r = await call("auth/session");
      emit(r.user);
    }
  } catch {
    await clear();
  }
})();
export const auth: AuthAdapter = {
  subscribe(cb) {
    callbacks.add(cb);
    void ready.then(() => cb(identity));
    return () => {
      callbacks.delete(cb);
    };
  },
  async token() {
    await ready;
    return sessionToken;
  },
  async email(email, password, signup, phone) {
    await ready;
    const r = await call(signup ? "auth/signup" : "auth/login", {
      email,
      password,
      phone,
      scope: "customer",
    });
    sessionToken = r.token;
    await SecureStore.setItemAsync("wn.session.v1", sessionToken!);
    emit(r.user);
  },
  async reset(email) {
    await call("auth/reset-request", { email });
  },
  async confirmReset(token, password) {
    await call("auth/reset", { token, password });
    await clear();
  },
  async changePassword(currentPassword, password) {
    await call("auth/password", { currentPassword, password });
    await clear();
  },
  async refresh() {
    const r = await call("auth/session");
    emit(r.user);
  },
  async signOut() {
    try {
      await call("auth/logout", {});
    } finally {
      await clear();
    }
  },
};
