-- v2_0004_funcoes_rpc.sql
-- Auxdec v2 — limpeza ordenada de escopo e RPCs de salvamento.
-- Objetos criados (todos v2_):
--   funções: v2_trg_escopo_limpeza (trigger), v2_salvar_modelo, v2_salvar_produto,
--            v2_salvar_analise_formula, v2_salvar_analise_agregado, v2_salvar_filtro,
--            v2_excluir_escopo
--   trigger: v2_escopos_limpeza
-- Todas as RPCs: SECURITY DEFINER, search_path vazio, filtram por auth.uid() explicitamente,
-- EXECUTE revogado de public/anon e concedido só a authenticated.
-- NÃO incluída aqui: v2_importar_escopo (será entregue junto com backup/importação, Etapa 4).
--
-- Códigos de erro (SQLSTATE):
--   V2001 conflito_versao        V2002 conflito_nome_herdado   V2003 valor/limites
--   V2004 dependencia_circular   V2005 campo_imutavel          V2006 tipo_imutavel
--   V2007 referência/pai inválido V2008 filtro inválido        V2009 ranking inválido
--   V2010 agregado 2–5           V2011 não encontrado          V2012 referência inexistente
--   V2013 payload inválido       V2014 confirmação inválida    28000 não autenticado

-- -------------------------------------------- exclusão ordenada dos dados do escopo
-- Os vínculos entre tabelas irmãs são NO ACTION (bloqueiam exclusão de itens em uso). Numa
-- cascata a partir de v2_escopos (RPC ou exclusão do usuário em auth.users) a ordem de
-- exclusão entre irmãs não é garantida; por isso os dados são removidos folha-primeiro aqui.
create function public.v2_trg_escopo_limpeza() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.v2_config_analise       where escopo_id = old.id;
  delete from public.v2_filtro_condicoes     where escopo_id = old.id;
  delete from public.v2_filtros              where escopo_id = old.id;
  delete from public.v2_agregado_componentes where escopo_id = old.id;
  delete from public.v2_analise_refs         where escopo_id = old.id;
  delete from public.v2_itens_analise        where escopo_id = old.id;
  delete from public.v2_produto_valores      where escopo_id = old.id;
  delete from public.v2_modelo_valores       where escopo_id = old.id;
  delete from public.v2_produtos             where escopo_id = old.id;
  delete from public.v2_modelos              where escopo_id = old.id;
  delete from public.v2_itens_produto        where escopo_id = old.id;
  delete from public.v2_itens_modelo         where escopo_id = old.id;
  delete from public.v2_imagens              where escopo_id = old.id;
  return old;
end $$;

create trigger v2_escopos_limpeza before delete on public.v2_escopos
  for each row execute function public.v2_trg_escopo_limpeza();

revoke all on function public.v2_trg_escopo_limpeza() from public, anon, authenticated;

-- ------------------------------------------------------------------ salvar modelo
-- p_id nulo = criar. p_versao = versão que o usuário editou (ignorada na criação).
-- p_valores: [{"item_modelo_id": uuid, "valor_num": n|null, "valor_txt": s|null, "valor_img_id": uuid|null}]
-- Semântica: p_valores NULL = não mexe nos valores; array (mesmo vazio) = substitui, e os itens
-- ausentes da lista são removidos do modelo.
create function public.v2_salvar_modelo(
  p_escopo_id uuid, p_id uuid, p_versao integer, p_nome text, p_descricao text, p_valores jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid; v_versao integer; v_atual integer;
  v_valores jsonb := coalesce(p_valores, '[]'::jsonb);
  v_ids uuid[]; v_el jsonb; v_tipo text;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;
  if jsonb_typeof(v_valores) <> 'array' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'p_valores deve ser um array';
  end if;

  perform 1 from public.v2_escopos where id = p_escopo_id and user_id = v_uid for share;
  if not found then raise exception 'escopo_nao_encontrado' using errcode = 'V2011'; end if;

  if p_id is null then
    insert into public.v2_modelos (user_id, escopo_id, nome, descricao)
    values (v_uid, p_escopo_id, p_nome, p_descricao)
    returning id, versao into v_id, v_versao;
  else
    select versao into v_atual from public.v2_modelos
     where id = p_id and escopo_id = p_escopo_id and user_id = v_uid for update;
    if not found then raise exception 'registro_nao_encontrado' using errcode = 'V2011'; end if;
    if v_atual is distinct from p_versao then
      raise exception 'conflito_versao' using errcode = 'V2001',
        detail = format('tabela=v2_modelos id=%s versao_persistida=%s', p_id, v_atual);
    end if;
    update public.v2_modelos set nome = p_nome, descricao = p_descricao, versao = v_atual + 1
     where id = p_id returning id, versao into v_id, v_versao;
  end if;

  if p_valores is not null then
    v_ids := array(select (e ->> 'item_modelo_id')::uuid from jsonb_array_elements(v_valores) e);
    if array_position(v_ids, null) is not null then
      raise exception 'payload_invalido' using errcode = 'V2013', detail = 'todo valor precisa de item_modelo_id';
    end if;

    delete from public.v2_modelo_valores where modelo_id = v_id and item_modelo_id <> all (v_ids);

    for v_el in select e from jsonb_array_elements(v_valores) e loop
      select tipo into v_tipo from public.v2_itens_modelo
       where id = (v_el ->> 'item_modelo_id')::uuid and escopo_id = p_escopo_id and user_id = v_uid;
      if not found then
        raise exception 'referencia_inexistente' using errcode = 'V2012',
          detail = format('item de modelo %s não existe neste escopo', v_el ->> 'item_modelo_id');
      end if;
      insert into public.v2_modelo_valores
        (modelo_id, item_modelo_id, user_id, escopo_id, tipo, valor_num, valor_txt, valor_img_id)
      values (v_id, (v_el ->> 'item_modelo_id')::uuid, v_uid, p_escopo_id, v_tipo,
              (v_el ->> 'valor_num')::numeric, v_el ->> 'valor_txt', (v_el ->> 'valor_img_id')::uuid)
      on conflict (modelo_id, item_modelo_id) do update
        set valor_num = excluded.valor_num, valor_txt = excluded.valor_txt,
            valor_img_id = excluded.valor_img_id, updated_at = now();
    end loop;
  end if;

  set constraints all immediate;
  return jsonb_build_object('id', v_id, 'versao', v_versao);
end $$;

-- ----------------------------------------------------------------- salvar produto
-- p_modelo_id nulo = produto sem modelo. Conflito de nomes herdado × próprio bloqueia (V2002).
-- p_valores: mesma semântica de v2_salvar_modelo (NULL = não mexe; array = substitui).
create function public.v2_salvar_produto(
  p_escopo_id uuid, p_id uuid, p_versao integer, p_nome text, p_descricao text,
  p_modelo_id uuid, p_valores jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid; v_versao integer; v_atual integer;
  v_valores jsonb := coalesce(p_valores, '[]'::jsonb);
  v_ids uuid[]; v_el jsonb; v_tipo text;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;
  if jsonb_typeof(v_valores) <> 'array' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'p_valores deve ser um array';
  end if;

  perform 1 from public.v2_escopos where id = p_escopo_id and user_id = v_uid for share;
  if not found then raise exception 'escopo_nao_encontrado' using errcode = 'V2011'; end if;

  if p_modelo_id is not null then
    -- trava o modelo para que ele não seja excluído enquanto este produto é associado a ele
    perform 1 from public.v2_modelos where id = p_modelo_id and escopo_id = p_escopo_id and user_id = v_uid for share;
    if not found then
      raise exception 'referencia_inexistente' using errcode = 'V2012',
        detail = format('modelo %s não existe neste escopo', p_modelo_id);
    end if;
  end if;

  if p_id is null then
    insert into public.v2_produtos (user_id, escopo_id, nome, descricao, modelo_id)
    values (v_uid, p_escopo_id, p_nome, p_descricao, p_modelo_id)
    returning id, versao into v_id, v_versao;
  else
    select versao into v_atual from public.v2_produtos
     where id = p_id and escopo_id = p_escopo_id and user_id = v_uid for update;
    if not found then raise exception 'registro_nao_encontrado' using errcode = 'V2011'; end if;
    if v_atual is distinct from p_versao then
      raise exception 'conflito_versao' using errcode = 'V2001',
        detail = format('tabela=v2_produtos id=%s versao_persistida=%s', p_id, v_atual);
    end if;
    update public.v2_produtos
       set nome = p_nome, descricao = p_descricao, modelo_id = p_modelo_id, versao = v_atual + 1
     where id = p_id returning id, versao into v_id, v_versao;
  end if;

  if p_valores is not null then
    v_ids := array(select (e ->> 'item_produto_id')::uuid from jsonb_array_elements(v_valores) e);
    if array_position(v_ids, null) is not null then
      raise exception 'payload_invalido' using errcode = 'V2013', detail = 'todo valor precisa de item_produto_id';
    end if;

    delete from public.v2_produto_valores where produto_id = v_id and item_produto_id <> all (v_ids);

    for v_el in select e from jsonb_array_elements(v_valores) e loop
      select tipo into v_tipo from public.v2_itens_produto
       where id = (v_el ->> 'item_produto_id')::uuid and escopo_id = p_escopo_id and user_id = v_uid;
      if not found then
        raise exception 'referencia_inexistente' using errcode = 'V2012',
          detail = format('item de produto %s não existe neste escopo', v_el ->> 'item_produto_id');
      end if;
      insert into public.v2_produto_valores
        (produto_id, item_produto_id, user_id, escopo_id, tipo, valor_num, valor_txt, valor_img_id)
      values (v_id, (v_el ->> 'item_produto_id')::uuid, v_uid, p_escopo_id, v_tipo,
              (v_el ->> 'valor_num')::numeric, v_el ->> 'valor_txt', (v_el ->> 'valor_img_id')::uuid)
      on conflict (produto_id, item_produto_id) do update
        set valor_num = excluded.valor_num, valor_txt = excluded.valor_txt,
            valor_img_id = excluded.valor_img_id, updated_at = now();
    end loop;
  end if;

  set constraints all immediate;
  return jsonb_build_object('id', v_id, 'versao', v_versao);
end $$;

-- ------------------------------------------------------ salvar análise: fórmula
-- O texto guarda referências por id: [[m:<uuid>]] item de modelo, [[p:<uuid>]] item de produto,
-- [[a:<uuid>]] item de análise. As referências gravadas em v2_analise_refs são derivadas do
-- próprio texto, então texto e dependências nunca divergem. A sintaxe da expressão é validada
-- no cliente (o banco valida referências, escopo, tipos e ciclos).
create function public.v2_salvar_analise_formula(
  p_escopo_id uuid, p_id uuid, p_versao integer, p_nome text, p_descricao text, p_formula_texto text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid; v_versao integer; v_atual integer; v_tipo text;
  v_marcadores integer; v_tokens integer;
  v_m text[]; v_ref uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;
  if p_formula_texto is null or btrim(p_formula_texto) = '' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'a fórmula não pode ser vazia';
  end if;

  -- todo "[[" precisa ser um token bem formado
  v_marcadores := (length(p_formula_texto) - length(replace(p_formula_texto, '[[', ''))) / 2;
  select count(*) into v_tokens
    from regexp_matches(p_formula_texto, '\[\[(m|p|a):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]', 'g');
  if v_marcadores <> v_tokens then
    raise exception 'formula_referencia_malformada' using errcode = 'V2013',
      detail = 'há marcador [[ ]] que não é uma referência válida';
  end if;

  perform 1 from public.v2_escopos where id = p_escopo_id and user_id = v_uid for share;
  if not found then raise exception 'escopo_nao_encontrado' using errcode = 'V2011'; end if;

  if p_id is null then
    insert into public.v2_itens_analise (user_id, escopo_id, nome, descricao, tipo, formula_texto)
    values (v_uid, p_escopo_id, p_nome, p_descricao, 'formula', p_formula_texto)
    returning id, versao into v_id, v_versao;
  else
    select versao, tipo into v_atual, v_tipo from public.v2_itens_analise
     where id = p_id and escopo_id = p_escopo_id and user_id = v_uid for update;
    if not found then raise exception 'registro_nao_encontrado' using errcode = 'V2011'; end if;
    if v_tipo <> 'formula' then
      raise exception 'tipo_imutavel' using errcode = 'V2006', detail = 'este item de análise não é uma fórmula';
    end if;
    if v_atual is distinct from p_versao then
      raise exception 'conflito_versao' using errcode = 'V2001',
        detail = format('tabela=v2_itens_analise id=%s versao_persistida=%s', p_id, v_atual);
    end if;
    update public.v2_itens_analise
       set nome = p_nome, descricao = p_descricao, formula_texto = p_formula_texto, versao = v_atual + 1
     where id = p_id returning id, versao into v_id, v_versao;
    delete from public.v2_analise_refs where analise_id = v_id;
  end if;

  for v_m in
    select distinct on (m[1], lower(m[2])) m
      from regexp_matches(p_formula_texto, '\[\[(m|p|a):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]', 'g') as m
  loop
    v_ref := v_m[2]::uuid;
    if v_m[1] = 'm' then
      perform 1 from public.v2_itens_modelo where id = v_ref and escopo_id = p_escopo_id and user_id = v_uid for share;
      if not found then
        raise exception 'referencia_inexistente' using errcode = 'V2012', detail = format('item de modelo %s', v_ref);
      end if;
      insert into public.v2_analise_refs (analise_id, user_id, escopo_id, item_modelo_id)
        values (v_id, v_uid, p_escopo_id, v_ref);
    elsif v_m[1] = 'p' then
      perform 1 from public.v2_itens_produto where id = v_ref and escopo_id = p_escopo_id and user_id = v_uid for share;
      if not found then
        raise exception 'referencia_inexistente' using errcode = 'V2012', detail = format('item de produto %s', v_ref);
      end if;
      insert into public.v2_analise_refs (analise_id, user_id, escopo_id, item_produto_id)
        values (v_id, v_uid, p_escopo_id, v_ref);
    else
      perform 1 from public.v2_itens_analise where id = v_ref and escopo_id = p_escopo_id and user_id = v_uid for share;
      if not found then
        raise exception 'referencia_inexistente' using errcode = 'V2012', detail = format('item de análise %s', v_ref);
      end if;
      insert into public.v2_analise_refs (analise_id, user_id, escopo_id, item_analise_id)
        values (v_id, v_uid, p_escopo_id, v_ref);
    end if;
  end loop;

  set constraints all immediate;
  return jsonb_build_object('id', v_id, 'versao', v_versao);
end $$;

-- ----------------------------------------------------- salvar análise: agregado
-- p_componentes (2 a 5, na ordem desejada):
--   [{"peso": 1-10, "direcao": "maior"|"menor", "lmin": n, "lmax": n,
--     "item_modelo_id" | "item_produto_id" | "item_analise_id": uuid}]
create function public.v2_salvar_analise_agregado(
  p_escopo_id uuid, p_id uuid, p_versao integer, p_nome text, p_descricao text,
  p_peso integer, p_componentes jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid; v_versao integer; v_atual integer; v_tipo text;
  v_comp jsonb := coalesce(p_componentes, '[]'::jsonb);
  v_el jsonb; v_ordem integer := 0;
  v_mod uuid; v_prod uuid; v_ana uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;
  if jsonb_typeof(v_comp) <> 'array' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'p_componentes deve ser um array';
  end if;
  if jsonb_array_length(v_comp) not between 2 and 5 then
    raise exception 'agregado_componentes_invalido' using errcode = 'V2010',
      detail = format('um agregado deve ter de 2 a 5 componentes (recebeu %s)', jsonb_array_length(v_comp));
  end if;

  perform 1 from public.v2_escopos where id = p_escopo_id and user_id = v_uid for share;
  if not found then raise exception 'escopo_nao_encontrado' using errcode = 'V2011'; end if;

  if p_id is null then
    insert into public.v2_itens_analise (user_id, escopo_id, nome, descricao, tipo, peso)
    values (v_uid, p_escopo_id, p_nome, p_descricao, 'agregado', p_peso)
    returning id, versao into v_id, v_versao;
  else
    select versao, tipo into v_atual, v_tipo from public.v2_itens_analise
     where id = p_id and escopo_id = p_escopo_id and user_id = v_uid for update;
    if not found then raise exception 'registro_nao_encontrado' using errcode = 'V2011'; end if;
    if v_tipo <> 'agregado' then
      raise exception 'tipo_imutavel' using errcode = 'V2006', detail = 'este item de análise não é um agregado';
    end if;
    if v_atual is distinct from p_versao then
      raise exception 'conflito_versao' using errcode = 'V2001',
        detail = format('tabela=v2_itens_analise id=%s versao_persistida=%s', p_id, v_atual);
    end if;
    update public.v2_itens_analise
       set nome = p_nome, descricao = p_descricao, peso = p_peso, versao = v_atual + 1
     where id = p_id returning id, versao into v_id, v_versao;
    delete from public.v2_agregado_componentes where agregado_id = v_id;
  end if;

  for v_el in select e from jsonb_array_elements(v_comp) e loop
    v_ordem := v_ordem + 1;
    v_mod  := (v_el ->> 'item_modelo_id')::uuid;
    v_prod := (v_el ->> 'item_produto_id')::uuid;
    v_ana  := (v_el ->> 'item_analise_id')::uuid;
    if num_nonnulls(v_mod, v_prod, v_ana) <> 1 then
      raise exception 'payload_invalido' using errcode = 'V2013',
        detail = format('componente %s deve referenciar exatamente um item', v_ordem);
    end if;
    insert into public.v2_agregado_componentes
      (agregado_id, user_id, escopo_id, ordem, peso, direcao, lmin, lmax,
       item_modelo_id, item_produto_id, item_analise_id)
    values (v_id, v_uid, p_escopo_id, v_ordem, (v_el ->> 'peso')::smallint, v_el ->> 'direcao',
            (v_el ->> 'lmin')::numeric, (v_el ->> 'lmax')::numeric, v_mod, v_prod, v_ana);
  end loop;

  set constraints all immediate;
  return jsonb_build_object('id', v_id, 'versao', v_versao);
end $$;

-- ------------------------------------------------------------------ salvar filtro
-- p_condicoes: [{"item_modelo_id"|"item_produto_id"|"item_analise_id": uuid,
--                "operador": "eq|ne|lt|gt|le|ge", "valor_num": n|null, "valor_txt": s|null}]
-- p_condicoes NULL = não mexe nas condições; array (mesmo vazio) = substitui.
create function public.v2_salvar_filtro(
  p_escopo_id uuid, p_id uuid, p_versao integer, p_nome text, p_descricao text,
  p_logica text, p_condicoes jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid; v_versao integer; v_atual integer;
  v_cond jsonb := coalesce(p_condicoes, '[]'::jsonb);
  v_el jsonb; v_ordem integer := 0;
  v_mod uuid; v_prod uuid; v_ana uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;
  if jsonb_typeof(v_cond) <> 'array' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'p_condicoes deve ser um array';
  end if;

  perform 1 from public.v2_escopos where id = p_escopo_id and user_id = v_uid for share;
  if not found then raise exception 'escopo_nao_encontrado' using errcode = 'V2011'; end if;

  if p_id is null then
    insert into public.v2_filtros (user_id, escopo_id, nome, descricao, logica)
    values (v_uid, p_escopo_id, p_nome, p_descricao, p_logica)
    returning id, versao into v_id, v_versao;
  else
    select versao into v_atual from public.v2_filtros
     where id = p_id and escopo_id = p_escopo_id and user_id = v_uid for update;
    if not found then raise exception 'registro_nao_encontrado' using errcode = 'V2011'; end if;
    if v_atual is distinct from p_versao then
      raise exception 'conflito_versao' using errcode = 'V2001',
        detail = format('tabela=v2_filtros id=%s versao_persistida=%s', p_id, v_atual);
    end if;
    update public.v2_filtros
       set nome = p_nome, descricao = p_descricao, logica = p_logica, versao = v_atual + 1
     where id = p_id returning id, versao into v_id, v_versao;
    if p_condicoes is not null then
      delete from public.v2_filtro_condicoes where filtro_id = v_id;
    end if;
  end if;

  if p_condicoes is not null then
    for v_el in select e from jsonb_array_elements(v_cond) e loop
      v_ordem := v_ordem + 1;
      v_mod  := (v_el ->> 'item_modelo_id')::uuid;
      v_prod := (v_el ->> 'item_produto_id')::uuid;
      v_ana  := (v_el ->> 'item_analise_id')::uuid;
      if num_nonnulls(v_mod, v_prod, v_ana) <> 1 then
        raise exception 'payload_invalido' using errcode = 'V2013',
          detail = format('condição %s deve referenciar exatamente um item', v_ordem);
      end if;
      insert into public.v2_filtro_condicoes
        (filtro_id, user_id, escopo_id, ordem, item_modelo_id, item_produto_id, item_analise_id,
         operador, valor_num, valor_txt)
      values (v_id, v_uid, p_escopo_id, v_ordem, v_mod, v_prod, v_ana,
              v_el ->> 'operador', (v_el ->> 'valor_num')::numeric, v_el ->> 'valor_txt');
    end loop;
  end if;

  set constraints all immediate;
  return jsonb_build_object('id', v_id, 'versao', v_versao);
end $$;

-- ---------------------------------------------------------------- excluir escopo
-- Exige a versão atual e a confirmação reforçada (nome exato do escopo). Devolve os caminhos
-- das imagens para o cliente removê-las do Storage. A confirmação de que existe backup é
-- responsabilidade da interface (o banco não consegue verificá-la).
create function public.v2_excluir_escopo(p_id uuid, p_versao integer, p_confirmacao text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text; v_atual integer; v_caminhos jsonb;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;

  select nome, versao into v_nome, v_atual from public.v2_escopos
   where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'registro_nao_encontrado' using errcode = 'V2011'; end if;
  if v_atual is distinct from p_versao then
    raise exception 'conflito_versao' using errcode = 'V2001',
      detail = format('tabela=v2_escopos id=%s versao_persistida=%s', p_id, v_atual);
  end if;
  if p_confirmacao is distinct from v_nome then
    raise exception 'confirmacao_invalida' using errcode = 'V2014',
      detail = 'digite o nome exato do escopo para confirmar a exclusão';
  end if;

  select coalesce(jsonb_agg(storage_path order by storage_path), '[]'::jsonb) into v_caminhos
    from public.v2_imagens where escopo_id = p_id and user_id = v_uid;

  delete from public.v2_escopos where id = p_id and user_id = v_uid;

  set constraints all immediate;
  return jsonb_build_object('caminhos', v_caminhos);
end $$;

-- ------------------------------------------------------- privilégios das RPCs
revoke all on function public.v2_salvar_modelo(uuid, uuid, integer, text, text, jsonb)                     from public, anon;
revoke all on function public.v2_salvar_produto(uuid, uuid, integer, text, text, uuid, jsonb)              from public, anon;
revoke all on function public.v2_salvar_analise_formula(uuid, uuid, integer, text, text, text)             from public, anon;
revoke all on function public.v2_salvar_analise_agregado(uuid, uuid, integer, text, text, integer, jsonb)  from public, anon;
revoke all on function public.v2_salvar_filtro(uuid, uuid, integer, text, text, text, jsonb)               from public, anon;
revoke all on function public.v2_excluir_escopo(uuid, integer, text)                                       from public, anon;

grant execute on function public.v2_salvar_modelo(uuid, uuid, integer, text, text, jsonb)                    to authenticated;
grant execute on function public.v2_salvar_produto(uuid, uuid, integer, text, text, uuid, jsonb)             to authenticated;
grant execute on function public.v2_salvar_analise_formula(uuid, uuid, integer, text, text, text)            to authenticated;
grant execute on function public.v2_salvar_analise_agregado(uuid, uuid, integer, text, text, integer, jsonb) to authenticated;
grant execute on function public.v2_salvar_filtro(uuid, uuid, integer, text, text, text, jsonb)              to authenticated;
grant execute on function public.v2_excluir_escopo(uuid, integer, text)                                      to authenticated;
