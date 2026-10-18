// Disposable Auth Emulator adapter. It never connects to Google's live identity endpoints.
import * as SecureStore from "expo-secure-store";
import type { AuthAdapter, Identity } from "./auth";
import { runtime, validateLocalUrl } from "./runtime";
const base = validateLocalUrl(runtime.testAuthUrl);
let idToken: string | null = null,
  refreshToken: string | null = null,
  expires = 0;
let user: Identity | null = null,
  pending: { sessionInfo: string; uid: string | null } | null = null;
const callbacks = new Set<(user: Identity | null) => void>();
const storage = "wh.local-test.auth";
function emit() {
  callbacks.forEach((callback) => callback(user));
}
async function request(action: string, body: unknown) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(
      `${base}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=demo-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    const result = await r.json();
    if (!r.ok)
      throw new Error(
        `Test auth: ${result.error?.message || "request failed"}`,
      );
    return result;
  } finally {
    clearTimeout(timer);
  }
}
async function loadIdentity() {
  if (!idToken) {
    user = null;
    emit();
    return;
  }
  const result = await request("lookup", { idToken }),
    record = result.users?.[0];
  if (!record) throw new Error("Test identity not found.");
  user = {
    uid: record.localId,
    email: record.email || null,
    emailVerified: !!record.emailVerified,
    phone: record.phoneNumber || null,
  };
  emit();
}
async function accept(result: {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}) {
  idToken = result.idToken;
  refreshToken = result.refreshToken;
  expires = Date.now() + Number(result.expiresIn || 3600) * 1000;
  await SecureStore.setItemAsync(storage, refreshToken);
  await loadIdentity();
}
async function token() {
  if (idToken && expires > Date.now() + 60000) return idToken;
  refreshToken ||= await SecureStore.getItemAsync(storage);
  if (!refreshToken) return null;
  const r = await fetch(
    `${base}/securetoken.googleapis.com/v1/token?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    },
  );
  const result = await r.json();
  if (!r.ok) throw new Error("Local test session expired. Sign in again.");
  idToken = result.id_token;
  refreshToken = result.refresh_token;
  expires = Date.now() + Number(result.expires_in) * 1000;
  return idToken;
}
export const localAuth: AuthAdapter = {
  subscribe(callback) {
    callbacks.add(callback);
    void (async () => {
      try {
        await token();
        await loadIdentity();
      } catch {
        user = null;
        idToken = null;
        refreshToken = null;
        await SecureStore.deleteItemAsync(storage);
        emit();
      }
    })();
    return () => {
      callbacks.delete(callback);
    };
  },
  token,
  async email(email, password, signup) {
    await accept(
      await request(signup ? "signUp" : "signInWithPassword", {
        email: email.trim(),
        password,
        returnSecureToken: true,
      }),
    );
  },
  async google() {
    throw new Error(
      "Google provider requires real Firebase setup. Use a local test email account here.",
    );
  },
  async apple() {
    throw new Error(
      "Apple provider requires real Firebase/Apple setup. Use a local test email account here.",
    );
  },
  async sendPhone(phone, link) {
    if (!/^\+[1-9]\d{6,14}$/.test(phone))
      throw new Error("Use international phone format.");
    const result = await request("sendVerificationCode", {
      phoneNumber: phone,
    });
    pending = {
      sessionInfo: result.sessionInfo,
      uid: link ? user?.uid || null : null,
    };
  },
  async confirmPhone(code) {
    if (!pending) throw new Error("Request a new test code.");
    if (pending.uid && pending.uid !== user?.uid)
      throw new Error("Account changed. Request a new test code.");
    await accept(
      await request("signInWithPhoneNumber", {
        sessionInfo: pending.sessionInfo,
        code,
        ...(pending.uid ? { idToken: await token() } : {}),
        returnSecureToken: true,
      }),
    );
    pending = null;
  },
  async addEmail(email, password) {
    await accept(
      await request("update", {
        idToken: await token(),
        email: email.trim(),
        password,
        returnSecureToken: true,
      }),
    );
    await localAuth.verifyEmail();
  },
  async verifyEmail() {
    await request("sendOobCode", {
      requestType: "VERIFY_EMAIL",
      idToken: await token(),
    });
  },
  async reset(email) {
    await request("sendOobCode", {
      requestType: "PASSWORD_RESET",
      email: email.trim(),
    });
  },
  async refresh() {
    await token();
    await loadIdentity();
  },
  async signOut() {
    await SecureStore.deleteItemAsync(storage);
    idToken = null;
    refreshToken = null;
    user = null;
    pending = null;
    emit();
  },
};
