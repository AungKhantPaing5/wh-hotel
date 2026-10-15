CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE room_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  max_guests INTEGER NOT NULL CHECK(max_guests>0),
  nightly_amount_minor BIGINT NOT NULL CHECK(nightly_amount_minor>=0),
  currency TEXT NOT NULL DEFAULT 'MMK',
  amenities TEXT[] NOT NULL DEFAULT '{}'
);
CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  room_type_id INTEGER NOT NULL REFERENCES room_types(id),
  number TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  firebase_uid TEXT NOT NULL,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL CHECK(check_out>check_in),
  guests INTEGER NOT NULL CHECK(guests>0),
  total_amount_minor BIGINT NOT NULL CHECK(total_amount_minor>=0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING_APPROVAL','AWAITING_PAYMENT','CONFIRMED','REJECTED','EXPIRED','CANCELLED')),
  expires_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(firebase_uid,idempotency_key),
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in,check_out,'[)') WITH &&
  ) WHERE (status IN ('PENDING_APPROVAL','AWAITING_PAYMENT','CONFIRMED'))
);
CREATE INDEX booking_user_idx ON bookings(firebase_uid);
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  booking_id UUID REFERENCES bookings(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Demo prices only. MMK amounts here use 2 decimal places; no provider conversion is implemented.
INSERT INTO room_types(name,description,max_guests,nightly_amount_minor,amenities) VALUES
('Deluxe Double','A calm retreat for two with a comfortable king bed.',2,8500000,ARRAY['Wi-Fi','Air conditioning','Breakfast']),
('Family Suite','More space to relax together after a day exploring.',4,14500000,ARRAY['Wi-Fi','Living area','Breakfast']);
INSERT INTO rooms(room_type_id,number) VALUES(1,'201'),(1,'202'),(2,'301');
