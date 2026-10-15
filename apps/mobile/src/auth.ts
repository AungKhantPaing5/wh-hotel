export interface Identity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
}
export interface AuthAdapter {
  subscribe(callback: (user: Identity | null) => void): () => void;
  token(): Promise<string | null>;
  email(email: string, password: string, signup: boolean): Promise<void>;
  google(): Promise<void>;
  apple(): Promise<void>;
  sendPhone(phone: string, link: boolean): Promise<void>;
  confirmPhone(code: string): Promise<void>;
  addEmail(email: string, password: string): Promise<void>;
  verifyEmail(): Promise<void>;
  reset(email: string): Promise<void>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}
export const localTestMode = process.env.EXPO_PUBLIC_LOCAL_TEST === "true";
export const authEnabled = process.env.EXPO_PUBLIC_AUTH_ENABLED === "true";
if (localTestMode && authEnabled)
  throw new Error(
    "Local testing and live authentication cannot be enabled together.",
  );
export const auth: AuthAdapter | null = localTestMode
  ? require("./localTest").localAuth
  : authEnabled
    ? require("./nativeFirebase").nativeAuth
    : null;
