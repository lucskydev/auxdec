\set ON_ERROR_STOP on
\ir support/helpers.sql
begin;
select pg_temp.guarda();
insert into auth.users (id, email) values (pg_temp.ua(), 'a@test.local');

do $$
declare
  e uuid; e2 uuid; im_q uuid; im_c uuid; im_f uuid; im_x uuid; ip_p uuid; ip_l uuid; ix2 uuid; fx2 uuid;
  f1 uuid; f1v int; f2 uuid; f2v int; f3 uuid; f3v int; a1 uuid; a1v int; a2 uuid; a2v int; fil1 uuid; fil2 uuid;
  r jsonb; v_n int; cfg_v int; d jsonb; fx uuid; fantasma uuid := gen_random_uuid();
begin
  perform pg_temp.como(pg_temp.ua());
  insert into public.v2_escopos (nome) values ('Imoveis') returning id into e;
  insert into public.v2_escopos (nome) values ('Outro') returning id into e2;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Quartos', 'numerico') returning id into im_q;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Cor', 'textual') returning id into im_c;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Foto', 'imagem') returning id into im_f;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Extra', 'numerico') returning id into im_x;
  insert into public.v2_itens_produto (escopo_id, nome, tipo) values (e, 'Preco', 'numerico') returning id into ip_p;
  insert into public.v2_itens_produto (escopo_id, nome, tipo) values (e, 'Link', 'textual') returning id into ip_l;
  insert into public.v2_itens_produto (escopo_id, nome, tipo) values (e2, 'Preco', 'numerico') returning id into ix2;
  fx2 := ((public.v2_salvar_formula(null, e2, null, 'F-outro', null, '1', '[]')) ->> 'id')::uuid;

  -- ===== formulas: referencias coerentes com o texto =====
  r := public.v2_salvar_formula(null, e, null, 'Dobro', null, format('[[m:%s]] * 2', im_q), jsonb_build_array(pg_temp.ref('m', im_q)));
  f1 := (r ->> 'id')::uuid; f1v := (r ->> 'versao')::int;
  r := public.v2_salvar_formula(null, e, null, 'Soma', null, format('[[a:%s]] + [[p:%s]]', f1, ip_p),
         jsonb_build_array(pg_temp.ref('a', f1), pg_temp.ref('p', ip_p)));
  f2 := (r ->> 'id')::uuid; f2v := (r ->> 'versao')::int;
  select count(*) into v_n from public.v2_analise_refs where analise_id = f2;
  assert v_n = 2, 'formula Soma deveria ter 2 referencias';
  -- texto com UUID em maiusculas e referencia repetida e aceito (uma linha so)
  r := public.v2_salvar_formula(null, e, null, 'Quadrado', null, format('[[m:%s]] * [[m:%s]]', upper(im_q::text), im_q),
         jsonb_build_array(pg_temp.ref('m', im_q)));
  select count(*) into v_n from public.v2_analise_refs where analise_id = (r ->> 'id')::uuid;
  assert v_n = 1, 'referencia repetida deveria virar uma so';
  -- texto e refs divergentes
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X1', null, %L, '[]')$q$, e, format('[[m:%s]] + 1', im_q)), 'V2008');
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X2', null, '1 + 1', %L::jsonb)$q$, e, jsonb_build_array(pg_temp.ref('m', im_q))::text), 'V2008');
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X2b', null, '1', '{"a":1}')$q$, e), 'V2008');
  -- formula vazia
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X3', null, '   ', '[]')$q$, e), '23514');
  -- so itens NUMERICOS podem ser referenciados
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X4', null, %L, %L::jsonb)$q$, e,
         format('[[m:%s]]', im_c), jsonb_build_array(pg_temp.ref('m', im_c))::text), '23503');
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X5', null, %L, %L::jsonb)$q$, e,
         format('[[m:%s]]', im_f), jsonb_build_array(pg_temp.ref('m', im_f))::text), '23503');
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X6', null, %L, %L::jsonb)$q$, e,
         format('[[p:%s]]', ip_l), jsonb_build_array(pg_temp.ref('p', ip_l))::text), '23503');
  -- referencia inexistente ou de outro escopo
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X7', null, %L, %L::jsonb)$q$, e,
         format('[[m:%s]]', fantasma), jsonb_build_array(pg_temp.ref('m', fantasma))::text), '23503');
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X8', null, %L, %L::jsonb)$q$, e,
         format('[[p:%s]]', ix2), jsonb_build_array(pg_temp.ref('p', ix2))::text), '23503');
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(null, %L, null, 'X9', null, %L, %L::jsonb)$q$, e,
         format('[[a:%s]]', fx2), jsonb_build_array(pg_temp.ref('a', fx2))::text), '23503');

  -- ===== ciclos =====
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(%L, %L, %L, 'Dobro', null, %L, %L::jsonb)$q$, f1, e, f1v,
         format('[[a:%s]] + 1', f1), jsonb_build_array(pg_temp.ref('a', f1))::text), 'V2005');          -- autorreferencia
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(%L, %L, %L, 'Dobro', null, %L, %L::jsonb)$q$, f1, e, f1v,
         format('[[a:%s]] + 1', f2), jsonb_build_array(pg_temp.ref('a', f2))::text), 'V2005');          -- f1 -> f2 -> f1
  r := public.v2_salvar_formula(null, e, null, 'Terceira', null, format('[[a:%s]]', f2), jsonb_build_array(pg_temp.ref('a', f2)));
  f3 := (r ->> 'id')::uuid; f3v := (r ->> 'versao')::int;
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(%L, %L, %L, 'Dobro', null, %L, %L::jsonb)$q$, f1, e, f1v,
         format('[[a:%s]]', f3), jsonb_build_array(pg_temp.ref('a', f3))::text), 'V2005');              -- ciclo de 3
  -- sem ciclo: editar f1 para usar outro item continua valendo (e a versao sobe)
  r := public.v2_salvar_formula(f1, e, f1v, 'Dobro', 'agora com descricao', format('[[m:%s]] * 3', im_q), jsonb_build_array(pg_temp.ref('m', im_q)));
  assert (r ->> 'versao')::int = f1v + 1, 'versao da formula deveria subir'; f1v := f1v + 1;
  -- tipo do item de analise e imutavel; RPCs de tipo trocado sao recusadas
  perform pg_temp.falha(format($q$update public.v2_itens_analise set tipo = 'agregado', versao = versao + 1 where id = %L$q$, f1), '42501');  -- privilegio
  perform pg_temp.admin();   -- mesmo com acesso total (dono), o trigger impede a troca de tipo
  perform pg_temp.falha(format($q$update public.v2_itens_analise set tipo = 'agregado', versao = versao + 1 where id = %L$q$, f1), 'V2003');
  perform pg_temp.como(pg_temp.ua());

  -- ===== agregados =====
  r := public.v2_salvar_agregado(null, e, null, 'Nota A', null, 5,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'm', im_q), pg_temp.comp(2, 3, 'menor', 0, 1000000, 'p', ip_p)));
  a1 := (r ->> 'id')::uuid; a1v := (r ->> 'versao')::int;
  select count(*) into v_n from public.v2_agregado_componentes where agregado_id = a1; assert v_n = 2, 'agregado com 2 componentes';
  -- quantidade de componentes: 2 a 5
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'Nota 0', null, 5, '[]')$q$, e), 'V2006');
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'Nota 1', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'm', im_q))::text), 'V2006');
  perform pg_temp.passa(format($q$select public.v2_salvar_agregado(null, %L, null, 'Nota 5', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 1, 'maior', 0, 10, 'm', im_q), pg_temp.comp(2, 1, 'maior', 0, 10, 'p', ip_p),
                           pg_temp.comp(3, 1, 'maior', 0, 10, 'a', f1), pg_temp.comp(4, 1, 'maior', 0, 10, 'a', f2),
                           pg_temp.comp(5, 1, 'maior', 0, 10, 'a', f3))::text));
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'Nota 6', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 1, 'maior', 0, 10, 'm', im_q), pg_temp.comp(2, 1, 'maior', 0, 10, 'p', ip_p),
                           pg_temp.comp(3, 1, 'maior', 0, 10, 'a', f1), pg_temp.comp(4, 1, 'maior', 0, 10, 'a', f2),
                           pg_temp.comp(5, 1, 'maior', 0, 10, 'a', f3), pg_temp.comp(6, 1, 'maior', 0, 10, 'a', a1))::text), '23514');
  -- pesos, limites, direcao
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'P0', null, 0, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'm', im_q), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), '23514');
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'P11', null, 11, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'm', im_q), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), '23514');
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'C11', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 11, 'maior', 0, 10, 'm', im_q), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), '23514');
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'Lim', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 7, 7, 'm', im_q), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), '23514');
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'Dir', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'tanto-faz', 0, 10, 'm', im_q), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), '23514');
  -- limites invertidos (lmin > lmax) sao validos: o calculo normaliza pela diferenca
  perform pg_temp.passa(format($q$select public.v2_salvar_agregado(null, %L, null, 'Invertido', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 10, 0, 'm', im_q), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text));
  -- componentes so numericos
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'Txt', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'm', im_c), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), '23503');
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'Img', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'm', im_f), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), '23503');
  -- componente de outro escopo
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(null, %L, null, 'Esc', null, 5, %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'p', ix2), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), '23503');
  -- agregado aninhado e ciclos entre agregados
  r := public.v2_salvar_agregado(null, e, null, 'Nota B', null, 8,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'a', a1), pg_temp.comp(2, 3, 'maior', 0, 10, 'a', f1)));
  a2 := (r ->> 'id')::uuid; a2v := (r ->> 'versao')::int;
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(%L, %L, %L, 'Nota A', null, 5, %L::jsonb)$q$, a1, e, a1v,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'a', a2), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), 'V2005');
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(%L, %L, %L, 'Nota A', null, 5, %L::jsonb)$q$, a1, e, a1v,
         jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'a', a1), pg_temp.comp(2, 3, 'maior', 0, 10, 'p', ip_p))::text), 'V2005');
  -- formula que depende de agregado que depende dela
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(%L, %L, %L, 'Dobro', null, %L, %L::jsonb)$q$, f1, e, f1v,
         format('[[a:%s]]', a2), jsonb_build_array(pg_temp.ref('a', a2))::text), 'V2005');
  -- RPC do tipo errado
  perform pg_temp.falha(format($q$select public.v2_salvar_formula(%L, %L, %L, 'Nota A', null, '1', '[]')$q$, a1, e, a1v), 'V2008');
  perform pg_temp.falha(format($q$select public.v2_salvar_agregado(%L, %L, %L, 'Dobro', null, 5, '[]')$q$, f1, e, f1v), 'V2008');

  -- ===== filtros =====
  r := public.v2_salvar_filtro(null, e, null, 'Barato', null, 'AND',
         jsonb_build_array(pg_temp.cond(1, 'm', im_q, '≥', 3, null), pg_temp.cond(2, 'p', ip_p, '<', 500000, null),
                           pg_temp.cond(3, 'a', f1, '>', 1, null), pg_temp.cond(4, 'm', im_c, '≠', null, 'Preto')));
  fil1 := (r ->> 'id')::uuid;
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F0', null, 'AND', '[]')$q$, e), 'V2009');
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F1', null, 'AND', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'm', im_f, '=', null, 'x'))::text), 'V2009');                      -- imagem
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F2', null, 'AND', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'm', im_c, '<', null, 'x'))::text), 'V2009');                      -- texto com <
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F3', null, 'AND', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'm', im_q, '=', null, 'abc'))::text), 'V2009');                    -- numero com texto
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F4', null, 'AND', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'm', im_c, '=', 5, null))::text), 'V2009');                        -- texto com numero
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F5', null, 'AND', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'm', im_q, '=', null, null))::text), 'V2009');                     -- sem valor
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F6', null, 'AND', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'm', im_q, '>>', 1, null))::text), '23514');                       -- operador invalido
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F7', null, 'XOR', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'm', im_q, '=', 1, null))::text), '23514');                        -- logica invalida
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'BARATO', null, 'AND', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'm', im_q, '=', 1, null))::text), '23505');                        -- nome duplicado
  perform pg_temp.falha(format($q$select public.v2_salvar_filtro(null, %L, null, 'F8', null, 'AND', %L::jsonb)$q$, e,
         jsonb_build_array(pg_temp.cond(1, 'p', ix2, '=', 1, null))::text), '23503');                         -- outro escopo

  -- ===== configuracao da analise: agregado do ranking =====
  select versao into cfg_v from public.v2_config_analise where escopo_id = e;
  perform pg_temp.falha(format($q$update public.v2_config_analise set agregado_ranking_id = %L, versao = versao + 1 where escopo_id = %L$q$, f1, e), '23503'); -- formula nao serve
  perform pg_temp.passa(format($q$update public.v2_config_analise set agregado_ranking_id = %L, modo = 'produtos', versao = versao + 1 where escopo_id = %L$q$, a2, e));
  perform pg_temp.falha(format($q$update public.v2_config_analise set modo = 'invalido', versao = versao + 1 where escopo_id = %L$q$, e), '23514');
  perform pg_temp.falha(format($q$update public.v2_config_analise set colunas = '[]'::jsonb, versao = versao + 1 where escopo_id = %L$q$, e), '23514');

  -- ===== exclusoes bloqueadas por dependencia =====
  perform pg_temp.falha(format($q$delete from public.v2_itens_modelo where id = %L$q$, im_q), '23503');   -- usado em formula/agregado/filtro
  perform pg_temp.falha(format($q$delete from public.v2_itens_produto where id = %L$q$, ip_p), '23503');
  perform pg_temp.falha(format($q$delete from public.v2_itens_analise where id = %L$q$, f1), '23503');    -- usado por outra formula
  perform pg_temp.falha(format($q$delete from public.v2_itens_analise where id = %L$q$, a1), '23503');    -- componente de Nota B
  perform pg_temp.falha(format($q$delete from public.v2_itens_analise where id = %L$q$, a2), '23503');    -- agregado do ranking
  d := public.v2_dependencias('m', im_q);
  assert jsonb_array_length(d -> 'formulas') >= 1 and jsonb_array_length(d -> 'agregados') >= 1 and jsonb_array_length(d -> 'filtros') = 1,
         format('dependencias do item de modelo inesperadas: %s', d);
  assert (public.v2_dependencias('a', a2) ->> 'ranking')::boolean, 'ranking deveria constar nas dependencias';
  -- item usado so por um filtro: bloqueado ate o filtro ser excluido
  r := public.v2_salvar_filtro(null, e, null, 'So extra', null, 'OR', jsonb_build_array(pg_temp.cond(1, 'm', im_x, '>', 1, null)));
  fil2 := (r ->> 'id')::uuid;
  perform pg_temp.falha(format($q$delete from public.v2_itens_modelo where id = %L$q$, im_x), '23503');
  delete from public.v2_filtros where id = fil2;
  perform pg_temp.passa(format($q$delete from public.v2_itens_modelo where id = %L$q$, im_x));
  select count(*) into v_n from public.v2_filtro_condicoes where filtro_id = fil2;
  assert v_n = 0, 'condicoes do filtro excluido deveriam ter sido removidas';

  perform pg_temp.admin();
  raise notice 'OK 05_analise';
end $$;
rollback;
