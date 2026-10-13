-- =====================================================================
-- v2_0003 — regras de integridade que o frontend não pode contornar
-- (triggers de linha/versão, tipo imutável, conflito de nomes herdado ×
-- próprio, limites numéricos, ciclos, agregados 2–5, condições de filtro).
-- Constraint triggers "deferred" são verificados no COMMIT, então a ordem
-- das operações dentro de uma transação (RPC) não importa.
-- =====================================================================

-- ---------- triggers genéricos ----------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'v2_escopos','v2_itens_modelo','v2_itens_produto','v2_modelos','v2_produtos','v2_imagens',
    'v2_modelo_valores','v2_produto_valores','v2_itens_analise','v2_analise_refs',
    'v2_agregado_componentes','v2_filtros','v2_filtro_condicoes','v2_config_analise'
  ] loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.v2_trg_linha()',
      t || '_a_linha', t);
  end loop;

  foreach t in array array[
    'v2_escopos','v2_itens_modelo','v2_itens_produto','v2_modelos','v2_produtos',
    'v2_itens_analise','v2_filtros','v2_config_analise'
  ] loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.v2_trg_versao()',
      t || '_b_versao', t);
  end loop;

  foreach t in array array['v2_itens_modelo','v2_itens_produto','v2_itens_analise'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.v2_trg_tipo_imutavel()',
      t || '_c_tipo', t);
  end loop;
end $$;

-- ---------- config padrão criada junto com o escopo -------------------

create or replace function public.v2_trg_escopo_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.v2_config_analise (user_id, escopo_id) values (new.user_id, new.id);
  return new;
end
$$;

create trigger v2_escopos_d_config
  after insert on public.v2_escopos
  for each row execute function public.v2_trg_escopo_config();

-- ---------- conflito de nomes: item herdado × item próprio (D1) -------

create or replace function public.v2_assert_sem_conflito_produto(p_produto uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_nomes text;
begin
  select string_agg(distinct im.nome, ', ')
    into v_nomes
    from public.v2_produtos p
    join public.v2_modelo_valores mv on mv.modelo_id = p.modelo_id
    join public.v2_itens_modelo im   on im.id = mv.item_modelo_id
    join public.v2_produto_valores pv on pv.produto_id = p.id
    join public.v2_itens_produto ip   on ip.id = pv.item_produto_id
   where p.id = p_produto
     and lower(btrim(im.nome)) = lower(btrim(ip.nome));

  if v_nomes is not null then
    raise exception 'conflito_nomes: o modelo e o produto possuem itens com o mesmo nome: %', v_nomes
      using errcode = 'V2002';
  end if;
end
$$;

create or replace function public.v2_trg_conflito_produto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.v2_assert_sem_conflito_produto(new.id);
  return null;
end
$$;

create or replace function public.v2_trg_conflito_produto_valores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.v2_assert_sem_conflito_produto(new.produto_id);
  return null;
end
$$;

create or replace function public.v2_trg_conflito_modelo_valores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in select id from public.v2_produtos where modelo_id = new.modelo_id loop
    perform public.v2_assert_sem_conflito_produto(r.id);
  end loop;
  return null;
end
$$;

create or replace function public.v2_trg_conflito_renome_item_modelo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in
    select distinct p.id
      from public.v2_modelo_valores mv
      join public.v2_produtos p on p.modelo_id = mv.modelo_id
     where mv.item_modelo_id = new.id
  loop
    perform public.v2_assert_sem_conflito_produto(r.id);
  end loop;
  return null;
end
$$;

create or replace function public.v2_trg_conflito_renome_item_produto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in select produto_id as id from public.v2_produto_valores where item_produto_id = new.id loop
    perform public.v2_assert_sem_conflito_produto(r.id);
  end loop;
  return null;
end
$$;

create constraint trigger v2_produtos_e_conflito
  after insert or update of modelo_id on public.v2_produtos
  deferrable initially deferred
  for each row execute function public.v2_trg_conflito_produto();

create constraint trigger v2_produto_valores_e_conflito
  after insert or update on public.v2_produto_valores
  deferrable initially deferred
  for each row execute function public.v2_trg_conflito_produto_valores();

create constraint trigger v2_modelo_valores_e_conflito
  after insert or update on public.v2_modelo_valores
  deferrable initially deferred
  for each row execute function public.v2_trg_conflito_modelo_valores();

create constraint trigger v2_itens_modelo_e_conflito
  after update of nome on public.v2_itens_modelo
  deferrable initially deferred
  for each row execute function public.v2_trg_conflito_renome_item_modelo();

create constraint trigger v2_itens_produto_e_conflito
  after update of nome on public.v2_itens_produto
  deferrable initially deferred
  for each row execute function public.v2_trg_conflito_renome_item_produto();

-- ---------- limites numéricos dos itens --------------------------------

create or replace function public.v2_trg_limites_modelo_valores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_min numeric; v_max numeric; v_nome text;
begin
  if new.valor_num is not null then
    select valor_min, valor_max, nome into v_min, v_max, v_nome
      from public.v2_itens_modelo where id = new.item_modelo_id;
    if (v_min is not null and new.valor_num < v_min) or (v_max is not null and new.valor_num > v_max) then
      raise exception 'valor_fora_dos_limites: "%" aceita valores entre % e %',
        v_nome, coalesce(v_min::text, '-infinito'), coalesce(v_max::text, '+infinito')
        using errcode = 'V2004';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.v2_trg_limites_produto_valores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_min numeric; v_max numeric; v_nome text;
begin
  if new.valor_num is not null then
    select valor_min, valor_max, nome into v_min, v_max, v_nome
      from public.v2_itens_produto where id = new.item_produto_id;
    if (v_min is not null and new.valor_num < v_min) or (v_max is not null and new.valor_num > v_max) then
      raise exception 'valor_fora_dos_limites: "%" aceita valores entre % e %',
        v_nome, coalesce(v_min::text, '-infinito'), coalesce(v_max::text, '+infinito')
        using errcode = 'V2004';
    end if;
  end if;
  return new;
end
$$;

create trigger v2_modelo_valores_f_limites
  before insert or update on public.v2_modelo_valores
  for each row execute function public.v2_trg_limites_modelo_valores();

create trigger v2_produto_valores_f_limites
  before insert or update on public.v2_produto_valores
  for each row execute function public.v2_trg_limites_produto_valores();

-- Ao mudar os limites de um item, nenhum valor já gravado pode ficar fora deles.
create or replace function public.v2_trg_limites_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_fora boolean;
begin
  if tg_table_name = 'v2_itens_modelo' then
    select exists (
      select 1 from public.v2_modelo_valores v
       where v.item_modelo_id = new.id and v.valor_num is not null
         and ((new.valor_min is not null and v.valor_num < new.valor_min)
           or (new.valor_max is not null and v.valor_num > new.valor_max))
    ) into v_fora;
  else
    select exists (
      select 1 from public.v2_produto_valores v
       where v.item_produto_id = new.id and v.valor_num is not null
         and ((new.valor_min is not null and v.valor_num < new.valor_min)
           or (new.valor_max is not null and v.valor_num > new.valor_max))
    ) into v_fora;
  end if;

  if v_fora then
    raise exception 'valor_fora_dos_limites: existem valores gravados fora dos novos limites de "%"', new.nome
      using errcode = 'V2004';
  end if;
  return null;
end
$$;

create trigger v2_itens_modelo_g_limites
  after update of valor_min, valor_max on public.v2_itens_modelo
  for each row execute function public.v2_trg_limites_item();

create trigger v2_itens_produto_g_limites
  after update of valor_min, valor_max on public.v2_itens_produto
  for each row execute function public.v2_trg_limites_item();

-- ---------- ciclos entre itens de análise ------------------------------

create or replace function public.v2_assert_sem_ciclo(p_inicio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    with recursive arestas (origem, destino) as (
      select analise_id, item_analise_id
        from public.v2_analise_refs where item_analise_id is not null
      union all
      select agregado_id, item_analise_id
        from public.v2_agregado_componentes where item_analise_id is not null
    ),
    caminho (no) as (
      select destino from arestas where origem = p_inicio
      union
      select a.destino from arestas a join caminho c on a.origem = c.no
    )
    select 1 from caminho where no = p_inicio
  ) then
    raise exception 'dependencia_circular: o item de analise depende, direta ou indiretamente, de si mesmo'
      using errcode = 'V2005';
  end if;
end
$$;

create or replace function public.v2_trg_ciclo_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_analise_id is not null then
    perform public.v2_assert_sem_ciclo(new.analise_id);
  end if;
  return null;
end
$$;

create or replace function public.v2_trg_ciclo_componentes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_analise_id is not null then
    perform public.v2_assert_sem_ciclo(new.agregado_id);
  end if;
  return null;
end
$$;

create constraint trigger v2_analise_refs_h_ciclo
  after insert or update on public.v2_analise_refs
  deferrable initially deferred
  for each row execute function public.v2_trg_ciclo_refs();

create constraint trigger v2_agregado_componentes_h_ciclo
  after insert or update on public.v2_agregado_componentes
  deferrable initially deferred
  for each row execute function public.v2_trg_ciclo_componentes();

-- ---------- agregado: 2 a 5 componentes --------------------------------

create or replace function public.v2_assert_agregado(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tipo text; v_nome text; v_n integer;
begin
  select tipo, nome into v_tipo, v_nome from public.v2_itens_analise where id = p_id;
  if v_tipo = 'agregado' then
    select count(*) into v_n from public.v2_agregado_componentes where agregado_id = p_id;
    if v_n < 2 or v_n > 5 then
      raise exception 'agregado_invalido: o agregado "%" deve ter de 2 a 5 componentes (tem %)', v_nome, v_n
        using errcode = 'V2006';
    end if;
  end if;
end
$$;

create or replace function public.v2_trg_agregado_componentes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.v2_assert_agregado(new.agregado_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    perform public.v2_assert_agregado(old.agregado_id);
  end if;
  return null;
end
$$;

create or replace function public.v2_trg_agregado_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.v2_assert_agregado(new.id);
  return null;
end
$$;

create constraint trigger v2_agregado_componentes_i_contagem
  after insert or update or delete on public.v2_agregado_componentes
  deferrable initially deferred
  for each row execute function public.v2_trg_agregado_componentes();

create constraint trigger v2_itens_analise_i_agregado
  after insert on public.v2_itens_analise
  deferrable initially deferred
  for each row execute function public.v2_trg_agregado_item();

-- ---------- condições de filtro ----------------------------------------

create or replace function public.v2_trg_filtro_condicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_tipo text;
begin
  if new.item_modelo_id is not null then
    select tipo into v_tipo from public.v2_itens_modelo where id = new.item_modelo_id;
  elsif new.item_produto_id is not null then
    select tipo into v_tipo from public.v2_itens_produto where id = new.item_produto_id;
  else
    v_tipo := 'numerico';  -- itens de análise produzem números
  end if;

  if v_tipo = 'imagem' then
    raise exception 'filtro_invalido: itens de imagem nao podem ser filtrados' using errcode = 'V2009';
  elsif v_tipo = 'numerico' then
    if new.valor_num is null or new.valor_txt is not null then
      raise exception 'filtro_invalido: condicao numerica exige valor numerico' using errcode = 'V2009';
    end if;
  elsif v_tipo = 'textual' then
    if new.valor_txt is null or new.valor_num is not null then
      raise exception 'filtro_invalido: condicao textual exige valor de texto' using errcode = 'V2009';
    end if;
    if new.operador not in ('=', '≠') then
      raise exception 'filtro_invalido: itens de texto so aceitam = e ≠' using errcode = 'V2009';
    end if;
  end if;
  return new;
end
$$;

create trigger v2_filtro_condicoes_j_valida
  before insert or update on public.v2_filtro_condicoes
  for each row execute function public.v2_trg_filtro_condicao();
