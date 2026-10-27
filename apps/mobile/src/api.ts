import { runtime, validateLocalUrl } from "./runtime";
import type { Booking, Room, Stay } from "./domain";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}
export function apiBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("Set a valid HTTPS API URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ApiError(
      "Set a valid HTTPS API URL without credentials, query or fragment.",
    );
  }
  return value.replace(/\/+$/, "");
}
export class WhApi {
  constructor(
    private base: string,
    private token: () => Promise<string | null>,
    private transport: typeof fetch = fetch,
  ) {}
  async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      authenticated?: boolean;
      key?: string;
    } = {},
  ): Promise<T> {
    const base = runtime.localTest
      ? validateLocalUrl(this.base)
      : apiBase(this.base);
    const headers: Record<string, string> = { Accept: "application/json", "X-WN-Request": "1" };
    if (options.authenticated) {
      const token = await this.token();
      if (!token) throw new ApiError("Sign in first.", 401);
      headers.Authorization = `Bearer ${token}`;
    }
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.key) headers["Idempotency-Key"] = options.key;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await this.transport(`${base}/${path}`, {
        method: options.method || "GET",
        headers,
        redirect: "error",
        signal: controller.signal,
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      const data = await response.json().catch(() => {
        throw new ApiError("Unexpected response from the hotel server.");
      });
      if (!response.ok)
        throw new ApiError(
          typeof data?.message === "string"
            ? data.message
            : "Hotel request failed. Try again.",
          response.status,
        );
      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        "Cannot reach the hotel. Check My bookings before retrying an uncertain request.",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  profile() {
    return this.request<{
      uid: string;
      phone: string | null;
      needsPhone: boolean;
      email: string | null;
    }>("me", { authenticated: true });
  }
  saveContact(phone: string) {
    return this.request("me/contact", {
      method: "PATCH",
      body: { phone },
      authenticated: true,
    });
  }
  rooms(stay?: Stay) {
    return this.request<Room[]>(
      stay
        ? `availability?checkIn=${encodeURIComponent(stay.checkIn)}&checkOut=${encodeURIComponent(stay.checkOut)}`
        : "rooms",
    );
  }
  bookings() {
    return this.request<Booking[]>("bookings", { authenticated: true });
  }
  book(room: Room, stay: Stay, key: string) {
    return this.request<Booking>("bookings", {
      method: "POST",
      authenticated: true,
      key,
      body: { roomTypeId: room.id, ...stay },
    });
  }
}
