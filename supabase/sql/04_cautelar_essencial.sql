-- ============================================================
-- 04 — CAUTELAR ESSENCIAL: schema do novo laudo próprio da Certive
-- ------------------------------------------------------------
-- ADITIVO e SEGURO. Cria uma família de tabelas NOVA, em paralelo,
-- sem tocar nas tabelas atuais (cautelares / cautelares_secoes /
-- cautelares_fotos / cautelares_pesquisas), que continuam servindo
-- o módulo que está no ar. A virada para o novo módulo acontece
-- depois, num passo controlado — os dados históricos permanecem
-- intactos e acessíveis (tabela legada só-leitura).
--
-- Convenções seguidas do projeto:
--   - schema public, SERIAL PK, snake_case;
--   - os_id  -> ordens_servico(id)  (chave de junção do módulo);
--   - vistoriador_id -> operadores(id);
--   - unidade_id em TODAS as tabelas (arquitetura multiunidade);
--   - RLS: ao rodar 02_rls_autenticado.sql novamente, estas tabelas
--     recebem automaticamente a política "só autenticado" (o bloco
--     percorre todas as tabelas de public). O isolamento por unidade
--     é feito na aplicação (activeUnitId), como no resto do sistema.
--
-- Preparado para os níveis AVANCADO e ABSOLUTO: o campo `nivel`
-- existe desde já e novos blocos entram como novas tabelas cautelar_*
-- ligadas por os_id, sem refatorar o Essencial.
--
-- Nomeação: a tabela principal chama-se `cautelar` (singular) para
-- coexistir com a legada `cautelares` (plural) até a virada.
-- ============================================================

-- 1) Principal — um laudo por OS
create table if not exists public.cautelar (
  id              serial primary key,
  os_id           integer not null unique references public.ordens_servico(id) on delete cascade,
  unidade_id      integer not null,
  nivel           varchar(12) not null default 'ESSENCIAL'
                    check (nivel in ('ESSENCIAL','AVANCADO','ABSOLUTO')),
  -- dados do veículo (bloco 2)
  placa           varchar(10),
  chassi          varchar(30),
  renavam         varchar(20),
  fabricante      varchar(60),
  modelo          varchar(80),
  cor             varchar(30),
  ano_fabricacao  varchar(4),
  ano_modelo      varchar(4),
  combustivel     varchar(30),
  numero_motor    varchar(40),
  quilometragem   integer,
  -- abertura (bloco 1) / contexto
  vistoriador_id  integer references public.operadores(id) on delete set null,
  solicitante     varchar(120),
  tipo_cliente    varchar(40),
  data_vistoria   timestamp with time zone,
  local_vistoria  varchar(160),
  -- parecer (bloco 9)
  parecer         varchar(28)
                    check (parecer in ('CONFORME','CONFORME_COM_APONTAMENTO','NAO_CONFORME')),
  observacao_geral text,
  status          varchar(30) not null default 'em_captura',
  created_at      timestamp with time zone not null default now(),
  updated_at      timestamp with time zone not null default now()
);
create index if not exists idx_cautelar_os_id on public.cautelar(os_id);
create index if not exists idx_cautelar_unidade on public.cautelar(unidade_id);

-- 2) Estrutura — 21 pontos (origem FISICA)
create table if not exists public.cautelar_estrutura (
  id           serial primary key,
  os_id        integer not null references public.ordens_servico(id) on delete cascade,
  unidade_id   integer not null,
  ponto_codigo varchar(40) not null,
  ponto_nome   varchar(80) not null,
  grupo        varchar(20) not null,
  status       varchar(20),
  observacao   text,
  unique (os_id, ponto_codigo)
);
create index if not exists idx_cautelar_estrutura_os on public.cautelar_estrutura(os_id);

-- 3) Pintura — 15 pontos (origem FISICA)
create table if not exists public.cautelar_pintura (
  id           serial primary key,
  os_id        integer not null references public.ordens_servico(id) on delete cascade,
  unidade_id   integer not null,
  ponto_numero integer not null check (ponto_numero between 1 and 15),
  ponto_nome   varchar(60) not null,
  status       varchar(30),
  unique (os_id, ponto_numero)
);
create index if not exists idx_cautelar_pintura_os on public.cautelar_pintura(os_id);

-- 4) Etiquetas (origem FISICA)
create table if not exists public.cautelar_etiquetas (
  id         serial primary key,
  os_id      integer not null references public.ordens_servico(id) on delete cascade,
  unidade_id integer not null,
  ponto_nome varchar(80) not null,
  condicao   varchar(20),
  unique (os_id, ponto_nome)
);
create index if not exists idx_cautelar_etiquetas_os on public.cautelar_etiquetas(os_id);

-- 5) Vidros — 6 pontos (origem FISICA)
create table if not exists public.cautelar_vidros (
  id             serial primary key,
  os_id          integer not null references public.ordens_servico(id) on delete cascade,
  unidade_id     integer not null,
  ponto_nome     varchar(60) not null,
  condicao       varchar(20),
  chassi_gravado boolean not null default false,
  unique (os_id, ponto_nome)
);
create index if not exists idx_cautelar_vidros_os on public.cautelar_vidros(os_id);

-- 6) Identificação veicular — MOTOR e CHASSI (origem FISICA)
create table if not exists public.cautelar_identificacao (
  id         serial primary key,
  os_id      integer not null references public.ordens_servico(id) on delete cascade,
  unidade_id integer not null,
  item       varchar(10) not null check (item in ('MOTOR','CHASSI')),
  status     varchar(20),
  unique (os_id, item)
);
create index if not exists idx_cautelar_identificacao_os on public.cautelar_identificacao(os_id);

-- 7) Fotos — com GPS e timestamp (origem FISICA)
create table if not exists public.cautelar_fotos (
  id          serial primary key,
  os_id       integer not null references public.ordens_servico(id) on delete cascade,
  unidade_id  integer not null,
  bloco       varchar(50) not null,   -- codigo do slot obrigatório
  legenda     varchar(120),
  url         text,
  latitude    double precision,
  longitude   double precision,
  captured_at timestamp with time zone,
  unique (os_id, bloco)
);
create index if not exists idx_cautelar_fotos_os on public.cautelar_fotos(os_id);

-- 8) Consulta veicular — bloco plugável (origem CONSULTA: hoje UNION, futuro SERPRO)
create table if not exists public.cautelar_consulta (
  id                serial primary key,
  os_id             integer not null references public.ordens_servico(id) on delete cascade,
  unidade_id        integer not null,
  fonte             varchar(20) not null check (fonte in ('UNION','SERPRO')),
  token             varchar(120),
  codigo_consulta   varchar(120),
  consultado_em     timestamp with time zone,
  base_atualizada_em timestamp with time zone,
  payload_json      jsonb
);
create index if not exists idx_cautelar_consulta_os on public.cautelar_consulta(os_id);

-- 9) Débitos — 11 rubricas (origem CONSULTA); o total é somado na aplicação/laudo
create table if not exists public.cautelar_debitos (
  id         serial primary key,
  os_id      integer not null references public.ordens_servico(id) on delete cascade,
  unidade_id integer not null,
  rubrica    varchar(40) not null,
  valor      numeric(12,2) not null default 0,
  unique (os_id, rubrica)
);
create index if not exists idx_cautelar_debitos_os on public.cautelar_debitos(os_id);

-- ------------------------------------------------------------
-- RLS: rode (ou re-rode) o 02_rls_autenticado.sql DEPOIS deste
-- arquivo — ele aplica a política "só autenticado" a todas as
-- tabelas novas automaticamente. (Enquanto o banco estiver aberto,
-- estas tabelas seguem a mesma política das demais.)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- REVERSÃO (se necessário) — remove apenas a família nova:
--   drop table if exists public.cautelar_debitos, public.cautelar_consulta,
--     public.cautelar_fotos, public.cautelar_identificacao, public.cautelar_vidros,
--     public.cautelar_etiquetas, public.cautelar_pintura, public.cautelar_estrutura,
--     public.cautelar cascade;
-- ============================================================
