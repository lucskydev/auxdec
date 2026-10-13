-- =====================================================================
-- v2_0006 — Realtime.
-- EXCEÇÃO À REGRA 1, autorizada pelo usuário em 2026-10-09: o comando
-- ALTER PUBLICATION supabase_realtime ... só ADICIONA tabelas v2_ e não
-- altera nenhuma tabela da versão atual (decisoes_estado).
-- REPLICA IDENTITY FULL (só em tabelas v2_) permite que eventos de UPDATE e
-- DELETE tragam a linha completa, inclusive escopo_id, para o cliente filtrar.
-- =====================================================================

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime nao existe; nada a fazer';
    return;
  end if;

  foreach t in array array[
    'v2_escopos','v2_itens_modelo','v2_itens_produto','v2_modelos','v2_produtos',
    'v2_modelo_valores','v2_produto_valores','v2_itens_analise','v2_analise_refs',
    'v2_agregado_componentes','v2_filtros','v2_filtro_condicoes','v2_config_analise'
  ] loop
    execute format('alter table public.%I replica identity full', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
