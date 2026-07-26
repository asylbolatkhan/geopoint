ALTER TABLE solo_games ADD COLUMN mode_key TEXT;
CREATE INDEX solo_games_mode_idx ON solo_games (student_id, mode_key);
