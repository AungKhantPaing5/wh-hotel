import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { db } from "./db";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("hex");
export function emailAddress(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw new BadRequestException("Enter a valid email address.");
  return value.trim().toLowerCase();
}
export function passwordValue(value: unknown): string {
  if (typeof value !== "string" || value.length < 6 || value.length > 128)
    throw new BadRequestException("Use a password with 6–128 characters.");
  return value;
}
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (e, key) => (e ? reject(e) : resolve(key)),
    ),
  );
}
export async function hashPassword(value: unknown) {
  const password = passwordValue(value),
    salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function checkPassword(value: unknown, stored: string | null) {
  const password =
    typeof value === "string" && value.length <= 128 ? value : "";
  const parts = stored?.split("$");
  const valid =
    parts?.length === 3 &&
    parts[0] === "scrypt" &&
    /^[a-f0-9]{128}$/.test(parts[2]);
  const key = await derive(
    password,
    valid ? parts![1] : "00000000000000000000000000000000",
  );
  return Boolean(valid && timingSafeEqual(key, Buffer.from(parts![2], "hex")));
}
export async function rateLimit(bucket: string, max = 10, seconds = 900) {
  const r = (
    await db.query(
      `INSERT INTO auth_limits(bucket,attempts,expires_at) VALUES($1,1,now()+make_interval(secs=>$2)) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN auth_limits.expires_at<=now() THEN 1 ELSE auth_limits.attempts+1 END,expires_at=CASE WHEN auth_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE auth_limits.expires_at END RETURNING attempts`,
      [digest(bucket), seconds],
    )
  ).rows[0];
  if (r.attempts > max)
    throw new HttpException("Too many attempts. Please try again later.", 429);
}
export async function user(authorization?: string) {
  if (!authorization?.startsWith("Bearer "))
    throw new UnauthorizedException("Please sign in.");
  const token = authorization.slice(7);
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new UnauthorizedException("Please sign in again.");
  const r = (
    await db.query(
      `SELECT a.uid,a.email,a.is_owner,a.must_change_password,s.scope FROM account_sessions s JOIN accounts a ON a.uid=s.account_uid WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT a.disabled`,
      [digest(token)],
    )
  ).rows[0];
  if (!r)
    throw new UnauthorizedException("Session expired. Please sign in again.");
  return r;
}
export async function owner(authorization?: string) {
  const current = await user(authorization);
  if (!current.is_owner || current.scope !== "admin")
    throw new ForbiddenException();
  return current;
}
export const permissionNames = [
  "bookings.read",
  "bookings.manage",
  "stays.manage",
  "rooms.manage",
  "payments.read",
  "kitchen.manage",
] as const;
export async function grants(uid: string) {
  const a = (
    await db.query(
      "SELECT is_owner FROM accounts WHERE uid=$1 AND NOT disabled",
      [uid],
    )
  ).rows[0];
  if (a?.is_owner) return [...permissionNames];
  return (
    (
      await db.query(
        "SELECT permissions FROM staff_permissions WHERE firebase_uid=$1",
        [uid],
      )
    ).rows[0]?.permissions || []
  );
}
export async function admin(
  authorization?: string,
  permission = "bookings.read",
) {
  const current = await user(authorization);
  if (
    current.scope !== "admin" ||
    current.must_change_password ||
    !(await grants(current.uid)).includes(permission)
  )
    throw new ForbiddenException(
      "This action requires permission. Change your temporary password first if required.",
    );
  return current;
}
export async function accountProfile(uid: string) {
  const r = (
    await db.query("SELECT uid,email FROM accounts WHERE uid=$1", [uid])
  ).rows[0];
  if (!r) throw new UnauthorizedException();
  return { ...r, emailVerified: false, phoneNumber: undefined };
}
