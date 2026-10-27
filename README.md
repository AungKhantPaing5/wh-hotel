# WN Hotel

Single-hotel booking website, Android/iOS app, administration and kitchen operations.

## Current stack

- Next.js website and admin dashboard.
- NestJS API with PostgreSQL 17, including local email/password accounts.
- React Native / Expo mobile app, version 0.5.0.
- SMTP for password recovery and booking approval emails.
- GitHub Actions for verification, disposable end-to-end testing and Android APK builds.

Firebase is no longer a runtime dependency. Google/Apple/SMS login has been removed in this release. Email/password is the supported login method.

## Upgrade an existing server

The migration is additive. Booking, room, payment, photo and staff records remain in the database. Historical `firebase_uid` columns remain stable internal keys only.

1. Back up the existing PostgreSQL database and uploaded-photo volume before switching authentication:

```bash
cd /opt/wh-hotel
mkdir -p backups
chmod 700 backups
(
  umask 077
  docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "backups/before-local-auth-$(date +%Y%m%d-%H%M%S).sql"
  docker compose exec -T api tar -C /app/uploads -czf - . > "backups/photos-$(date +%Y%m%d-%H%M%S).tar.gz"
)
```

2. Pull and rebuild. Keep the existing `POSTGRES_PASSWORD` and Docker volumes.

```bash
git pull --ff-only
docker compose up -d --build
```

3. Set `.env` `WEB_ORIGIN` to the exact public HTTPS origin, without a trailing slash, e.g. `https://thai1.payapi.uk`. Production cookies require HTTPS. Set the SMTP values below for recovery and booking emails. Recreate API after changing environment values:

```bash
docker compose up -d --force-recreate api
```

4. Create the hotel owner account interactively. The password is hidden and must be 12–128 characters:

```bash
docker compose exec api node apps/api/scripts/manage-owner.mjs
```

Open `/admin` and enter this email/password. The same command can recover owner access from the server console. It must only be run by the server operator.

5. Existing Firebase passwords cannot authenticate against the new account system. Migration imports only unambiguous booking email/UID pairs with no password. These customers use Forgot password once SMTP is configured, or the owner sets a temporary password under **Customers**. An admin-set temporary password requires a change before booking, kitchen ordering or privileged staff operations.

Accounts with no booking email, shared email/UID collisions, and staff without an imported account need an explicit identity mapping. See [migration and testing guide](docs/local-accounts-kitchen.md). Do not create duplicate accounts for customers whose history needs linking.

6. Install the new Android APK after deploying the backend. Version 0.4 used Firebase and does not support the new login protocol. New test APKs are under GitHub Actions **WN Android Local Accounts**. Store signing / iPhone installation require the respective platform credentials.

## Owner account management

**Customers** lets the owner create accounts, edit customer/staff email, set a new temporary password and disable accounts. Password hashes never appear in the dashboard. Changing account credentials revokes all sessions and recovery tokens. Owners change their own password through the password form or the server-only command.

**Staff** accepts an account email and these permissions:

| Permission | Access |
|---|---|
| `bookings.read` | Read bookings and customer contact details |
| `bookings.manage` | Accept/reject booking requests, record received offline payment with stay permission |
| `stays.manage` | Check in/out confirmed bookings |
| `rooms.manage` | Room types, rates, physical rooms and photos |
| `payments.read` | Payment ledger |
| `kitchen.manage` | Create/edit dishes, upload dish photos, change availability and manage food-order progress |

Booking-management/stay permissions also grant booking read access. Only owner accounts can assign permissions or set/change dish prices, including through direct API calls. Kitchen staff can create an unpriced dish, which remains hidden from the orderable menu until the owner prices it. Mark unavailable to archive a dish while preserving order history.

## Stay and kitchen flow

1. Guest requests a room. Admin accepts it. Approval email states **awaiting payment**.
2. After actually receiving cash/bank payment, authorized staff records the receipt reference. This creates a separate `MANUAL` payment record and confirms the booking. It does not call a payment gateway.
3. Admin/staff checks the guest in during their reserved dates, using Myanmar hotel time.
4. Checked-in customers order dishes in the website account Kitchen section or the native mobile Kitchen tab. Server validates guest ownership, check-in state, current prices and availability. Quantities and price snapshots remain in the order history. Food charges are separate from room payments.
5. Kitchen changes `PLACED` to `PREPARING`, `READY`, then `DELIVERED`, or cancels an open order.
6. Staff delivers/cancels open orders before checking out. New food orders are blocked after check-out. Concurrent checkout/order requests serialize against the booking row.

Room types support **40 photos each**, up to 5 MiB / 20 MP per image. Admin can select multiple files. Each is uploaded sequentially, normalized to WebP and stored on the persistent photo volume. Customer web thumbnails and the native full-screen gallery display all selected images.

## SMTP

```dotenv
WEB_ORIGIN=https://your-domain.com
SMTP_HOST=your-provider-smtp-host
SMTP_PORT=587
SMTP_USER=your-provider-login
SMTP_PASS=your-provider-secret
EMAIL_FROM="WN Hotel <bookings@your-domain.com>"
```

Use the provider's domain verification / SPF / DKIM settings. Secrets stay server-side. Without SMTP, login works but Forgot password reports recovery unavailable and booking mail remains queued. Admin password resets remain available.

Recovery links expire in 30 minutes, are single-use and revoke previous sessions on success. Web reset uses `/reset-password#token=...` and clears the fragment after reading it. Android lets users paste the emailed recovery code and reset inside the app. There is no email verification or email OTP in this release.

## Local testing

```bash
docker compose -f compose.test.yml up -d --build
docker compose -f compose.test.yml -f compose.acceptance.yml run --rm acceptance
```

Use `http://localhost:3000`. Isolated test accounts: `admin@wh.test`, `guest@wh.test`, `staff@wh.test`; password `WhTestOnly2026!`. These accounts are created only with `APP_ENV=local-test`. Test mail uses a JSON transport and never sends externally. No Firebase emulator is required.

```bash
npm ci
npm test
npm run build
cd apps/mobile
npm ci
npm run typecheck
npm test
```

## CI/CD

- **WH CI** builds API/site and checks schema against disposable PostgreSQL.
- **WH Local Acceptance** runs real API/database tests and Playwright customer/admin flows.
- **WN Expo Mobile** checks types/tests and Android/iOS JS exports.
- **WN Android Local Accounts** builds a standalone ARM64 Android APK with test signing, using `EXPO_PUBLIC_API_URL` repository variable or `https://thai1.payapi.uk/api`.
- **WH Deploy** runs only after the local end-to-end acceptance workflow succeeds and remains opt-in with repository variable `AUTO_DEPLOY=true`, production environment and SSH secrets. Prepare owner migration and backups before enabling it for this release.

Live payment APIs remain disabled until merchant integration is supplied. Manual payment entry must correspond to an actual payment received by the hotel.
