import { auth as sharedAuth, api as sharedApi } from "./session";
export const auth = () => sharedAuth("wn-admin");
export const api = (
  path: string,
  init: RequestInit = {},
  authenticated = false,
) => sharedApi(path, init, authenticated, "wn-admin");
