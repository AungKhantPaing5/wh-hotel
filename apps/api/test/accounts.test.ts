import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  checkPassword,
  emailAddress,
  passwordValue,
} from "../src/accounts";
import { dishDetails, foodItems } from "../src/kitchen";
test("password hashes use independent salts, verify correctly and reject malformed hashes", async () => {
  const a = await hashPassword("SecureHotel2026!"),
    b = await hashPassword("SecureHotel2026!");
  assert.notEqual(a, b);
  assert.ok(!a.includes("SecureHotel2026!"));
  assert.equal(await checkPassword("SecureHotel2026!", a), true);
  assert.equal(await checkPassword("wrong password", a), false);
  assert.equal(await checkPassword("SecureHotel2026!", null), false);
  assert.throws(() => passwordValue("short"));
  assert.equal(emailAddress(" Guest@WN.TEST "), "guest@wn.test");
});
test("kitchen staff cannot submit prices, even when submitting an unchanged price", () => {
  const dish = {
    name: " Curry ",
    description: "Contains peanuts",
    active: true,
  };
  assert.deepEqual(dishDetails(dish, false), {
    name: "Curry",
    description: "Contains peanuts",
    active: true,
    photo: null,
    price: null,
  });
  assert.throws(
    () => dishDetails({ ...dish, priceMinor: "0" }, false),
    /Only the hotel admin/,
  );
  assert.equal(
    dishDetails({ ...dish, priceMinor: "120000" }, true).price,
    "120000",
  );
  assert.throws(() => dishDetails({ ...dish, priceMinor: "-1" }, true));
});
test("food quantities are bounded and duplicate lines cannot distort billing", () => {
  assert.throws(() =>
    foodItems([
      { dishId: 1, quantity: 1 },
      { dishId: 1, quantity: 2 },
    ]),
  );
  assert.throws(() => foodItems([{ dishId: 1, quantity: 21 }]));
  assert.throws(() => foodItems([]));
  assert.deepEqual(
    foodItems([
      { dishId: 2, quantity: 2 },
      { dishId: 1, quantity: 1 },
    ]),
    [
      { dishId: 1, quantity: 1 },
      { dishId: 2, quantity: 2 },
    ],
  );
});

test(
  "legacy migration imports only a one-to-one account/email mapping",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { Pool } = await import("pg");
    const { readFile } = await import("node:fs/promises");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL }),
      c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "CREATE TEMP TABLE bookings(firebase_uid text,guest_email text) ON COMMIT DROP",
      );
      await c.query(
        "CREATE TEMP TABLE accounts(uid text PRIMARY KEY,email text UNIQUE) ON COMMIT DROP",
      );
      await c.query(
        "INSERT INTO bookings VALUES('safe','Guest@hotel.test'),('safe','guest@hotel.test'),('changed','old@hotel.test'),('changed','new@hotel.test'),('duplicate-a','shared@hotel.test'),('duplicate-b','shared@hotel.test')",
      );
      const sql = await readFile(
        new URL("../sql/005.sql", import.meta.url),
        "utf8",
      );
      await c.query(
        sql.slice(
          sql.indexOf("WITH identities AS"),
          sql.indexOf("CREATE TABLE account_sessions"),
        ),
      );
      assert.deepEqual(
        (await c.query("SELECT uid,email FROM accounts ORDER BY uid")).rows,
        [{ uid: "safe", email: "guest@hotel.test" }],
      );
    } finally {
      await c.query("ROLLBACK");
      c.release();
      await pool.end();
    }
  },
);

 test('password policy accepts six characters and rejects five',async()=>{assert.equal(passwordValue('123456'),'123456');assert.throws(()=>passwordValue('12345'));const hash=await hashPassword('123456');assert.equal(await checkPassword('123456',hash),true);});
