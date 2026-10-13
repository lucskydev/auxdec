-- =====================================================================
-- v2_0001 — funções utilitárias e tabelas base
-- Escopos, itens de modelo/produto, modelos, produtos, imagens e valores.
-- Todos os objetos têm o prefixo v2_. Nada aqui lê ou altera decisoes_*
-- nem escreve em auth.users (apenas referencia auth.users(id) por FK).
-- Códigos de erro próprios (SQLSTATE):
--   V2000 nao_autenticado      V2001 conflito_versao     V2002 conflito_nomes
--   V2003 campo_imutavel       V2004 valor_fora_dos_limites
--   V2005 dependencia_circular V2006 agregado_invalido   V2007 nao_encontrado
--   V2008 entrada_invalida     V2009 filtro_invalido
-- =====================================================================

-- ---------- funções de trigger genéricas -----------------------------

create or replace function public.v2_trg_linha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'campo_imutavel: user_id nao pode ser alterado' using errcode = 'V2003';
    end if;
    if (to_jsonb(new) ->> 'escopo_id') is distinct from (to_jsonb(old) ->> 'escopo_id') then
      raise exception 'campo_imutavel: escopo_id nao pode ser alterado' using errcode = 'V2003';
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end
$$;

-- Controle de versão otimista, verificado dentro do bloqueio da linha:
-- o UPDATE só passa se NEW.versao = OLD.versao + 1.
create or replace function public.v2_trg_versao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.versao := 1;
    return new;
  end if;

  -- Atualização que SÓ muda ultimo_acesso (só existe em v2_escopos) não exige nem
  -- altera a versão. Qualquer outra mudança, ou um UPDATE que reenvia a mesma linha
  -- para registrar alteração nos filhos, passa pela checagem de versão abaixo.
  if (to_jsonb(new) -> 'ultimo_acesso') is distinct from (to_jsonb(old) -> 'ultimo_acesso')
     and (to_jsonb(new) - array['versao', 'updated_at', 'ultimo_acesso'])
       = (to_jsonb(old) - array['versao', 'updated_at', 'ultimo_acesso']) then
    new.versao := old.versao;
    return new;
  end if;

  if new.versao is distinct from old.versao + 1 then
    raise exception 'conflito_versao: o registro foi modificado em outra sessao (versao atual %, enviada %)',
      old.versao, new.versao - 1
      using errcode = 'V2001';
  end if;
  return new;
end
$$;

create or replace function public.v2_trg_tipo_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo then
    raise exception 'campo_imutavel: o tipo nao pode ser alterado apos a criacao' using errcode = 'V2003';
  end if;
  return new;
end
$$;

-- ---------- escopos ---------------------------------------------------

create table public.v2_escopos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text not null check (btrim(nome) <> ''),
  descricao     text,
  ultimo_acesso timestamptz not null default now(),
  versao        integer not null default 1 check (versao >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id)
);
create unique index v2_escopos_nome_uq on public.v2_escopos (user_id, lower(btrim(nome)));

-- ---------- itens de modelo e de produto (definições) -----------------

create table public.v2_itens_modelo (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  escopo_id      uuid not null,
  nome           text not null check (btrim(nome) <> ''),
  descricao      text,
  tipo           text not null check (tipo in ('numerico', 'textual', 'imagem')),
  unidade        text,
  casas_decimais smallint check (casas_decimais between 0 and 10),
  valor_min      numeric,
  valor_max      numeric,
  versao         integer not null default 1 check (versao >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  unique (id, escopo_id),
  unique (id, tipo),
  check (tipo = 'numerico'
         or (unidade is null and casas_decimais is null and valor_min is null and valor_max is null)),
  check (valor_min is null or valor_max is null or valor_min <= valor_max)
);
create unique index v2_itens_modelo_nome_uq on public.v2_itens_modelo (escopo_id, lower(btrim(nome)));

create table public.v2_itens_produto (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  escopo_id      uuid not null,
  nome           text not null check (btrim(nome) <> ''),
  descricao      text,
  tipo           text not null check (tipo in ('numerico', 'textual', 'imagem')),
  unidade        text,
  casas_decimais smallint check (casas_decimais between 0 and 10),
  valor_min      numeric,
  valor_max      numeric,
  versao         integer not null default 1 check (versao >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  unique (id, escopo_id),
  unique (id, tipo),
  check (tipo = 'numerico'
         or (unidade is null and casas_decimais is null and valor_min is null and valor_max is null)),
  check (valor_min is null or valor_max is null or valor_min <= valor_max)
);
create unique index v2_itens_produto_nome_uq on public.v2_itens_produto (escopo_id, lower(btrim(nome)));

-- ---------- modelos e produtos ---------------------------------------

create table public.v2_modelos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  escopo_id  uuid not null,
  nome       text not null check (btrim(nome) <> ''),
  descricao  text,
  versao     integer not null default 1 check (versao >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  unique (id, escopo_id)
);
create unique index v2_modelos_nome_uq on public.v2_modelos (escopo_id, lower(btrim(nome)));

create table public.v2_produtos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  escopo_id  uuid not null,
  nome       text not null check (btrim(nome) <> ''),
  descricao  text,
  modelo_id  uuid,
  versao     integer not null default 1 check (versao >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  -- NO ACTION: impede modelo de outro escopo e impede excluir modelo com produtos.
  foreign key (modelo_id, escopo_id) references public.v2_modelos (id, escopo_id),
  unique (id, escopo_id)
);
create unique index v2_produtos_nome_uq on public.v2_produtos (escopo_id, lower(btrim(nome)));
create index v2_produtos_modelo_idx on public.v2_produtos (modelo_id);

-- ---------- imagens (metadados; o arquivo fica no Storage) ------------

create table public.v2_imagens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  escopo_id    uuid not null,
  storage_path text not null unique,
  largura      integer not null check (largura between 1 and 800),
  altura       integer not null check (altura between 1 and 600),
  bytes        integer not null check (bytes > 0),
  mime         text not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  unique (id, escopo_id),
  check (storage_path like (user_id::text || '/' || escopo_id::text || '/%'))
);

-- ---------- valores (a linha existir = o item pertence ao registro) ---

create table public.v2_modelo_valores (
  user_id        uuid not null default auth.uid(),
  escopo_id      uuid not null,
  modelo_id      uuid not null,
  item_modelo_id uuid not null,
  tipo           text not null,
  valor_num      numeric,
  valor_txt      text,
  valor_img_id   uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (modelo_id, item_modelo_id),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  foreign key (modelo_id, escopo_id) references public.v2_modelos (id, escopo_id) on delete cascade,
  foreign key (item_modelo_id, escopo_id) references public.v2_itens_modelo (id, escopo_id),
  foreign key (item_modelo_id, tipo) references public.v2_itens_modelo (id, tipo),
  foreign key (valor_img_id, escopo_id) references public.v2_imagens (id, escopo_id),
  check ((tipo = 'numerico' and valor_txt is null and valor_img_id is null)
      or (tipo = 'textual' and valor_num is null and valor_img_id is null)
      or (tipo = 'imagem' and valor_num is null and valor_txt is null))
);
create index v2_modelo_valores_item_idx on public.v2_modelo_valores (item_modelo_id);

create table public.v2_produto_valores (
  user_id         uuid not null default auth.uid(),
  escopo_id       uuid not null,
  produto_id      uuid not null,
  item_produto_id uuid not null,
  tipo            text not null,
  valor_num       numeric,
  valor_txt       text,
  valor_img_id    uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (produto_id, item_produto_id),
  foreign key (escopo_id, user_id) references public.v2_escopos (id, user_id) on delete cascade,
  foreign key (produto_id, escopo_id) references public.v2_produtos (id, escopo_id) on delete cascade,
  foreign key (item_produto_id, escopo_id) references public.v2_itens_produto (id, escopo_id),
  foreign key (item_produto_id, tipo) references public.v2_itens_produto (id, tipo),
  foreign key (valor_img_id, escopo_id) references public.v2_imagens (id, escopo_id),
  check ((tipo = 'numerico' and valor_txt is null and valor_img_id is null)
      or (tipo = 'textual' and valor_num is null and valor_img_id is null)
      or (tipo = 'imagem' and valor_num is null and valor_txt is null))
);
create index v2_produto_valores_item_idx on public.v2_produto_valores (item_produto_id);
