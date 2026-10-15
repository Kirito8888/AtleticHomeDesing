-- v2.2 · Datos SINTÉTICOS para scripts/dev/test-migration.sh: sin datos reales, ids fijos «syn-…», correos @example.invalid.
-- Se cargan sobre la copia de la foto previa (esquema anterior a la migración que se prueba): solo columnas con valor
-- obligatorio, el resto por defecto. Idempotente (ON CONFLICT DO NOTHING). Si una versión futura cambia columnas
-- obligatorias de estas tablas, ajustar aquí.
INSERT INTO "User" ("id", "email", "name", "updatedAt") VALUES
  ('syn-u1', 'sintetica-1@example.invalid', 'Sintética Uno', now()),
  ('syn-u2', 'sintetica-2@example.invalid', 'Sintética Dos', now()),
  ('syn-coach', 'sintetica-coach@example.invalid', 'Sintética Entrenadora', now())
ON CONFLICT DO NOTHING;
UPDATE "User" SET "role" = 'COACH' WHERE "id" = 'syn-coach';

INSERT INTO "AthleteProfile" ("id", "userId", "heightCm", "ctlTimeConstant", "atlTimeConstant", "updatedAt") VALUES
  ('syn-p1', 'syn-u1', 172, 42, 7, now()),
  ('syn-p2', 'syn-u2', 165, 50, 10, now())
ON CONFLICT DO NOTHING;

-- 120 sesiones: fuerza, pista y técnica, repartidas entre las dos atletas; una de cada 40 viene «de Strava»
INSERT INTO "TrainingSession" ("id", "userId", "date", "type", "status", "title", "durationSec", "sessionRpe", "tss", "source", "externalId", "updatedAt")
SELECT 'syn-s' || n,
       CASE WHEN n % 2 = 0 THEN 'syn-u1' ELSE 'syn-u2' END,
       DATE '2026-06-01' + n,
       (ARRAY['STRENGTH', 'TRACK', 'TECHNICAL'])[1 + n % 3]::"SessionType",
       'COMPLETED',
       'Sesión sintética ' || n,
       3000 + n * 10,
       5 + (n % 5),
       30 + (n % 60),
       CASE WHEN n % 40 = 0 THEN 'STRAVA' END,
       CASE WHEN n % 40 = 0 THEN 'syn:' || n END,
       now()
FROM generate_series(1, 120) AS n
ON CONFLICT DO NOTHING;

INSERT INTO "StrengthSession" ("id", "sessionId")
SELECT 'syn-ss' || n, 'syn-s' || n FROM generate_series(1, 120) AS n WHERE n % 3 = 0 ON CONFLICT DO NOTHING;
INSERT INTO "StrengthSet" ("id", "strengthSessionId", "exerciseId", "order", "setIndex", "reps", "weightKg")
SELECT 'syn-set' || n || '-' || k, 'syn-ss' || n, (SELECT "id" FROM "Exercise" WHERE "userId" IS NULL ORDER BY "id" LIMIT 1), k, k, 5, 60 + k * 2.5
FROM generate_series(1, 120) AS n, generate_series(1, 3) AS k WHERE n % 3 = 0 ON CONFLICT DO NOTHING;

INSERT INTO "TrackSession" ("id", "sessionId", "modality")
SELECT 'syn-ts' || n, 'syn-s' || n, 'SPRINT' FROM generate_series(1, 120) AS n WHERE n % 3 = 1 ON CONFLICT DO NOTHING;
INSERT INTO "TrackInterval" ("id", "trackSessionId", "order")
SELECT 'syn-ti' || n || '-' || k, 'syn-ts' || n, k FROM generate_series(1, 120) AS n, generate_series(1, 4) AS k WHERE n % 3 = 1 ON CONFLICT DO NOTHING;

INSERT INTO "TechnicalSession" ("id", "sessionId", "event")
SELECT 'syn-te' || n, 'syn-s' || n, 'JAVELIN' FROM generate_series(1, 120) AS n WHERE n % 3 = 2 ON CONFLICT DO NOTHING;
INSERT INTO "TechnicalAttempt" ("id", "technicalSessionId", "order", "markM")
SELECT 'syn-ta' || n || '-' || k, 'syn-te' || n, k, 40 + (n % 7) + k * 0.5
FROM generate_series(1, 120) AS n, generate_series(1, 5) AS k WHERE n % 3 = 2 ON CONFLICT DO NOTHING;

INSERT INTO "PersonalRecord" ("id", "userId", "kind", "value", "achievedOn", "sessionId") VALUES
  ('syn-pr1', 'syn-u1', 'TECHNICAL_MARK', 44.5, DATE '2026-07-01', 'syn-s2'),
  ('syn-pr2', 'syn-u2', 'TECHNICAL_MARK', 39.8, DATE '2026-07-05', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO "DailyLoad" ("id", "userId", "date", "tss", "ctl", "atl", "tsb", "updatedAt")
SELECT 'syn-dl' || n, 'syn-u1', DATE '2026-06-01' + n, 40, 30 + n * 0.1, 35 + n * 0.1, -5, now() FROM generate_series(1, 60) AS n ON CONFLICT DO NOTHING;

INSERT INTO "CoachAthlete" ("id", "coachId", "athleteId", "status") VALUES ('syn-ca1', 'syn-coach', 'syn-u1', 'ACTIVE') ON CONFLICT DO NOTHING;
