-- 1. Criação da Tabela de Configurações (Ajustes Globais da Plataforma)
CREATE TABLE IF NOT EXISTS configuracoes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zap_responsavel TEXT,
    zap_dias_aviso INTEGER DEFAULT 3,
    zap_template TEXT DEFAULT 'Atenção: A conta {descricao} no valor de R$ {valor} vence no dia {vencimento}',
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS para configurações
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para configuracoes (Permitir tudo para usuários autenticados/anonimos, pois é uma tabela global)
DROP POLICY IF EXISTS "allow_all_configuracoes" ON configuracoes;
CREATE POLICY "allow_all_configuracoes" ON configuracoes FOR ALL USING (true) WITH CHECK (true);

-- Inserir uma linha padrão caso não exista
INSERT INTO configuracoes (zap_dias_aviso) 
SELECT 3 WHERE NOT EXISTS (SELECT 1 FROM configuracoes);

-- 2. Adicionar coluna na tabela de contas a pagar para evitar envios duplicados
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS notificacao_enviada BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Função para o pg_cron (caso utilize no Supabase para rodar a Edge Function todo dia às 08h)
-- Nota: O pg_cron requer permissões de superusuário e a extensão habilitada.
-- Descomente e execute o bloco abaixo diretamente no SQL Editor do Supabase após configurar o cron e os Secrets.

/*
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'notificacao-diaria-contas',
  '0 8 * * *', -- Todos os dias às 8:00 AM UTC (Ajuste para seu fuso se necessário)
  $$
    SELECT net.http_post(
      url:='https://SEU_PROJETO.supabase.co/functions/v1/notify-bills',
      headers:='{"Authorization": "Bearer SEU_ANON_KEY"}'::jsonb
    );
  $$
);
*/
