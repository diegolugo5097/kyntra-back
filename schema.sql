-- Esquema para la app de asignación de rutinas
-- Diseñado para Neon (Postgres)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('trainer', 'user')),
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  trainer_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- solo aplica a role='user'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración: unidad de peso preferida de cada cuenta (afecta solo cómo se muestra, siempre se guarda en kg)
ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb'));

-- Bloques/días de entrenamiento (ej: "TORSO A", "Push", "Pierna B")
CREATE TABLE IF NOT EXISTS routine_days (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- "TORSO A", "Push", etc.
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ejercicios dentro de un día — nombre, indicaciones y objetivos, todos definidos por el entrenador
CREATE TABLE IF NOT EXISTS exercises (
  id SERIAL PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES routine_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_sets INTEGER,
  target_reps TEXT,            -- ej: "6-8"
  rir INTEGER,
  rpe TEXT,                    -- ej: "8-9"
  rest TEXT,                   -- descanso entre series, ej: "60-90s"
  notes TEXT,                  -- indicaciones del entrenador al crear el ejercicio
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración: por si la tabla ya existía sin esta columna
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS rest TEXT;

-- Registro de series realizadas por el usuario (equivalente a "Registro Diario")
CREATE TABLE IF NOT EXISTS exercise_logs (
  id SERIAL PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  set_number INTEGER NOT NULL,
  weight_kg NUMERIC(6,2),
  reps INTEGER,
  rir INTEGER,
  rpe NUMERIC(3,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fotos / videos subidos por el usuario (Cloudinary)
CREATE TABLE IF NOT EXISTS media_uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
  day_id INTEGER REFERENCES routine_days(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  observation TEXT,                 -- comentario del entrenador
  observation_by INTEGER REFERENCES users(id),
  observation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medidas corporales: el entrenador las registra periódicamente, queda un historial por fecha.
-- Todos los campos son opcionales salvo la fecha.
CREATE TABLE IF NOT EXISTS body_metrics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  height_cm NUMERIC(5,1),
  weight_kg NUMERIC(6,2),
  body_fat_pct NUMERIC(4,1),
  chest_cm NUMERIC(5,1),        -- pecho
  waist_cm NUMERIC(5,1),        -- torso/cintura
  arm_left_cm NUMERIC(5,1),     -- brazo izquierdo
  arm_right_cm NUMERIC(5,1),    -- brazo derecho
  leg_left_cm NUMERIC(5,1),     -- pierna izquierda
  leg_right_cm NUMERIC(5,1),    -- pierna derecha
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración: por si la tabla ya existía sin estas columnas
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS chest_cm NUMERIC(5,1);
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS waist_cm NUMERIC(5,1);
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS arm_cm NUMERIC(5,1);   -- columna vieja, ya no se usa
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS leg_cm NUMERIC(5,1);   -- columna vieja, ya no se usa
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS arm_left_cm NUMERIC(5,1);
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS arm_right_cm NUMERIC(5,1);
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS leg_left_cm NUMERIC(5,1);
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS leg_right_cm NUMERIC(5,1);

-- Migración de datos: si ya habías guardado una sola medida de brazo/pierna, la pasamos al lado
-- izquierdo para no perderla (puedes editarla después si quieres separar los valores reales)
UPDATE body_metrics SET arm_left_cm = arm_cm WHERE arm_cm IS NOT NULL AND arm_left_cm IS NULL;
UPDATE body_metrics SET leg_left_cm = leg_cm WHERE leg_cm IS NOT NULL AND leg_left_cm IS NULL;

-- Notificaciones (ej: al entrenador cuando el usuario sube algo)
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,               -- 'new_upload', 'new_observation', 'new_message'
  message TEXT NOT NULL,
  related_upload_id INTEGER REFERENCES media_uploads(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat directo entrenador <-> usuario
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suscripciones de notificaciones push (una por navegador/dispositivo en el que el usuario las active)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_days_user ON routine_days(user_id);
CREATE INDEX IF NOT EXISTS idx_exercises_day ON exercises(day_id);
CREATE INDEX IF NOT EXISTS idx_logs_exercise ON exercise_logs(exercise_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_date ON exercise_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_media_user ON media_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_body_metrics_user ON body_metrics(user_id, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
