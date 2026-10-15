import "reflect-metadata";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Module,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { validateStay } from "./dates";

if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST &&
  (process.env.APP_ENV !== "local-test" ||
    process.env.FIREBASE_PROJECT_ID !== "demo-wh-final")
) {
  throw new Error(
    "Firebase emulator is allowed only in the isolated demo-wh-final local-test environment.",
  );
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.FIREBASE_PROJECT_ID) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

async function user(authorization?: string) {
  if (!process.env.FIREBASE_PROJECT_ID)
    throw new HttpException("Authentication is not configured.", 503);
  if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException();
  try {
    return await getAuth().verifyIdToken(authorization.slice(7), true);
  } catch {
    throw new UnauthorizedException("Please sign in again.");
  }
}

const permissions = [
  "bookings.read",
  "bookings.manage",
  "rooms.manage",
  "payments.read",
] as const;
function isOwner(uid: string) {
  return (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(uid);
}
async function grants(uid: string): Promise<string[]> {
  if (isOwner(uid)) return [...permissions];
  return (
    (
      await db.query(
        "SELECT permissions FROM staff_permissions WHERE firebase_uid=$1",
        [uid],
      )
    ).rows[0]?.permissions || []
  );
}
async function admin(authorization?: string, permission = "bookings.read") {
  const current = await user(authorization);
  if (!(await grants(current.uid)).includes(permission))
    throw new ForbiddenException();
  return current;
}
async function owner(authorization?: string) {
  const current = await user(authorization);
  if (!isOwner(current.uid)) throw new ForbiddenException();
  return current;
}
function id(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new BadRequestException("Invalid ID");
  return value;
}

function stay(a: unknown, b: unknown) {
  try {
    return validateStay(a, b);
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}

@Controller("v1")
class ApiController {
  @Get("health/live") live() {
    return { status: "ok", hotel: "WH" };
  }

  @Get("health/ready") async ready() {
    await db.query("SELECT 1 FROM room_types LIMIT 1");
    return { status: "ready" };
  }

  @Get("rooms") async rooms() {
    return (
      await db.query("SELECT * FROM room_types ORDER BY nightly_amount_minor")
    ).rows;
  }

  @Get("availability") async availability(
    @Query("checkIn") a: string,
    @Query("checkOut") b: string,
  ) {
    const [checkIn, checkOut] = stay(a, b);
    return (
      await db.query(
        `
      SELECT t.*, count(r.id)::int AS available_rooms FROM room_types t
      LEFT JOIN rooms r ON r.room_type_id=t.id AND r.active=true AND NOT EXISTS (
        SELECT 1 FROM bookings b WHERE b.room_id=r.id
        AND b.status IN ('PENDING_APPROVAL','AWAITING_PAYMENT','CONFIRMED')
        AND (b.status='CONFIRMED' OR b.expires_at>now())
        AND daterange(b.check_in,b.check_out,'[)') && daterange($1::date,$2::date,'[)')
      ) GROUP BY t.id ORDER BY t.nightly_amount_minor`,
        [checkIn, checkOut],
      )
    ).rows;
  }

  @Get("me") async me(@Headers("authorization") authorization?: string) {
    const identity = await user(authorization);
    const profile = await getAuth().getUser(identity.uid);
    return {
      uid: identity.uid,
      email: profile.email,
      emailVerified: profile.emailVerified,
      phone: profile.phoneNumber,
      needsEmail: !profile.email || !profile.emailVerified,
      needsPhone: !profile.phoneNumber,
      permissions: await grants(identity.uid),
      isOwner: isOwner(identity.uid),
    };
  }

  @Get("bookings") async bookings(
    @Headers("authorization") authorization?: string,
  ) {
    const identity = await user(authorization);
    return (
      await db.query(
        "SELECT * FROM bookings WHERE firebase_uid=$1 ORDER BY created_at DESC",
        [identity.uid],
      )
    ).rows;
  }

  @Post("bookings") async book(
    @Headers("authorization") authorization: string,
    @Headers("idempotency-key") key: string,
    @Body()
    body: {
      roomTypeId?: number;
      checkIn?: string;
      checkOut?: string;
      guests?: number;
    },
  ) {
    const identity = await user(authorization);
    const profile = await getAuth().getUser(identity.uid);
    if (!profile.phoneNumber)
      throw new ForbiddenException("Verify a phone number before booking.");
    if (typeof key !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
      throw new BadRequestException("A valid Idempotency-Key is required.");
    const [checkIn, checkOut] = stay(body.checkIn, body.checkOut);
    if (
      !Number.isInteger(body.roomTypeId) ||
      !Number.isInteger(body.guests) ||
      body.guests! < 1
    ) {
      throw new BadRequestException("Select a room type and guest count.");
    }
    const fingerprint = JSON.stringify([
      body.roomTypeId,
      checkIn,
      checkOut,
      body.guests,
    ]);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Serialize retries for the same user/key across API instances.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [identity.uid + ":" + key],
      );
      const old = (
        await client.query(
          "SELECT * FROM bookings WHERE firebase_uid=$1 AND idempotency_key=$2",
          [identity.uid, key],
        )
      ).rows[0];
      if (old) {
        if (old.request_fingerprint !== fingerprint)
          throw new HttpException(
            "Idempotency key used for different request.",
            409,
          );
        await client.query("COMMIT");
        return old;
      }
      await client.query(
        "UPDATE bookings SET status='EXPIRED' WHERE status IN ('PENDING_APPROVAL','AWAITING_PAYMENT') AND expires_at<=now()",
      );
      const type = (
        await client.query("SELECT * FROM room_types WHERE id=$1", [
          body.roomTypeId,
        ])
      ).rows[0];
      if (!type || body.guests! > type.max_guests)
        throw new BadRequestException("Invalid room or guest count.");
      const room = (
        await client.query(
          `
        SELECT r.id FROM rooms r WHERE r.room_type_id=$1 AND r.active=true
        AND NOT EXISTS (
          SELECT 1 FROM bookings b WHERE b.room_id=r.id
          AND b.status IN ('PENDING_APPROVAL','AWAITING_PAYMENT','CONFIRMED')
          AND daterange(b.check_in,b.check_out,'[)') && daterange($2::date,$3::date,'[)')
        ) ORDER BY r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`,
          [body.roomTypeId, checkIn, checkOut],
        )
      ).rows[0];
      if (!room)
        throw new HttpException("No room available. Please search again.", 409);
      const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
      const total = BigInt(type.nightly_amount_minor) * BigInt(nights);
      const booking = (
        await client.query(
          `
        INSERT INTO bookings(id,firebase_uid,room_id,check_in,check_out,guests,total_amount_minor,currency,
          status,expires_at,idempotency_key,request_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING_APPROVAL',now()+interval '30 minutes',$9,$10)
        RETURNING *`,
          [
            randomUUID(),
            identity.uid,
            room.id,
            checkIn,
            checkOut,
            body.guests,
            total.toString(),
            type.currency,
            key,
            fingerprint,
          ],
        )
      ).rows[0];
      await client.query("COMMIT");
      return booking;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23P01")
        throw new HttpException("Room was just booked. Please retry.", 409);
      throw error;
    } finally {
      client.release();
    }
  }

  @Get("admin/bookings") async allBookings(
    @Headers("authorization") authorization?: string,
  ) {
    await admin(authorization);
    return (
      await db.query(
        "SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200",
      )
    ).rows;
  }

  @Patch("admin/bookings/:id") async approve(
    @Headers("authorization") authorization: string,
    @Param("id") id: string,
    @Body() body: { action?: string },
  ) {
    const current = await admin(authorization, "bookings.manage");
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new BadRequestException("Invalid booking ID");
    if (!["accept", "reject"].includes(body.action || ""))
      throw new BadRequestException("Use accept or reject.");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE bookings SET status=$2,
        expires_at=CASE WHEN $2='AWAITING_PAYMENT' THEN now()+interval '10 minutes' ELSE NULL END
        WHERE id=$1 AND status='PENDING_APPROVAL' AND expires_at>now() RETURNING *`,
        [id, body.action === "accept" ? "AWAITING_PAYMENT" : "REJECTED"],
      );
      if (!result.rows[0])
        throw new HttpException("Booking expired or already handled.", 409);
      await client.query(
        "INSERT INTO audit_logs(actor_uid,action,booking_id) VALUES($1,$2,$3)",
        [current.uid, body.action, id],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  @Get("admin/room-types") async adminTypes(
    @Headers("authorization") authorization?: string,
  ) {
    await admin(authorization, "rooms.manage");
    return (await db.query("SELECT * FROM room_types ORDER BY id")).rows;
  }
  @Patch("admin/room-types/:id") async editType(
    @Headers("authorization") authorization: string,
    @Param("id") value: string,
    @Body() body: Record<string, unknown>,
  ) {
    const current = await admin(authorization, "rooms.manage");
    const typeId = Number(value);
    if (!Number.isSafeInteger(typeId) || typeId < 1)
      throw new BadRequestException("Invalid room type");
    const {
      name,
      description,
      maxGuests,
      nightlyAmountMinor,
      amenities,
      photoUrls,
    } = body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 120 ||
      typeof description !== "string" ||
      description.length > 3000 ||
      !Number.isInteger(maxGuests) ||
      Number(maxGuests) < 1 ||
      Number(maxGuests) > 4 ||
      typeof nightlyAmountMinor !== "string" ||
      !/^(0|[1-9][0-9]{0,15})$/.test(nightlyAmountMinor) ||
      !Array.isArray(amenities) ||
      amenities.length > 30 ||
      amenities.some(
        (a) => typeof a !== "string" || !a.trim() || a.length > 80,
      ) ||
      !Array.isArray(photoUrls) ||
      photoUrls.length > 8 ||
      photoUrls.some((url) => {
        try {
          const u = new URL(String(url));
          return (
            typeof url !== "string" ||
            u.protocol !== "https:" ||
            !!u.username ||
            !!u.password ||
            url.length > 2000
          );
        } catch {
          return true;
        }
      })
    )
      throw new BadRequestException(
        "Invalid room details. Use HTTPS photo URLs and integer minor-unit prices.",
      );
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = (
        await client.query(
          "UPDATE room_types SET name=$2,description=$3,max_guests=$4,nightly_amount_minor=$5,amenities=$6,photo_urls=$7 WHERE id=$1 RETURNING *",
          [
            typeId,
            name.trim(),
            description,
            maxGuests,
            nightlyAmountMinor,
            amenities,
            photoUrls,
          ],
        )
      ).rows[0];
      if (!result) throw new NotFoundException();
      await client.query(
        "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,$2,$3)",
        [current.uid, "room-type.update", JSON.stringify({ typeId })],
      );
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  @Get("admin/rooms") async physicalRooms(
    @Headers("authorization") authorization?: string,
  ) {
    await admin(authorization, "rooms.manage");
    return (
      await db.query(
        "SELECT r.*,t.name AS room_type FROM rooms r JOIN room_types t ON t.id=r.room_type_id ORDER BY r.number",
      )
    ).rows;
  }
  @Patch("admin/rooms/:id") async roomActive(
    @Headers("authorization") authorization: string,
    @Param("id") value: string,
    @Body() body: { active?: boolean },
  ) {
    const current = await admin(authorization, "rooms.manage");
    if (
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < 1 ||
      typeof body.active !== "boolean"
    )
      throw new BadRequestException();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = (
        await client.query(
          "UPDATE rooms SET active=$2 WHERE id=$1 RETURNING *",
          [Number(value), body.active],
        )
      ).rows[0];
      if (!result) throw new NotFoundException();
      await client.query(
        "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,$2,$3)",
        [
          current.uid,
          "room.active",
          JSON.stringify({ roomId: Number(value), active: body.active }),
        ],
      );
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  @Get("admin/staff") async staff(
    @Headers("authorization") authorization?: string,
  ) {
    await owner(authorization);
    return (
      await db.query("SELECT * FROM staff_permissions ORDER BY firebase_uid")
    ).rows;
  }
  @Post("admin/staff") async setStaff(
    @Headers("authorization") authorization: string,
    @Body() body: { uid?: unknown; permissions?: unknown },
  ) {
    const current = await owner(authorization);
    if (
      typeof body.uid !== "string" ||
      body.uid.length > 128 ||
      isOwner(body.uid) ||
      !Array.isArray(body.permissions) ||
      body.permissions.some((p) => !permissions.includes(p))
    )
      throw new BadRequestException(
        "Use an existing non-owner Firebase UID and valid permissions.",
      );
    await getAuth().getUser(body.uid);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO staff_permissions(firebase_uid,permissions) VALUES($1,$2) ON CONFLICT(firebase_uid) DO UPDATE SET permissions=$2,updated_at=now()",
        [body.uid, [...new Set(body.permissions)]],
      );
      await client.query(
        "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,$2,$3)",
        [current.uid, "staff.permissions", JSON.stringify(body)],
      );
      await client.query("COMMIT");
      return { status: "saved" };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  @Delete("admin/staff/:uid") async removeStaff(
    @Headers("authorization") authorization: string,
    @Param("uid") uid: string,
  ) {
    const current = await owner(authorization);
    if (isOwner(uid))
      throw new BadRequestException(
        "Owner access is configured on the server.",
      );
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM staff_permissions WHERE firebase_uid=$1",
        [uid],
      );
      await client.query(
        "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,$2,$3)",
        [current.uid, "staff.revoke", JSON.stringify({ uid })],
      );
      await client.query("COMMIT");
      return { status: "revoked" };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  @Get("admin/payments") async payments(
    @Headers("authorization") authorization?: string,
  ) {
    await admin(authorization, "payments.read");
    return (
      await db.query(
        "SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 200",
      )
    ).rows;
  }
  @Get("admin/system") async system(
    @Headers("authorization") authorization?: string,
  ) {
    await owner(authorization);
    return {
      hotel: "WH",
      authConfigured: !!process.env.FIREBASE_PROJECT_ID,
      localTest: process.env.APP_ENV === "local-test",
      livePayments: false,
      paymentMode:
        process.env.APP_ENV === "local-test" ? "SIMULATED_ONLY" : "DISABLED",
      schemaVersion: (
        await db.query("SELECT version FROM schema_migrations ORDER BY version")
      ).rows.map((r) => r.version),
    };
  }
  @Post("local-test/bookings/:id/pay") async simulatePayment(
    @Headers("authorization") authorization: string,
    @Param("id") bookingId: string,
  ) {
    if (
      process.env.APP_ENV !== "local-test" ||
      process.env.FIREBASE_PROJECT_ID !== "demo-wh-final" ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST
    )
      throw new NotFoundException();
    const identity = await user(authorization);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const booking = (
        await client.query(
          "SELECT * FROM bookings WHERE id=$1 AND firebase_uid=$2 FOR UPDATE",
          [id(bookingId), identity.uid],
        )
      ).rows[0];
      if (!booking) throw new NotFoundException();
      const old = (
        await client.query(
          "SELECT * FROM payment_transactions WHERE booking_id=$1",
          [booking.id],
        )
      ).rows[0];
      if (old) {
        await client.query("COMMIT");
        return { booking, payment: old, simulated: true };
      }
      if (
        booking.status !== "AWAITING_PAYMENT" ||
        new Date(booking.expires_at).getTime() <= Date.now()
      )
        throw new HttpException(
          "Only an accepted, unexpired request can receive a test payment.",
          409,
        );
      const payment = (
        await client.query(
          "INSERT INTO payment_transactions(id,booking_id,provider,amount_minor,currency,status) VALUES($1,$2,'SIMULATED',$3,$4,'SUCCEEDED') RETURNING *",
          [
            randomUUID(),
            booking.id,
            booking.total_amount_minor,
            booking.currency,
          ],
        )
      ).rows[0];
      const result = (
        await client.query(
          "UPDATE bookings SET status='CONFIRMED',expires_at=NULL WHERE id=$1 RETURNING *",
          [booking.id],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO audit_logs(actor_uid,action,booking_id) VALUES($1,'local-test.payment',$2)",
        [identity.uid, booking.id],
      );
      await client.query("COMMIT");
      return { booking: result, payment, simulated: true };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

@Module({ controllers: [ApiController] })
class AppModule {}

async function bootstrap() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.WEB_ORIGIN || "http://localhost:3000" });
  app.enableShutdownHooks();
  await app.listen(4000, "0.0.0.0");
  // Expire holds periodically; booking transactions also expire them atomically.
  const timer = setInterval(() => {
    void db
      .query(
        "UPDATE bookings SET status='EXPIRED' WHERE status IN ('PENDING_APPROVAL','AWAITING_PAYMENT') AND expires_at<=now()",
      )
      .catch(() => console.error("Hold expiration failed; will retry."));
  }, 30000);
  timer.unref();
}
void bootstrap();
