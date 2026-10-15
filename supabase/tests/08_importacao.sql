-- 08_importacao.sql — v2_importar_escopo (migração 0006): novo, substituir, remapeamento e recusas.
-- Banco descartável. Roda depois de 06 (usa t.popular e t.restos_escopo).

reset role;

-- Backup de teste. Ids "antigos" fixos; o servidor deve trocar todos.
create or replace function t.backup(p_extra_formula text default null) returns jsonb
language sql as $$
select jsonb_build_object(
  'formato', 'auxdec-backup', 'versao_formato', 1, 'exportado_em', '2026-10-13T00:00:00Z',
  'escopo', jsonb_build_object('nome', 'Origem', 'descricao', null),
  'itens_modelo', jsonb_build_array(
    jsonb_build_object('id','11111111-1111-4111-8111-000000000001','nome','Preço','descricao',null,'tipo','numerico','unidade','R$','casas_decimais',2,'valor_min',0,'valor_max',1000000),
    jsonb_build_object('id','11111111-1111-4111-8111-000000000002','nome','Foto','descricao',null,'tipo','imagem','unidade',null,'casas_decimais',null,'valor_min',null,'valor_max',null)),
  'itens_produto', jsonb_build_array(
    jsonb_build_object('id','11111111-1111-4111-8111-000000000003','nome','Km','descricao',null,'tipo','numerico','unidade','km','casas_decimais',0,'valor_min',0,'valor_max',null),
    jsonb_build_object('id','11111111-1111-4111-8111-000000000004','nome','Cor','descricao',null,'tipo','textual','unidade',null,'casas_decimais',null,'valor_min',null,'valor_max',null)),
  'imagens', jsonb_build_array(
    jsonb_build_object('id','11111111-1111-4111-8111-000000000009','arquivo','imagens/x.webp','largura',800,'altura',600,'bytes',1000,'mime','image/webp')),
  'modelos', jsonb_build_array(
    jsonb_build_object('id','11111111-1111-4111-8111-000000000005','nome','Gol','descricao','d','valores', jsonb_build_array(
      jsonb_build_object('item_id','11111111-1111-4111-8111-000000000001','valor_num',50000,'valor_txt',null,'valor_img_id',null),
      jsonb_build_object('item_id','11111111-1111-4111-8111-000000000002','valor_num',null,'valor_txt',null,'valor_img_id','11111111-1111-4111-8111-000000000009')))),
  'produtos', jsonb_build_array(
    jsonb_build_object('id','11111111-1111-4111-8111-000000000006','nome','Gol 2020','descricao',null,'modelo_id','11111111-1111-4111-8111-000000000005','valores', jsonb_build_array(
      jsonb_build_object('item_id','11111111-1111-4111-8111-000000000003','valor_num',12000,'valor_txt',null,'valor_img_id',null),
      jsonb_build_object('item_id','11111111-1111-4111-8111-000000000004','valor_num',null,'valor_txt','azul','valor_img_id',null)))),
  'itens_analise', jsonb_build_array(
    jsonb_build_object('id','11111111-1111-4111-8111-000000000007','nome','Dobro','descricao',null,'tipo','formula',
      'formula_texto', coalesce(p_extra_formula, '[[m:11111111-1111-4111-8111-000000000001]] * 2'),'peso',null,'componentes',jsonb_build_array()),
    jsonb_build_object('id','11111111-1111-4111-8111-00000000000a','nome','Nota','descricao',null,'tipo','agregado','formula_texto',null,'peso',5,'componentes', jsonb_build_array(
      jsonb_build_object('ordem',1,'peso',1,'direcao','menor','lmin',0,'lmax',100000,'item_modelo_id','11111111-1111-4111-8111-000000000001','item_produto_id',null,'item_analise_id',null),
      jsonb_build_object('ordem',2,'peso',2,'direcao','menor','lmin',0,'lmax',100000,'item_modelo_id',null,'item_produto_id',null,'item_analise_id','11111111-1111-4111-8111-000000000007')))),
  'filtros', jsonb_build_array(
    jsonb_build_object('id','11111111-1111-4111-8111-00000000000b','nome','Barato','descricao',null,'logica','AND','condicoes', jsonb_build_array(
      jsonb_build_object('ordem',1,'item_modelo_id','11111111-1111-4111-8111-000000000001','item_produto_id',null,'item_analise_id',null,'operador','lt','valor_num',60000,'valor_txt',null)))),
  'config', jsonb_build_object('modo','produtos','logica_global','OR','agregado_ranking_id','11111111-1111-4111-8111-00000000000a',
    'colunas', jsonb_build_object('visiveis', jsonb_build_array('nome','m:11111111-1111-4111-8111-000000000001'), 'larguras', jsonb_build_object('m:11111111-1111-4111-8111-000000000001', 200)),
    'ordenacao', jsonb_build_array(jsonb_build_object('col','a:11111111-1111-4111-8111-00000000000a','dir','desc'))))
$$;
grant execute on function t.backup(text) to authenticated;

-- ============================ importar como NOVO ============================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
select gen_random_uuid() as n1 \gset
select format('%s/%s/%s.webp', :'ua', :'n1', gen_random_uuid()) as n1_path \gset
select public.v2_importar_escopo(t.backup(), 'novo', :'n1', 'Importado', 'desc', null, null,
  jsonb_build_object('11111111-1111-4111-8111-000000000009', :'n1_path')) as r1 \gset

reset role;
select t.ok(t.restos_escopo(:'n1') = 1 + 2 + 2 + 1 + 1 + 1 + 2 + 2 + 2 + 1 + 2 + 1 + 1 + 1,
  'importação cria escopo, itens, modelo, produto, imagem, valores, análises, refs, componentes, filtro, condição e config');
select t.ok((select nome from public.v2_escopos where id = :'n1') = 'Importado', 'nome final vem de p_nome');
select t.ok((select array_agg(nome order by ordem) from public.v2_itens_modelo where escopo_id = :'n1') = array['Preço', 'Foto'], 'importação preserva a ordem dos itens do arquivo (0007)');
select t.ok(not exists (select 1 from public.v2_itens_modelo where id::text like '11111111-%'), 'nenhum id antigo foi reaproveitado (itens)');
select t.ok(not exists (select 1 from public.v2_modelos where id::text like '11111111-%') and not exists (select 1 from public.v2_imagens where id::text like '11111111-%'), 'nenhum id antigo foi reaproveitado (modelos, imagens)');
select t.ok((select formula_texto from public.v2_itens_analise where nome = 'Dobro' and escopo_id = :'n1')
  = format('[[m:%s]] * 2', (select id from public.v2_itens_modelo where nome = 'Preço' and escopo_id = :'n1')),
  'fórmula remapeada para o id novo do item');
select t.ok((select count(*) from public.v2_analise_refs where escopo_id = :'n1') = 1, 'referência de fórmula derivada do texto');
select t.ok((select agregado_ranking_id from public.v2_config_analise where escopo_id = :'n1')
  = (select id from public.v2_itens_analise where nome = 'Nota' and escopo_id = :'n1'), 'ranking aponta para o agregado novo');
select t.ok((select modo || logica_global from public.v2_config_analise where escopo_id = :'n1') = 'produtosOR', 'modo e lógica global importados');
select t.ok((select colunas::text from public.v2_config_analise where escopo_id = :'n1') not like '%11111111-%', 'chaves de coluna remapeadas');
select t.ok((select colunas->'visiveis'->>1 from public.v2_config_analise where escopo_id = :'n1')
  = 'm:' || (select id from public.v2_itens_modelo where nome = 'Preço' and escopo_id = :'n1'), 'coluna visível aponta para o item novo');
select t.ok((select storage_path from public.v2_imagens where escopo_id = :'n1') = :'n1_path', 'caminho da imagem é o enviado pelo cliente');
select t.ok((select count(*) from public.v2_produtos p join public.v2_modelos m on m.id = p.modelo_id and m.escopo_id = p.escopo_id where p.escopo_id = :'n1') = 1, 'produto ligado ao modelo novo');
select t.ok((select count(*) from public.v2_modelo_valores where escopo_id = :'n1' and valor_img_id is not null) = 1, 'valor de imagem ligado à imagem nova');

-- ============================ recusas (e atomicidade) ============================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
select gen_random_uuid() as x1 \gset
select t.erro(format($q$select public.v2_importar_escopo('{"formato":"outro"}'::jsonb, 'novo', %L, 'X', null, null, null, '{}')$q$, :'x1'),
  'V2013', 'formato desconhecido é recusado');
select t.erro(format($q$select public.v2_importar_escopo(t.backup() - 'modelos', 'novo', %L, 'X', null, null, null, '{}')$q$, :'x1'),
  'V2013', 'lista ausente é recusada');
select t.erro(format($q$select public.v2_importar_escopo(t.backup(), 'qualquer', %L, 'X', null, null, null, '{}')$q$, :'x1'),
  'V2013', 'modo inválido é recusado');
select t.erro(format($q$select public.v2_importar_escopo(t.backup(), 'novo', %L, 'Importado', null, null, null, '{}')$q$, :'x1'),
  'qualquer', 'nome de escopo já existente é recusado (sem caminho de imagem também)');
select t.erro(format($q$select public.v2_importar_escopo(t.backup(), 'novo', %L, 'X', null, null, null, jsonb_build_object('11111111-1111-4111-8111-000000000009', 'outro/lugar/x.webp'))$q$, :'x1'),
  '23514', 'caminho de imagem fora de uid/escopo/ é recusado');
select t.erro(format($q$select public.v2_importar_escopo(t.backup('[[m:11111111-1111-4111-8111-0000000000ff]] + 1'), 'novo', %L, 'X', null, null, null, jsonb_build_object('11111111-1111-4111-8111-000000000009', %L))$q$, :'x1', :'ua' || '/' || :'x1' || '/a.webp'),
  'V2012', 'fórmula que referencia item fora do backup é recusada');
select t.erro(format($q$select public.v2_importar_escopo(t.backup('[[a:11111111-1111-4111-8111-00000000000a]] + 1'), 'novo', %L, 'X', null, null, null, jsonb_build_object('11111111-1111-4111-8111-000000000009', %L))$q$, :'x1', :'ua' || '/' || :'x1' || '/a.webp'),
  'qualquer', 'fórmula que referencia agregado e cria ciclo é recusada');
select t.erro(format($q$select public.v2_importar_escopo(jsonb_set(t.backup(), '{itens_analise,1,componentes}', '[]'::jsonb), 'novo', %L, 'X', null, null, null, jsonb_build_object('11111111-1111-4111-8111-000000000009', %L))$q$, :'x1', :'ua' || '/' || :'x1' || '/a.webp'),
  'V2010', 'agregado sem 2 a 5 componentes é recusado');
select t.erro(format($q$select public.v2_importar_escopo(jsonb_set(t.backup(), '{itens_produto,0,nome}', '"preço"'), 'novo', %L, 'X', null, null, null, jsonb_build_object('11111111-1111-4111-8111-000000000009', %L))$q$, :'x1', :'ua' || '/' || :'x1' || '/a.webp'),
  'V2002', 'nome de item próprio igual a item herdado é recusado');
reset role;
select t.ok(not exists (select 1 from public.v2_escopos where id = :'x1') and t.restos_escopo(:'x1') = 0, 'nenhuma importação recusada deixou resíduos (atomicidade)');

select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select t.erro(format($q$select public.v2_importar_escopo(t.backup(), 'novo', %L, 'X', null, null, null, '{}')$q$, :'x1'),
  '28000', 'sem autenticação é recusado');
reset role;
set role anon;
select t.erro(format($q$select public.v2_importar_escopo(t.backup(), 'novo', %L, 'X', null, null, null, '{}')$q$, :'x1'),
  '42501', 'anon não executa a função');
reset role;

-- ============================ substituir ============================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
select versao as n1_v from public.v2_escopos where id = :'n1' \gset
select t.erro(format($q$select public.v2_importar_escopo(t.backup(), 'substituir', %L, 'Novo nome', null, %s, 'errado', '{}')$q$, :'n1', :'n1_v'),
  'V2014', 'substituir exige o nome atual digitado');
select t.erro(format($q$select public.v2_importar_escopo(t.backup(), 'substituir', %L, 'Novo nome', null, %s, 'Importado', '{}')$q$, :'n1', :'n1_v'::int + 3),
  'V2001', 'substituir com versão antiga é recusado');
select set_config('request.jwt.claim.sub', :'ub', false);
select t.erro(format($q$select public.v2_importar_escopo(t.backup(), 'substituir', %L, 'Novo nome', null, %s, 'Importado', '{}')$q$, :'n1', :'n1_v'),
  'V2011', 'B não substitui escopo do A');
reset role;
select t.ok(t.restos_escopo(:'n1') = 20, 'recusas não alteraram o escopo');

select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
select format('%s/%s/%s.webp', :'ua', :'n1', gen_random_uuid()) as n2_path \gset
select public.v2_importar_escopo(t.backup(), 'substituir', :'n1', 'Substituído', null, :'n1_v'::int, 'Importado',
  jsonb_build_object('11111111-1111-4111-8111-000000000009', :'n2_path')) as r2 \gset
reset role;
select t.ok(jsonb_exists(:'r2'::jsonb -> 'caminhos_antigos', :'n1_path'), 'devolve o caminho da imagem antiga para limpeza');
select t.ok(jsonb_array_length(:'r2'::jsonb -> 'caminhos_antigos') = 1, 'e apenas as imagens do conteúdo anterior');
select t.ok(t.restos_escopo(:'n1') = 20, 'conteúdo substituído tem o mesmo tamanho (sem duplicar, sem resíduo)');
select t.ok((select nome from public.v2_escopos where id = :'n1') = 'Substituído', 'nome atualizado');
select t.ok((select versao from public.v2_escopos where id = :'n1') = :'n1_v'::int + 1, 'versão do escopo incrementada');
select t.ok((select storage_path from public.v2_imagens where escopo_id = :'n1') = :'n2_path', 'imagem nova no lugar da antiga');
select t.ok((select count(*) from public.v2_config_analise where escopo_id = :'n1') = 1, 'continua havendo uma única configuração');
select t.ok((select agregado_ranking_id from public.v2_config_analise where escopo_id = :'n1') is not null, 'ranking restabelecido após substituir');
