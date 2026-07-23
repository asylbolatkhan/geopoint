-- Мұғалім рөлі
ALTER TABLE students DROP CONSTRAINT students_role_check;
ALTER TABLE students ADD CONSTRAINT students_role_check
  CHECK (role IN ('student', 'teacher', 'admin'));

-- Жаттығуда әр сұраққа бөлек жауап беру (instant feedback).
-- Объект-карта: { "<canonicalIndex>": optionIndex|null } — кілт бар = жауап құлыпталған.
ALTER TABLE solo_games ADD COLUMN progress JSONB NOT NULL DEFAULT '{}'::jsonb;
