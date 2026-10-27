-- Protect an earlier 005 import when a legacy UID used multiple historical emails.
-- Keep records intact for explicit owner review. No password-bearing account is changed.
UPDATE accounts a SET disabled=true WHERE password_hash IS NULL AND NOT is_owner
 AND (SELECT count(DISTINCT lower(trim(b.guest_email))) FROM bookings b
      WHERE b.firebase_uid=a.uid AND b.guest_email IS NOT NULL)>1;
DELETE FROM account_sessions s USING accounts a WHERE s.account_uid=a.uid AND a.disabled;
DELETE FROM password_resets p USING accounts a WHERE p.account_uid=a.uid AND a.disabled;
