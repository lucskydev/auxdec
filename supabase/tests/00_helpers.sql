-- 00_helpers.sql
-- Funções de apoio dos testes (schema t). Funciona em Postgres puro com o stub e no Supabase local.
-- Não usar no projeto "sistemas". Os testes escrevem dados: só rodam em banco descartável.

drop schema if exists t cascade;
create schema t;
grant usage on schema t to anon, authenticated;

-- Falha o teste com mensagem clara.
create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FALHOU: %', p_msg;
  end if;
  raise notice 'ok   - %', p_msg;
end $$;

-- Executa SQL e exige que falhe com o SQLSTATE esperado (ou, em p_estado = 'qualquer', com qualquer erro).
create function t.erro(p_sql text, p_estado text, p_msg text) returns void language plpgsql as $$
declare v_estado text;
begin
  begin
    execute p_sql;
    execute 'set constraints all immediate'; -- dispara na hora os checks adiados (constraint triggers)
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    if p_estado = 'qualquer' or v_estado = p_estado then
      raise notice 'ok   - % (SQLSTATE %)', p_msg, v_estado;
      return;
    end if;
    raise exception 'FALHOU: % — esperado SQLSTATE %, veio % (%)', p_msg, p_estado, v_estado, sqlerrm;
  end;
  raise exception 'FALHOU: % — deveria ter falhado e passou', p_msg;
end $$;

-- Executa DML e devolve quantas linhas foram afetadas (0 = bloqueado por RLS).
create function t.linhas(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
end $$;

-- Conta linhas visíveis ao papel atual.
create function t.n(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  execute 'select count(*) from (' || p_sql || ') s' into v;
  return v;
end $$;

grant execute on all functions in schema t to anon, authenticated;
