import { test } from "node:test";
import assert from "node:assert/strict";
import { profileDetails } from "../src/profile-controller";
test("self profile accepts contact fields and rejects role/identity changes", () => {
  const p = { fullName: " Guest ", phone: "09123456789", address: " Yangon " };
  assert.equal(profileDetails(p).fullName, "Guest");
  assert.equal(profileDetails(p).address, "Yangon");
  for (const extra of [
    { uid: "other" },
    { email: "other@hotel.test" },
    { permissions: ["rooms.manage"] },
    { isOwner: true },
    { jobTitle: "Manager" },
    { department: "Management" },
    { avatarUrl: "https://evil.test" },
  ])
    assert.throws(() => profileDetails({ ...p, ...extra }));
  for (const phone of ["08123456789", "0912345678", "09123456789\n"])
    assert.throws(() => profileDetails({ ...p, phone }));
  assert.equal(
    profileDetails({ ...p, jobTitle: "Chef", department: "Kitchen" }, true)
      .jobTitle,
    "Chef",
  );
});
