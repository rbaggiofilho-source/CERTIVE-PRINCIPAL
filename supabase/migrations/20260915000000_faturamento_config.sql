-- Configuração de faturamento: dados bancários (instruções de pagamento) e
-- texto padrão do e-mail. Ficam na linha única de configuracoes_gerais.
ALTER TABLE configuracoes_gerais
ADD COLUMN IF NOT EXISTS "fatBanco" JSONB,
ADD COLUMN IF NOT EXISTS "fatEmailAssunto" TEXT,
ADD COLUMN IF NOT EXISTS "fatEmailCorpo" TEXT;

-- URL do PDF gerado no fechamento da fatura (reutilizado por Asaas/e-mail).
ALTER TABLE faturas
ADD COLUMN IF NOT EXISTS "pdf_url" TEXT;
