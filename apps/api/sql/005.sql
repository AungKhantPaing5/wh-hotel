-- Keep legacy firebase_uid columns as stable historical account keys. No Firebase runtime is used.
CREATE TABLE accounts (
 uid TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE CHECK(email=lower(email)),
 password_hash TEXT,
 is_owner BOOLEAN NOT NULL DEFAULT false,
 disabled BOOLEAN NOT NULL DEFAULT false,
 must_change_password BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Import only unambiguous booking identities. Their passwords require email recovery/admin setup.
INSERT INTO accounts(uid,email)
 SELECT min(firebase_uid),lower(trim(guest_email)) FROM bookings
 WHERE guest_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 GROUP BY lower(trim(guest_email)) HAVING count(DISTINCT firebase_uid)=1
 ON CONFLICT DO NOTHING;
CREATE TABLE account_sessions (
 token_hash TEXT PRIMARY KEY,
 account_uid TEXT NOT NULL REFERENCES accounts(uid),
 scope TEXT NOT NULL CHECK(scope IN ('customer','admin')),
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_account ON account_sessions(account_uid);
CREATE TABLE password_resets (
 token_hash TEXT PRIMARY KEY,
 account_uid TEXT NOT NULL REFERENCES accounts(uid),
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE auth_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
ALTER TABLE bookings ADD COLUMN checked_in_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN checked_out_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN checked_in_by TEXT;
ALTER TABLE bookings ADD COLUMN checked_out_by TEXT;
ALTER TABLE payment_transactions DROP CONSTRAINT payment_transactions_provider_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_provider_check CHECK(provider IN ('SIMULATED','MANUAL'));
CREATE TABLE dishes (
 id SERIAL PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 description TEXT NOT NULL DEFAULT '',
 photo_url TEXT,
 price_minor BIGINT CHECK(price_minor>=0),
 active BOOLEAN NOT NULL DEFAULT true,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE food_orders (
 id UUID PRIMARY KEY,
 booking_id UUID NOT NULL REFERENCES bookings(id),
 account_uid TEXT NOT NULL REFERENCES accounts(uid),
 idempotency_key TEXT NOT NULL,
 request_fingerprint TEXT NOT NULL,
 total_minor BIGINT NOT NULL CHECK(total_minor>=0),
 currency TEXT NOT NULL DEFAULT 'MMK',
 status TEXT NOT NULL DEFAULT 'PLACED' CHECK(status IN ('PLACED','PREPARING','READY','DELIVERED','CANCELLED')),
 note TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(account_uid,idempotency_key)
);
CREATE TABLE food_order_items (
 order_id UUID NOT NULL REFERENCES food_orders(id),
 dish_id INTEGER NOT NULL REFERENCES dishes(id),
 dish_name TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
 unit_price_minor BIGINT NOT NULL CHECK(unit_price_minor>=0),
 PRIMARY KEY(order_id,dish_id)
);
