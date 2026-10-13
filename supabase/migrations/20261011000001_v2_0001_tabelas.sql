-- v2_0001_tabelas.sql
-- Auxdec v2 — tabelas, chaves, restrições e índices.
-- Objetos criados (todos com prefixo v2_):
--   tabelas: v2_escopos, v2_itens_modelo, v2_itens_produto, v2_modelos, v2_produtos,
--            v2_imagens, v2_modelo_valores, v2_produto_valores, v2_itens_analise,
--            v2_analise_refs, v2_agregado_componentes, v2_filtros, v2_filtro_condicoes,
--            v2_config_analise
-- Nenhum objeto sem prefixo v2_ é criado, alterado ou removido.

-- ---------------------------------------------------------------- escopos
create table public.v2_escopos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text not null,
  descricao     text,
  ultimo_acesso timestamptz not null default now(),
  versao        integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint v2_escopos_nome_ck check (btrim(nome) <> ''),
  constraint v2_escopos_id_user_uq unique (id, user_id)
);
create unique index v2_escopos_nome_uq on public.v2_escopos (user_id, lower(btrim(nome)));

-- ----------------------------------------------------------- itens de modelo
create table public.v2_itens_modelo (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  escopo_id       uuid not null,
  nome            text not null,
  descricao       text,
  tipo            text not null,
  unidade         text,
  casas_decimais  smallint,
  valor_min       numeric,
  valor_max       numeric,
  versao          integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint v2_itens_modelo_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_itens_modelo_nome_ck check (btrim(nome) <> ''),
  constraint v2_itens_modelo_tipo_ck check (tipo in ('numerico', 'textual', 'imagem')),
  constraint v2_itens_modelo_casas_ck check (casas_decimais is null or casas_decimais between 0 and 10),
  constraint v2_itens_modelo_limites_ck check (valor_min is null or valor_max is null or valor_min <= valor_max),
  -- numeric aceita NaN e ±Infinity; em numeric o NaN é maior que tudo, então "< Infinity" rejeita os três
  constraint v2_itens_modelo_finito_ck check (
    (valor_min is null or abs(valor_min) < 'Infinity'::numeric) and (valor_max is null or abs(valor_max) < 'Infinity'::numeric)),
  constraint v2_itens_modelo_so_numerico_ck check (
    tipo = 'numerico'
    or (unidade is null and casas_decimais is null and valor_min is null and valor_max is null)),
  constraint v2_itens_modelo_id_escopo_uq unique (id, escopo_id),
  constraint v2_itens_modelo_id_tipo_uq unique (id, tipo)
);
create unique index v2_itens_modelo_nome_uq on public.v2_itens_modelo (escopo_id, lower(btrim(nome)));

-- ---------------------------------------------------------- itens de produto
create table public.v2_itens_produto (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  escopo_id       uuid not null,
  nome            text not null,
  descricao       text,
  tipo            text not null,
  unidade         text,
  casas_decimais  smallint,
  valor_min       numeric,
  valor_max       numeric,
  versao          integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint v2_itens_produto_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_itens_produto_nome_ck check (btrim(nome) <> ''),
  constraint v2_itens_produto_tipo_ck check (tipo in ('numerico', 'textual', 'imagem')),
  constraint v2_itens_produto_casas_ck check (casas_decimais is null or casas_decimais between 0 and 10),
  constraint v2_itens_produto_limites_ck check (valor_min is null or valor_max is null or valor_min <= valor_max),
  constraint v2_itens_produto_finito_ck check (
    (valor_min is null or abs(valor_min) < 'Infinity'::numeric) and (valor_max is null or abs(valor_max) < 'Infinity'::numeric)),
  constraint v2_itens_produto_so_numerico_ck check (
    tipo = 'numerico'
    or (unidade is null and casas_decimais is null and valor_min is null and valor_max is null)),
  constraint v2_itens_produto_id_escopo_uq unique (id, escopo_id),
  constraint v2_itens_produto_id_tipo_uq unique (id, tipo)
);
create unique index v2_itens_produto_nome_uq on public.v2_itens_produto (escopo_id, lower(btrim(nome)));

-- ------------------------------------------------------------------- modelos
create table public.v2_modelos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  escopo_id   uuid not null,
  nome        text not null,
  descricao   text,
  versao      integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint v2_modelos_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_modelos_nome_ck check (btrim(nome) <> ''),
  constraint v2_modelos_id_escopo_uq unique (id, escopo_id)
);
create unique index v2_modelos_nome_uq on public.v2_modelos (escopo_id, lower(btrim(nome)));

-- ------------------------------------------------------------------ produtos
create table public.v2_produtos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  escopo_id   uuid not null,
  nome        text not null,
  descricao   text,
  modelo_id   uuid,
  versao      integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint v2_produtos_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  -- NO ACTION: impede excluir modelo com produtos e impede modelo de outro escopo.
  constraint v2_produtos_modelo_fk foreign key (modelo_id, escopo_id)
    references public.v2_modelos (id, escopo_id),
  constraint v2_produtos_nome_ck check (btrim(nome) <> ''),
  constraint v2_produtos_id_escopo_uq unique (id, escopo_id)
);
create unique index v2_produtos_nome_uq on public.v2_produtos (escopo_id, lower(btrim(nome)));

-- ------------------------------------------------------------------ imagens
create table public.v2_imagens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  escopo_id     uuid not null,
  storage_path  text not null,
  largura       integer not null,
  altura        integer not null,
  bytes         integer not null,
  mime          text not null,
  created_at    timestamptz not null default now(),
  constraint v2_imagens_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_imagens_path_uq unique (storage_path),
  constraint v2_imagens_path_ck check (storage_path like user_id::text || '/' || escopo_id::text || '/%'),
  constraint v2_imagens_dim_ck check (largura between 1 and 800 and altura between 1 and 600),
  constraint v2_imagens_bytes_ck check (bytes > 0),
  constraint v2_imagens_mime_ck check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  constraint v2_imagens_id_escopo_uq unique (id, escopo_id)
);

-- ------------------------------------------------------------ valores de modelo
-- A existência da linha significa "o item pertence ao modelo".
create table public.v2_modelo_valores (
  modelo_id       uuid not null,
  item_modelo_id  uuid not null,
  user_id         uuid not null default auth.uid(),
  escopo_id       uuid not null,
  tipo            text not null,
  valor_num       numeric,
  valor_txt       text,
  valor_img_id    uuid,
  updated_at      timestamptz not null default now(),
  primary key (modelo_id, item_modelo_id),
  constraint v2_modelo_valores_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_modelo_valores_modelo_fk foreign key (modelo_id, escopo_id)
    references public.v2_modelos (id, escopo_id) on delete cascade,
  -- NO ACTION: item de modelo em uso por algum modelo não pode ser excluído.
  constraint v2_modelo_valores_item_fk foreign key (item_modelo_id, escopo_id)
    references public.v2_itens_modelo (id, escopo_id),
  constraint v2_modelo_valores_item_tipo_fk foreign key (item_modelo_id, tipo)
    references public.v2_itens_modelo (id, tipo),
  constraint v2_modelo_valores_img_fk foreign key (valor_img_id, escopo_id)
    references public.v2_imagens (id, escopo_id),
  constraint v2_modelo_valores_tipo_ck check (
       (tipo = 'numerico' and valor_txt is null and valor_img_id is null)
    or (tipo = 'textual'  and valor_num is null and valor_img_id is null)
    or (tipo = 'imagem'   and valor_num is null and valor_txt is null)),
  constraint v2_modelo_valores_finito_ck check (valor_num is null or abs(valor_num) < 'Infinity'::numeric)
);

-- ----------------------------------------------------------- valores de produto
create table public.v2_produto_valores (
  produto_id       uuid not null,
  item_produto_id  uuid not null,
  user_id          uuid not null default auth.uid(),
  escopo_id        uuid not null,
  tipo             text not null,
  valor_num        numeric,
  valor_txt        text,
  valor_img_id     uuid,
  updated_at       timestamptz not null default now(),
  primary key (produto_id, item_produto_id),
  constraint v2_produto_valores_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_produto_valores_produto_fk foreign key (produto_id, escopo_id)
    references public.v2_produtos (id, escopo_id) on delete cascade,
  constraint v2_produto_valores_item_fk foreign key (item_produto_id, escopo_id)
    references public.v2_itens_produto (id, escopo_id),
  constraint v2_produto_valores_item_tipo_fk foreign key (item_produto_id, tipo)
    references public.v2_itens_produto (id, tipo),
  constraint v2_produto_valores_img_fk foreign key (valor_img_id, escopo_id)
    references public.v2_imagens (id, escopo_id),
  constraint v2_produto_valores_tipo_ck check (
       (tipo = 'numerico' and valor_txt is null and valor_img_id is null)
    or (tipo = 'textual'  and valor_num is null and valor_img_id is null)
    or (tipo = 'imagem'   and valor_num is null and valor_txt is null)),
  constraint v2_produto_valores_finito_ck check (valor_num is null or abs(valor_num) < 'Infinity'::numeric)
);

-- ----------------------------------------------------------- itens de análise
create table public.v2_itens_analise (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  escopo_id     uuid not null,
  nome          text not null,
  descricao     text,
  tipo          text not null,
  formula_texto text,
  peso          smallint,
  versao        integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint v2_itens_analise_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_itens_analise_nome_ck check (btrim(nome) <> ''),
  constraint v2_itens_analise_tipo_ck check (tipo in ('formula', 'agregado')),
  constraint v2_itens_analise_forma_ck check (
       (tipo = 'formula'  and formula_texto is not null and btrim(formula_texto) <> '' and peso is null)
    or (tipo = 'agregado' and formula_texto is null and peso between 1 and 10)),
  constraint v2_itens_analise_id_escopo_uq unique (id, escopo_id)
);
create unique index v2_itens_analise_nome_uq on public.v2_itens_analise (escopo_id, lower(btrim(nome)));

-- ------------------------------------------------- referências de fórmula
create table public.v2_analise_refs (
  id               uuid primary key default gen_random_uuid(),
  analise_id       uuid not null,
  user_id          uuid not null default auth.uid(),
  escopo_id        uuid not null,
  item_modelo_id   uuid,
  item_produto_id  uuid,
  item_analise_id  uuid,
  constraint v2_analise_refs_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_analise_refs_analise_fk foreign key (analise_id, escopo_id)
    references public.v2_itens_analise (id, escopo_id) on delete cascade,
  -- NO ACTION nos três: item referenciado por fórmula não pode ser excluído.
  constraint v2_analise_refs_modelo_fk foreign key (item_modelo_id, escopo_id)
    references public.v2_itens_modelo (id, escopo_id),
  constraint v2_analise_refs_produto_fk foreign key (item_produto_id, escopo_id)
    references public.v2_itens_produto (id, escopo_id),
  constraint v2_analise_refs_analise_ref_fk foreign key (item_analise_id, escopo_id)
    references public.v2_itens_analise (id, escopo_id),
  constraint v2_analise_refs_uma_ck check (num_nonnulls(item_modelo_id, item_produto_id, item_analise_id) = 1)
);
create unique index v2_analise_refs_mod_uq  on public.v2_analise_refs (analise_id, item_modelo_id)  where item_modelo_id  is not null;
create unique index v2_analise_refs_prod_uq on public.v2_analise_refs (analise_id, item_produto_id) where item_produto_id is not null;
create unique index v2_analise_refs_ana_uq  on public.v2_analise_refs (analise_id, item_analise_id) where item_analise_id is not null;

-- ------------------------------------------------- componentes de agregado
create table public.v2_agregado_componentes (
  id               uuid primary key default gen_random_uuid(),
  agregado_id      uuid not null,
  user_id          uuid not null default auth.uid(),
  escopo_id        uuid not null,
  ordem            smallint not null,
  peso             smallint not null,
  direcao          text not null,
  lmin             numeric not null,
  lmax             numeric not null,
  item_modelo_id   uuid,
  item_produto_id  uuid,
  item_analise_id  uuid,
  constraint v2_agregado_comp_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_agregado_comp_agregado_fk foreign key (agregado_id, escopo_id)
    references public.v2_itens_analise (id, escopo_id) on delete cascade,
  constraint v2_agregado_comp_modelo_fk foreign key (item_modelo_id, escopo_id)
    references public.v2_itens_modelo (id, escopo_id),
  constraint v2_agregado_comp_produto_fk foreign key (item_produto_id, escopo_id)
    references public.v2_itens_produto (id, escopo_id),
  constraint v2_agregado_comp_analise_fk foreign key (item_analise_id, escopo_id)
    references public.v2_itens_analise (id, escopo_id),
  constraint v2_agregado_comp_uma_ck check (num_nonnulls(item_modelo_id, item_produto_id, item_analise_id) = 1),
  constraint v2_agregado_comp_peso_ck check (peso between 1 and 10),
  constraint v2_agregado_comp_direcao_ck check (direcao in ('maior', 'menor')),
  constraint v2_agregado_comp_limites_ck check (lmin <> lmax),
  constraint v2_agregado_comp_finito_ck check (abs(lmin) < 'Infinity'::numeric and abs(lmax) < 'Infinity'::numeric),
  constraint v2_agregado_comp_ordem_ck check (ordem between 1 and 5),
  constraint v2_agregado_comp_ordem_uq unique (agregado_id, ordem)
);
-- --------------------------------------------------------------------- filtros
create table public.v2_filtros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  escopo_id   uuid not null,
  nome        text not null,
  descricao   text,
  logica      text not null default 'AND',
  versao      integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint v2_filtros_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_filtros_nome_ck check (btrim(nome) <> ''),
  constraint v2_filtros_logica_ck check (logica in ('AND', 'OR')),
  constraint v2_filtros_id_escopo_uq unique (id, escopo_id)
);
create unique index v2_filtros_nome_uq on public.v2_filtros (escopo_id, lower(btrim(nome)));

create table public.v2_filtro_condicoes (
  id               uuid primary key default gen_random_uuid(),
  filtro_id        uuid not null,
  user_id          uuid not null default auth.uid(),
  escopo_id        uuid not null,
  ordem            smallint not null,
  item_modelo_id   uuid,
  item_produto_id  uuid,
  item_analise_id  uuid,
  operador         text not null,
  valor_num        numeric,
  valor_txt        text,
  constraint v2_filtro_cond_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  constraint v2_filtro_cond_filtro_fk foreign key (filtro_id, escopo_id)
    references public.v2_filtros (id, escopo_id) on delete cascade,
  constraint v2_filtro_cond_modelo_fk foreign key (item_modelo_id, escopo_id)
    references public.v2_itens_modelo (id, escopo_id),
  constraint v2_filtro_cond_produto_fk foreign key (item_produto_id, escopo_id)
    references public.v2_itens_produto (id, escopo_id),
  constraint v2_filtro_cond_analise_fk foreign key (item_analise_id, escopo_id)
    references public.v2_itens_analise (id, escopo_id),
  constraint v2_filtro_cond_uma_ck check (num_nonnulls(item_modelo_id, item_produto_id, item_analise_id) = 1),
  -- eq, ne, lt, gt, le, ge  =  =, ≠, <, >, ≤, ≥ (a interface mostra os símbolos)
  constraint v2_filtro_cond_op_ck check (operador in ('eq', 'ne', 'lt', 'gt', 'le', 'ge')),
  constraint v2_filtro_cond_valor_ck check (num_nonnulls(valor_num, valor_txt) = 1),
  constraint v2_filtro_cond_finito_ck check (valor_num is null or abs(valor_num) < 'Infinity'::numeric),
  constraint v2_filtro_cond_ordem_uq unique (filtro_id, ordem)
);

-- ----------------------------------------------------- configuração da análise
create table public.v2_config_analise (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid(),
  escopo_id            uuid not null,
  modo                 text not null default 'ambos',
  logica_global        text not null default 'AND',
  agregado_ranking_id  uuid,
  colunas              jsonb not null default '{}'::jsonb,
  ordenacao            jsonb not null default '[]'::jsonb,
  versao               integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint v2_config_analise_escopo_fk foreign key (escopo_id, user_id)
    references public.v2_escopos (id, user_id) on delete cascade,
  -- NO ACTION: o agregado que define o ranking não pode ser excluído.
  constraint v2_config_analise_ranking_fk foreign key (agregado_ranking_id, escopo_id)
    references public.v2_itens_analise (id, escopo_id),
  constraint v2_config_analise_modo_ck check (modo in ('modelos', 'produtos', 'ambos', 'itens_analise')),
  constraint v2_config_analise_logica_ck check (logica_global in ('AND', 'OR')),
  constraint v2_config_analise_colunas_ck check (jsonb_typeof(colunas) = 'object'),
  constraint v2_config_analise_ordenacao_ck check (jsonb_typeof(ordenacao) = 'array'),
  constraint v2_config_analise_escopo_uq unique (escopo_id)
);

-- --------------------------------------------------------------------- índices
-- (colunas de FK usadas em joins, exclusões e RLS; os índices únicos acima já cobrem escopo_id+nome)
create index v2_produtos_modelo_idx          on public.v2_produtos (modelo_id) where modelo_id is not null;
create index v2_modelo_valores_item_idx      on public.v2_modelo_valores (item_modelo_id);
create index v2_modelo_valores_escopo_idx    on public.v2_modelo_valores (escopo_id);
create index v2_modelo_valores_img_idx       on public.v2_modelo_valores (valor_img_id) where valor_img_id is not null;
create index v2_produto_valores_item_idx     on public.v2_produto_valores (item_produto_id);
create index v2_produto_valores_escopo_idx   on public.v2_produto_valores (escopo_id);
create index v2_produto_valores_img_idx      on public.v2_produto_valores (valor_img_id) where valor_img_id is not null;
create index v2_imagens_escopo_idx           on public.v2_imagens (escopo_id);
create index v2_analise_refs_escopo_idx      on public.v2_analise_refs (escopo_id);
create index v2_analise_refs_ref_ana_idx     on public.v2_analise_refs (item_analise_id) where item_analise_id is not null;
create index v2_analise_refs_ref_mod_idx     on public.v2_analise_refs (item_modelo_id) where item_modelo_id is not null;
create index v2_analise_refs_ref_prod_idx    on public.v2_analise_refs (item_produto_id) where item_produto_id is not null;
create index v2_agregado_comp_escopo_idx     on public.v2_agregado_componentes (escopo_id);
create index v2_agregado_comp_ref_ana_idx    on public.v2_agregado_componentes (item_analise_id) where item_analise_id is not null;
create index v2_agregado_comp_ref_mod_idx    on public.v2_agregado_componentes (item_modelo_id) where item_modelo_id is not null;
create index v2_agregado_comp_ref_prod_idx   on public.v2_agregado_componentes (item_produto_id) where item_produto_id is not null;
create index v2_filtro_cond_filtro_idx       on public.v2_filtro_condicoes (filtro_id);
create index v2_filtro_cond_escopo_idx       on public.v2_filtro_condicoes (escopo_id);
create index v2_filtro_cond_ref_ana_idx      on public.v2_filtro_condicoes (item_analise_id) where item_analise_id is not null;
create index v2_filtro_cond_ref_mod_idx      on public.v2_filtro_condicoes (item_modelo_id) where item_modelo_id is not null;
create index v2_filtro_cond_ref_prod_idx     on public.v2_filtro_condicoes (item_produto_id) where item_produto_id is not null;
create index v2_config_analise_ranking_idx   on public.v2_config_analise (agregado_ranking_id) where agregado_ranking_id is not null;
create index v2_itens_modelo_escopo_idx      on public.v2_itens_modelo (escopo_id);
create index v2_itens_produto_escopo_idx     on public.v2_itens_produto (escopo_id);
create index v2_modelos_escopo_idx           on public.v2_modelos (escopo_id);
create index v2_produtos_escopo_idx          on public.v2_produtos (escopo_id);
create index v2_itens_analise_escopo_idx     on public.v2_itens_analise (escopo_id);
create index v2_filtros_escopo_idx           on public.v2_filtros (escopo_id);
