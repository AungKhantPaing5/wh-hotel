export interface RuntimeConfig {
  localTest: boolean;
  apiUrl: string;
}
export function validateLocalUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname;
  const octets = host.split(".");
  const ipv4 =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) &&
    octets.every((n) => Number(n) <= 255);
  const privateHost =
    host === "localhost" ||
    (ipv4 &&
      (host === "127.0.0.1" ||
        Number(octets[0]) === 10 ||
        (Number(octets[0]) === 192 && Number(octets[1]) === 168) ||
        (Number(octets[0]) === 172 &&
          Number(octets[1]) >= 16 &&
          Number(octets[1]) <= 31)));
  if (
    url.protocol !== "http:" ||
    !privateHost ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use an HTTP address on your private Wi-Fi / SSH tunnel. Public test-server addresses are not allowed.",
    );
  }
  return url.toString().replace(/\/+$/, "");
}
export const runtime: RuntimeConfig = {
  localTest: process.env.EXPO_PUBLIC_LOCAL_TEST === "true",
  apiUrl: process.env.EXPO_PUBLIC_API_URL || "",
};
export function configurePrivateTest(apiUrl: string): void {
  const api = validateLocalUrl(apiUrl.trim());
  runtime.apiUrl = api;
  runtime.localTest = true;
}
export function photoAddress(value: string, base = runtime.apiUrl): string {
  if (value.startsWith("/api/photos/")) {
    const url = new URL(base);
    if (url.pathname.replace(/\/+$/, "").endsWith("/v1"))
      return base.replace(/\/+$/, "") + value.slice(4);
    return url.origin + value;
  }
  return value;
}
