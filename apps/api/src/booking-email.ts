import nodemailer from "nodemailer";
import type { Pool } from "pg";

type Approval = {
  id: string;
  guest_email: string;
  room_number: string;
  room_type: string;
  check_in: string | Date;
  check_out: string | Date;
  total_amount_minor: string;
  currency: string;
  expires_at: string | Date;
};
const day = (value: string | Date) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
export function approvalMessage(booking: Approval) {
  return {
    subject: `WN Hotel — booking request approved (${booking.id})`,
    text: [
      "Your booking request has been approved by WN Hotel.",
      "",
      `Booking reference: ${booking.id}`,
      `Room: ${booking.room_number} — ${booking.room_type}`,
      `Check-in: ${day(booking.check_in)}`,
      `Check-out: ${day(booking.check_out)}`,
      `Total: ${new Intl.NumberFormat("en-US").format(Number(booking.total_amount_minor) / 100)} ${booking.currency}`,
      "",
      "Status: awaiting payment. This is an approval notice, not a paid booking confirmation.",
      `Payment deadline (UTC): ${new Date(booking.expires_at).toISOString()}`,
      "Please contact WN Hotel to arrange payment before this deadline. Online payments are not enabled.",
      "View your current booking status in My bookings on the hotel website.",
    ].join("\n"),
  };
}
export function emailConfigured() {
  if (process.env.EMAIL_TEST_MODE === "true")
    return process.env.APP_ENV === "local-test";
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.EMAIL_FROM,
  );
}
export function startEmailWorker(
  db: Pool,
  lookup: (uid: string) => Promise<{ email?: string }>,
) {
  const testing = process.env.EMAIL_TEST_MODE === "true";
  if (testing && process.env.APP_ENV !== "local-test")
    throw new Error(
      "Email test mode is allowed only in isolated local testing.",
    );
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = testing
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
  let busy = false;
  async function tick() {
    if (busy || !emailConfigured()) return;
    busy = true;
    try {
      // A crash after SMTP acceptance has an uncertain outcome; do not auto-resend it.
      await db.query(
        "UPDATE booking_emails SET status='FAILED',attempts=3,last_error='Delivery outcome unknown. Review before retrying.',updated_at=now() WHERE status='SENDING' AND updated_at<now()-interval '5 minutes'",
      );
      for (let n = 0; n < 5; n++) {
        const job = (
          await db.query(`UPDATE booking_emails SET status='SENDING',attempts=attempts+1,updated_at=now()
          WHERE booking_id=(SELECT booking_id FROM booking_emails WHERE status IN ('PENDING','FAILED') AND attempts<3 AND next_attempt_at<=now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)
        ).rows[0];
        if (!job) break;
        try {
          const booking = (
            await db.query(
              `SELECT b.*,r.number AS room_number,t.name AS room_type FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types t ON t.id=r.room_type_id WHERE b.id=$1`,
              [job.booking_id],
            )
          ).rows[0];
          if (
            !booking ||
            booking.status !== "AWAITING_PAYMENT" ||
            new Date(booking.expires_at).getTime() <= Date.now()
          ) {
            await db.query(
              "UPDATE booking_emails SET status='SKIPPED',last_error='Approval is no longer active.',updated_at=now() WHERE booking_id=$1",
              [job.booking_id],
            );
            continue;
          }
          const recipient =
            booking.guest_email || (await lookup(booking.firebase_uid)).email;
          if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
            throw new Error("MISSING_EMAIL");
          const content = approvalMessage(booking);
          const result = await transporter.sendMail({
            from: testing ? "WN Test <test@wh.test>" : process.env.EMAIL_FROM,
            to: recipient,
            messageId: `<approval-${booking.id}@wn-hotel.local>`,
            ...content,
          });
          if (!testing && !result.accepted?.length)
            throw new Error("RECIPIENT_REJECTED");
          await db.query(
            `UPDATE booking_emails SET status=$2,sent_at=now(),last_error=NULL,test_preview=$3,updated_at=now() WHERE booking_id=$1`,
            [
              job.booking_id,
              testing ? "TEST_SENT" : "SENT",
              testing ? JSON.stringify({ to: recipient, ...content }) : null,
            ],
          );
        } catch (error) {
          const code =
            (error as { code?: string; message?: string }).code ||
            ((error as Error).message === "MISSING_EMAIL"
              ? "MISSING_EMAIL"
              : "SEND_FAILED");
          await db.query(
            "UPDATE booking_emails SET status='FAILED',last_error=$2,next_attempt_at=now()+interval '30 seconds',updated_at=now() WHERE booking_id=$1",
            [
              job.booking_id,
              `Email not sent (${code}). Check SMTP configuration and recipient.`,
            ],
          );
        }
      }
    } catch {
      console.error(
        "Booking email worker could not process its queue; will retry.",
      );
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => void tick(), 5000);
  timer.unref();
  void tick();
}
