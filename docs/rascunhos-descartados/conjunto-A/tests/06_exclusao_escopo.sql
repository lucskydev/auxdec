\set ON_ERROR_STOP on
\ir support/helpers.sql
begin;
select pg_temp.guarda();
insert into auth.users (id, email) values (pg_temp.ua(), 'a@test.local'), (pg_temp.ub(), 'b@test.local');

create function pg_temp.total_v2(p_escopo uuid) returns int language plpgsql as $$
declare t text; n int; total int := 0;
begin
  foreach t in array array['v2_itens_modelo','v2_itens_produto','v2_modelos','v2_produtos','v2_imagens',
    'v2_modelo_valores','v2_produto_valores','v2_itens_analise','v2_analise_refs','v2_agregado_componentes',
    'v2_filtros','v2_filtro_condicoes','v2_config_analise'] loop
    execute format('select count(*) from public.%I where escopo_id = %L', t, p_escopo) into n;
    total := total + n;
  end loop;
  return total;
end $$;

do $$
declare
  e uuid; ev int; e2 uuid; im_q uuid; im_f uuid; ip_p uuid; img uuid; m uuid; f1 uuid; a1 uuid; a2 uuid; r jsonb;
  caminho text; v_n int; eb uuid;
begin
  -- B tambem tem um escopo (nunca pode ser tocado)
  perform pg_temp.como(pg_temp.ub());
  insert into public.v2_escopos (nome) values ('Escopo de B') returning id into eb;

  perform pg_temp.como(pg_temp.ua());
  insert into public.v2_escopos (nome) values ('Imoveis') returning id, versao into e, ev;
  insert into public.v2_escopos (nome) values ('Escopo que fica') returning id into e2;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Quartos', 'numerico') returning id into im_q;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Foto', 'imagem') returning id into im_f;
  insert into public.v2_itens_produto (escopo_id, nome, tipo) values (e, 'Preco', 'numerico') returning id into ip_p;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e2, 'Quartos', 'numerico');
  caminho := pg_temp.ua() || '/' || e || '/f.webp';
  insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime) values (e, caminho, 10, 10, 10, 'image/webp') returning id into img;
  m := ((public.v2_salvar_modelo(null, e, null, 'Apto', null, jsonb_build_array(pg_temp.vn(im_q, 2), pg_temp.vi(im_f, img)))) ->> 'id')::uuid;
  perform public.v2_salvar_produto(null, e, null, 'Apto 1', null, m, jsonb_build_array(pg_temp.vn(ip_p, 100)));
  f1 := ((public.v2_salvar_formula(null, e, null, 'Dobro', null, format('[[m:%s]]', im_q), jsonb_build_array(pg_temp.ref('m', im_q)))) ->> 'id')::uuid;
  a1 := ((public.v2_salvar_agregado(null, e, null, 'Nota', null, 5,
           jsonb_build_array(pg_temp.comp(1, 5, 'maior', 0, 10, 'm', im_q), pg_temp.comp(2, 5, 'maior', 0, 10, 'a', f1)))) ->> 'id')::uuid;
  perform public.v2_salvar_filtro(null, e, null, 'Filtro', null, 'AND', jsonb_build_array(pg_temp.cond(1, 'a', a1, '>', 1, null)));
  update public.v2_config_analise set agregado_ranking_id = a1, versao = versao + 1 where escopo_id = e;
  assert pg_temp.total_v2(e) > 10, 'escopo de teste deveria ter varios registros';

  -- confirmacao reforcada: nome errado, versao velha, e usuario sem dono
  perform pg_temp.falha(format($q$select public.v2_excluir_escopo(%L, %L, 'nome errado')$q$, e, ev), 'V2008');
  perform pg_temp.falha(format($q$select public.v2_excluir_escopo(%L, %L, 'Imoveis')$q$, e, ev + 5), 'V2001');
  perform pg_temp.falha(format($q$select public.v2_excluir_escopo(%L, %L, null)$q$, e, ev), 'V2008');
  assert pg_temp.total_v2(e) > 10, 'nada deveria ter sido apagado pelas tentativas invalidas';

  -- exclusao correta: apaga tudo de uma vez (inclusive o que se referencia mutuamente) e devolve as imagens
  r := public.v2_excluir_escopo(e, ev, '  IMOVEIS ');
  assert r -> 'imagens_removidas' = to_jsonb(array[caminho]), format('imagens_removidas inesperado: %s', r);
  assert pg_temp.total_v2(e) = 0, 'o escopo excluido deixou registros para tras';
  select count(*) into v_n from public.v2_escopos where id = e; assert v_n = 0, 'escopo deveria ter sido removido';

  -- o outro escopo do mesmo usuario e o escopo de outro usuario continuam intactos
  assert pg_temp.total_v2(e2) = 2, 'escopo vizinho foi afetado (esperados itens + config)';
  perform pg_temp.admin();
  assert (select count(*) from public.v2_escopos where id = eb) = 1, 'escopo de B foi afetado';
  assert pg_temp.total_v2(eb) = 1, 'config do escopo de B foi afetada';

  -- remover o usuario leva todos os dados dele (e so dele) por cascata
  delete from auth.users where id = pg_temp.ua();
  assert (select count(*) from public.v2_escopos where user_id = pg_temp.ua()) = 0, 'escopos do usuario removido continuam';
  assert pg_temp.total_v2(e2) = 0, 'dados do usuario removido continuam';
  assert (select count(*) from public.v2_escopos where id = eb) = 1, 'dados de B deveriam permanecer';

  raise notice 'OK 06_exclusao_escopo';
end $$;
rollback;
