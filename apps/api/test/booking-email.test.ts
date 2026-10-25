import test from "node:test";
import assert from "node:assert/strict";
import { approvalMessage } from "../src/booking-email";
test("approval emails distinguish payment-pending approval from confirmed payment", () => {
  const message = approvalMessage({
    id: "booking-reference",
    guest_email: "guest@example.com",
    room_number: "201",
    room_type: "Deluxe",
    check_in: "2026-11-01",
    check_out: "2026-11-03",
    total_amount_minor: "17000000",
    currency: "MMK",
    expires_at: "2026-11-01T10:00:00Z",
  });
  assert.match(message.subject, /booking request approved/);
  for (const detail of [
    "booking-reference",
    "201",
    "Deluxe",
    "2026-11-01",
    "2026-11-03",
    "170,000 MMK",
    "not a paid booking confirmation",
    "2026-11-01T10:00:00.000Z",
  ])
    assert.ok(message.text.includes(detail));
});
