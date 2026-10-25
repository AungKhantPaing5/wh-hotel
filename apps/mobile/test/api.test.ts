import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, WhApi, apiBase } from "../src/api";
import { previewRooms } from "../src/domain";
test("rejects insecure or credential-bearing API URLs", () => {
  for (const url of [
    "",
    "http://hotel.example/api",
    "https://user:pass@hotel.example",
    "https://hotel.example?x=1",
    "https://hotel.example/#x",
  ]) {
    assert.throws(() => apiBase(url), ApiError);
  }
  assert.equal(
    apiBase("https://hotel.example/api/"),
    "https://hotel.example/api",
  );
});
test("booking sends Firebase token and stable idempotency key; rejects redirects", async () => {
  let request: RequestInit | undefined;
  let requestedUrl = "";
  const api = new WhApi(
    "https://hotel.example/api",
    async () => "firebase-token",
    async (url, options) => {
      requestedUrl = String(url);
      request = options;
      return new Response(
        JSON.stringify({ id: "server-booking", total_amount_minor: "12300" }),
        { status: 201 },
      );
    },
  );
  const result = await api.book(
    previewRooms[0]!,
    { checkIn: "2026-10-20", checkOut: "2026-10-22", guests: 2 },
    "stable-request-key",
  );
  assert.equal(result.id, "server-booking");
  assert.equal(requestedUrl, "https://hotel.example/api/bookings");
  assert.equal(request?.redirect, "error");
  assert.equal(
    (request?.headers as Record<string, string>).Authorization,
    "Bearer firebase-token",
  );
  assert.equal(
    (request?.headers as Record<string, string>)["Idempotency-Key"],
    "stable-request-key",
  );
  assert.deepEqual(JSON.parse(request?.body as string), {
    roomTypeId: 1,
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    guests: 2,
  });
});
test("requires authentication before network request and preserves server conflict", async () => {
  const noAuth = new WhApi(
    "https://hotel.example/api",
    async () => null,
    async () => {
      throw new Error("must not call");
    },
  );
  await assert.rejects(
    () => noAuth.bookings(),
    (e: ApiError) => e.status === 401,
  );
  const conflict = new WhApi(
    "https://hotel.example/api",
    async () => "token",
    async () =>
      new Response(JSON.stringify({ message: "No room available." }), {
        status: 409,
      }),
  );
  await assert.rejects(
    () => conflict.bookings(),
    (e: ApiError) => e.status === 409 && e.message === "No room available.",
  );
});
test("does not turn a server failure into preview or payment success", async () => {
  const api = new WhApi(
    "https://hotel.example/api",
    async () => "token",
    async () => new Response("<html>bad gateway</html>", { status: 502 }),
  );
  await assert.rejects(() => api.rooms(), /Unexpected response/);
});

test("native account contact is saved against the authenticated backend without SMS", async () => {
  let url = "",
    body: RequestInit | undefined;
  const api = new WhApi(
    "https://hotel.example/api",
    async () => "firebase-token",
    async (input, options) => {
      url = String(input);
      body = options;
      return new Response(
        JSON.stringify({ phone: "09123456789", needsPhone: false }),
        { status: 200 },
      );
    },
  );
  await api.saveContact("09123456789");
  assert.equal(url, "https://hotel.example/api/me/contact");
  assert.equal(body?.method, "PATCH");
  assert.equal(
    (body?.headers as Record<string, string>).Authorization,
    "Bearer firebase-token",
  );
  assert.deepEqual(JSON.parse(String(body?.body)), { phone: "09123456789" });
});
