-- Adicionando campos à tabela de parceiros para suporte ao Asaas e Notificações
ALTER TABLE parceiros
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS whatsapp TEXT,
ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

-- Adicionando campos à tabela de faturas para suporte ao Asaas e Notificações
ALTER TABLE faturas
ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_url TEXT,
ADD COLUMN IF NOT EXISTS notificacao_zap BOOLEAN NOT NULL DEFAULT false;

-- Permitir update na tabela faturas para as funções anonimas caso necessário (ex: Webhook)
-- Ou assumimos que o Webhook usará service_role, o que é mais seguro.
