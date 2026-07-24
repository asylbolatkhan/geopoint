CREATE TABLE announcements (
  month_key TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Алғашқы деплойда өткен айдың кеш хабарламасы кетіп қалмас үшін алдын-ала claim ету
INSERT INTO announcements (month_key)
VALUES (to_char((now() AT TIME ZONE 'Asia/Almaty') - interval '1 month', 'YYYY-MM'));
