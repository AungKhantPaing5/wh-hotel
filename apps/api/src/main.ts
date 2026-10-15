import 'reflect-metadata';
import {
  BadRequestException, Body, Controller, Get, Headers, HttpException,
  Module, Param, Patch, Post, Query, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { validateStay } from './dates';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.FIREBASE_PROJECT_ID) {
  initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
}

async function user(authorization?: string) {
  if (!process.env.FIREBASE_PROJECT_ID) throw new HttpException('Authentication is not configured.', 503);
  if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException();
  try { return await getAuth().verifyIdToken(authorization.slice(7), true); }
  catch { throw new UnauthorizedException('Please sign in again.'); }
}

async function admin(authorization?: string) {
  const current = await user(authorization);
  if (!(process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(current.uid)) {
    throw new ForbiddenException();
  }
  return current;
}

function stay(a: unknown, b: unknown) {
  try { return validateStay(a, b); }
  catch (e) { throw new BadRequestException((e as Error).message); }
}

@Controller('v1')
class ApiController {
  @Get('health/live') live() { return { status: 'ok', hotel: 'WH' }; }

  @Get('health/ready') async ready() {
    await db.query('SELECT 1 FROM room_types LIMIT 1');
    return { status: 'ready' };
  }

  @Get('rooms') async rooms() {
    return (await db.query('SELECT * FROM room_types ORDER BY nightly_amount_minor')).rows;
  }

  @Get('availability') async availability(@Query('checkIn') a: string, @Query('checkOut') b: string) {
    const [checkIn, checkOut] = stay(a, b);
    return (await db.query(`
      SELECT t.*, count(r.id)::int AS available_rooms FROM room_types t
      LEFT JOIN rooms r ON r.room_type_id=t.id AND r.active=true AND NOT EXISTS (
        SELECT 1 FROM bookings b WHERE b.room_id=r.id
        AND b.status IN ('PENDING_APPROVAL','AWAITING_PAYMENT','CONFIRMED')
        AND (b.status='CONFIRMED' OR b.expires_at>now())
        AND daterange(b.check_in,b.check_out,'[)') && daterange($1::date,$2::date,'[)')
      ) GROUP BY t.id ORDER BY t.nightly_amount_minor`, [checkIn, checkOut])).rows;
  }

  @Get('me') async me(@Headers('authorization') authorization?: string) {
    const identity = await user(authorization);
    const profile = await getAuth().getUser(identity.uid);
    return {
      uid: identity.uid, email: profile.email, emailVerified: profile.emailVerified,
      phone: profile.phoneNumber,
      needsEmail: !profile.email || !profile.emailVerified,
      needsPhone: !profile.phoneNumber,
    };
  }

  @Get('bookings') async bookings(@Headers('authorization') authorization?: string) {
    const identity = await user(authorization);
    return (await db.query('SELECT * FROM bookings WHERE firebase_uid=$1 ORDER BY created_at DESC', [identity.uid])).rows;
  }

  @Post('bookings') async book(
    @Headers('authorization') authorization: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { roomTypeId?: number; checkIn?: string; checkOut?: string; guests?: number },
  ) {
    const identity = await user(authorization);
    const profile = await getAuth().getUser(identity.uid);
    if (!profile.phoneNumber) throw new ForbiddenException('Verify a phone number before booking.');
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new BadRequestException('A valid Idempotency-Key is required.');
    const [checkIn, checkOut] = stay(body.checkIn, body.checkOut);
    if (!Number.isInteger(body.roomTypeId) || !Number.isInteger(body.guests) || body.guests! < 1) {
      throw new BadRequestException('Select a room type and guest count.');
    }
    const fingerprint = JSON.stringify([body.roomTypeId, checkIn, checkOut, body.guests]);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // Serialize retries for the same user/key across API instances.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [identity.uid + ':' + key]);
      const old = (await client.query('SELECT * FROM bookings WHERE firebase_uid=$1 AND idempotency_key=$2', [identity.uid, key])).rows[0];
      if (old) {
        if (old.request_fingerprint !== fingerprint) throw new HttpException('Idempotency key used for different request.', 409);
        await client.query('COMMIT');
        return old;
      }
      await client.query("UPDATE bookings SET status='EXPIRED' WHERE status IN ('PENDING_APPROVAL','AWAITING_PAYMENT') AND expires_at<=now()");
      const type = (await client.query('SELECT * FROM room_types WHERE id=$1', [body.roomTypeId])).rows[0];
      if (!type || body.guests! > type.max_guests) throw new BadRequestException('Invalid room or guest count.');
      const room = (await client.query(`
        SELECT r.id FROM rooms r WHERE r.room_type_id=$1 AND r.active=true
        AND NOT EXISTS (
          SELECT 1 FROM bookings b WHERE b.room_id=r.id
          AND b.status IN ('PENDING_APPROVAL','AWAITING_PAYMENT','CONFIRMED')
          AND daterange(b.check_in,b.check_out,'[)') && daterange($2::date,$3::date,'[)')
        ) ORDER BY r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`, [body.roomTypeId, checkIn, checkOut])).rows[0];
      if (!room) throw new HttpException('No room available. Please search again.', 409);
      const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
      const total = BigInt(type.nightly_amount_minor) * BigInt(nights);
      const booking = (await client.query(`
        INSERT INTO bookings(id,firebase_uid,room_id,check_in,check_out,guests,total_amount_minor,currency,
          status,expires_at,idempotency_key,request_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING_APPROVAL',now()+interval '30 minutes',$9,$10)
        RETURNING *`, [randomUUID(), identity.uid, room.id, checkIn, checkOut, body.guests, total.toString(), type.currency, key, fingerprint])).rows[0];
      await client.query('COMMIT');
      return booking;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as {code?: string}).code === '23P01') throw new HttpException('Room was just booked. Please retry.', 409);
      throw error;
    } finally { client.release(); }
  }

  @Get('admin/bookings') async allBookings(@Headers('authorization') authorization?: string) {
    await admin(authorization);
    return (await db.query('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200')).rows;
  }

  @Patch('admin/bookings/:id') async approve(
    @Headers('authorization') authorization: string,
    @Param('id') id: string, @Body() body: { action?: string },
  ) {
    const current = await admin(authorization);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException('Invalid booking ID');
    if (!['accept', 'reject'].includes(body.action || '')) throw new BadRequestException('Use accept or reject.');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`UPDATE bookings SET status=$2,
        expires_at=CASE WHEN $2='AWAITING_PAYMENT' THEN now()+interval '10 minutes' ELSE NULL END
        WHERE id=$1 AND status='PENDING_APPROVAL' AND expires_at>now() RETURNING *`,
        [id, body.action === 'accept' ? 'AWAITING_PAYMENT' : 'REJECTED']);
      if (!result.rows[0]) throw new HttpException('Booking expired or already handled.', 409);
      await client.query('INSERT INTO audit_logs(actor_uid,action,booking_id) VALUES($1,$2,$3)', [current.uid, body.action, id]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

@Module({ controllers: [ApiController] })
class AppModule {}

async function bootstrap() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.WEB_ORIGIN || 'http://localhost:3000' });
  app.enableShutdownHooks();
  await app.listen(4000, '0.0.0.0');
  // Expire holds periodically; booking transactions also expire them atomically.
  const timer = setInterval(() => {
    void db.query("UPDATE bookings SET status='EXPIRED' WHERE status IN ('PENDING_APPROVAL','AWAITING_PAYMENT') AND expires_at<=now()")
      .catch(() => console.error('Hold expiration failed; will retry.'));
  }, 30000);
  timer.unref();
}
void bootstrap();
