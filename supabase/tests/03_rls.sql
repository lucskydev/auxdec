-- 03_rls.sql — isolamento entre usuários e acesso anônimo (RLS + privilégios)

-- ============================ usuário B não enxerga nada do A ============================
select set_config('request.jwt.claim.sub', :'ub', false);
set role authenticated;

select t.ok(t.n('select 1 from public.v2_escopos where id = ' || quote_literal(:'ea')) = 0, 'B não vê o escopo do A');
select t.ok(t.n('select 1 from public.v2_itens_modelo   where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê itens de modelo do A');
select t.ok(t.n('select 1 from public.v2_itens_produto  where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê itens de produto do A');
select t.ok(t.n('select 1 from public.v2_modelos        where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê modelos do A');
select t.ok(t.n('select 1 from public.v2_produtos       where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê produtos do A');
select t.ok(t.n('select 1 from public.v2_imagens        where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê imagens do A');
select t.ok(t.n('select 1 from public.v2_modelo_valores where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê valores de modelo do A');
select t.ok(t.n('select 1 from public.v2_produto_valores where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê valores de produto do A');
select t.ok(t.n('select 1 from public.v2_itens_analise  where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê itens de análise do A');
select t.ok(t.n('select 1 from public.v2_analise_refs   where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê referências de fórmula do A');
select t.ok(t.n('select 1 from public.v2_agregado_componentes where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê componentes de agregado do A');
select t.ok(t.n('select 1 from public.v2_filtros        where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê filtros do A');
select t.ok(t.n('select 1 from public.v2_filtro_condicoes where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê condições de filtro do A');
select t.ok(t.n('select 1 from public.v2_config_analise where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê a configuração de análise do A');
select t.ok(t.n('select 1 from public.v2_vw_produto_efetivo where escopo_id = ' || quote_literal(:'ea')) = 0, 'B não vê a view de produto efetivo do A (security_invoker)');

-- B não escreve nos dados do A
select t.ok(t.linhas(format('update public.v2_escopos set nome = %L, versao = versao + 1 where id = %L', 'invadido', :'ea')) = 0, 'B não altera escopo do A');
select t.ok(t.linhas(format('update public.v2_itens_modelo set nome = %L, versao = versao + 1 where id = %L', 'invadido', :'im_preco')) = 0, 'B não altera item do A');
select t.ok(t.linhas(format('delete from public.v2_itens_modelo where id = %L', :'im_foto')) = 0, 'B não exclui item do A');
select t.ok(t.linhas(format('delete from public.v2_modelos where id = %L', :'m2')) = 0, 'B não exclui modelo do A');
select t.ok(t.linhas(format('delete from public.v2_produtos where id = %L', :'p3')) = 0, 'B não exclui produto do A');
select t.ok(t.linhas(format('delete from public.v2_filtros where id = %L', :'ft1')) = 0, 'B não exclui filtro do A');
select t.ok(t.linhas(format('delete from public.v2_imagens where id = %L', :'img1')) = 0, 'B não exclui imagem do A');
select t.ok(t.linhas(format('update public.v2_config_analise set modo = %L, versao = versao + 1 where id = %L', 'modelos', :'cfg')) = 0, 'B não altera configuração do A');

select t.erro(format('insert into public.v2_itens_modelo (user_id, escopo_id, nome, tipo) values (%L, %L, %L, %L)', :'ua', :'ea', 'x', 'textual'),
  '42501', 'B não insere linha com user_id do A (RLS WITH CHECK)');
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, %L, %L)', :'ea', 'x', 'textual'),
  '23503', 'B não insere item no escopo do A (FK composta escopo+usuário)');
select t.erro(format('insert into public.v2_escopos (user_id, nome) values (%L, %L)', :'ua', 'x'),
  '42501', 'B não cria escopo em nome do A');

-- RPCs com id de outro usuário
select t.erro(format('select public.v2_salvar_modelo(%L, null, null, %L, null, %L)', :'ea', 'x', '[]'), 'V2011', 'RPC salvar_modelo recusa escopo do A');
select t.erro(format('select public.v2_salvar_modelo(%L, %L, 1, %L, null, %L)', :'eb', :'m1', 'x', '[]'), 'V2011', 'RPC salvar_modelo recusa modelo do A mesmo com escopo próprio');
select t.erro(format('select public.v2_salvar_produto(%L, null, null, %L, null, null, %L)', :'ea', 'x', '[]'), 'V2011', 'RPC salvar_produto recusa escopo do A');
select t.erro(format('select public.v2_salvar_analise_formula(%L, null, null, %L, null, %L)', :'ea', 'x', '1 + 1'), 'V2011', 'RPC salvar_analise_formula recusa escopo do A');
select t.erro(format('select public.v2_salvar_filtro(%L, null, null, %L, null, %L, %L)', :'ea', 'x', 'AND', '[]'), 'V2011', 'RPC salvar_filtro recusa escopo do A');
select t.erro(format('select public.v2_excluir_escopo(%L, 1, %L)', :'ea', 'Veículos'), 'V2011', 'RPC excluir_escopo recusa escopo do A');
select t.erro(format('select public.v2_salvar_analise_formula(%L, null, null, %L, null, %L)', :'eb', 'refA', format('[[m:%s]] + 1', :'im_preco')),
  'V2012', 'B não referencia item do A numa fórmula do próprio escopo');

-- B não escreve direto onde só as RPCs escrevem
select t.erro(format('insert into public.v2_modelos (escopo_id, nome) values (%L, %L)', :'eb', 'direto'), '42501', 'INSERT direto em v2_modelos é negado');
select t.erro(format('insert into public.v2_filtros (escopo_id, nome) values (%L, %L)', :'eb', 'direto'), '42501', 'INSERT direto em v2_filtros é negado');
select t.erro(format('delete from public.v2_escopos where id = %L', :'eb'), '42501', 'DELETE direto em v2_escopos é negado (só pela RPC)');
select t.erro('delete from public.v2_modelo_valores', '42501', 'DELETE direto em v2_modelo_valores é negado');

-- ============================ visitante anônimo ============================
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t.erro('select * from public.v2_escopos', '42501', 'anon não lê v2_escopos');
select t.erro('select * from public.v2_vw_produto_efetivo', '42501', 'anon não lê a view');
select t.erro('insert into public.v2_escopos (nome) values (''anon'')', '42501', 'anon não insere escopo');
select t.erro(format('select public.v2_salvar_modelo(%L, null, null, %L, null, %L)', :'ea', 'x', '[]'), '42501', 'anon não executa RPC v2_salvar_modelo');
select t.erro(format('select public.v2_excluir_escopo(%L, 1, %L)', :'ea', 'Veículos'), '42501', 'anon não executa RPC v2_excluir_escopo');

-- authenticated sem sessão válida (sub vazio) não passa nas RPCs
reset role;
set role authenticated;
select t.erro(format('select public.v2_salvar_modelo(%L, null, null, %L, null, %L)', :'ea', 'x', '[]'), '28000', 'sem auth.uid() a RPC responde nao_autenticado');
select t.ok(t.n('select 1 from public.v2_escopos') = 0, 'sem auth.uid() o SELECT não devolve linhas');

-- ============================ A continua enxergando tudo ============================
reset role;
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
select t.ok(t.n('select 1 from public.v2_escopos') = 2, 'A vê seus 2 escopos e nenhum do B');
select t.ok(t.n('select 1 from public.v2_itens_modelo') = 4, 'A vê seus 4 itens de modelo e nenhum do B');
reset role;
