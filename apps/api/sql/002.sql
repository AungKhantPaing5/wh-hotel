ALTER TABLE room_types ADD COLUMN photo_urls TEXT[] NOT NULL DEFAULT '{}';
CREATE TABLE staff_permissions (
  firebase_uid TEXT PRIMARY KEY,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id),
  provider TEXT NOT NULL CHECK (provider='SIMULATED'),
  amount_minor BIGINT NOT NULL CHECK(amount_minor>=0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status='SUCCEEDED'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE admin_activity (
  id BIGSERIAL PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
