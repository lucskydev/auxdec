-- =====================================================================
-- v2_0002 — itens de análise (fórmulas e agregados), filtros e
-- configuração persistente da análise.
-- Colunas "*_tipo" geradas fixam, por FK composta, que fórmulas e
-- agregados só referenciem itens NUMÉRICOS (e agregados só agregados).
-- =====================================================================

create table public.v2_itens_analise (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  escopo_id     uuid not null,
  nome          text not null check (btrim(nome) <> ''),
  descricao     text,
  tipo          text not null check (tipo in ('formula', 'agregado')),
  formula_texto text,
  peso          smallint,
  versao        integer not null default 1 check (versao >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  unique (id, escopo_id),
  unique (id, tipo),
  check ((tipo = 'formula' and formula_texto is not null and btrim(formula_texto) <> '' and peso is null)
      or (tipo = 'agregado' and formula_texto is null and peso between 1 and 10))
);
create unique index v2_itens_analise_nome_uq on public.v2_itens_analise (escopo_id, lower(btrim(nome)));

-- Dependências de uma fórmula (derivadas do texto no momento de salvar).
create table public.v2_analise_refs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  escopo_id       uuid not null,
  analise_id      uuid not null,
  analise_tipo    text not null default 'formula' check (analise_tipo = 'formula'),
  item_modelo_id  uuid,
  item_produto_id uuid,
  item_analise_id uuid,
  ref_modelo_tipo  text generated always as (case when item_modelo_id  is not null then 'numerico' end) stored,
  ref_produto_tipo text generated always as (case when item_produto_id is not null then 'numerico' end) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  foreign key (analise_id, escopo_id) references public.v2_itens_analise (id, escopo_id) on delete cascade,
  foreign key (analise_id, analise_tipo) references public.v2_itens_analise (id, tipo) on delete cascade,
  -- NO ACTION: item referenciado não pode ser excluído.
  foreign key (item_modelo_id, escopo_id) references public.v2_itens_modelo (id, escopo_id),
  foreign key (item_modelo_id, ref_modelo_tipo) references public.v2_itens_modelo (id, tipo),
  foreign key (item_produto_id, escopo_id) references public.v2_itens_produto (id, escopo_id),
  foreign key (item_produto_id, ref_produto_tipo) references public.v2_itens_produto (id, tipo),
  foreign key (item_analise_id, escopo_id) references public.v2_itens_analise (id, escopo_id),
  check (num_nonnulls(item_modelo_id, item_produto_id, item_analise_id) = 1)
);
create unique index v2_analise_refs_uq
  on public.v2_analise_refs (analise_id, coalesce(item_modelo_id, item_produto_id, item_analise_id));
create index v2_analise_refs_modelo_idx  on public.v2_analise_refs (item_modelo_id)  where item_modelo_id  is not null;
create index v2_analise_refs_produto_idx on public.v2_analise_refs (item_produto_id) where item_produto_id is not null;
create index v2_analise_refs_analise_idx on public.v2_analise_refs (item_analise_id) where item_analise_id is not null;

-- Componentes (inclusões) de um agregado: 2 a 5, cada um com peso, direção e limites.
create table public.v2_agregado_componentes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  escopo_id       uuid not null,
  agregado_id     uuid not null,
  agregado_tipo   text not null default 'agregado' check (agregado_tipo = 'agregado'),
  ordem           smallint not null check (ordem between 1 and 5),
  peso            smallint not null check (peso between 1 and 10),
  direcao         text not null check (direcao in ('maior', 'menor')),
  lmin            numeric not null,
  lmax            numeric not null,
  item_modelo_id  uuid,
  item_produto_id uuid,
  item_analise_id uuid,
  ref_modelo_tipo  text generated always as (case when item_modelo_id  is not null then 'numerico' end) stored,
  ref_produto_tipo text generated always as (case when item_produto_id is not null then 'numerico' end) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  foreign key (agregado_id, escopo_id) references public.v2_itens_analise (id, escopo_id) on delete cascade,
  foreign key (agregado_id, agregado_tipo) references public.v2_itens_analise (id, tipo) on delete cascade,
  foreign key (item_modelo_id, escopo_id) references public.v2_itens_modelo (id, escopo_id),
  foreign key (item_modelo_id, ref_modelo_tipo) references public.v2_itens_modelo (id, tipo),
  foreign key (item_produto_id, escopo_id) references public.v2_itens_produto (id, escopo_id),
  foreign key (item_produto_id, ref_produto_tipo) references public.v2_itens_produto (id, tipo),
  foreign key (item_analise_id, escopo_id) references public.v2_itens_analise (id, escopo_id),
  unique (agregado_id, ordem),
  check (lmin <> lmax),
  check (num_nonnulls(item_modelo_id, item_produto_id, item_analise_id) = 1)
);
create index v2_agregado_comp_modelo_idx  on public.v2_agregado_componentes (item_modelo_id)  where item_modelo_id  is not null;
create index v2_agregado_comp_produto_idx on public.v2_agregado_componentes (item_produto_id) where item_produto_id is not null;
create index v2_agregado_comp_analise_idx on public.v2_agregado_componentes (item_analise_id) where item_analise_id is not null;

-- Filtros salvos (a ativação na tela de análise fica na sessão do navegador).
create table public.v2_filtros (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  escopo_id  uuid not null,
  nome       text not null check (btrim(nome) <> ''),
  descricao  text,
  logica     text not null default 'AND' check (logica in ('AND', 'OR')),
  versao     integer not null default 1 check (versao >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  unique (id, escopo_id)
);
create unique index v2_filtros_nome_uq on public.v2_filtros (escopo_id, lower(btrim(nome)));

create table public.v2_filtro_condicoes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  escopo_id       uuid not null,
  filtro_id       uuid not null,
  ordem           smallint not null check (ordem >= 1),
  item_modelo_id  uuid,
  item_produto_id uuid,
  item_analise_id uuid,
  operador        text not null check (operador in ('=', '≠', '<', '>', '≤', '≥')),
  valor_num       numeric,
  valor_txt       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  foreign key (filtro_id, escopo_id) references public.v2_filtros (id, escopo_id) on delete cascade,
  foreign key (item_modelo_id, escopo_id) references public.v2_itens_modelo (id, escopo_id),
  foreign key (item_produto_id, escopo_id) references public.v2_itens_produto (id, escopo_id),
  foreign key (item_analise_id, escopo_id) references public.v2_itens_analise (id, escopo_id),
  unique (filtro_id, ordem),
  check (num_nonnulls(item_modelo_id, item_produto_id, item_analise_id) = 1),
  check (num_nonnulls(valor_num, valor_txt) = 1)
);
create index v2_filtro_cond_modelo_idx  on public.v2_filtro_condicoes (item_modelo_id)  where item_modelo_id  is not null;
create index v2_filtro_cond_produto_idx on public.v2_filtro_condicoes (item_produto_id) where item_produto_id is not null;
create index v2_filtro_cond_analise_idx on public.v2_filtro_condicoes (item_analise_id) where item_analise_id is not null;

-- Configuração persistente de apresentação da análise (uma linha por escopo).
create table public.v2_config_analise (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid(),
  escopo_id           uuid not null unique,
  modo                text not null default 'ambos' check (modo in ('modelos', 'produtos', 'ambos', 'analise')),
  logica_global       text not null default 'AND' check (logica_global in ('AND', 'OR')),
  agregado_ranking_id uuid,
  ranking_tipo        text generated always as (case when agregado_ranking_id is not null then 'agregado' end) stored,
  colunas             jsonb not null default '{}'::jsonb check (jsonb_typeof(colunas) = 'object'),
  ordenacao           jsonb not null default '[]'::jsonb check (jsonb_typeof(ordenacao) = 'array'),
  versao              integer not null default 1 check (versao >= 1),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  -- NO ACTION: o agregado usado no ranking não pode ser excluído.
  foreign key (agregado_ranking_id, escopo_id) references public.v2_itens_analise (id, escopo_id),
  foreign key (agregado_ranking_id, ranking_tipo) references public.v2_itens_analise (id, tipo)
);
