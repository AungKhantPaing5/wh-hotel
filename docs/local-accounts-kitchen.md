# Authentication migration and kitchen validation

## Identity migration

Migration 005 does not contact Firebase. It imports `bookings.guest_email` only when one normalized email maps to one legacy UID, retaining that UID. Passwords start empty and require email recovery or an owner-set temporary password.

Use a server-side database review to locate ambiguous / missing mappings:

```sql
SELECT lower(trim(guest_email)) AS email, array_agg(DISTINCT firebase_uid) AS legacy_keys
FROM bookings WHERE guest_email IS NOT NULL
GROUP BY lower(trim(guest_email)) HAVING count(DISTINCT firebase_uid)>1;
SELECT DISTINCT b.firebase_uid,b.guest_email FROM bookings b
LEFT JOIN accounts a ON a.uid=b.firebase_uid WHERE a.uid IS NULL;
SELECT s.firebase_uid FROM staff_permissions s
LEFT JOIN accounts a ON a.uid=s.firebase_uid WHERE a.uid IS NULL;
```

For a verified identity, use the existing legacy key when inserting an account. Never automatically join accounts based on a customer-entered email or create an unrelated UID for a guest who needs their historical bookings. Review the old identity source before adding missing records. New owner identity is configured by the interactive server command. No old Firebase owner environment variable grants local owner access.

Existing raw Firebase credentials/config variables and the `/secrets` mount are unused and can be removed from deployment configuration after migration. Keep a backup of the old system separately until account/history checks complete.

## Security model

Passwords use salted scrypt (N=32768,r=8,p=1,64-byte key). Only hashes enter the database. Sessions use random 256-bit tokens, storing only SHA-256 digests server-side. Web uses same-origin HttpOnly Secure SameSite=Strict cookies with separate admin/customer scopes. Native app stores its bearer session in SecureStore. Admin sessions last at most 8 hours, customer sessions 7 days. Logout revokes server sessions. Credential changes/disable/reset revoke all account sessions and reset tokens.

Authentication/reset attempts use database-backed rate limits. Web mutation requests require an explicit custom header and allowed Origin. Owner/kitchen/stay permissions are checked at the API for each action. Staff sessions cannot set prices even by submitting unchanged `priceMinor`. Staff accounts with temporary passwords must change them before privileged actions. Customer email is stored, not marked verified by a fake verification flag.

Recovery transport uses configured SMTP. Uniform response text avoids confirming account existence. Recovery sends do not block other bookings; delivery may fail, in which case the customer can retry or contact the owner. `EMAIL_TEST_MODE=true` is restricted to local-test and records recovery-token fixture data only inside the disposable test database.

## Handover checks

- Create/recover owner through server console; sign in at `/admin`.
- Reset one imported customer, compare historical bookings/room/contact details.
- Check new customer signup with valid/invalid 09 phone format.
- Create/edit/disable account, set temporary password, confirm old sessions stop working.
- Reset password via email, confirm code cannot be reused and Android completes reset in-app.
- Grant kitchen-only staff permission. Verify dish edits work and all price mutations fail.
- Upload multiple room photos, verify web thumbnail selection and native gallery.
- Book, accept, receive offline payment, record reference, check in on valid dates.
- Deny food order before check-in, from another customer, or after check-out.
- Change dish price after an order; verify the old order keeps its price snapshot.
- Concurrent retries return the same order and server-calculated total.
- Deliver/cancel open kitchen orders before check-out.
- Confirm actual email delivery in both inbox and spam folders.
- Restore database and photo backups to a separate test instance.

CI covers account/session/permission transitions, booking inventory, photo limits, mail queue, kitchen lifecycle and browser login/account forms. Real devices, real SMTP and production deployment still require environment-specific checks.
