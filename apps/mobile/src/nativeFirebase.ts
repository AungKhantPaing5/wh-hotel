import {
  getAuth,
  onIdTokenChanged,
  getIdToken,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  AppleAuthProvider,
  EmailAuthProvider,
  PhoneAuthProvider,
  signInWithCredential,
  signInWithPhoneNumber,
  verifyPhoneNumber,
  linkWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
  signOut,
  type FirebaseAuthTypes,
} from "@react-native-firebase/auth";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import {
  appleAuth,
  appleAuthAndroid,
} from "@invertase/react-native-apple-authentication";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import type { AuthAdapter, Identity } from "./auth";
const firebase = getAuth();
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});
let confirmation: FirebaseAuthTypes.ConfirmationResult | null = null;
let verificationId: string | null = null;
let linkUid: string | null = null;
function requiredUser() {
  const user = firebase.currentUser;
  if (!user) throw new Error("Sign in first.");
  return user;
}
function identity(user: FirebaseAuthTypes.User | null): Identity | null {
  return user
    ? {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        phone: user.phoneNumber,
      }
    : null;
}
const listeners = new Set<(user: Identity | null) => void>();
function emit() {
  for (const callback of listeners) callback(identity(firebase.currentUser));
}
export const nativeAuth: AuthAdapter = {
  subscribe(callback) {
    listeners.add(callback);
    const unsubscribe = onIdTokenChanged(firebase, (user) =>
      callback(identity(user)),
    );
    return () => {
      listeners.delete(callback);
      unsubscribe();
    };
  },
  async token() {
    return firebase.currentUser ? getIdToken(firebase.currentUser) : null;
  },
  async email(email, password, signup) {
    if (signup) {
      const result = await createUserWithEmailAndPassword(
        firebase,
        email.trim(),
        password,
      );
      await sendEmailVerification(result.user);
    } else await signInWithEmailAndPassword(firebase, email.trim(), password);
  },
  async google() {
    if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
      throw new Error("Configure the Google Web client ID first.");
    await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();
    if (!isSuccessResponse(result)) return;
    if (!result.data.idToken)
      throw new Error("Google did not return an ID token.");
    await signInWithCredential(
      firebase,
      GoogleAuthProvider.credential(result.data.idToken),
    );
  },
  async apple() {
    if (Platform.OS === "ios") {
      const result = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });
      if (!result.identityToken || !result.nonce)
        throw new Error("Apple sign-in did not return a credential.");
      await signInWithCredential(
        firebase,
        AppleAuthProvider.credential(result.identityToken, result.nonce),
      );
    } else {
      const clientId = process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;
      const redirectUri = process.env.EXPO_PUBLIC_APPLE_REDIRECT_URI;
      if (!clientId || !redirectUri)
        throw new Error(
          "Configure Apple Service ID and HTTPS redirect URI for Android.",
        );
      const nonce = Crypto.randomUUID();
      appleAuthAndroid.configure({
        clientId,
        redirectUri,
        responseType: appleAuthAndroid.ResponseType.ALL,
        scope: appleAuthAndroid.Scope.ALL,
        nonce,
        state: Crypto.randomUUID(),
      });
      const result = await appleAuthAndroid.signIn();
      if (!result.id_token)
        throw new Error("Apple sign-in did not return a token.");
      await signInWithCredential(
        firebase,
        AppleAuthProvider.credential(result.id_token, nonce),
      );
    }
  },
  async sendPhone(phone, link) {
    if (!/^\+[1-9]\d{6,14}$/.test(phone))
      throw new Error("Use international format, e.g. +959123456789.");
    confirmation = null;
    verificationId = null;
    linkUid = null;
    if (link) {
      const user = requiredUser();
      const snapshot = await verifyPhoneNumber(firebase, phone, 60);
      verificationId = snapshot.verificationId;
      linkUid = user.uid;
    } else confirmation = await signInWithPhoneNumber(firebase, phone);
  },
  async confirmPhone(code) {
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit SMS code.");
    if (verificationId) {
      const user = requiredUser();
      if (user.uid !== linkUid)
        throw new Error("Account changed. Send a new code.");
      await linkWithCredential(
        user,
        PhoneAuthProvider.credential(verificationId, code),
      );
      await reload(user);
      await getIdToken(user, true);
      emit();
    } else if (confirmation) await confirmation.confirm(code);
    else throw new Error("Request a new SMS code.");
    confirmation = null;
    verificationId = null;
    linkUid = null;
  },
  async addEmail(email, password) {
    const user = requiredUser();
    await linkWithCredential(
      user,
      EmailAuthProvider.credential(email.trim(), password),
    );
    await sendEmailVerification(user);
    await reload(user);
    emit();
  },
  async verifyEmail() {
    await sendEmailVerification(requiredUser());
  },
  async reset(email) {
    await sendPasswordResetEmail(firebase, email.trim());
  },
  async refresh() {
    const user = requiredUser();
    await reload(user);
    await getIdToken(user, true);
    emit();
  },
  async signOut() {
    confirmation = null;
    verificationId = null;
    linkUid = null;
    await signOut(firebase);
  },
};
