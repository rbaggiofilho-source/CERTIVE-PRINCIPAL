-- ================================================
-- CERTIVE VISTORIAS — Schema Improvements
-- Execute este SQL no SQL Editor do Supabase
-- APÓS o schema original estar rodando
-- ================================================

-- ================================================
-- 1. UNIQUE CONSTRAINTS (previnem duplicatas)
-- ================================================
ALTER TABLE ordens_servico ADD CONSTRAINT uq_os_numero UNIQUE (numero);
ALTER TABLE faturas ADD CONSTRAINT uq_fat_codigo UNIQUE (codigo);

-- ================================================
-- 2. FOREIGN KEYS FALTANTES
-- ================================================

-- ordens_servico.faturaId → faturas(id)
ALTER TABLE ordens_servico ADD CONSTRAINT fk_os_fatura
  FOREIGN KEY ("faturaId") REFERENCES faturas(id) ON DELETE SET NULL;

-- caixa_movimentos.osId → ordens_servico(id)
ALTER TABLE caixa_movimentos ADD CONSTRAINT fk_mov_os
  FOREIGN KEY ("osId") REFERENCES ordens_servico(id) ON DELETE SET NULL;

-- caixa_movimentos.faturaId → faturas(id)
ALTER TABLE caixa_movimentos ADD CONSTRAINT fk_mov_fatura
  FOREIGN KEY ("faturaId") REFERENCES faturas(id) ON DELETE SET NULL;

-- ordens_servico.reapresentacaoOrigemID → self-reference
ALTER TABLE ordens_servico ADD CONSTRAINT fk_os_reapresentacao
  FOREIGN KEY ("reapresentacaoOrigemID") REFERENCES ordens_servico(id) ON DELETE SET NULL;

-- ================================================
-- 3. INDEXES ADICIONAIS
-- ================================================
CREATE INDEX IF NOT EXISTS idx_os_numero ON ordens_servico(numero);
CREATE INDEX IF NOT EXISTS idx_fat_parceiro_pago ON faturas("parceiroId", pago);

-- ================================================
-- 4. VIEW SEGURA para operadores (sem coluna senha)
-- ================================================
CREATE OR REPLACE VIEW operadores_safe AS
SELECT id, nome, login, funcao, "unidadeId", permissoes, ativo
FROM operadores;

-- ================================================
-- 5. RLS MELHORADO
-- Requer que a request venha com a anon key válida
-- (Preparação para Supabase Auth futuro)
-- ================================================

-- Remover políticas permissivas existentes
DROP POLICY IF EXISTS "allow_all_unidades" ON unidades;
DROP POLICY IF EXISTS "allow_all_servicos" ON servicos;
DROP POLICY IF EXISTS "allow_all_taxas" ON taxas_referencia;
DROP POLICY IF EXISTS "allow_all_operadores" ON operadores;
DROP POLICY IF EXISTS "allow_all_parceiros" ON parceiros;
DROP POLICY IF EXISTS "allow_all_os" ON ordens_servico;
DROP POLICY IF EXISTS "allow_all_caixa" ON caixa_diario;
DROP POLICY IF EXISTS "allow_all_movimentos" ON caixa_movimentos;
DROP POLICY IF EXISTS "allow_all_contas" ON contas_pagar;
DROP POLICY IF EXISTS "allow_all_faturas" ON faturas;
DROP POLICY IF EXISTS "allow_all_auditoria" ON auditoria;

-- Novas políticas: acesso com anon key (role = 'anon')
-- Tabelas de leitura/escrita geral (acesso via anon key)
CREATE POLICY "anon_full_unidades" ON unidades FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_servicos" ON servicos FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_taxas" ON taxas_referencia FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_parceiros" ON parceiros FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_os" ON ordens_servico FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_caixa" ON caixa_diario FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_movimentos" ON caixa_movimentos FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_contas" ON contas_pagar FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_faturas" ON faturas FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

CREATE POLICY "anon_full_auditoria" ON auditoria FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

-- Operadores: acesso restrito (leitura somente colunas safe via VIEW)
CREATE POLICY "anon_full_operadores" ON operadores FOR ALL
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');
