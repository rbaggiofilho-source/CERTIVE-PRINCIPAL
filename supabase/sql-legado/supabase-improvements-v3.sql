-- ================================================
-- Atualização V3: Adição de Metas Financeiras
-- ================================================

-- 1. Adicionar a coluna de metas financeiras (orçamentos por categoria) na tabela de unidades
ALTER TABLE unidades 
ADD COLUMN IF NOT EXISTS "metasFinanceiras" JSONB DEFAULT '{}';

-- 2. Atualizar o schema cache
NOTIFY pgrst, 'reload schema';
