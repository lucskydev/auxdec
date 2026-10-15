-- 09_ordem.sql — ordem manual dos itens (migração 0007). Autocontido: cria os próprios escopos
-- (os arquivos 03–08 alteram os dados das fixtures). Usa os usuários :ua e :ub de 02.

reset role;
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;

insert into public.v2_escopos (nome) values ('Ordem A');
insert into public.v2_escopos (nome) values ('Ordem A2');
select id as oa  from public.v2_escopos where nome = 'Ordem A'  \gset
select id as oa2 from public.v2_escopos where nome = 'Ordem A2' \gset

insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'oa', 'Preço', 'textual');
insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'oa', 'Ano', 'textual');
insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'oa', 'Motor', 'textual');
insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'oa', 'Foto', 'imagem');
select id as o_preco from public.v2_itens_modelo where nome = 'Preço' and escopo_id = :'oa' \gset
select id as o_ano   from public.v2_itens_modelo where nome = 'Ano'   and escopo_id = :'oa' \gset
select id as o_motor from public.v2_itens_modelo where nome = 'Motor' and escopo_id = :'oa' \gset
select id as o_foto  from public.v2_itens_modelo where nome = 'Foto'  and escopo_id = :'oa' \gset

select t.ok((select array_agg(nome order by ordem) from public.v2_itens_modelo where escopo_id = :'oa')
            = array['Preço', 'Ano', 'Motor', 'Foto'], 'itens numerados na ordem de criação');
select t.ok((select array_agg(ordem order by ordem) from public.v2_itens_modelo where escopo_id = :'oa') = array[1,2,3,4],
            'ordem dos itens é 1..4');

-- reordenar
select array_agg(id order by case nome when 'Foto' then 1 when 'Motor' then 2 when 'Ano' then 3 else 4 end) as nova
  from public.v2_itens_modelo where escopo_id = :'oa' \gset
select versao as v_antes from public.v2_itens_modelo where id = :'o_preco' \gset
select public.v2_reordenar_itens(:'oa', 'itens_modelo', :'nova'::uuid[]);
select t.ok((select array_agg(nome order by ordem) from public.v2_itens_modelo where escopo_id = :'oa')
            = array['Foto', 'Motor', 'Ano', 'Preço'], 'reordenação aplicada');
select t.ok((select versao from public.v2_itens_modelo where id = :'o_preco') = :'v_antes'::int,
            'reordenar não altera a versão do item');

-- edição normal continua exigindo versão
select t.erro(format($q$update public.v2_itens_modelo set descricao = 'x' where id = '%s'$q$, :'o_preco'), 'V2001',
              'edição de item sem incrementar versão continua falhando (V2001)');
select t.ok(t.linhas(format($q$update public.v2_itens_modelo set descricao = 'x', versao = versao + 1 where id = '%s'$q$, :'o_preco')) = 1,
            'edição com versao+1 continua funcionando');
select t.ok((select ordem from public.v2_itens_modelo where id = :'o_preco') = 4, 'editar item preserva a ordem');
select t.ok(t.linhas(format($q$update public.v2_itens_modelo set ordem = 4 where id = '%s'$q$, :'o_preco')) = 1,
            'update só de ordem não exige versão');

-- listas inválidas
select t.erro(format($q$select public.v2_reordenar_itens('%s','itens_modelo', array['%s','%s']::uuid[])$q$, :'oa', :'o_preco', :'o_ano'),
              'V2013', 'lista incompleta recusada');
select t.erro(format($q$select public.v2_reordenar_itens('%s','itens_modelo', array['%s','%s','%s','%s','%s']::uuid[])$q$, :'oa', :'o_preco', :'o_ano', :'o_motor', :'o_foto', :'o_foto'),
              'V2013', 'lista com repetido recusada');
select t.erro(format($q$select public.v2_reordenar_itens('%s','itens_modelo', array['%s','%s','%s','%s']::uuid[])$q$, :'oa', :'o_preco', :'o_ano', :'o_motor', gen_random_uuid()),
              'V2013', 'id desconhecido na lista recusado');
select t.erro(format($q$select public.v2_reordenar_itens('%s','modelos', '{}'::uuid[])$q$, :'oa'), 'V2013', 'tabela inválida recusada');

-- itens de produto
insert into public.v2_itens_produto (escopo_id, nome, tipo) values (:'oa', 'A', 'textual');
insert into public.v2_itens_produto (escopo_id, nome, tipo) values (:'oa', 'B', 'textual');
insert into public.v2_itens_produto (escopo_id, nome, tipo) values (:'oa', 'C', 'textual');
select array_agg(id order by nome desc) as nova_p from public.v2_itens_produto where escopo_id = :'oa' \gset
select public.v2_reordenar_itens(:'oa', 'itens_produto', :'nova_p'::uuid[]);
select t.ok((select array_agg(nome order by ordem) from public.v2_itens_produto where escopo_id = :'oa') = array['C', 'B', 'A'],
            'reordenação de itens de produto aplicada');

-- item novo vai para o fim; numeração reinicia em cada escopo
insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'oa', 'Novo', 'textual');
select t.ok((select ordem from public.v2_itens_modelo where escopo_id = :'oa' and nome = 'Novo') = 5, 'item novo entra no fim');
insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'oa2', 'Primeiro', 'textual');
select t.ok((select ordem from public.v2_itens_modelo where escopo_id = :'oa2' and nome = 'Primeiro') = 1, 'numeração reinicia em cada escopo');

-- outro usuário e anônimo
select set_config('request.jwt.claim.sub', :'ub', false);
select t.erro(format($q$select public.v2_reordenar_itens('%s','itens_modelo', array['%s']::uuid[])$q$, :'oa', :'o_preco'),
              'V2011', 'usuário B não reordena itens do A');
reset role;
set role anon;
select t.erro(format($q$select public.v2_reordenar_itens('%s','itens_modelo', '{}'::uuid[])$q$, :'oa'), '42501', 'anon sem EXECUTE');
reset role;
