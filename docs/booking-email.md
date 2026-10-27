# Booking approval email

Admin → Bookings displays the customer email, phone, room number and email delivery state. New bookings store contact snapshots; older records use their local account account/contact profile as a fallback.

Accepting a booking commits its approval and one durable email job together. The API checks the queue every five seconds. The approval email explicitly says payment is still pending, includes the room, dates, total, booking reference and payment deadline. An expired or inactive approval is skipped. SMTP failures are retried up to three times; staff with bookings.manage can retry a failed active approval. SMTP acceptance is not proof of inbox delivery.

## Production setup

Obtain SMTP credentials from your mail provider. Add these server-side values to /opt/wh-hotel/.env:

```dotenv
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
EMAIL_FROM="WN Hotel <bookings@your-domain.com>"
```

Port 465 uses implicit TLS. Other ports require STARTTLS. Use the sender address/domain approved by the provider and configure its SPF/DKIM records in Cloudflare as instructed by that provider. Never put SMTP credentials in NEXT_PUBLIC variables or commit .env.

```bash
cd /opt/wh-hotel
git pull --ff-only
docker compose up -d --build
```

Without SMTP configuration, approval still succeeds and the admin card says “Email setup required”. After setting credentials, restart/recreate the API. Pending active approval emails will be processed. Old expired approvals will not be sent. Existing approved active bookings with no email job have a “Queue approval email” button.

local account Authentication verification/password-reset emails are separate from these booking emails. This implementation sends booking mail using your SMTP provider.

## Testing

compose.test.yml enables EMAIL_TEST_MODE only for APP_ENV=local-test. It generates JSON mail in the disposable PostgreSQL outbox, marks it TEST_SENT and never sends external mail. The acceptance suite checks recipient, content and queue uniqueness; browser tests check the guest contacts and delivery status. Production delivery requires an actual provider and a real inbox test after SMTP setup.
