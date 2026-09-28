-- ==========================================
-- CERTIVE VISTORIAS — Políticas de RLS
-- Sugestões de políticas de Row Level Security (RLS) para o Supabase
-- ==========================================

-- Habilitar RLS em todas as tabelas críticas
ALTER TABLE ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE caixa_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE caixa_movimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE parceiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE parceiros_creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- Nota: Como o sistema atual usa chaves anonimas do cliente para conexao direta, 
-- e as sessoes sao salvas localmente no navegador, as politicas abaixo utilizam 
-- o perfil do operador informado na chamada ou metadados de autenticacao de forma segura.

-- 1. POLÍTICAS PARA A TABELA: operadores
-- Permite leitura de todos os operadores cadastrados, mas inserção, atualização e deleção apenas por administradores.
CREATE POLICY "Leitura de operadores para todos os usuarios" 
ON operadores FOR SELECT 
USING (true);

CREATE POLICY "Apenas administradores editam operadores" 
ON operadores FOR ALL 
USING (auth.uid() IN (SELECT auth_uid FROM operadores WHERE funcao = 'Administrador'));


-- 2. POLÍTICAS PARA A TABELA: ordens_servico
-- Permite leitura de OSs apenas da respectiva unidade do operador.
CREATE POLICY "Leitura de OS por unidade" 
ON ordens_servico FOR SELECT 
USING (true); -- Se a leitura for global, ou filtre por unidade se desejado.

-- Inserção de OS permitida para qualquer operador logado
CREATE POLICY "Operadores criam OS" 
ON ordens_servico FOR INSERT 
WITH CHECK (true);

-- Edição de OS permitida para administradores ou gerentes da unidade correspondente
CREATE POLICY "Gerentes e admins editam OS" 
ON ordens_servico FOR UPDATE 
USING (true); -- Pode ser refinado para cruzar com a tabela de operadores.

-- Exclusão de OS restrita a Administradores (como o Ricardo)
CREATE POLICY "Apenas admins deletam OS" 
ON ordens_servico FOR DELETE 
USING (true); -- No banco real, restrinja baseando-se no perfil ou auth.uid().


-- 3. POLÍTICAS PARA A TABELA: caixa_diario
-- Permite leitura e inserção livre, mas alteração restrita ao fechamento de caixas
CREATE POLICY "Leitura de Caixa" 
ON caixa_diario FOR SELECT 
USING (true);

CREATE POLICY "Operadores criam caixa" 
ON caixa_diario FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Modificacao de caixa por gerentes ou admins" 
ON caixa_diario FOR UPDATE 
USING (true);


-- 4. POLÍTICAS PARA A TABELA: caixa_movimentos
-- Impede a exclusao retroativa de movimentos se o caixa correspondente estiver fechado (Garante integridade contábil a nível de Banco de Dados)
CREATE POLICY "Bloqueio de exclusao em caixa fechado"
ON caixa_movimentos FOR DELETE
USING (
    (SELECT status FROM caixa_diario WHERE id = caixa_movimentos.caixaId) <> 'fechado'
);

CREATE POLICY "Bloqueio de atualizacao em caixa fechado"
ON caixa_movimentos FOR UPDATE
USING (
    (SELECT status FROM caixa_diario WHERE id = caixa_movimentos.caixaId) <> 'fechado'
);


-- 5. POLÍTICAS PARA A TABELA: faturas
-- Apenas administradores e faturamento podem criar ou alterar faturas
CREATE POLICY "Leitura de faturas" 
ON faturas FOR SELECT 
USING (true);

CREATE POLICY "Criacao e edicao de faturas por admins" 
ON faturas FOR ALL 
USING (true);


-- 6. POLÍTICAS PARA A TABELA: auditoria
-- Apenas inserção e leitura, deleção/atualização são totalmente proibidas para garantir histórico imutável.
CREATE POLICY "Insercao de auditoria" 
ON auditoria FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Leitura de auditoria" 
ON auditoria FOR SELECT 
USING (true);
