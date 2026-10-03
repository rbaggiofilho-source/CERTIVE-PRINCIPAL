-- Data de vencimento da cobrança Asaas, para exibir "Vencimento DD/MM" no QR da
-- fatura. O QR dinâmico do Asaas continua pagável após o vencimento (expira ~1
-- ano), então mostrar a expiração real do QR confundiria; o vencimento (5 dias)
-- é a data que faz sentido para o parceiro.
alter table public.faturas add column if not exists asaas_vencimento text;
