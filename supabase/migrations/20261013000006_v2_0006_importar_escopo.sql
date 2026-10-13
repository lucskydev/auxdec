-- v2_0006_importar_escopo.sql
-- Objetos criados (todos com prefixo v2_):
--   função: public.v2_importar_escopo(jsonb, text, uuid, text, text, integer, text, jsonb)
-- Nenhum objeto sem prefixo v2_ é criado, alterado ou removido. Nenhuma tabela é alterada.
--
-- Importa o conteúdo de um backup ("auxdec-backup" v1) numa única transação, GERANDO NOVOS ids
-- para tudo e remapeando todas as referências (itens, valores, fórmulas, componentes, filtros,
-- configuração). Qualquer falha desfaz tudo.
--   p_payload   conteúdo de backup.json
--   p_modo      'novo' (cria o escopo p_escopo_id) | 'substituir' (esvazia e repovoa o escopo p_escopo_id)
--   p_escopo_id novo: id escolhido pelo cliente (necessário para formar os caminhos das imagens);
--               substituir: id do escopo existente
--   p_nome      nome final do escopo (o cliente resolve conflitos de nome antes)
--   p_versao, p_confirmacao   só em 'substituir': versão editada e nome atual digitado (V2001/V2014)
--   p_caminhos  {"<id da imagem no backup>": "<uid>/<escopo>/<uuid>.<ext>"} — arquivos já enviados ao Storage
-- Retorna {escopo_id, versao, caminhos_antigos[]}; no modo substituir, caminhos_antigos lista os
-- arquivos do conteúdo anterior para o cliente remover do Storage.
-- Regras de integridade (tipos, limites, refs numéricas, ciclos, 2–5 componentes, conflito de nomes)
-- continuam sendo aplicadas pelos triggers e constraints das tabelas.

create function public.v2_importar_escopo(
  p_payload jsonb, p_modo text, p_escopo_id uuid, p_nome text, p_descricao text,
  p_versao integer, p_confirmacao text, p_caminhos jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_map jsonb := '{}'::jsonb;
  v_antigos jsonb := '[]'::jsonb;
  v_nome_atual text; v_atual integer; v_versao integer;
  v_k text; v_r record; v_g text[]; v_texto text; v_novo text;
  v_cfg jsonb; v_col text; v_ord text;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;
  if p_modo is null or p_modo not in ('novo', 'substituir') then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'modo deve ser novo ou substituir';
  end if;
  if p_escopo_id is null or p_nome is null or btrim(p_nome) = '' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'escopo e nome são obrigatórios';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_payload->>'formato' is distinct from 'auxdec-backup'
     or p_payload->>'versao_formato' is distinct from '1' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'formato ou versão de backup não suportado';
  end if;
  if octet_length(p_payload::text) > 10485760 then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'backup excede 10 MB de dados';
  end if;
  foreach v_k in array array['itens_modelo','itens_produto','modelos','produtos','imagens','itens_analise','filtros'] loop
    if jsonb_typeof(p_payload->v_k) is distinct from 'array' then
      raise exception 'payload_invalido' using errcode = 'V2013', detail = format('campo %s ausente ou inválido', v_k);
    end if;
  end loop;
  if jsonb_typeof(p_payload->'config') is distinct from 'object' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'campo config ausente ou inválido';
  end if;
  if jsonb_typeof(coalesce(p_caminhos, '{}'::jsonb)) <> 'object' then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'p_caminhos deve ser um objeto';
  end if;

  -- ------------------------------------------------ escopo (novo ou substituído)
  if p_modo = 'novo' then
    insert into public.v2_escopos (id, user_id, nome, descricao)
    values (p_escopo_id, v_uid, btrim(p_nome), p_descricao)
    returning versao into v_versao;            -- o trigger v2_escopos_config_inicial cria a configuração
  else
    select nome, versao into v_nome_atual, v_atual from public.v2_escopos
     where id = p_escopo_id and user_id = v_uid for update;
    if not found then raise exception 'registro_nao_encontrado' using errcode = 'V2011'; end if;
    if v_atual is distinct from p_versao then
      raise exception 'conflito_versao' using errcode = 'V2001',
        detail = format('tabela=v2_escopos id=%s versao_persistida=%s', p_escopo_id, v_atual);
    end if;
    if p_confirmacao is distinct from v_nome_atual then
      raise exception 'confirmacao_invalida' using errcode = 'V2014';
    end if;
    select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_antigos
      from public.v2_imagens where escopo_id = p_escopo_id and user_id = v_uid;
    -- a configuração é mantida (uma por escopo), mas solta o ranking antes de remover os itens
    update public.v2_config_analise set agregado_ranking_id = null, versao = versao + 1
     where escopo_id = p_escopo_id and user_id = v_uid;
    delete from public.v2_filtro_condicoes     where escopo_id = p_escopo_id;
    delete from public.v2_filtros              where escopo_id = p_escopo_id;
    delete from public.v2_agregado_componentes where escopo_id = p_escopo_id;
    delete from public.v2_analise_refs         where escopo_id = p_escopo_id;
    delete from public.v2_itens_analise        where escopo_id = p_escopo_id;
    delete from public.v2_produto_valores      where escopo_id = p_escopo_id;
    delete from public.v2_modelo_valores       where escopo_id = p_escopo_id;
    delete from public.v2_produtos             where escopo_id = p_escopo_id;
    delete from public.v2_modelos              where escopo_id = p_escopo_id;
    delete from public.v2_itens_produto        where escopo_id = p_escopo_id;
    delete from public.v2_itens_modelo         where escopo_id = p_escopo_id;
    delete from public.v2_imagens              where escopo_id = p_escopo_id;
    update public.v2_escopos set nome = btrim(p_nome), descricao = p_descricao, versao = v_atual + 1
     where id = p_escopo_id returning versao into v_versao;
  end if;

  -- ------------------------------------------------ novos ids (um por registro com id)
  select coalesce(jsonb_object_agg(id, to_jsonb(gen_random_uuid()::text)), '{}'::jsonb) into v_map
  from (
    select lower(e->>'id') as id from jsonb_array_elements(p_payload->'itens_modelo') e
    union all select lower(e->>'id') from jsonb_array_elements(p_payload->'itens_produto') e
    union all select lower(e->>'id') from jsonb_array_elements(p_payload->'modelos') e
    union all select lower(e->>'id') from jsonb_array_elements(p_payload->'produtos') e
    union all select lower(e->>'id') from jsonb_array_elements(p_payload->'imagens') e
    union all select lower(e->>'id') from jsonb_array_elements(p_payload->'itens_analise') e
    union all select lower(e->>'id') from jsonb_array_elements(p_payload->'filtros') e
  ) t;
  if exists (select 1 from jsonb_each_text(v_map) where key is null) then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'registro sem id';
  end if;

  -- ------------------------------------------------ imagens (arquivos já enviados pelo cliente)
  insert into public.v2_imagens (id, user_id, escopo_id, storage_path, largura, altura, bytes, mime)
  select (v_map->>lower(x.id))::uuid, v_uid, p_escopo_id, p_caminhos->>x.id, x.largura, x.altura, x.bytes, x.mime
  from jsonb_to_recordset(p_payload->'imagens') as x(id text, largura integer, altura integer, bytes integer, mime text);

  -- ------------------------------------------------ itens
  insert into public.v2_itens_modelo (id, user_id, escopo_id, nome, descricao, tipo, unidade, casas_decimais, valor_min, valor_max)
  select (v_map->>lower(x.id))::uuid, v_uid, p_escopo_id, x.nome, x.descricao, x.tipo, x.unidade, x.casas_decimais, x.valor_min, x.valor_max
  from jsonb_to_recordset(p_payload->'itens_modelo')
    as x(id text, nome text, descricao text, tipo text, unidade text, casas_decimais smallint, valor_min numeric, valor_max numeric);

  insert into public.v2_itens_produto (id, user_id, escopo_id, nome, descricao, tipo, unidade, casas_decimais, valor_min, valor_max)
  select (v_map->>lower(x.id))::uuid, v_uid, p_escopo_id, x.nome, x.descricao, x.tipo, x.unidade, x.casas_decimais, x.valor_min, x.valor_max
  from jsonb_to_recordset(p_payload->'itens_produto')
    as x(id text, nome text, descricao text, tipo text, unidade text, casas_decimais smallint, valor_min numeric, valor_max numeric);

  -- ------------------------------------------------ modelos, produtos e valores
  insert into public.v2_modelos (id, user_id, escopo_id, nome, descricao)
  select (v_map->>lower(x.id))::uuid, v_uid, p_escopo_id, x.nome, x.descricao
  from jsonb_to_recordset(p_payload->'modelos') as x(id text, nome text, descricao text);

  insert into public.v2_produtos (id, user_id, escopo_id, nome, descricao, modelo_id)
  select (v_map->>lower(x.id))::uuid, v_uid, p_escopo_id, x.nome, x.descricao, (v_map->>lower(x.modelo_id))::uuid
  from jsonb_to_recordset(p_payload->'produtos') as x(id text, nome text, descricao text, modelo_id text);

  insert into public.v2_modelo_valores (modelo_id, item_modelo_id, user_id, escopo_id, tipo, valor_num, valor_txt, valor_img_id)
  select (v_map->>lower(m.id))::uuid, i.id, v_uid, p_escopo_id, i.tipo, v.valor_num, v.valor_txt, (v_map->>lower(v.valor_img_id))::uuid
  from jsonb_array_elements(p_payload->'modelos') as mj(j),
       lateral jsonb_to_record(mj.j) as m(id text, valores jsonb),
       lateral jsonb_to_recordset(coalesce(m.valores, '[]'::jsonb)) as v(item_id text, valor_num numeric, valor_txt text, valor_img_id text)
  join public.v2_itens_modelo i on i.id = (v_map->>lower(v.item_id))::uuid and i.escopo_id = p_escopo_id;

  insert into public.v2_produto_valores (produto_id, item_produto_id, user_id, escopo_id, tipo, valor_num, valor_txt, valor_img_id)
  select (v_map->>lower(p.id))::uuid, i.id, v_uid, p_escopo_id, i.tipo, v.valor_num, v.valor_txt, (v_map->>lower(v.valor_img_id))::uuid
  from jsonb_array_elements(p_payload->'produtos') as pj(j),
       lateral jsonb_to_record(pj.j) as p(id text, valores jsonb),
       lateral jsonb_to_recordset(coalesce(p.valores, '[]'::jsonb)) as v(item_id text, valor_num numeric, valor_txt text, valor_img_id text)
  join public.v2_itens_produto i on i.id = (v_map->>lower(v.item_id))::uuid and i.escopo_id = p_escopo_id;

  -- ------------------------------------------------ itens de análise (fórmulas com ids remapeados)
  for v_r in
    select * from jsonb_to_recordset(p_payload->'itens_analise')
      as x(id text, nome text, descricao text, tipo text, formula_texto text, peso smallint)
  loop
    v_texto := v_r.formula_texto;
    if v_r.tipo = 'formula' and v_texto is not null then
      for v_g in
        select m from regexp_matches(v_r.formula_texto,
          '(\[\[(m|p|a):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\])', 'g') as t(m)
      loop
        v_novo := v_map->>lower(v_g[3]);
        if v_novo is null then
          raise exception 'referencia_inexistente' using errcode = 'V2012', detail = 'fórmula referencia um item que não está no backup';
        end if;
        v_texto := replace(v_texto, v_g[1], '[[' || v_g[2] || ':' || v_novo || ']]');
      end loop;
    end if;
    insert into public.v2_itens_analise (id, user_id, escopo_id, nome, descricao, tipo, formula_texto, peso)
    values ((v_map->>lower(v_r.id))::uuid, v_uid, p_escopo_id, v_r.nome, v_r.descricao, v_r.tipo, v_texto, v_r.peso);
  end loop;

  -- referências de fórmula (derivadas do texto já remapeado, como em v2_salvar_analise_formula)
  insert into public.v2_analise_refs (analise_id, user_id, escopo_id, item_modelo_id, item_produto_id, item_analise_id)
  select distinct a.id, v_uid, p_escopo_id,
         case when g[2] = 'm' then g[3]::uuid end,
         case when g[2] = 'p' then g[3]::uuid end,
         case when g[2] = 'a' then g[3]::uuid end
  from public.v2_itens_analise a,
       lateral regexp_matches(a.formula_texto,
         '(\[\[(m|p|a):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\])', 'g') as t(g)
  where a.escopo_id = p_escopo_id and a.tipo = 'formula';

  insert into public.v2_agregado_componentes
    (agregado_id, user_id, escopo_id, ordem, peso, direcao, lmin, lmax, item_modelo_id, item_produto_id, item_analise_id)
  select (v_map->>lower(a.id))::uuid, v_uid, p_escopo_id, c.ordem, c.peso, c.direcao, c.lmin, c.lmax,
         (v_map->>lower(c.item_modelo_id))::uuid, (v_map->>lower(c.item_produto_id))::uuid, (v_map->>lower(c.item_analise_id))::uuid
  from jsonb_to_recordset(p_payload->'itens_analise') as a(id text, tipo text, componentes jsonb),
       lateral jsonb_to_recordset(case when a.tipo = 'agregado' and jsonb_typeof(a.componentes) = 'array' then a.componentes else '[]'::jsonb end)
         as c(ordem smallint, peso smallint, direcao text, lmin numeric, lmax numeric,
              item_modelo_id text, item_produto_id text, item_analise_id text);

  -- ------------------------------------------------ filtros
  insert into public.v2_filtros (id, user_id, escopo_id, nome, descricao, logica)
  select (v_map->>lower(x.id))::uuid, v_uid, p_escopo_id, x.nome, x.descricao, x.logica
  from jsonb_to_recordset(p_payload->'filtros') as x(id text, nome text, descricao text, logica text);

  insert into public.v2_filtro_condicoes
    (filtro_id, user_id, escopo_id, ordem, item_modelo_id, item_produto_id, item_analise_id, operador, valor_num, valor_txt)
  select (v_map->>lower(f.id))::uuid, v_uid, p_escopo_id, c.ordem,
         (v_map->>lower(c.item_modelo_id))::uuid, (v_map->>lower(c.item_produto_id))::uuid, (v_map->>lower(c.item_analise_id))::uuid,
         c.operador, c.valor_num, c.valor_txt
  from jsonb_to_recordset(p_payload->'filtros') as f(id text, condicoes jsonb),
       lateral jsonb_to_recordset(case when jsonb_typeof(f.condicoes) = 'array' then f.condicoes else '[]'::jsonb end)
         as c(ordem smallint, item_modelo_id text, item_produto_id text, item_analise_id text, operador text, valor_num numeric, valor_txt text);

  -- ------------------------------------------------ configuração da análise
  v_cfg := p_payload->'config';
  v_col := coalesce(v_cfg->'colunas', '{}'::jsonb)::text;
  v_ord := coalesce(v_cfg->'ordenacao', '[]'::jsonb)::text;
  for v_g in
    select m from regexp_matches(v_col || v_ord, '([mpa]):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', 'g') as t(m)
  loop
    v_novo := v_map->>lower(v_g[2]);
    if v_novo is not null then
      v_col := replace(v_col, v_g[1] || ':' || v_g[2], v_g[1] || ':' || v_novo);
      v_ord := replace(v_ord, v_g[1] || ':' || v_g[2], v_g[1] || ':' || v_novo);
    end if;
  end loop;
  update public.v2_config_analise
     set modo = coalesce(v_cfg->>'modo', 'ambos'),
         logica_global = coalesce(v_cfg->>'logica_global', 'AND'),
         agregado_ranking_id = (v_map->>lower(v_cfg->>'agregado_ranking_id'))::uuid,
         colunas = v_col::jsonb,
         ordenacao = v_ord::jsonb,
         versao = versao + 1
   where escopo_id = p_escopo_id and user_id = v_uid;

  set constraints all immediate;   -- como nas demais RPCs: erros dos checks adiados saem daqui

  return jsonb_build_object('escopo_id', p_escopo_id, 'versao', v_versao, 'caminhos_antigos', v_antigos);
end $$;

revoke all on function public.v2_importar_escopo(jsonb, text, uuid, text, text, integer, text, jsonb) from public, anon;
grant execute on function public.v2_importar_escopo(jsonb, text, uuid, text, text, integer, text, jsonb) to authenticated;
