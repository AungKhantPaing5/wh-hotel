CREATE TABLE customer_contacts (
  firebase_uid TEXT PRIMARY KEY,
  phone TEXT NOT NULL CHECK (phone ~ '^09[0-9]{9}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
