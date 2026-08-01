-- Profile and Panchayat data must live in the database so every login sees
-- the same worker contact information, availability, and assignment list.
ALTER TABLE users ADD COLUMN IF NOT EXISTS panchayat_id VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;

UPDATE users
SET panchayat_id = 'vakadu-balireddypalem'
WHERE panchayat_id IS NULL OR panchayat_id = '';

ALTER TABLE users ALTER COLUMN panchayat_id SET DEFAULT 'vakadu-balireddypalem';
ALTER TABLE users ALTER COLUMN panchayat_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS users_role_panchayat_idx ON users (role, panchayat_id);
