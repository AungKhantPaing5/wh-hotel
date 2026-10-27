import { Pool } from "pg";
import { scryptSync } from "node:crypto";
if (process.env.APP_ENV !== "local-test")
  throw Error("Disposable test seeding is disabled outside local-test.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const salt = "0123456789abcdef0123456789abcdef",
  hash = `scrypt$${salt}$${scryptSync("WhTestOnly2026!", salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
try {
  for (const [uid, email, phone, owner] of [
    ["wh-test-admin", "admin@wh.test", "09770000001", true],
    ["wh-test-guest", "guest@wh.test", "09770000002", false],
    ["wh-test-staff", "staff@wh.test", "09770000003", false],
    ["wh-test-no-phone", "nophone@wh.test", null, false],
  ]) {
    await pool.query(
      "INSERT INTO accounts(uid,email,password_hash,is_owner) VALUES($1,$2,$3,$4) ON CONFLICT(uid) DO UPDATE SET password_hash=$3,is_owner=$4,disabled=false,must_change_password=false",
      [uid, email, hash, owner],
    );
    if (phone)
      await pool.query(
        "INSERT INTO customer_contacts(firebase_uid,phone) VALUES($1,$2) ON CONFLICT(firebase_uid) DO UPDATE SET phone=$2",
        [uid, phone],
      );
  }
  console.log("Disposable test accounts ready.");
} finally {
  await pool.end();
}
