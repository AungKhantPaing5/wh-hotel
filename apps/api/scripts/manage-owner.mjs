import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Pool } from "pg";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
if (!stdin.isTTY)
  throw Error(
    "Run interactively: docker compose exec api node apps/api/scripts/manage-owner.mjs",
  );
const rl = createInterface({ input: stdin, output: stdout });
const email = (await rl.question("Owner email: ")).trim().toLowerCase();
rl.close();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error("Invalid email.");
async function hidden(prompt) {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    function handle(data) {
      for (const c of data.toString()) {
        if (c === "\u0003") {
          stdin.setRawMode(false);
          stdin.off("data", handle);
          reject(Error("Cancelled."));
          return;
        }
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.off("data", handle);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    }
    stdin.on("data", handle);
  });
}
const password = await hidden(
    "New owner password (hidden, 12–128 characters): ",
  ),
  repeat = await hidden("Repeat password (hidden): ");
stdin.pause();
if (password !== repeat || password.length < 12 || password.length > 128)
  throw Error("Passwords must match and have 12–128 characters.");
const salt = randomBytes(16).toString("hex"),
  hash = `scrypt$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`,
  pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  c = await pool.connect();
try {
  await c.query("BEGIN");
  const a = (
    await c.query(
      "INSERT INTO accounts(uid,email,password_hash,is_owner) VALUES($1,$2,$3,true) ON CONFLICT(email) DO UPDATE SET password_hash=$3,is_owner=true,disabled=false,must_change_password=false RETURNING uid",
      [randomUUID(), email, hash],
    )
  ).rows[0];
  await c.query("DELETE FROM account_sessions WHERE account_uid=$1", [a.uid]);
  await c.query("DELETE FROM password_resets WHERE account_uid=$1", [a.uid]);
  await c.query("COMMIT");
  console.log("Owner account saved. Sign in at /admin.");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
