-- Tipo de carroceria do veículo (hatch, sedan, SUV, pick-up, van...). Usado pela
-- vistoria cautelar e pelo laudo para mostrar a silhueta do modelo certo.
alter table public.ordens_servico add column if not exists "veiculoTipo" varchar(30);
