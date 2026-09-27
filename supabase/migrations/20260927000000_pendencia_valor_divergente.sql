-- ==========================================
-- CERTIVE VISTORIAS — Auditoria de fechamento
-- Novo tipo de pendência: valor_divergente
-- ==========================================
--
-- A conferência do fechamento passou a comparar também o VALOR do laudo do
-- DETRAN com o valor da OS (combos ficam de fora, pois a OS cobra o pacote e o
-- DETRAN registra só a transferência). Quando o valor difere, gera uma
-- pendência do tipo 'valor_divergente'. É preciso permitir esse valor no check.

alter table public.pendencias_fechamento
  drop constraint if exists pendencias_fechamento_tipo_check;

alter table public.pendencias_fechamento
  add constraint pendencias_fechamento_tipo_check
  check (tipo in ('laudo_sem_os','os_sem_laudo','placa_errada','valor_divergente','os_aberta'));
