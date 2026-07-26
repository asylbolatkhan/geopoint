ALTER TABLE students ADD COLUMN school_id INT REFERENCES schools(id);
UPDATE students s SET school_id = c.school_id FROM classes c WHERE s.class_id = c.id;
UPDATE students SET school_id = (SELECT id FROM schools ORDER BY id LIMIT 1)
WHERE school_id IS NULL AND role IN ('teacher', 'admin');
ALTER TABLE students DROP CONSTRAINT students_role_check;
ALTER TABLE students ADD CONSTRAINT students_role_check
  CHECK (role IN ('student', 'teacher', 'player', 'admin'));
ALTER TABLE schools ADD CONSTRAINT schools_name_key UNIQUE (name);
CREATE INDEX students_school_idx ON students (school_id);
