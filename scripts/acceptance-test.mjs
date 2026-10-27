import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import sharp from "sharp";
if (process.env.APP_ENV !== "local-test")
  throw Error("Disposable testing only.");
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000/v1",
  db = new Pool({ connectionString: process.env.DATABASE_URL }),
  password = "WhTestOnly2026!";
async function call(path, token, method = "GET", body, key, status = 200) {
  const r = await fetch(`${base}/${path}`, {
    method,
    headers: {
      "X-WN-Request": "1",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
async function login(email, scope = "customer", pass = password) {
  return (
    await call(
      "auth/login",
      null,
      "POST",
      { email, password: pass, scope },
      undefined,
      201,
    )
  ).token;
}
try {
  const owner = await login("admin@wh.test", "admin"),
    guest = await login("guest@wh.test");
  assert.equal(
    (await call("admin/system", owner)).authProvider,
    "LOCAL_POSTGRESQL",
  );
  await call("admin/bookings", guest, "GET", null, null, 403);
  await call(
    "auth/login",
    null,
    "POST",
    { email: "guest@wh.test", password: "wrong" },
    null,
    401,
  );
  await call(
    "auth/signup",
    null,
    "POST",
    { email: "new@wh.test", password, phone: "08123456789" },
    null,
    400,
  );
  const email = `signup-${randomUUID()}@wh.test`,
    signed = await call(
      "auth/signup",
      null,
      "POST",
      { email, password, phone: "09123456789" },
      null,
      201,
    );
  assert.equal((await call("me", signed.token)).phone, "09123456789");
  await call(
    "admin/accounts",
    owner,
    "POST",
    { email: `new-staff-${randomUUID()}@wh.test`, password },
    null,
    201,
  );
  await call(
    "admin/staff",
    owner,
    "POST",
    {
      email: "staff@wh.test",
      permissions: ["kitchen.manage", "stays.manage", "bookings.manage"],
    },
    null,
    201,
  );
  const staff = await login("staff@wh.test", "admin");
  assert.ok((await call("me", staff)).permissions.includes("bookings.read"));
  await call("admin/accounts", staff, "GET", null, null, 403);
  console.log(
    "PASS local authentication, account creation and permission boundary",
  );
  const typeBody = {
    name: `Integration-${randomUUID()}`,
    description: "Test room",
    maxGuests: 2,
    nightlyAmountMinor: "2500000",
    amenities: ["Wi-Fi"],
    photoUrls: [],
    roomNumbers: [`T-${randomUUID()}`],
  };
  const type = await call(
    "admin/room-types",
    owner,
    "POST",
    typeBody,
    null,
    201,
  );
  const pixels = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#23875a" },
  })
    .png()
    .toBuffer();
  const photo = await call(
    `admin/room-types/${type.id}/photos`,
    owner,
    "POST",
    { data: pixels.toString("base64") },
    null,
    201,
  );
  const urls = Array.from(
    { length: 40 },
    (_, i) => `https://example.com/room-${i}.jpg`,
  );
  await call(`admin/room-types/${type.id}`, owner, "PATCH", {
    ...typeBody,
    photoUrls: urls,
  });
  await call(
    `admin/room-types/${type.id}`,
    owner,
    "PATCH",
    { ...typeBody, photoUrls: [...urls, "https://example.com/extra.jpg"] },
    null,
    400,
  );
  await call(`admin/room-types/${type.id}`, owner, "PATCH", {
    ...typeBody,
    photoUrls: [photo.url],
  });
  console.log("PASS room creation, safe image upload and 40-photo limit");
  const today = new Date(Date.now() + 390 * 60000).toISOString().slice(0, 10),
    out = new Date(Date.parse(today + "T00:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10),
    key = randomUUID(),
    body = { roomTypeId: type.id, checkIn: today, checkOut: out, guests: 1 };
  const booking = await call("bookings", guest, "POST", body, key, 201);
  assert.equal(
    (await call("bookings", guest, "POST", body, key, 201)).id,
    booking.id,
  );
  await call("bookings", guest, "POST", body, randomUUID(), 409);
  await call(`admin/bookings/${booking.id}`, owner, "PATCH", {
    action: "accept",
  });
  const until = Date.now() + 20000;
  let preview;
  while (Date.now() < until) {
    preview = (
      await db.query("SELECT * FROM booking_emails WHERE booking_id=$1", [
        booking.id,
      ])
    ).rows[0];
    if (preview?.status === "TEST_SENT") break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(preview?.status, "TEST_SENT");
  assert.equal(preview.test_preview.to, "guest@wh.test");
  await call(
    `admin/bookings/${booking.id}/stay`,
    staff,
    "POST",
    { action: "check-in" },
    null,
    400,
  );
  await call(
    `admin/bookings/${booking.id}/stay`,
    staff,
    "POST",
    { action: "confirm-payment", paymentReference: "cash-receipt-test" },
    null,
    201,
  );
  const dish = await call(
    "admin/kitchen/dishes",
    owner,
    "POST",
    {
      name: "Test curry",
      description: "Peanuts",
      active: true,
      priceMinor: "500000",
    },
    null,
    201,
  );
  await call(
    `admin/kitchen/dishes/${dish.id}`,
    staff,
    "PATCH",
    {
      name: "Test curry",
      description: "Peanuts",
      active: true,
      priceMinor: "1",
    },
    null,
    403,
  );
  const unpriced = await call(
    "admin/kitchen/dishes",
    staff,
    "POST",
    { name: "Staff special", description: "Admin will price", active: true },
    null,
    201,
  );
  assert.equal(unpriced.price_minor, null);
  assert.ok(!(await call("kitchen/menu")).some((d) => d.id === unpriced.id));
  await call(
    "kitchen/orders",
    guest,
    "POST",
    {
      bookingId: booking.id,
      items: [{ dishId: dish.id, quantity: 2 }],
      note: "",
    },
    randomUUID(),
    403,
  );
  await call(
    `admin/bookings/${booking.id}/stay`,
    staff,
    "POST",
    { action: "check-in" },
    null,
    201,
  );
  await call(
    `admin/bookings/${booking.id}/stay`,
    staff,
    "POST",
    { action: "check-in" },
    null,
    400,
  );
  const foodKey = randomUUID(),
    foodBody = {
      bookingId: booking.id,
      items: [{ dishId: dish.id, quantity: 2 }],
      note: "No extra salt",
      total_minor: "1",
    };
  const [order, repeat] = await Promise.all([
    call("kitchen/orders", guest, "POST", foodBody, foodKey, 201),
    call("kitchen/orders", guest, "POST", foodBody, foodKey, 201),
  ]);
  assert.equal(order.id, repeat.id);
  assert.equal(order.total_minor, "1000000");
  await call(
    "kitchen/orders",
    signed.token,
    "POST",
    foodBody,
    randomUUID(),
    403,
  );
  await call(
    `admin/bookings/${booking.id}/stay`,
    staff,
    "POST",
    { action: "check-out" },
    null,
    400,
  );
  await call(
    `admin/kitchen/orders/${order.id}`,
    staff,
    "PATCH",
    { status: "DELIVERED" },
    null,
    400,
  );
  for (const status of ["PREPARING", "READY", "DELIVERED"])
    await call(`admin/kitchen/orders/${order.id}`, staff, "PATCH", { status });
  await call(
    `admin/bookings/${booking.id}/stay`,
    staff,
    "POST",
    { action: "check-out" },
    null,
    201,
  );
  await call("kitchen/orders", guest, "POST", foodBody, randomUUID(), 403);
  const history = await call("bookings", guest);
  assert.ok(history.find((b) => b.id === booking.id).checked_out_at);
  console.log(
    "PASS approval email, manual settlement, check-in, food idempotency/pricing, status transitions and check-out gate",
  );
  await call("auth/reset-request", null, "POST", { email }, null, 201);
  const reset = (
    await db.query(
      "SELECT details FROM admin_activity WHERE actor_uid=$1 AND action='test.reset-email' ORDER BY id DESC LIMIT 1",
      [signed.user.uid],
    )
  ).rows[0].details;
  await call(
    "auth/reset",
    null,
    "POST",
    { token: reset.token, password: "NewHotelPassword2026!" },
    null,
    201,
  );
  await call("me", signed.token, "GET", null, null, 401);
  await call(
    "auth/reset",
    null,
    "POST",
    { token: reset.token, password: "DifferentPassword2026!" },
    null,
    400,
  );
  const fresh = await login(email, "customer", "NewHotelPassword2026!");
  await call(`admin/accounts/${signed.user.uid}`, owner, "PATCH", {
    email: `changed-${randomUUID()}@wh.test`,
    password: "TemporaryPassword2026!",
  });
  await call("me", fresh, "GET", null, null, 401);
  const a = (
    await db.query("SELECT * FROM accounts WHERE uid=$1", [signed.user.uid])
  ).rows[0];
  assert.ok(a.must_change_password);
  assert.ok(!a.password_hash.includes("TemporaryPassword"));
  const temp = await login(a.email, "customer", "TemporaryPassword2026!");
  await call("bookings", temp, "POST", body, randomUUID(), 403);
  await call(
    "auth/password",
    temp,
    "POST",
    {
      currentPassword: "TemporaryPassword2026!",
      password: "PermanentPassword2026!",
    },
    null,
    201,
  );
  await call("me", temp, "GET", null, null, 401);
  const permanent = await login(a.email, "customer", "PermanentPassword2026!");
  await call(`admin/accounts/${a.uid}`, owner, "PATCH", { disabled: true });
  await call("me", permanent, "GET", null, null, 401);
  const cookieLogin = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-WN-Request": "1" },
    body: JSON.stringify({ email: "guest@wh.test", password, web: true }),
  });
  assert.match(
    cookieLogin.headers.get("set-cookie"),
    /HttpOnly; SameSite=Strict/,
  );
  assert.equal((await cookieLogin.json()).token, undefined);
  console.log(
    "PASS single-use recovery, session revocation, admin credential control and HttpOnly web sessions",
  );
} finally {
  await db.end();
}
