-- 02_fixtures.sql — usuários e dados de teste (banco descartável; escreve dados!)
-- Variáveis psql (\gset) ficam disponíveis para os arquivos seguintes (mesma sessão).

\set ua '00000000-0000-0000-0000-00000000000a'
\set ub '00000000-0000-0000-0000-00000000000b'
\set uc '00000000-0000-0000-0000-00000000000c'

reset role;
insert into auth.users (id, email) values (:'ua', 'a@teste'), (:'ub', 'b@teste'), (:'uc', 'c@teste');

-- ============================== usuário A ==============================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;

insert into public.v2_escopos (nome) values ('Veículos');
insert into public.v2_escopos (nome) values ('Imóveis');
select id as ea from public.v2_escopos where nome = 'Veículos' \gset
select id as ea2 from public.v2_escopos where nome = 'Imóveis' \gset

-- itens de modelo (escrita direta permitida)
insert into public.v2_itens_modelo (escopo_id, nome, tipo, unidade, casas_decimais, valor_min, valor_max)
  values (:'ea', 'Preço', 'numerico', 'R$', 2, 0, 1000000);
insert into public.v2_itens_modelo (escopo_id, nome, tipo, casas_decimais, valor_min, valor_max)
  values (:'ea', 'Ano', 'numerico', 0, 1990, 2030);
insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'ea', 'Motor', 'textual');
insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'ea', 'Foto', 'imagem');
select id as im_preco from public.v2_itens_modelo where nome = 'Preço' and escopo_id = :'ea' \gset
select id as im_ano   from public.v2_itens_modelo where nome = 'Ano'   and escopo_id = :'ea' \gset
select id as im_motor from public.v2_itens_modelo where nome = 'Motor' and escopo_id = :'ea' \gset
select id as im_foto  from public.v2_itens_modelo where nome = 'Foto'  and escopo_id = :'ea' \gset

-- itens de produto
insert into public.v2_itens_produto (escopo_id, nome, tipo, unidade, valor_min) values (:'ea', 'Km', 'numerico', 'km', 0);
insert into public.v2_itens_produto (escopo_id, nome, tipo) values (:'ea', 'motor', 'textual');   -- conflita com o item de modelo "Motor"
insert into public.v2_itens_produto (escopo_id, nome, tipo) values (:'ea', 'Link', 'textual');
insert into public.v2_itens_produto (escopo_id, nome, tipo) values (:'ea', 'Foto do produto', 'imagem');
select id as ip_km    from public.v2_itens_produto where nome = 'Km'              and escopo_id = :'ea' \gset
select id as ip_motor from public.v2_itens_produto where nome = 'motor'           and escopo_id = :'ea' \gset
select id as ip_link  from public.v2_itens_produto where nome = 'Link'            and escopo_id = :'ea' \gset
select id as ip_foto  from public.v2_itens_produto where nome = 'Foto do produto' and escopo_id = :'ea' \gset

-- imagem (metadados; o arquivo em si é testado em 05_storage.sql)
insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime)
  values (:'ea', :'ua' || '/' || :'ea' || '/' || gen_random_uuid() || '.webp', 800, 600, 12345, 'image/webp');
select id as img1 from public.v2_imagens where escopo_id = :'ea' \gset

-- modelos (via RPC)
select (public.v2_salvar_modelo(:'ea', null, null, 'CR-V 2006', 'geração 2006-2011',
  format('[{"item_modelo_id":"%s","valor_num":50000},{"item_modelo_id":"%s","valor_num":2008},
          {"item_modelo_id":"%s","valor_txt":"2.0"},{"item_modelo_id":"%s","valor_img_id":"%s"}]',
         :'im_preco', :'im_ano', :'im_motor', :'im_foto', :'img1')::jsonb) ->> 'id') as m1 \gset
select (public.v2_salvar_modelo(:'ea', null, null, 'Civic', null,
  format('[{"item_modelo_id":"%s","valor_num":2010},{"item_modelo_id":"%s","valor_num":40000}]',
         :'im_ano', :'im_preco')::jsonb) ->> 'id') as m2 \gset

-- produtos (via RPC)
select (public.v2_salvar_produto(:'ea', null, null, 'CR-V placa X', null, :'m1',
  format('[{"item_produto_id":"%s","valor_num":120000},{"item_produto_id":"%s","valor_txt":"http://x"}]',
         :'ip_km', :'ip_link')::jsonb) ->> 'id') as p1 \gset
select (public.v2_salvar_produto(:'ea', null, null, 'Civic Y', null, :'m2',
  format('[{"item_produto_id":"%s","valor_num":80000},{"item_produto_id":"%s","valor_txt":"1.8 flex"}]',
         :'ip_km', :'ip_motor')::jsonb) ->> 'id') as p2 \gset
select (public.v2_salvar_produto(:'ea', null, null, 'Sem modelo', null, null,
  format('[{"item_produto_id":"%s","valor_num":10}]', :'ip_km')::jsonb) ->> 'id') as p3 \gset

-- fórmulas
select (public.v2_salvar_analise_formula(:'ea', null, null, 'Preço por km', null,
  format('[[m:%s]] / [[p:%s]]', :'im_preco', :'ip_km')) ->> 'id') as f1 \gset
select (public.v2_salvar_analise_formula(:'ea', null, null, 'Ajustada', null,
  format('ROUND([[a:%s]] * 2, 2)', :'f1')) ->> 'id') as f2 \gset

-- agregados
select (public.v2_salvar_analise_agregado(:'ea', null, null, 'Nota custo', null, 5,
  format('[{"peso":5,"direcao":"menor","lmin":20000,"lmax":80000,"item_modelo_id":"%s"},
           {"peso":3,"direcao":"menor","lmin":0,"lmax":200000,"item_produto_id":"%s"},
           {"peso":2,"direcao":"menor","lmin":0,"lmax":10,"item_analise_id":"%s"}]',
         :'im_preco', :'ip_km', :'f1')::jsonb) ->> 'id') as ag1 \gset
select (public.v2_salvar_analise_agregado(:'ea', null, null, 'Nota geral', null, 8,
  format('[{"peso":7,"direcao":"maior","lmin":0,"lmax":10,"item_analise_id":"%s"},
           {"peso":3,"direcao":"maior","lmin":1990,"lmax":2030,"item_modelo_id":"%s"}]',
         :'ag1', :'im_ano')::jsonb) ->> 'id') as ag2 \gset

-- filtro
select (public.v2_salvar_filtro(:'ea', null, null, 'Barato', null, 'AND',
  format('[{"item_modelo_id":"%s","operador":"lt","valor_num":60000},
           {"item_produto_id":"%s","operador":"le","valor_num":100000}]', :'im_preco', :'ip_km')::jsonb) ->> 'id') as ft1 \gset

-- ranking da análise
select id as cfg, versao as cfg_v from public.v2_config_analise where escopo_id = :'ea' \gset
update public.v2_config_analise set agregado_ranking_id = :'ag2', versao = :'cfg_v'::int + 1 where id = :'cfg';

-- ============================== usuário B ==============================
select set_config('request.jwt.claim.sub', :'ub', false);
insert into public.v2_escopos (nome) values ('Escopo do B');
select id as eb from public.v2_escopos where nome = 'Escopo do B' \gset
insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (:'eb', 'Item B', 'textual');
select id as imb from public.v2_itens_modelo where escopo_id = :'eb' \gset

reset role;
select t.ok((select count(*) from public.v2_itens_modelo) = 5, 'fixtures criadas: 4 itens de modelo do A + 1 do B');
