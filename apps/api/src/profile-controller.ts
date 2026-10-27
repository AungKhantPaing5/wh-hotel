import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Param,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { db } from "./db";
import { user, owner, grants } from "./accounts";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
export function profileDetails(b: any, managed = false) {
  if (
    !b ||
    typeof b.fullName !== "string" ||
    b.fullName.length > 100 ||
    typeof b.address !== "string" ||
    b.address.length > 500 ||
    typeof b.phone !== "string" ||
    b.phone.length !== 11 ||
    !/^09[0-9]{9}$/.test(b.phone)
  )
    throw new BadRequestException(
      "Enter a name (up to 100 characters), address (up to 500) and an 11-digit phone starting with 09.",
    );
  if (
    !managed &&
    [
      "jobTitle",
      "department",
      "permissions",
      "isOwner",
      "email",
      "uid",
      "avatarUrl",
    ].some((k) => Object.hasOwn(b, k))
  )
    throw new BadRequestException(
      "Account email, role, staff details and avatar use separate controls.",
    );
  if (
    managed &&
    ((b.jobTitle !== undefined &&
      (typeof b.jobTitle !== "string" || b.jobTitle.length > 100)) ||
      (b.department !== undefined &&
        (typeof b.department !== "string" || b.department.length > 100)))
  )
    throw new BadRequestException(
      "Staff title and department must be at most 100 characters.",
    );
  return {
    fullName: b.fullName.trim(),
    address: b.address.trim(),
    phone: b.phone,
    jobTitle: b.jobTitle ?? null,
    department: b.department ?? null,
  };
}
async function readProfile(uid: string) {
  const a = (
    await db.query(
      `SELECT a.uid,a.email,a.is_owner,a.created_at,p.full_name,p.address,p.avatar_url,p.job_title,p.department,c.phone FROM accounts a LEFT JOIN account_profiles p ON p.account_uid=a.uid LEFT JOIN customer_contacts c ON c.firebase_uid=a.uid WHERE a.uid=$1`,
      [uid],
    )
  ).rows[0];
  if (!a) throw new NotFoundException("Account not found.");
  return {
    uid: a.uid,
    email: a.email,
    fullName: a.full_name || "",
    address: a.address || "",
    avatarUrl: a.avatar_url || null,
    phone: a.phone || "",
    jobTitle: a.job_title || "",
    department: a.department || "",
    isOwner: a.is_owner,
    permissions: await grants(uid),
    joinedAt: a.created_at,
  };
}
async function saveProfile(
  uid: string,
  b: any,
  actor: string,
  managed = false,
) {
  const d = profileDetails(b, managed),
    c = await db.connect();
  try {
    await c.query("BEGIN");
    if (
      !(
        await c.query("SELECT uid FROM accounts WHERE uid=$1 FOR UPDATE", [uid])
      ).rowCount
    )
      throw new NotFoundException();
    await c.query(
      `INSERT INTO account_profiles(account_uid,full_name,address,job_title,department) VALUES($1,$2,$3,COALESCE($4,''),COALESCE($5,'')) ON CONFLICT(account_uid) DO UPDATE SET full_name=$2,address=$3,job_title=COALESCE($4,account_profiles.job_title),department=COALESCE($5,account_profiles.department),updated_at=now()`,
      [uid, d.fullName, d.address, d.jobTitle, d.department],
    );
    await c.query(
      "INSERT INTO customer_contacts(firebase_uid,phone) VALUES($1,$2) ON CONFLICT(firebase_uid) DO UPDATE SET phone=$2,updated_at=now()",
      [uid, d.phone],
    );
    await c.query(
      "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,$2,$3)",
      [
        actor,
        managed ? "profile.admin-update" : "profile.self-update",
        JSON.stringify({ uid }),
      ],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return readProfile(uid);
}
@Controller("v1")
export class ProfileController {
  @Get("me/profile") async mine(@Headers("authorization") h: string) {
    const u = await user(h);
    return readProfile(u.uid);
  }
  @Patch("me/profile") async update(
    @Headers("authorization") h: string,
    @Body() b: any,
  ) {
    const u = await user(h);
    return saveProfile(u.uid, b, u.uid);
  }
  @Get("admin/accounts/:uid/profile") async managed(
    @Headers("authorization") h: string,
    @Param("uid") uid: string,
  ) {
    await owner(h);
    return readProfile(uid);
  }
  @Patch("admin/accounts/:uid/profile") async manage(
    @Headers("authorization") h: string,
    @Param("uid") uid: string,
    @Body() b: any,
  ) {
    const u = await owner(h);
    return saveProfile(uid, b, u.uid, true);
  }
  @Post("me/profile/photo") async photo(
    @Headers("authorization") h: string,
    @Body() b: any,
  ) {
    const u = await user(h);
    if (
      typeof b.data !== "string" ||
      b.data.length > 7000000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)
    )
      throw new BadRequestException(
        "Choose a JPEG, PNG or WebP photo up to 5 MiB.",
      );
    const bytes = Buffer.from(b.data, "base64");
    if (
      !bytes.length ||
      bytes.length > 5 * 1024 * 1024 ||
      bytes.toString("base64") !== b.data
    )
      throw new BadRequestException("Invalid image.");
    let output: Buffer;
    try {
      const image = sharp(bytes, {
          limitInputPixels: 20000000,
          animated: false,
        }),
        m = await image.metadata();
      if (
        !["jpeg", "png", "webp"].includes(m.format || "") ||
        (m.pages || 1) > 1
      )
        throw Error();
      output = await image
        .rotate()
        .resize(640, 640, { fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        "Image is unsupported, damaged or exceeds 20 megapixels.",
      );
    }
    const name = createHash("sha256").update(output).digest("hex") + ".webp",
      dir = resolve(process.env.PHOTO_DIRECTORY || "/app/uploads"),
      url = "/api/photos/" + name;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), output, { mode: 0o644 });
    await db.query(
      "INSERT INTO account_profiles(account_uid,avatar_url) VALUES($1,$2) ON CONFLICT(account_uid) DO UPDATE SET avatar_url=$2,updated_at=now()",
      [u.uid, url],
    );
    return readProfile(u.uid);
  }
}
