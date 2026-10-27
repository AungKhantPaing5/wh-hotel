import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Patch,
  Param,
  Req,
  Res,
  BadRequestException,
  HttpException,
  ForbiddenException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import {
  user,
  owner,
  checkPassword,
  hashPassword,
  passwordValue,
  emailAddress,
  randomToken,
  digest,
  rateLimit,
} from "./accounts";
import { emailConfigured } from "./booking-email";
const safe = (r: any) => ({
  uid: r.uid,
  email: r.email,
  emailVerified: false,
  phone: null,
  mustChangePassword: r.must_change_password,
});
const scopeOf = (value: unknown) => (value === "admin" ? "admin" : "customer");
function setCookie(
  res: Response,
  token: string,
  scope: string,
  seconds: number,
) {
  res.setHeader(
    "Set-Cookie",
    `wn_${scope}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${seconds}${process.env.APP_ENV === "local-test" ? ";" : "; Secure"}`,
  );
  res.setHeader("Cache-Control", "no-store");
}
@Controller("v1")
export class AuthController {
  @Post("auth/signup") async signup(
    @Body() b: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await rateLimit("signup:" + req.ip, 40, 3600);
    const email = emailAddress(b.email),
      password = await hashPassword(b.password);
    if (
      typeof b.phone !== "string" ||
      b.phone.length !== 11 ||
      !/^09[0-9]{9}$/.test(b.phone)
    )
      throw new BadRequestException(
        "Phone must start with 09 and contain exactly 11 digits.",
      );
    const c = await db.connect();
    let a;
    try {
      await c.query("BEGIN");
      a = (
        await c.query(
          "INSERT INTO accounts(uid,email,password_hash) VALUES($1,$2,$3) RETURNING *",
          [randomUUID(), email, password],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO customer_contacts(firebase_uid,phone) VALUES($1,$2)",
        [a.uid, b.phone],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      if ((e as any).code === "23505")
        throw new BadRequestException(
          "Account could not be created. Try login or password recovery.",
        );
      throw e;
    } finally {
      c.release();
    }
    return this.session(a, "customer", b.web === true, res);
  }
  async session(
    a: any,
    scope: string,
    web: boolean,
    res: Response,
    query: any = db,
  ) {
    const token = randomToken(),
      seconds = scope === "admin" ? 28800 : 604800;
    await query.query(
      "INSERT INTO account_sessions(token_hash,account_uid,scope,expires_at) VALUES($1,$2,$3,now()+make_interval(secs=>$4))",
      [digest(token), a.uid, scope, seconds],
    );
    if (web) setCookie(res, token, scope, seconds);
    return { user: safe(a), ...(web ? {} : { token }) };
  }
  @Post("auth/login") async login(
    @Body() b: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = emailAddress(b.email);
    await rateLimit("login:" + email, 15);
    await rateLimit("login-ip:" + req.ip, 100);
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const a = (
        await c.query("SELECT * FROM accounts WHERE email=$1 FOR UPDATE", [
          email,
        ])
      ).rows[0];
      const okay = await checkPassword(b.password, a?.password_hash || null);
      if (!okay || a?.disabled)
        throw new HttpException("Email or password is incorrect.", 401);
      const scope = scopeOf(b.scope);
      if (
        scope === "admin" &&
        !a.is_owner &&
        !(
          await c.query(
            "SELECT 1 FROM staff_permissions WHERE firebase_uid=$1 AND cardinality(permissions)>0",
            [a.uid],
          )
        ).rowCount
      )
        throw new ForbiddenException(
          "This account does not have staff access.",
        );
      const result = await this.session(a, scope, b.web === true, res, c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  @Get("auth/session") async sessionInfo(@Headers("authorization") h: string) {
    return { user: safe(await user(h)) };
  }
  @Post("auth/logout") async logout(
    @Headers("authorization") h: string,
    @Headers("x-wn-scope") sc: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (h?.startsWith("Bearer "))
      await db.query("DELETE FROM account_sessions WHERE token_hash=$1", [
        digest(h.slice(7)),
      ]);
    setCookie(res, "", scopeOf(sc), 0);
    return { status: "signed_out" };
  }
  @Post("auth/password") async changePassword(
    @Headers("authorization") h: string,
    @Body() b: any,
  ) {
    const u = await user(h),
      hash = await hashPassword(b.password),
      c = await db.connect();
    try {
      await c.query("BEGIN");
      const a = (
        await c.query("SELECT * FROM accounts WHERE uid=$1 FOR UPDATE", [u.uid])
      ).rows[0];
      if (
        !a ||
        a.disabled ||
        !(await checkPassword(b.currentPassword, a.password_hash))
      )
        throw new BadRequestException("Current password is incorrect.");
      await c.query(
        "UPDATE accounts SET password_hash=$2,must_change_password=false WHERE uid=$1",
        [u.uid, hash],
      );
      await c.query("DELETE FROM account_sessions WHERE account_uid=$1", [
        u.uid,
      ]);
      await c.query("DELETE FROM password_resets WHERE account_uid=$1", [
        u.uid,
      ]);
      await c.query("COMMIT");
      return {
        status: "password_changed",
        message: "Password changed. Sign in again.",
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  @Post("auth/reset-request") async resetRequest(
    @Body() b: any,
    @Req() req: Request,
  ) {
    const email = emailAddress(b.email);
    await rateLimit("reset:" + email, 3, 3600);
    await rateLimit("reset-ip:" + req.ip, 30, 3600);
    if (!emailConfigured())
      throw new HttpException(
        "Email recovery is unavailable. Contact hotel administration.",
        503,
      );
    const a = (
      await db.query("SELECT * FROM accounts WHERE email=$1 AND NOT disabled", [
        email,
      ])
    ).rows[0];
    if (a) {
      const token = randomToken();
      await db.query("DELETE FROM password_resets WHERE account_uid=$1", [
        a.uid,
      ]);
      await db.query(
        "INSERT INTO password_resets(token_hash,account_uid,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
        [digest(token), a.uid],
      );
      const origin = process.env.WEB_ORIGIN || "";
      if (!/^https:\/\//.test(origin) && process.env.APP_ENV !== "local-test")
        throw new HttpException("Recovery URL is not configured.", 503);
      const link = `${origin}/reset-password#token=${token}`;
      if (
        process.env.EMAIL_TEST_MODE === "true" &&
        process.env.APP_ENV === "local-test"
      )
        await db.query(
          "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,'test.reset-email',$2)",
          [a.uid, JSON.stringify({ token, link })],
        );
      else {
        try {
          const port = Number(process.env.SMTP_PORT || 587);
          await nodemailer
            .createTransport({
              host: process.env.SMTP_HOST,
              port,
              secure: port === 465,
              requireTLS: port !== 465,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
              connectionTimeout: 10000,
              greetingTimeout: 10000,
              socketTimeout: 15000,
            })
            .sendMail({
              from: process.env.EMAIL_FROM,
              to: email,
              subject: "WN Hotel password recovery",
              text: `Open this link within 30 minutes:\n${link}\n\nIn the Android app, paste this recovery code:\n${token}\n\nIf you did not request this, ignore this message.`,
            });
        } catch {
          await db.query("DELETE FROM password_resets WHERE token_hash=$1", [
            digest(token),
          ]); /* generic response avoids leaking account existence */
        }
      }
    }
    return {
      message:
        "If the account exists, a recovery email will arrive. Check spam or contact the hotel.",
    };
  }
  @Post("auth/reset") async reset(@Body() b: any, @Req() req: Request) {
    await rateLimit("reset-consume:" + req.ip, 30);
    if (typeof b.token !== "string" || !/^[a-f0-9]{64}$/.test(b.token))
      throw new BadRequestException("Invalid recovery code.");
    const hash = await hashPassword(b.password),
      c = await db.connect();
    try {
      await c.query("BEGIN");
      const r = (
        await c.query(
          "SELECT p.account_uid FROM password_resets p JOIN accounts a ON a.uid=p.account_uid WHERE token_hash=$1 AND expires_at>now() AND NOT a.disabled FOR UPDATE OF p,a",
          [digest(b.token)],
        )
      ).rows[0];
      if (!r)
        throw new BadRequestException("Recovery code expired or already used.");
      await c.query(
        "UPDATE accounts SET password_hash=$2,must_change_password=false WHERE uid=$1",
        [r.account_uid, hash],
      );
      await c.query("DELETE FROM account_sessions WHERE account_uid=$1", [
        r.account_uid,
      ]);
      await c.query("DELETE FROM password_resets WHERE account_uid=$1", [
        r.account_uid,
      ]);
      await c.query("COMMIT");
      return { message: "Password reset. Sign in with your new password." };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  @Get("admin/accounts") async list(@Headers("authorization") h: string) {
    await owner(h);
    return (
      await db.query(
        "SELECT uid,email,disabled,is_owner,must_change_password,created_at FROM accounts ORDER BY created_at DESC LIMIT 500",
      )
    ).rows;
  }
  @Post("admin/accounts") async create(
    @Headers("authorization") h: string,
    @Body() b: any,
  ) {
    const u = await owner(h),
      email = emailAddress(b.email),
      hash = await hashPassword(b.password);
    try {
      const a = (
        await db.query(
          "INSERT INTO accounts(uid,email,password_hash,must_change_password) VALUES($1,$2,$3,true) RETURNING uid,email",
          [randomUUID(), email, hash],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,'account.create',$2)",
        [u.uid, JSON.stringify({ uid: a.uid, email })],
      );
      return a;
    } catch (e) {
      if ((e as any).code === "23505")
        throw new BadRequestException("Email already exists.");
      throw e;
    }
  }
  @Patch("admin/accounts/:uid") async update(
    @Headers("authorization") h: string,
    @Param("uid") uid: string,
    @Body() b: any,
  ) {
    const u = await owner(h);
    const email = b.email === undefined ? null : emailAddress(b.email),
      hash = b.password === undefined ? null : await hashPassword(b.password);
    if (b.disabled !== undefined && typeof b.disabled !== "boolean")
      throw new BadRequestException("Invalid account status.");
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const a = (
        await c.query("SELECT * FROM accounts WHERE uid=$1 FOR UPDATE", [uid])
      ).rows[0];
      if (!a || a.is_owner)
        throw new BadRequestException(
          "Use owner account tools for owner credentials.",
        );
      await c.query(
        "UPDATE accounts SET email=COALESCE($2,email),password_hash=COALESCE($3,password_hash),disabled=COALESCE($4,disabled),must_change_password=CASE WHEN $3::text IS NOT NULL THEN true ELSE must_change_password END WHERE uid=$1",
        [uid, email, hash, b.disabled ?? null],
      );
      await c.query("DELETE FROM account_sessions WHERE account_uid=$1", [uid]);
      await c.query("DELETE FROM password_resets WHERE account_uid=$1", [uid]);
      await c.query(
        "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,'account.update',$2)",
        [
          u.uid,
          JSON.stringify({
            uid,
            email,
            passwordChanged: Boolean(hash),
            disabled: b.disabled,
          }),
        ],
      );
      await c.query("COMMIT");
      return { status: "saved" };
    } catch (e) {
      await c.query("ROLLBACK");
      if ((e as any).code === "23505")
        throw new BadRequestException("Email already exists.");
      throw e;
    } finally {
      c.release();
    }
  }
}
