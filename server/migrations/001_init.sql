CREATE TABLE schools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE classes (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (school_id, name)
);

CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  tg_user_id BIGINT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  class_id INT REFERENCES classes(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  lang TEXT NOT NULL DEFAULT 'kk' CHECK (lang IN ('kk', 'ru')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE battles (
  id SERIAL PRIMARY KEY,
  challenger_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  opponent_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  questions JSONB NOT NULL,
  challenger_result JSONB,
  opponent_result JSONB,
  status TEXT NOT NULL DEFAULT 'awaiting_opponent'
    CHECK (status IN ('awaiting_opponent', 'completed', 'expired', 'declined')),
  winner_id INT REFERENCES students(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX battles_challenger_idx ON battles (challenger_id, created_at);
CREATE INDEX battles_opponent_idx ON battles (opponent_id, created_at);
CREATE INDEX battles_expiry_idx ON battles (status, expires_at);

CREATE TABLE solo_games (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  questions JSONB NOT NULL,
  answers JSONB,
  correct_count INT,
  total INT NOT NULL,
  duration_ms INT,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX solo_games_student_idx ON solo_games (student_id, created_at);

CREATE TABLE points_events (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  ref_id INT,
  month_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX points_events_month_idx ON points_events (month_key, student_id);
CREATE INDEX points_events_student_idx ON points_events (student_id, created_at);
