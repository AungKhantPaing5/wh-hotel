import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  bookingFingerprint,
  effectiveStatus,
  hotelToday,
  money,
  nights,
  previewRooms,
  validateStay,
  type Booking,
} from "../src/domain";
const stay = { checkIn: "2026-10-20", checkOut: "2026-10-22", guests: 2 };
test("hotel date crosses midnight at Myanmar time, independent of phone timezone", () => {
  assert.equal(hotelToday(new Date("2026-10-15T17:29:59Z")), "2026-10-15");
  assert.equal(hotelToday(new Date("2026-10-15T17:30:00Z")), "2026-10-16");
});
test("validates actual calendar dates and stay bounds", () => {
  assert.equal(validateStay(stay, "2026-10-15"), null);
  for (const override of [
    { checkIn: "2026-02-30" },
    { checkOut: stay.checkIn },
    { checkOut: "2026-11-21" },
    { guests: 0 },
    { guests: 1.5 },
    { checkIn: "2026-10-14" },
  ]) {
    assert.ok(validateStay({ ...stay, ...override }, "2026-10-15"));
  }
  assert.equal(nights(stay), 2);
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});
test("money keeps exact minor units above JS safe integer range", () => {
  assert.equal(money("900719925474099301"), "9,007,199,254,740,993.01 MMK");
});
test("only temporary holds expire, confirmed bookings remain confirmed", () => {
  const booking = {
    expires_at: "2026-10-15T00:00:00Z",
    status: "PENDING_APPROVAL",
  } as Booking;
  assert.equal(
    effectiveStatus(booking, Date.parse("2026-10-15T00:00:00Z")),
    "EXPIRED",
  );
  assert.equal(
    effectiveStatus(
      { ...booking, status: "CONFIRMED" },
      Date.parse("2026-10-16"),
    ),
    "CONFIRMED",
  );
});
test("booking retry identity is scoped to UID and request details", () => {
  const room = previewRooms[0]!;
  const key = bookingFingerprint("uid-a", room, stay);
  assert.equal(key, bookingFingerprint("uid-a", room, { ...stay }));
  assert.notEqual(key, bookingFingerprint("uid-b", room, stay));
  assert.notEqual(
    key,
    bookingFingerprint("uid-a", room, { ...stay, guests: 1 }),
  );
});
