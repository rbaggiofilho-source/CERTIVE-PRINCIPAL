-- MIGRATION TO SUPPORT EMAIL, COMBO, AND RETORNO LOGIC
-- Execute this script in the Supabase SQL Editor (https://supabase.com/dashboard/project/xktsvimtkwjegzaljfpm/sql/new)

-- 1. Add email column to parceiros table (make it text)
ALTER TABLE parceiros ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Add email, combo and retorno columns to ordens_servico table
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "clienteEmail" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "comboVistoria" BOOLEAN DEFAULT FALSE;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "isRetorno" BOOLEAN DEFAULT FALSE;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "retornoOrigemOSId" BIGINT REFERENCES ordens_servico(id) ON DELETE SET NULL;

-- 3. Update existing operators/administrators or partners if needed
UPDATE parceiros SET email = 'financeiro@parceiro.com.br' WHERE email IS NULL;

-- 4. Adjust database ID sequence to prevent identity key conflicts
SELECT setval(pg_get_serial_sequence('operadores', 'id'), coalesce(max(id), 1)) FROM operadores;

-- 5. Insert new operators with full system access
INSERT INTO operadores (nome, login, senha, funcao, "unidadeId", permissoes, ativo)
VALUES 
('Jonas Kroll', 'Jkroll', '070142', 'Gerente Geral', 1, ARRAY['abertura_os', 'caixa', 'faturamento', 'contas', 'cadastros', 'bi'], true),
('Romano Gonzales Mendes', 'Rgmendes', '135586', 'Gerente Geral', 1, ARRAY['abertura_os', 'caixa', 'faturamento', 'contas', 'cadastros', 'bi'], true)
ON CONFLICT (login) DO NOTHING;

-- 6. Readjust sequence after insertions
SELECT setval(pg_get_serial_sequence('operadores', 'id'), coalesce(max(id), 1)) FROM operadores;
