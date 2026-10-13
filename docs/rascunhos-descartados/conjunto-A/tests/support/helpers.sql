-- Auxiliares de teste (vivem só na sessão, em pg_temp).
create function pg_temp.ua() returns uuid language sql as $$ select '00000000-0000-4000-8000-00000000000a'::uuid $$;
create function pg_temp.ub() returns uuid language sql as $$ select '00000000-0000-4000-8000-00000000000b'::uuid $$;

-- Recusa rodar contra o banco de produção/compartilhado.
create function pg_temp.guarda() returns void language plpgsql as $$
begin
  if to_regclass('public.decisoes_estado') is not null then
    raise exception 'ABORTADO: existe public.decisoes_estado. Estes testes escrevem dados e so podem rodar em banco local/descartavel.';
  end if;
end $$;

create function pg_temp.como(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

create function pg_temp.admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Executa q e exige que falhe com o SQLSTATE esperado (cada tentativa roda numa
-- subtransação, então a falha não derruba o teste). Se q terminar com
-- "set constraints all immediate", os triggers deferidos também são verificados.
create function pg_temp.falha(q text, esperado text) returns void language plpgsql as $$
begin
  begin
    execute q;
    execute 'set constraints all immediate';
  exception when others then
    if sqlstate = esperado then
      return;
    end if;
    raise exception 'erro diferente do esperado (esperado %, veio % : %) em: %', esperado, sqlstate, sqlerrm, q;
  end;
  raise exception 'ERA ESPERADO FALHAR com %, mas passou: %', esperado, q;
end $$;

-- Executa q e exige que NÃO falhe (verificando também os triggers deferidos).
create function pg_temp.passa(q text) returns void language plpgsql as $$
begin
  execute q;
  execute 'set constraints all immediate';   -- forca a checagem dos triggers deferidos agora
  execute 'set constraints all deferred';    -- e volta ao modo normal (vale ate o fim da transacao)
end $$;

-- Montadores de valores para as RPCs de modelo/produto.
create function pg_temp.vn(i uuid, n numeric) returns jsonb language sql as $$ select jsonb_build_object('item_id', i, 'valor_num', n) $$;
create function pg_temp.vt(i uuid, t text)   returns jsonb language sql as $$ select jsonb_build_object('item_id', i, 'valor_txt', t) $$;
create function pg_temp.vi(i uuid, g uuid)   returns jsonb language sql as $$ select jsonb_build_object('item_id', i, 'valor_img_id', g) $$;

-- Montadores para formula/agregado/filtro.
create function pg_temp.ref(t text, i uuid) returns jsonb language sql as $$ select jsonb_build_object('tipo', t, 'id', i) $$;
create function pg_temp.comp(ordem int, peso int, dir text, lmin numeric, lmax numeric, t text, i uuid) returns jsonb
language sql as $$ select jsonb_build_object('ordem', ordem, 'peso', peso, 'direcao', dir, 'lmin', lmin, 'lmax', lmax, 'tipo', t, 'id', i) $$;
create function pg_temp.cond(ordem int, t text, i uuid, op text, vnum numeric, vtxt text) returns jsonb
language sql as $$ select jsonb_build_object('ordem', ordem, 'tipo', t, 'id', i, 'operador', op, 'valor_num', vnum, 'valor_txt', vtxt) $$;
