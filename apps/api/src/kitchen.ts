import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Patch,
  Param,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  HttpException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { user, admin } from "./accounts";
function number(value: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new BadRequestException("Invalid dish.");
  return n;
}
function uuid(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value))
    throw new BadRequestException("Invalid order.");
  return value;
}
export function dishDetails(b: any, owner: boolean) {
  if (
    !b ||
    typeof b.name !== "string" ||
    !b.name.trim() ||
    b.name.length > 120 ||
    typeof b.description !== "string" ||
    b.description.length > 2000 ||
    typeof b.active !== "boolean"
  )
    throw new BadRequestException(
      "Enter a dish name, description and availability.",
    );
  if (Object.hasOwn(b, "priceMinor") && !owner)
    throw new ForbiddenException(
      "Only the hotel admin may set or change prices.",
    );
  if (
    Object.hasOwn(b, "priceMinor") &&
    (typeof b.priceMinor !== "string" ||
      !/^(0|[1-9][0-9]{0,11})$/.test(b.priceMinor))
  )
    throw new BadRequestException("Enter a valid price in minor units.");
  if (
    b.photoUrl &&
    !(
      typeof b.photoUrl === "string" &&
      /^\/api\/photos\/[a-f0-9]{64}\.webp$/.test(b.photoUrl)
    )
  )
    throw new BadRequestException("Upload a hotel photo first.");
  return {
    name: b.name.trim(),
    description: b.description,
    active: b.active,
    photo: b.photoUrl || null,
    price: b.priceMinor ?? null,
  };
}
export function foodItems(value: any) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 30 ||
    value.some(
      (i) =>
        !Number.isSafeInteger(i.dishId) ||
        i.dishId < 1 ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > 20,
    ) ||
    new Set(value.map((i) => i.dishId)).size !== value.length
  )
    throw new BadRequestException(
      "Choose 1–30 distinct dishes, quantity 1–20 each.",
    );
  return [...value]
    .map((i) => ({ dishId: i.dishId, quantity: i.quantity }))
    .sort((a, b) => a.dishId - b.dishId);
}
@Controller("v1")
export class KitchenController {
  @Get("kitchen/menu") async menu() {
    return (
      await db.query(
        "SELECT * FROM dishes WHERE active AND price_minor IS NOT NULL ORDER BY name",
      )
    ).rows;
  }
  @Get("kitchen/orders") async myOrders(@Headers("authorization") h: string) {
    const u = await user(h);
    return (
      await db.query(
        `SELECT o.*,r.number AS room_number,(SELECT json_agg(i) FROM food_order_items i WHERE i.order_id=o.id) AS items FROM food_orders o JOIN bookings b ON b.id=o.booking_id JOIN rooms r ON r.id=b.room_id WHERE o.account_uid=$1 ORDER BY o.created_at DESC LIMIT 100`,
        [u.uid],
      )
    ).rows;
  }
  @Post("kitchen/orders") async order(
    @Headers("authorization") h: string,
    @Headers("idempotency-key") key: string,
    @Body() b: any,
  ) {
    const u = await user(h);
    if (u.must_change_password)
      throw new ForbiddenException("Change your temporary password first.");
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(key || ""))
      throw new BadRequestException("A valid Idempotency-Key is required.");
    const items = foodItems(b.items);
    if (typeof b.note !== "string" || b.note.length > 500)
      throw new BadRequestException(
        "Order note must be at most 500 characters.",
      );
    uuid(b.bookingId);
    const fingerprint = JSON.stringify([b.bookingId, items, b.note]),
      c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "food:" + u.uid + ":" + key,
      ]);
      const old = (
        await c.query(
          "SELECT * FROM food_orders WHERE account_uid=$1 AND idempotency_key=$2",
          [u.uid, key],
        )
      ).rows[0];
      if (old) {
        if (old.request_fingerprint !== fingerprint)
          throw new HttpException(
            "Order key already used for another request.",
            409,
          );
        await c.query("COMMIT");
        return old;
      }
      const booking = (
        await c.query(
          "SELECT * FROM bookings WHERE id=$1 AND firebase_uid=$2 FOR UPDATE",
          [b.bookingId, u.uid],
        )
      ).rows[0];
      if (
        !booking ||
        booking.status !== "CONFIRMED" ||
        !booking.checked_in_at ||
        booking.checked_out_at
      )
        throw new ForbiddenException(
          "Food ordering is available only after staff check-in and before check-out.",
        );
      const dishes = (
        await c.query(
          "SELECT * FROM dishes WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE",
          [items.map((i) => i.dishId)],
        )
      ).rows;
      let total = 0n;
      for (const i of items) {
        const d = dishes.find((d) => d.id === i.dishId);
        if (!d || !d.active || d.price_minor === null)
          throw new BadRequestException(
            "A selected dish is unavailable. Refresh the menu.",
          );
        total += BigInt(d.price_minor) * BigInt(i.quantity);
      }
      const row = (
        await c.query(
          "INSERT INTO food_orders(id,booking_id,account_uid,idempotency_key,request_fingerprint,total_minor,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            randomUUID(),
            booking.id,
            u.uid,
            key,
            fingerprint,
            total.toString(),
            b.note,
          ],
        )
      ).rows[0];
      for (const i of items) {
        const d = dishes.find((d) => d.id === i.dishId);
        await c.query(
          "INSERT INTO food_order_items(order_id,dish_id,dish_name,quantity,unit_price_minor) VALUES($1,$2,$3,$4,$5)",
          [row.id, d.id, d.name, i.quantity, d.price_minor],
        );
      }
      await c.query("COMMIT");
      return row;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  @Post("admin/kitchen/photos") async photo(
    @Headers("authorization") h: string,
    @Body() b: any,
  ) {
    await admin(h, "kitchen.manage");
    if (
      typeof b.data !== "string" ||
      b.data.length > 7000000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)
    )
      throw new BadRequestException("Choose an image up to 5 MiB.");
    const input = Buffer.from(b.data, "base64");
    if (
      input.length > 5 * 1024 * 1024 ||
      !input.length ||
      input.toString("base64") !== b.data
    )
      throw new BadRequestException("Invalid image.");
    let output: Buffer;
    try {
      const image = sharp(input, {
          limitInputPixels: 20000000,
          animated: false,
        }),
        meta = await image.metadata();
      if (
        !["jpeg", "png", "webp"].includes(meta.format || "") ||
        (meta.pages || 1) > 1
      )
        throw Error();
      output = await image
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        "Use JPEG, PNG or WebP up to 20 megapixels.",
      );
    }
    const name = createHash("sha256").update(output).digest("hex") + ".webp",
      dir = resolve(process.env.PHOTO_DIRECTORY || "/app/uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), output, { mode: 0o644 });
    return { url: "/api/photos/" + name };
  }
  @Get("admin/kitchen/dishes") async dishes(
    @Headers("authorization") h: string,
  ) {
    await admin(h, "kitchen.manage");
    return (await db.query("SELECT * FROM dishes ORDER BY id")).rows;
  }
  @Post("admin/kitchen/dishes") async create(
    @Headers("authorization") h: string,
    @Body() b: any,
  ) {
    const u = await admin(h, "kitchen.manage"),
      d = dishDetails(b, u.is_owner);
    const r = (
      await db.query(
        "INSERT INTO dishes(name,description,photo_url,price_minor,active) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [d.name, d.description, d.photo, d.price, d.active],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,'dish.create',$2)",
      [u.uid, JSON.stringify({ id: r.id, price: d.price })],
    );
    return r;
  }
  @Patch("admin/kitchen/dishes/:id") async edit(
    @Headers("authorization") h: string,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    const u = await admin(h, "kitchen.manage"),
      d = dishDetails(b, u.is_owner);
    const r = (
      await db.query(
        "UPDATE dishes SET name=$2,description=$3,photo_url=$4,price_minor=CASE WHEN $5::text IS NULL THEN price_minor ELSE $5::bigint END,active=$6,updated_at=now() WHERE id=$1 RETURNING *",
        [number(id), d.name, d.description, d.photo, d.price, d.active],
      )
    ).rows[0];
    if (!r) throw new NotFoundException();
    await db.query(
      "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,'dish.update',$2)",
      [u.uid, JSON.stringify({ id: r.id, price: d.price })],
    );
    return r;
  }
  @Get("admin/kitchen/orders") async orders(
    @Headers("authorization") h: string,
  ) {
    await admin(h, "kitchen.manage");
    return (
      await db.query(
        `SELECT o.*,r.number AS room_number,a.email,(SELECT json_agg(i) FROM food_order_items i WHERE i.order_id=o.id) AS items FROM food_orders o JOIN accounts a ON a.uid=o.account_uid JOIN bookings b ON b.id=o.booking_id JOIN rooms r ON r.id=b.room_id ORDER BY o.created_at DESC LIMIT 200`,
      )
    ).rows;
  }
  @Patch("admin/kitchen/orders/:id") async status(
    @Headers("authorization") h: string,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    const u = await admin(h, "kitchen.manage");
    const transitions: Record<string, string[]> = {
      PLACED: ["PREPARING", "CANCELLED"],
      PREPARING: ["READY", "CANCELLED"],
      READY: ["DELIVERED", "CANCELLED"],
    };
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const o = (
        await c.query("SELECT * FROM food_orders WHERE id=$1 FOR UPDATE", [
          uuid(id),
        ])
      ).rows[0];
      if (!o || !transitions[o.status]?.includes(b.status))
        throw new BadRequestException(
          "Invalid order status transition. Refresh orders.",
        );
      await c.query("UPDATE food_orders SET status=$2 WHERE id=$1", [
        id,
        b.status,
      ]);
      await c.query(
        "INSERT INTO admin_activity(actor_uid,action,details) VALUES($1,'food.status',$2)",
        [u.uid, JSON.stringify({ id, status: b.status })],
      );
      await c.query("COMMIT");
      return { status: b.status };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
