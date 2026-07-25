-- Батл түрі: 'async' (кезекпен, бар тарих) / 'online' (нақты уақытта)
ALTER TABLE battles ADD COLUMN mode TEXT NOT NULL DEFAULT 'async'
  CHECK (mode IN ('async', 'online'));
