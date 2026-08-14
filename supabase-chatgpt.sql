-- ==========================================
-- CERTIVE VISTORIAS — Assistente ChatGPT
-- Histórico de conversas do ChatGPT por operador
-- ==========================================

-- Conversa (uma "thread" de chat, pertencente a um operador)
CREATE TABLE IF NOT EXISTS chatgpt_conversas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "operadorId" BIGINT,
  "operadorNome" TEXT,
  "unidadeId" BIGINT,
  titulo TEXT NOT NULL DEFAULT 'Nova conversa',
  modelo TEXT DEFAULT 'gpt-4o',
  "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mensagens de cada conversa
CREATE TABLE IF NOT EXISTS chatgpt_mensagens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "conversaId" BIGINT NOT NULL REFERENCES chatgpt_conversas(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'user', -- 'user' | 'assistant' | 'system'
  conteudo TEXT NOT NULL DEFAULT '',
  "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_conversas_operador ON chatgpt_conversas("operadorId");
CREATE INDEX IF NOT EXISTS idx_chatgpt_conversas_atualizado ON chatgpt_conversas("atualizadoEm" DESC);
CREATE INDEX IF NOT EXISTS idx_chatgpt_mensagens_conversa ON chatgpt_mensagens("conversaId");

ALTER TABLE chatgpt_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatgpt_mensagens ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas (padrão do projeto — o controle de acesso é feito no cliente pela sessão do operador)
DROP POLICY IF EXISTS "allow_all_chatgpt_conversas" ON chatgpt_conversas;
CREATE POLICY "allow_all_chatgpt_conversas" ON chatgpt_conversas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_chatgpt_mensagens" ON chatgpt_mensagens;
CREATE POLICY "allow_all_chatgpt_mensagens" ON chatgpt_mensagens FOR ALL USING (true) WITH CHECK (true);
