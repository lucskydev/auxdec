-- 01_estrutura.sql — verificações estruturais (executar como superusuário, em banco descartável)

-- Toda tabela v2_ tem RLS ativo
select t.ok(
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'v2\_%' and not c.relrowsecurity),
  'RLS ativo em todas as tabelas v2_');

select t.ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'v2\_%') = 14,
  'existem exatamente 14 tabelas v2_');

-- Nenhuma policy v2_ usa "true" como condição
select t.ok(
  not exists (select 1 from pg_policies
               where (tablename like 'v2\_%' or policyname like 'v2\_%')
                 and (lower(coalesce(qual, '')) in ('true', '(true)') or lower(coalesce(with_check, '')) in ('true', '(true)'))),
  'nenhuma policy v2_ com condição true');

-- Toda policy de tabela v2_ filtra pelo dono
select t.ok(
  not exists (select 1 from pg_policies
               where schemaname = 'public' and tablename like 'v2\_%'
                 and not (coalesce(qual, with_check) like '%auth.uid()%' and coalesce(qual, with_check) like '%user_id%')),
  'toda policy de tabela v2_ compara auth.uid() com user_id');

-- Policies de tabela v2_ são só para authenticated
select t.ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'v2\_%' and roles <> '{authenticated}'),
  'policies v2_ são exclusivas do papel authenticated');

-- Toda policy fora da versão atual começa com v2_
select t.ok(
  not exists (select 1 from pg_policies where policyname not like 'v2\_%' and policyname not like 'decisoes\_%'),
  'nenhuma policy desconhecida: só v2_ (novas) e decisoes_ (versão atual, intactas)');

-- anon não tem privilégio algum nas tabelas/views v2_
select t.ok(
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname like 'v2\_%' and c.relkind in ('r', 'v')
                 and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
                   or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))),
  'anon sem privilégio em tabelas/views v2_');

-- Nenhuma função v2_ é executável por anon nem por PUBLIC
select t.ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname like 'v2\_%'
                 and (p.proacl is null
                      or has_function_privilege('anon', p.oid, 'execute')
                      or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))),
  'anon e PUBLIC sem EXECUTE em funções v2_');

-- Funções de trigger não são executáveis por authenticated
select t.ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname like 'v2\_trg\_%'
                 and has_function_privilege('authenticated', p.oid, 'execute')),
  'authenticated sem EXECUTE nas funções de trigger v2_trg_*');

-- Só as 8 RPCs são executáveis por authenticated
select t.ok(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'v2\_%' and has_function_privilege('authenticated', p.oid, 'execute'))
  = array['v2_excluir_escopo', 'v2_importar_escopo', 'v2_reordenar_itens', 'v2_salvar_analise_agregado', 'v2_salvar_analise_formula',
          'v2_salvar_filtro', 'v2_salvar_modelo', 'v2_salvar_produto'],
  'authenticated executa somente as 8 RPCs v2_');

-- Toda função v2_ tem search_path fixo; RPCs são SECURITY DEFINER
select t.ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname like 'v2\_%'
                 and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'toda função v2_ tem search_path fixo');

select t.ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and (p.proname like 'v2\_salvar\_%' or p.proname in ('v2_excluir_escopo', 'v2_importar_escopo', 'v2_reordenar_itens'))
                 and not p.prosecdef),
  'RPCs v2_ são SECURITY DEFINER');

-- authenticated não escreve direto nas tabelas que só as RPCs devem escrever
select t.ok(
  not exists (select 1 from unnest(array['v2_modelos', 'v2_produtos', 'v2_itens_analise', 'v2_filtros']) x
               where has_table_privilege('authenticated', 'public.' || x, 'insert')
                  or has_table_privilege('authenticated', 'public.' || x, 'update')),
  'authenticated não faz INSERT/UPDATE direto em modelos, produtos, itens de análise e filtros');
select t.ok(
  not exists (select 1 from unnest(array['v2_modelo_valores', 'v2_produto_valores', 'v2_analise_refs',
                                         'v2_agregado_componentes', 'v2_filtro_condicoes']) x
               where has_table_privilege('authenticated', 'public.' || x, 'insert')
                  or has_table_privilege('authenticated', 'public.' || x, 'update')
                  or has_table_privilege('authenticated', 'public.' || x, 'delete')),
  'authenticated não escreve direto em valores, referências, componentes e condições');
select t.ok(not has_table_privilege('authenticated', 'public.v2_escopos', 'delete'),
  'authenticated não exclui escopo direto (só pela RPC v2_excluir_escopo)');

-- Bucket novo é privado e tem limites
select t.ok((select not public and file_size_limit is not null and allowed_mime_types is not null
               from storage.buckets where id = 'v2_imagens'),
  'bucket v2_imagens existe, é privado e tem limite de tamanho e tipos');

-- Policies de storage: exatamente as 3 novas, todas filtrando bucket e pasta do usuário
select t.ok(
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'v2\_%') = 3,
  'existem exatamente 3 policies v2_ em storage.objects');
select t.ok(
  not exists (select 1 from pg_policies
               where schemaname = 'storage' and policyname like 'v2\_%'
                 and not (coalesce(qual, with_check) like '%bucket_id = ''v2_imagens''%'
                          and coalesce(qual, with_check) like '%foldername%auth.uid()%')),
  'policies de storage v2_ filtram por bucket v2_imagens e pasta do próprio usuário');
