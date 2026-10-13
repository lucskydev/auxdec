-- =====================================================================
-- v2_0004 — visão de herança e RPCs transacionais.
-- Registros com filhos (modelo+valores, produto+valores, fórmula+refs,
-- agregado+componentes, filtro+condições) são gravados SOMENTE por estas
-- funções: travam o pai (FOR UPDATE), conferem a versão e gravam pai e
-- filhos na mesma transação. O cliente nunca escreve direto nas tabelas
-- filhas (privilégios revogados em v2_0005).
-- Todas são SECURITY DEFINER com search_path vazio e filtram por auth.uid().
-- =====================================================================

-- ---------- herança: valores efetivos de cada produto -----------------

create view public.v2_vw_produto_efetivo
with (security_invoker = true)
as
select p.id as produto_id, p.escopo_id, p.user_id,
       'modelo'::text as origem,
       mv.item_modelo_id as item_id,
       mv.tipo, mv.valor_num, mv.valor_txt, mv.valor_img_id
  from public.v2_produtos p
  join public.v2_modelo_valores mv on mv.modelo_id = p.modelo_id
union all
select p.id, p.escopo_id, p.user_id,
       'proprio'::text,
       pv.item_produto_id,
       pv.tipo, pv.valor_num, pv.valor_txt, pv.valor_img_id
  from public.v2_produtos p
  join public.v2_produto_valores pv on pv.produto_id = p.id;

-- ---------- auxiliares -------------------------------------------------

create or replace function public.v2_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'nao_autenticado: faca login para continuar' using errcode = 'V2000';
  end if;
  return v_uid;
end
$$;

-- Remove os registros de imagem (e devolve os caminhos no Storage) que ficaram
-- sem nenhum valor apontando para eles. Só olha os ids informados.
create or replace function public.v2_liberar_imagens(p_ids uuid[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare v_paths text[];
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return '{}';
  end if;

  with livres as (
    select i.id, i.storage_path
      from public.v2_imagens i
     where i.id = any (p_ids)
       and i.user_id = auth.uid()
       and not exists (select 1 from public.v2_modelo_valores v where v.valor_img_id = i.id)
       and not exists (select 1 from public.v2_produto_valores v where v.valor_img_id = i.id)
  ), apagadas as (
    delete from public.v2_imagens i using livres l where i.id = l.id returning l.storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_paths from apagadas;

  return v_paths;
end
$$;

-- ---------- modelo -----------------------------------------------------

create or replace function public.v2_salvar_modelo(
  p_id uuid, p_escopo_id uuid, p_versao integer,
  p_nome text, p_descricao text, p_valores jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.v2_uid();
  v_vals jsonb := coalesce(p_valores, '[]'::jsonb);
  v_id uuid; v_escopo uuid; v_versao integer;
  v_antes uuid[]; v_esperado integer; v_gravado integer; v_paths text[];
begin
  if jsonb_typeof(v_vals) <> 'array' then
    raise exception 'entrada_invalida: valores deve ser uma lista' using errcode = 'V2008';
  end if;

  if p_id is null then
    insert into public.v2_modelos (user_id, escopo_id, nome, descricao)
    values (v_uid, p_escopo_id, p_nome, p_descricao)
    returning id, escopo_id, versao into v_id, v_escopo, v_versao;
    v_antes := '{}';
  else
    select escopo_id into v_escopo
      from public.v2_modelos where id = p_id and user_id = v_uid for update;
    if not found then
      raise exception 'nao_encontrado: modelo inexistente' using errcode = 'V2007';
    end if;
    v_id := p_id;
    select coalesce(array_agg(valor_img_id), '{}') into v_antes
      from public.v2_modelo_valores where modelo_id = v_id and valor_img_id is not null;
    update public.v2_modelos
       set nome = p_nome, descricao = p_descricao, versao = coalesce(p_versao, 0) + 1
     where id = v_id
    returning versao into v_versao;
  end if;

  delete from public.v2_modelo_valores
   where modelo_id = v_id
     and item_modelo_id not in (select (e ->> 'item_id')::uuid from jsonb_array_elements(v_vals) e);

  select count(*) into v_esperado from jsonb_array_elements(v_vals);
  insert into public.v2_modelo_valores
         (user_id, escopo_id, modelo_id, item_modelo_id, tipo, valor_num, valor_txt, valor_img_id)
  select v_uid, v_escopo, v_id, i.id, i.tipo,
         nullif(e ->> 'valor_num', '')::numeric, e ->> 'valor_txt', nullif(e ->> 'valor_img_id', '')::uuid
    from jsonb_array_elements(v_vals) e
    join public.v2_itens_modelo i on i.id = (e ->> 'item_id')::uuid and i.escopo_id = v_escopo
  on conflict (modelo_id, item_modelo_id) do update
     set valor_num = excluded.valor_num, valor_txt = excluded.valor_txt, valor_img_id = excluded.valor_img_id;
  get diagnostics v_gravado = row_count;
  if v_gravado <> v_esperado then
    raise exception 'entrada_invalida: algum item informado nao existe neste escopo' using errcode = 'V2008';
  end if;

  v_paths := public.v2_liberar_imagens(v_antes);
  return jsonb_build_object('id', v_id, 'versao', v_versao, 'imagens_removidas', to_jsonb(v_paths));
end
$$;

create or replace function public.v2_excluir_modelo(p_id uuid, p_versao integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.v2_uid();
  v_versao integer; v_antes uuid[]; v_prod text;
begin
  select versao into v_versao from public.v2_modelos where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception 'nao_encontrado: modelo inexistente' using errcode = 'V2007';
  end if;
  if v_versao <> p_versao then
    raise exception 'conflito_versao: o modelo foi modificado em outra sessao' using errcode = 'V2001';
  end if;

  select string_agg(nome, ', ' order by nome) into v_prod from public.v2_produtos where modelo_id = p_id;
  if v_prod is not null then
    raise exception 'dependencias_impeditivas: produtos associados impedem a exclusao: %', v_prod
      using errcode = 'V2010';
  end if;

  select coalesce(array_agg(valor_img_id), '{}') into v_antes
    from public.v2_modelo_valores where modelo_id = p_id and valor_img_id is not null;
  delete from public.v2_modelos where id = p_id;
  return jsonb_build_object('imagens_removidas', to_jsonb(public.v2_liberar_imagens(v_antes)));
end
$$;

-- ---------- produto ----------------------------------------------------

create or replace function public.v2_salvar_produto(
  p_id uuid, p_escopo_id uuid, p_versao integer,
  p_nome text, p_descricao text, p_modelo_id uuid, p_valores jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.v2_uid();
  v_vals jsonb := coalesce(p_valores, '[]'::jsonb);
  v_id uuid; v_escopo uuid; v_versao integer;
  v_antes uuid[]; v_esperado integer; v_gravado integer; v_paths text[];
begin
  if jsonb_typeof(v_vals) <> 'array' then
    raise exception 'entrada_invalida: valores deve ser uma lista' using errcode = 'V2008';
  end if;

  if p_id is null then
    insert into public.v2_produtos (user_id, escopo_id, nome, descricao, modelo_id)
    values (v_uid, p_escopo_id, p_nome, p_descricao, p_modelo_id)
    returning id, escopo_id, versao into v_id, v_escopo, v_versao;
    v_antes := '{}';
  else
    select escopo_id into v_escopo
      from public.v2_produtos where id = p_id and user_id = v_uid for update;
    if not found then
      raise exception 'nao_encontrado: produto inexistente' using errcode = 'V2007';
    end if;
    v_id := p_id;
    select coalesce(array_agg(valor_img_id), '{}') into v_antes
      from public.v2_produto_valores where produto_id = v_id and valor_img_id is not null;
    update public.v2_produtos
       set nome = p_nome, descricao = p_descricao, modelo_id = p_modelo_id,
           versao = coalesce(p_versao, 0) + 1
     where id = v_id
    returning versao into v_versao;
  end if;

  delete from public.v2_produto_valores
   where produto_id = v_id
     and item_produto_id not in (select (e ->> 'item_id')::uuid from jsonb_array_elements(v_vals) e);

  select count(*) into v_esperado from jsonb_array_elements(v_vals);
  insert into public.v2_produto_valores
         (user_id, escopo_id, produto_id, item_produto_id, tipo, valor_num, valor_txt, valor_img_id)
  select v_uid, v_escopo, v_id, i.id, i.tipo,
         nullif(e ->> 'valor_num', '')::numeric, e ->> 'valor_txt', nullif(e ->> 'valor_img_id', '')::uuid
    from jsonb_array_elements(v_vals) e
    join public.v2_itens_produto i on i.id = (e ->> 'item_id')::uuid and i.escopo_id = v_escopo
  on conflict (produto_id, item_produto_id) do update
     set valor_num = excluded.valor_num, valor_txt = excluded.valor_txt, valor_img_id = excluded.valor_img_id;
  get diagnostics v_gravado = row_count;
  if v_gravado <> v_esperado then
    raise exception 'entrada_invalida: algum item informado nao existe neste escopo' using errcode = 'V2008';
  end if;

  v_paths := public.v2_liberar_imagens(v_antes);
  return jsonb_build_object('id', v_id, 'versao', v_versao, 'imagens_removidas', to_jsonb(v_paths));
end
$$;

create or replace function public.v2_excluir_produto(p_id uuid, p_versao integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.v2_uid();
  v_versao integer; v_antes uuid[];
begin
  select versao into v_versao from public.v2_produtos where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception 'nao_encontrado: produto inexistente' using errcode = 'V2007';
  end if;
  if v_versao <> p_versao then
    raise exception 'conflito_versao: o produto foi modificado em outra sessao' using errcode = 'V2001';
  end if;

  select coalesce(array_agg(valor_img_id), '{}') into v_antes
    from public.v2_produto_valores where produto_id = p_id and valor_img_id is not null;
  delete from public.v2_produtos where id = p_id;
  return jsonb_build_object('imagens_removidas', to_jsonb(public.v2_liberar_imagens(v_antes)));
end
$$;

-- ---------- item de análise: fórmula -----------------------------------
-- Referências no texto: [[m:<uuid>]] item de modelo, [[p:<uuid>]] item de produto,
-- [[a:<uuid>]] item de análise. p_refs = [{"tipo":"m|p|a","id":"<uuid>"}, ...] e
-- precisa coincidir exatamente com os tokens do texto.

create or replace function public.v2_salvar_formula(
  p_id uuid, p_escopo_id uuid, p_versao integer,
  p_nome text, p_descricao text, p_formula_texto text, p_refs jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.v2_uid();
  v_refs jsonb := coalesce(p_refs, '[]'::jsonb);
  v_id uuid; v_escopo uuid; v_versao integer; v_tipo text;
  v_tokens text[]; v_declarados text[];
begin
  if jsonb_typeof(v_refs) <> 'array' then
    raise exception 'entrada_invalida: refs deve ser uma lista' using errcode = 'V2008';
  end if;

  select coalesce(array_agg(x order by x), '{}') into v_tokens
    from (select distinct lower(t.m[1]) || ':' || lower(t.m[2]) as x
            from regexp_matches(coalesce(p_formula_texto, ''),
                 '\[\[([mpa]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]', 'gi') as t(m)) s;

  select coalesce(array_agg(x order by x), '{}') into v_declarados
    from (select distinct (e ->> 'tipo') || ':' || lower(e ->> 'id') as x
            from jsonb_array_elements(v_refs) e) s;

  if v_tokens is distinct from v_declarados then
    raise exception 'entrada_invalida: as referencias declaradas nao coincidem com o texto da formula'
      using errcode = 'V2008';
  end if;

  if p_id is null then
    insert into public.v2_itens_analise (user_id, escopo_id, nome, descricao, tipo, formula_texto)
    values (v_uid, p_escopo_id, p_nome, p_descricao, 'formula', p_formula_texto)
    returning id, escopo_id, versao into v_id, v_escopo, v_versao;
  else
    select escopo_id, tipo into v_escopo, v_tipo
      from public.v2_itens_analise where id = p_id and user_id = v_uid for update;
    if not found then
      raise exception 'nao_encontrado: item de analise inexistente' using errcode = 'V2007';
    end if;
    if v_tipo <> 'formula' then
      raise exception 'entrada_invalida: o item informado nao e uma formula' using errcode = 'V2008';
    end if;
    v_id := p_id;
    update public.v2_itens_analise
       set nome = p_nome, descricao = p_descricao, formula_texto = p_formula_texto,
           versao = coalesce(p_versao, 0) + 1
     where id = v_id
    returning versao into v_versao;
  end if;

  delete from public.v2_analise_refs where analise_id = v_id;
  insert into public.v2_analise_refs
         (user_id, escopo_id, analise_id, item_modelo_id, item_produto_id, item_analise_id)
  select v_uid, v_escopo, v_id,
         case when s.t = 'm' then s.i end,
         case when s.t = 'p' then s.i end,
         case when s.t = 'a' then s.i end
    from (select distinct e ->> 'tipo' as t, (e ->> 'id')::uuid as i from jsonb_array_elements(v_refs) e) s;

  return jsonb_build_object('id', v_id, 'versao', v_versao);
end
$$;

-- ---------- item de análise: agregado ----------------------------------
-- p_componentes = [{"ordem":1,"peso":5,"direcao":"maior|menor","lmin":0,"lmax":10,
--                   "tipo":"m|p|a","id":"<uuid>"}, ...]  (2 a 5; checado no commit)

create or replace function public.v2_salvar_agregado(
  p_id uuid, p_escopo_id uuid, p_versao integer,
  p_nome text, p_descricao text, p_peso integer, p_componentes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.v2_uid();
  v_comps jsonb := coalesce(p_componentes, '[]'::jsonb);
  v_id uuid; v_escopo uuid; v_versao integer; v_tipo text;
begin
  if jsonb_typeof(v_comps) <> 'array' then
    raise exception 'entrada_invalida: componentes deve ser uma lista' using errcode = 'V2008';
  end if;

  if p_id is null then
    insert into public.v2_itens_analise (user_id, escopo_id, nome, descricao, tipo, peso)
    values (v_uid, p_escopo_id, p_nome, p_descricao, 'agregado', p_peso)
    returning id, escopo_id, versao into v_id, v_escopo, v_versao;
  else
    select escopo_id, tipo into v_escopo, v_tipo
      from public.v2_itens_analise where id = p_id and user_id = v_uid for update;
    if not found then
      raise exception 'nao_encontrado: item de analise inexistente' using errcode = 'V2007';
    end if;
    if v_tipo <> 'agregado' then
      raise exception 'entrada_invalida: o item informado nao e um agregado' using errcode = 'V2008';
    end if;
    v_id := p_id;
    update public.v2_itens_analise
       set nome = p_nome, descricao = p_descricao, peso = p_peso,
           versao = coalesce(p_versao, 0) + 1
     where id = v_id
    returning versao into v_versao;
  end if;

  delete from public.v2_agregado_componentes where agregado_id = v_id;
  insert into public.v2_agregado_componentes
         (user_id, escopo_id, agregado_id, ordem, peso, direcao, lmin, lmax,
          item_modelo_id, item_produto_id, item_analise_id)
  select v_uid, v_escopo, v_id,
         (e ->> 'ordem')::smallint, (e ->> 'peso')::smallint, e ->> 'direcao',
         (e ->> 'lmin')::numeric, (e ->> 'lmax')::numeric,
         case when e ->> 'tipo' = 'm' then (e ->> 'id')::uuid end,
         case when e ->> 'tipo' = 'p' then (e ->> 'id')::uuid end,
         case when e ->> 'tipo' = 'a' then (e ->> 'id')::uuid end
    from jsonb_array_elements(v_comps) e;

  return jsonb_build_object('id', v_id, 'versao', v_versao);
end
$$;

-- ---------- filtro -----------------------------------------------------
-- p_condicoes = [{"ordem":1,"tipo":"m|p|a","id":"<uuid>","operador":"<","valor_num":500000,
--                 "valor_txt":null}, ...]

create or replace function public.v2_salvar_filtro(
  p_id uuid, p_escopo_id uuid, p_versao integer,
  p_nome text, p_descricao text, p_logica text, p_condicoes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.v2_uid();
  v_conds jsonb := coalesce(p_condicoes, '[]'::jsonb);
  v_id uuid; v_escopo uuid; v_versao integer;
begin
  if jsonb_typeof(v_conds) <> 'array' then
    raise exception 'entrada_invalida: condicoes deve ser uma lista' using errcode = 'V2008';
  end if;
  if jsonb_array_length(v_conds) = 0 then
    raise exception 'filtro_invalido: o filtro precisa de pelo menos uma condicao' using errcode = 'V2009';
  end if;

  if p_id is null then
    insert into public.v2_filtros (user_id, escopo_id, nome, descricao, logica)
    values (v_uid, p_escopo_id, p_nome, p_descricao, coalesce(p_logica, 'AND'))
    returning id, escopo_id, versao into v_id, v_escopo, v_versao;
  else
    select escopo_id into v_escopo
      from public.v2_filtros where id = p_id and user_id = v_uid for update;
    if not found then
      raise exception 'nao_encontrado: filtro inexistente' using errcode = 'V2007';
    end if;
    v_id := p_id;
    update public.v2_filtros
       set nome = p_nome, descricao = p_descricao, logica = coalesce(p_logica, 'AND'),
           versao = coalesce(p_versao, 0) + 1
     where id = v_id
    returning versao into v_versao;
  end if;

  delete from public.v2_filtro_condicoes where filtro_id = v_id;
  insert into public.v2_filtro_condicoes
         (user_id, escopo_id, filtro_id, ordem, item_modelo_id, item_produto_id, item_analise_id,
          operador, valor_num, valor_txt)
  select v_uid, v_escopo, v_id, (e ->> 'ordem')::smallint,
         case when e ->> 'tipo' = 'm' then (e ->> 'id')::uuid end,
         case when e ->> 'tipo' = 'p' then (e ->> 'id')::uuid end,
         case when e ->> 'tipo' = 'a' then (e ->> 'id')::uuid end,
         e ->> 'operador', nullif(e ->> 'valor_num', '')::numeric, e ->> 'valor_txt'
    from jsonb_array_elements(v_conds) e;

  return jsonb_build_object('id', v_id, 'versao', v_versao);
end
$$;

-- ---------- escopo -----------------------------------------------------
-- A exclusão exige a versão atual e o nome digitado (confirmação reforçada).
-- Que o backup foi concluído é garantido pelo cliente: o banco não sabe disso.

create or replace function public.v2_excluir_escopo(p_id uuid, p_versao integer, p_nome_confirmacao text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.v2_uid();
  v_nome text; v_versao integer; v_paths text[];
begin
  select nome, versao into v_nome, v_versao
    from public.v2_escopos where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception 'nao_encontrado: escopo inexistente' using errcode = 'V2007';
  end if;
  if v_versao <> p_versao then
    raise exception 'conflito_versao: o escopo foi modificado em outra sessao' using errcode = 'V2001';
  end if;
  if lower(btrim(coalesce(p_nome_confirmacao, ''))) <> lower(btrim(v_nome)) then
    raise exception 'entrada_invalida: o nome digitado nao confere com o do escopo' using errcode = 'V2008';
  end if;

  select coalesce(array_agg(storage_path), '{}') into v_paths
    from public.v2_imagens where escopo_id = p_id;
  delete from public.v2_escopos where id = p_id;
  return jsonb_build_object('imagens_removidas', to_jsonb(v_paths));
end
$$;

-- ---------- consultas de dependência (somente leitura, respeitam RLS) --

-- Quem usa a DEFINIÇÃO de um item: p_tipo 'm' (item de modelo), 'p' (item de produto)
-- ou 'a' (item de análise).
create or replace function public.v2_dependencias(p_tipo text, p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'formulas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome) order by a.nome)
        from public.v2_analise_refs r join public.v2_itens_analise a on a.id = r.analise_id
       where case p_tipo when 'm' then r.item_modelo_id when 'p' then r.item_produto_id else r.item_analise_id end = p_id
    ), '[]'::jsonb),
    'agregados', coalesce((
      select jsonb_agg(distinct jsonb_build_object('id', a.id, 'nome', a.nome))
        from public.v2_agregado_componentes c join public.v2_itens_analise a on a.id = c.agregado_id
       where case p_tipo when 'm' then c.item_modelo_id when 'p' then c.item_produto_id else c.item_analise_id end = p_id
    ), '[]'::jsonb),
    'filtros', coalesce((
      select jsonb_agg(distinct jsonb_build_object('id', f.id, 'nome', f.nome))
        from public.v2_filtro_condicoes c join public.v2_filtros f on f.id = c.filtro_id
       where case p_tipo when 'm' then c.item_modelo_id when 'p' then c.item_produto_id else c.item_analise_id end = p_id
    ), '[]'::jsonb),
    'modelos', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome) order by m.nome)
        from public.v2_modelo_valores v join public.v2_modelos m on m.id = v.modelo_id
       where p_tipo = 'm' and v.item_modelo_id = p_id
    ), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome)
        from public.v2_produto_valores v join public.v2_produtos p on p.id = v.produto_id
       where p_tipo = 'p' and v.item_produto_id = p_id
    ), '[]'::jsonb),
    'ranking', exists (
      select 1 from public.v2_config_analise c where p_tipo = 'a' and c.agregado_ranking_id = p_id
    )
  )
$$;

-- Impacto de REMOVER um item de um modelo (D6): produtos que o herdam hoje
-- e os itens de análise/filtros que usam a definição do item.
create or replace function public.v2_impacto_item_no_modelo(p_modelo_id uuid, p_item_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'produtos_afetados', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome)
        from public.v2_produtos p where p.modelo_id = p_modelo_id
    ), '[]'::jsonb),
    'usos_do_item', public.v2_dependencias('m', p_item_id)
  )
$$;
