-- ГеоВикторина мектебінің мүшелері жай жеке ойыншыға айналады (ұпайлары сақталады)
UPDATE students SET role = 'player', school_id = NULL, class_id = NULL
WHERE role IN ('student', 'teacher')
  AND school_id = (SELECT id FROM schools WHERE name = 'ГеоВикторина мектебі');
-- Админ негізгі мектепке ауысады (лицей бар болса)
UPDATE students SET school_id = (SELECT id FROM schools WHERE name = 'Экономикалық лицей')
WHERE role = 'admin' AND (SELECT id FROM schools WHERE name = 'Экономикалық лицей') IS NOT NULL;
DELETE FROM classes WHERE school_id = (SELECT id FROM schools WHERE name = 'ГеоВикторина мектебі');
DELETE FROM schools WHERE name = 'ГеоВикторина мектебі';
