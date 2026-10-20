import { auth as sharedAuth, api as sharedApi } from "./firebase";

// Admin credentials never share the customer login or persist across reloads.
export const auth = () => sharedAuth("wn-admin");
export const api = (path: string, init: RequestInit = {}, authenticated = false) =>
  sharedApi(path, init, authenticated, "wn-admin");
