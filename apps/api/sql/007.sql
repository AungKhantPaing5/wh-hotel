CREATE TABLE account_profiles (
 account_uid TEXT PRIMARY KEY REFERENCES accounts(uid),
 full_name TEXT NOT NULL DEFAULT '' CHECK(length(full_name)<=100),
 address TEXT NOT NULL DEFAULT '' CHECK(length(address)<=500),
 avatar_url TEXT,
 job_title TEXT NOT NULL DEFAULT '' CHECK(length(job_title)<=100),
 department TEXT NOT NULL DEFAULT '' CHECK(length(department)<=100),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
