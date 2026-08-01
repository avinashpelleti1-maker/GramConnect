CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('citizen', 'worker', 'admin');
CREATE TYPE complaint_status AS ENUM ('submitted', 'under_review', 'assigned', 'on_the_way', 'in_progress', 'resolved', 'verification', 'closed');
CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE sos_type AS ENUM ('medical', 'fire', 'police', 'electricity', 'flood', 'animal_attack', 'women_safety');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(15) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  role user_role NOT NULL DEFAULT 'citizen',
  village VARCHAR(120) NOT NULL DEFAULT 'Pedda Cheruvu',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE worker_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  skills TEXT[] NOT NULL DEFAULT '{}',
  experience_years SMALLINT NOT NULL DEFAULT 0,
  available BOOLEAN NOT NULL DEFAULT true,
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  jobs_completed INT NOT NULL DEFAULT 0
);

CREATE TABLE complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id VARCHAR(24) NOT NULL UNIQUE,
  citizen_id UUID NOT NULL REFERENCES users(id),
  assigned_worker_id UUID REFERENCES users(id),
  category VARCHAR(60) NOT NULL,
  priority complaint_priority NOT NULL DEFAULT 'medium',
  status complaint_status NOT NULL DEFAULT 'submitted',
  description TEXT NOT NULL,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  location_label VARCHAR(200),
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  voice_urls TEXT[] NOT NULL DEFAULT '{}',
  ai_confidence NUMERIC(3,2),
  confirmations INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE complaint_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  status complaint_status NOT NULL,
  note TEXT,
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE complaint_supports (
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  citizen_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stance VARCHAR(16) NOT NULL CHECK (stance IN ('confirm', 'fixed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (complaint_id, citizen_id)
);

CREATE TABLE sos_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id UUID NOT NULL REFERENCES users(id),
  alert_type sos_type NOT NULL,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panchayat_id VARCHAR(120) NOT NULL,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(140) NOT NULL,
  message TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX complaints_status_idx ON complaints(status);
CREATE INDEX complaints_created_idx ON complaints(created_at DESC);
CREATE INDEX sos_status_idx ON sos_alerts(status);
CREATE INDEX announcements_panchayat_created_idx ON announcements(panchayat_id, created_at DESC);
