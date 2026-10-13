\set ON_ERROR_STOP on
\ir support/helpers.sql
begin;
select pg_temp.guarda();
insert into auth.users (id, email) values (pg_temp.ua(), 'a@test.local'), (pg_temp.ub(), 'b@test.local');

do $$
declare
  v_esc uuid; v_item uuid; v_mod jsonb; v_mid uuid; v_n int; t text;
  v_tabelas text[] := array['v2_escopos','v2_itens_modelo','v2_itens_produto','v2_modelos','v2_produtos',
    'v2_imagens','v2_modelo_valores','v2_produto_valores','v2_itens_analise','v2_analise_refs',
    'v2_agregado_componentes','v2_filtros','v2_filtro_condicoes','v2_config_analise'];
begin
  -- usuario A cria dados
  perform pg_temp.como(pg_temp.ua());
  insert into public.v2_escopos (nome) values ('Veiculos') returning id into v_esc;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (v_esc, 'Quartos', 'numerico') returning id into v_item;
  v_mod := public.v2_salvar_modelo(null, v_esc, null, 'CR-V', null,
             jsonb_build_array(jsonb_build_object('item_id', v_item, 'valor_num', 3)));
  v_mid := (v_mod ->> 'id')::uuid;
  select count(*) into v_n from public.v2_escopos;          assert v_n = 1, 'A deveria ver o proprio escopo';
  select count(*) into v_n from public.v2_config_analise;   assert v_n = 1, 'config padrao deveria existir';
  select count(*) into v_n from public.v2_modelo_valores;   assert v_n = 1, 'A deveria ver o valor do modelo';

  -- usuario B nao enxerga nada de A em nenhuma tabela nem na visao
  perform pg_temp.como(pg_temp.ub());
  foreach t in array v_tabelas loop
    execute format('select count(*) from public.%I', t) into v_n;
    assert v_n = 0, format('B enxerga %s linha(s) de %s', v_n, t);
  end loop;
  select count(*) into v_n from public.v2_vw_produto_efetivo; assert v_n = 0, 'B enxerga a visao de A';

  -- B nao altera nem apaga linhas de A (RLS filtra: 0 linhas afetadas)
  update public.v2_escopos set nome = 'invadido'; get diagnostics v_n = row_count;
  assert v_n = 0, 'B atualizou escopo de A';
  delete from public.v2_itens_modelo; get diagnostics v_n = row_count;
  assert v_n = 0, 'B apagou item de A';

  -- B nao insere com o user_id de A, nem pendura dados no escopo de A
  perform pg_temp.falha(format($q$insert into public.v2_escopos (user_id, nome) values (%L, 'inv')$q$, pg_temp.ua()), '42501');
  perform pg_temp.falha(format($q$insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, 'x', 'numerico')$q$, v_esc), '23503');
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(null, %L, null, 'x', null, '[]')$q$, v_esc), '23503');
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, 1, 'x', null, '[]')$q$, v_mid, v_esc), 'V2007');
  perform pg_temp.falha(format($q$select public.v2_excluir_modelo(%L, 1)$q$, v_mid), 'V2007');
  perform pg_temp.falha(format($q$select public.v2_excluir_escopo(%L, 1, 'Veiculos')$q$, v_esc), 'V2007');

  -- privilegios: authenticated nao escreve direto onde ha filhos
  perform pg_temp.como(pg_temp.ua());
  perform pg_temp.falha(format($q$insert into public.v2_modelos (escopo_id, nome) values (%L, 'direto')$q$, v_esc), '42501');
  perform pg_temp.falha($q$update public.v2_modelo_valores set valor_num = 99$q$, '42501');
  perform pg_temp.falha($q$delete from public.v2_escopos$q$, '42501');
  perform pg_temp.falha($q$select public.v2_assert_agregado(gen_random_uuid())$q$, '42501');
  perform pg_temp.falha($q$select public.v2_liberar_imagens('{}')$q$, '42501');

  -- authenticated sem sub (token sem usuario) nao passa pelas RPCs
  perform pg_temp.como(null);
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(null, %L, null, 'x', null, '[]')$q$, v_esc), 'V2000');

  -- anon: nada de tabelas, visao nem RPCs
  perform pg_temp.anonimo();
  foreach t in array v_tabelas loop
    perform pg_temp.falha(format('select count(*) from public.%I', t), '42501');
  end loop;
  perform pg_temp.falha('select count(*) from public.v2_vw_produto_efetivo', '42501');
  perform pg_temp.falha($q$select public.v2_dependencias('m', gen_random_uuid())$q$, '42501');
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(null, %L, null, 'x', null, '[]')$q$, v_esc), '42501');

  perform pg_temp.admin();
  raise notice 'OK 02_rls';
end $$;
rollback;
