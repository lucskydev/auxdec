-- 07_realtime_numerico.sql — Realtime (catálogo) e valores numéricos não finitos
-- Banco descartável apenas.

reset role;

-- ================================ Realtime ================================
select t.ok((select count(*) from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like 'v2\_%') = 14,
  'as 14 tabelas v2_ estão na publication supabase_realtime');
select t.ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'v2\_%' and c.relreplident = 'f') = 14,
  'as 14 tabelas v2_ têm REPLICA IDENTITY FULL (DELETE e UPDATE trazem a linha completa)');
select t.ok(not exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like 'v2\_%'
                and tablename not in (select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity)),
  'toda tabela v2_ publicada no Realtime tem RLS ativo');

-- ============================ NaN e ±Infinity ============================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;

-- item de produto numérico SEM limites: assim a checagem de limites não se antecipa ao CHECK
insert into public.v2_itens_produto (escopo_id, nome, tipo) values (:'ea', 'Sem limite', 'numerico');
select id as ip_livre from public.v2_itens_produto where escopo_id = :'ea' and nome = 'Sem limite' \gset

-- limites dos itens
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo, valor_min) values (%L, %L, %L, %L::numeric)',
  :'ea', 'nan_min', 'numerico', 'NaN'), '23514', 'valor_min = NaN é recusado');
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo, valor_max) values (%L, %L, %L, %L::numeric)',
  :'ea', 'inf_max', 'numerico', 'Infinity'), '23514', 'valor_max = Infinity é recusado');
select t.erro(format('insert into public.v2_itens_produto (escopo_id, nome, tipo, valor_min) values (%L, %L, %L, %L::numeric)',
  :'ea', 'ninf_min', 'numerico', '-Infinity'), '23514', 'valor_min = -Infinity é recusado (item de produto)');

-- valores enviados como TEXTO dentro do JSON da RPC ("NaN" vira numeric NaN no cast)
select t.erro(format($q$select public.v2_salvar_produto(%L, null, null, 'v nan', null, null,
  '[{"item_produto_id":"%s","valor_num":"NaN"}]'::jsonb)$q$, :'ea', :'ip_livre'),
  '23514', 'valor "NaN" vindo pela RPC é recusado');
select t.erro(format($q$select public.v2_salvar_produto(%L, null, null, 'v inf', null, null,
  '[{"item_produto_id":"%s","valor_num":"Infinity"}]'::jsonb)$q$, :'ea', :'ip_livre'),
  '23514', 'valor "Infinity" vindo pela RPC é recusado');
select t.erro(format($q$select public.v2_salvar_produto(%L, null, null, 'v ninf', null, null,
  '[{"item_produto_id":"%s","valor_num":"-Infinity"}]'::jsonb)$q$, :'ea', :'ip_livre'),
  '23514', 'valor "-Infinity" vindo pela RPC é recusado');

-- limites de normalização do agregado
select t.erro(format($q$select public.v2_salvar_analise_agregado(%L, null, null, 'agg nan', null, 5,
  '[{"peso":1,"direcao":"maior","lmin":"NaN","lmax":10,"item_modelo_id":"%s"},
    {"peso":1,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s"}]'::jsonb)$q$, :'ea', :'im_preco', :'im_ano'),
  '23514', 'lmin = NaN em componente de agregado é recusado');
select t.erro(format($q$select public.v2_salvar_analise_agregado(%L, null, null, 'agg inf', null, 5,
  '[{"peso":1,"direcao":"maior","lmin":0,"lmax":"Infinity","item_modelo_id":"%s"},
    {"peso":1,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s"}]'::jsonb)$q$, :'ea', :'im_preco', :'im_ano'),
  '23514', 'lmax = Infinity em componente de agregado é recusado');

-- condição de filtro
select t.erro(format($q$select public.v2_salvar_filtro(%L, null, null, 'f nan', null, 'AND',
  '[{"item_modelo_id":"%s","operador":"lt","valor_num":"NaN"}]'::jsonb)$q$, :'ea', :'im_preco'),
  '23514', 'valor NaN em condição de filtro é recusado');

-- contraprova: valor finito, inclusive decimal, continua aceito
select t.ok((public.v2_salvar_produto(:'ea', null, null, 'v ok', null, null,
  format('[{"item_produto_id":"%s","valor_num":1234.5678}]', :'ip_livre')::jsonb) ->> 'versao')::int = 1,
  'valor finito (decimal) continua aceito');
select t.ok((select valor_num from public.v2_produto_valores
              where item_produto_id = :'ip_livre') = 1234.5678,
  'e é gravado sem perda de precisão');

reset role;
