-- Inscrições de notificações push (Web Push) por dispositivo
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  "operadorId" BIGINT,
  "operadorNome" TEXT,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "userAgent" TEXT,
  "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_admin ON push_subscriptions("isAdmin");

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_push_subscriptions" ON push_subscriptions;
CREATE POLICY "allow_all_push_subscriptions" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);
