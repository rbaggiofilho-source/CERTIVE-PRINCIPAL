-- ============================================================
-- 01 — PREPARAR a tabela operadores  (ADITIVO / SEGURO)
-- Pode rodar AGORA. Não muda nada no funcionamento atual do
-- sistema; apenas prepara a estrutura para o login novo.
-- ============================================================

-- Liga cada operador à sua conta de login do Supabase Auth.
alter table public.operadores
  add column if not exists user_id uuid unique
  references auth.users(id) on delete set null;

-- A senha deixa de ser obrigatória na tabela (ela passa a viver, criptografada,
-- só no Supabase Auth). Isto NÃO afeta o sistema atual, que continua preenchendo
-- a senha normalmente até a virada. Na virada, a coluna senha será removida.
alter table public.operadores
  alter column senha drop not null;

-- Obs.: a coluna id já é "identity" (gera automaticamente), então não é
-- necessário criar sequência/default — novos operadores já recebem id sozinhos.
