-- 04_integridade.sql — regras de negócio garantidas no banco (como usuário A)

reset role;
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;

-- =============================== nomes únicos por escopo ===============================
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, %L, %L)', :'ea', ' PREÇO ', 'textual'),
  '23505', 'nome de item de modelo é único sem diferenciar maiúsculas, acento de caixa e espaços nas pontas');
select t.erro(format('insert into public.v2_itens_produto (escopo_id, nome, tipo) values (%L, %L, %L)', :'ea', 'KM', 'numerico'),
  '23505', 'nome de item de produto é único sem diferenciar maiúsculas');
select t.erro(format('insert into public.v2_escopos (nome) values (%L)', 'veículos'),
  '23505', 'nome de escopo é único por usuário sem diferenciar maiúsculas');
select t.erro(format('select public.v2_salvar_modelo(%L, null, null, %L, null, %L)', :'ea', 'civic', '[]'),
  '23505', 'nome de modelo é único no escopo sem diferenciar maiúsculas');
select t.erro(format('select public.v2_salvar_produto(%L, null, null, %L, null, null, %L)', :'ea', 'SEM MODELO', '[]'),
  '23505', 'nome de produto é único no escopo');
select t.erro(format('select public.v2_salvar_analise_formula(%L, null, null, %L, null, %L)', :'ea', 'preço POR km', '1 + 1'),
  '23505', 'nome de item de análise é único no escopo');
select t.erro(format('select public.v2_salvar_filtro(%L, null, null, %L, null, %L, %L)', :'ea', 'BARATO', 'AND', '[]'),
  '23505', 'nome de filtro é único no escopo');
select t.ok(t.linhas(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, %L, %L)', :'ea2', 'Preço', 'textual')) = 1,
  'o mesmo nome pode existir em outro escopo');

-- =============================== checks de valor ===============================
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, %L, %L)', :'ea', '   ', 'textual'), '23514', 'nome em branco é recusado');
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo, valor_min, valor_max) values (%L, %L, %L, 10, 1)', :'ea', 'inv', 'numerico'), '23514', 'valor_min > valor_max é recusado');
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo, unidade) values (%L, %L, %L, %L)', :'ea', 'inv2', 'textual', 'kg'), '23514', 'unidade/limites só existem em item numérico');
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, %L, %L)', :'ea', 'inv3', 'booleano'), '23514', 'tipo desconhecido é recusado');
select t.erro(format('insert into public.v2_itens_modelo (escopo_id, nome, tipo, casas_decimais) values (%L, %L, %L, 11)', :'ea', 'inv4', 'numerico'), '23514', 'casas decimais fora de 0–10 é recusado');

-- =============================== tipo e escopo imutáveis ===============================
select t.erro(format('update public.v2_itens_modelo set tipo = %L, versao = versao + 1 where id = %L', 'textual', :'im_ano'), 'V2006', 'tipo de item de modelo não muda');
select t.erro(format('update public.v2_itens_produto set tipo = %L, versao = versao + 1 where id = %L', 'textual', :'ip_km'), 'V2006', 'tipo de item de produto não muda');
-- v2_itens_analise só é escrita por RPC (authenticated não tem UPDATE); o gatilho é defesa em profundidade,
-- então esta asserção roda como dono da tabela.
reset role;
select t.erro(format('update public.v2_itens_analise set tipo = %L, versao = versao + 1 where id = %L', 'agregado', :'f1'), 'V2006', 'tipo de item de análise não muda');
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
select t.erro(format('update public.v2_itens_modelo set escopo_id = %L, versao = versao + 1 where id = %L', :'ea2', :'im_ano'), 'V2005', 'item não muda de escopo');
select t.erro(format('update public.v2_itens_modelo set user_id = %L, versao = versao + 1 where id = %L', :'ub', :'im_ano'), 'V2005', 'item não muda de dono');

-- =============================== controle de versão ===============================
select t.erro(format('update public.v2_itens_modelo set descricao = %L where id = %L', 'sem versão', :'im_ano'), 'V2001', 'UPDATE sem incrementar a versão é recusado');
select t.ok(t.linhas(format('update public.v2_itens_modelo set descricao = %L, versao = versao + 1 where id = %L', 'ok', :'im_ano')) = 1, 'UPDATE com versão+1 é aceito');
select versao as v_ano from public.v2_itens_modelo where id = :'im_ano' \gset
-- duas "sessões" editam a mesma versão: a primeira grava, a segunda é bloqueada
select t.ok(t.linhas(format('update public.v2_itens_modelo set descricao = %L, versao = %s where id = %L', 'sessão 1', :'v_ano'::int + 1, :'im_ano')) = 1, 'sessão 1 grava a versão que leu +1');
select t.erro(format('update public.v2_itens_modelo set descricao = %L, versao = %s where id = %L', 'sessão 2', :'v_ano'::int + 1, :'im_ano'), 'V2001', 'sessão 2, com versão desatualizada, é bloqueada');
select t.erro(format('update public.v2_itens_modelo set descricao = %L, versao = versao + 5 where id = %L', 'pulo', :'im_ano'), 'V2001', 'não é possível pular versões');

-- RPC: mesma regra
select versao as v_m2 from public.v2_modelos where id = :'m2' \gset
select t.ok((public.v2_salvar_modelo(:'ea', :'m2', :'v_m2'::int, 'Civic', 'editado', null) ->> 'versao')::int = :'v_m2'::int + 1, 'RPC salvar_modelo devolve a nova versão');
select t.erro(format('select public.v2_salvar_modelo(%L, %L, %s, %L, %L, null)', :'ea', :'m2', :'v_m2', 'Civic', 'versão antiga'), 'V2001', 'RPC salvar_modelo com versão antiga falha');
select t.erro(format('select public.v2_salvar_modelo(%L, %L, null, %L, %L, null)', :'ea', :'m2', 'Civic', 'sem versão'), 'V2001', 'RPC salvar_modelo sem versão falha');
select t.ok(t.n(format('select 1 from public.v2_modelo_valores where modelo_id = %L', :'m2')) = 2, 'a RPC com valores nulos mantém os valores existentes');

-- RPC não altera nada quando o salvamento falha (atomicidade)
select versao as v_m2 from public.v2_modelos where id = :'m2' \gset
select t.erro(format('select public.v2_salvar_modelo(%L, %L, %s, %L, %L, %L::jsonb)', :'ea', :'m2', :'v_m2', 'NOVO NOME', 'x',
  format('[{"item_modelo_id":"%s","valor_num":2000000}]', :'im_preco')), 'V2003', 'valor fora dos limites derruba o salvamento inteiro');
select t.ok((select nome from public.v2_modelos where id = :'m2') = 'Civic' and (select versao from public.v2_modelos where id = :'m2') = :'v_m2'::int,
  'após a falha, nome e versão do modelo continuam como antes');

-- escopo: ultimo_acesso não exige versão; editar o nome exige
select t.ok(t.linhas(format('update public.v2_escopos set ultimo_acesso = now() where id = %L', :'ea')) = 1, 'atualizar ultimo_acesso não exige versão');
select t.erro(format('update public.v2_escopos set nome = %L where id = %L', 'Outro nome', :'ea'), 'V2001', 'renomear escopo sem versão é recusado');

-- =============================== limites numéricos ===============================
select t.erro(format('select public.v2_salvar_produto(%L, %L, %s, %L, null, null, %L::jsonb)', :'ea', :'p3',
  (select versao from public.v2_produtos where id = :'p3'), 'Sem modelo',
  format('[{"item_produto_id":"%s","valor_num":-5}]', :'ip_km')), 'V2003', 'valor abaixo do mínimo do item de produto é recusado');
select t.erro(format('update public.v2_itens_modelo set valor_max = 1000, versao = versao + 1 where id = %L', :'im_preco'),
  'V2003', 'reduzir o limite máximo abaixo de valores já gravados é recusado');
select t.ok(t.linhas(format('update public.v2_itens_modelo set valor_max = 2000000, versao = versao + 1 where id = %L', :'im_preco')) = 1,
  'ampliar o limite é aceito');

-- =============================== imagens ===============================
select t.erro(format('insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime) values (%L, %L, 10, 10, 10, %L)',
  :'ea', 'outro/caminho.webp', 'image/webp'), '23514', 'caminho da imagem precisa começar com usuario/escopo/');
select t.erro(format('insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime) values (%L, %L, 801, 10, 10, %L)',
  :'ea', :'ua' || '/' || :'ea' || '/a.webp', 'image/webp'), '23514', 'imagem acima de 800x600 é recusada');
select t.erro(format('insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime) values (%L, %L, 10, 10, 10, %L)',
  :'ea', :'ua' || '/' || :'ea' || '/a.gif', 'image/gif'), '23514', 'mime fora da lista é recusado');
-- imagem de um escopo não pode ser usada em outro
insert into public.v2_itens_produto (escopo_id, nome, tipo) values (:'ea2', 'Foto', 'imagem');
select id as ip2_foto from public.v2_itens_produto where escopo_id = :'ea2' and nome = 'Foto' \gset
select t.erro(format('select public.v2_salvar_produto(%L, null, null, %L, null, null, %L::jsonb)', :'ea2', 'Casa 1',
  format('[{"item_produto_id":"%s","valor_img_id":"%s"}]', :'ip2_foto', :'img1')), '23503', 'imagem de outro escopo não pode ser vinculada (FK composta)');
-- valor de tipo errado
select t.erro(format('select public.v2_salvar_produto(%L, null, null, %L, null, null, %L::jsonb)', :'ea', 'Tipo errado',
  format('[{"item_produto_id":"%s","valor_txt":"abc"}]', :'ip_km')), '23514', 'valor textual em item numérico é recusado');

-- =============================== bloqueios de exclusão ===============================
select t.erro(format('delete from public.v2_modelos where id = %L', :'m1'), '23503', 'modelo com produtos associados não pode ser excluído');
select t.erro(format('delete from public.v2_itens_modelo where id = %L', :'im_preco'), '23503', 'item de modelo usado por modelo, fórmula, agregado e filtro não pode ser excluído');
select t.erro(format('delete from public.v2_itens_produto where id = %L', :'ip_km'), '23503', 'item de produto em uso não pode ser excluído');
select t.erro(format('delete from public.v2_itens_analise where id = %L', :'f1'), '23503', 'fórmula usada por outra fórmula e por agregado não pode ser excluída');
select t.erro(format('delete from public.v2_itens_analise where id = %L', :'ag1'), '23503', 'agregado usado por outro agregado não pode ser excluído');
select t.erro(format('delete from public.v2_itens_analise where id = %L', :'ag2'), '23503', 'agregado definido como ranking não pode ser excluído');
select t.erro(format('delete from public.v2_imagens where id = %L', :'img1'), '23503', 'imagem em uso não pode ser excluída');
select t.erro(format('delete from public.v2_itens_modelo where id = %L', :'im_foto'), '23503', 'item de modelo presente em algum modelo não pode ser excluído');

-- D6: remover o item DO MODELO (não a definição) é permitido; depois a definição pode ser excluída
select t.ok((public.v2_salvar_modelo(:'ea', :'m1', (select versao from public.v2_modelos where id = :'m1'), 'CR-V 2006', 'geração 2006-2011',
  format('[{"item_modelo_id":"%s","valor_num":50000},{"item_modelo_id":"%s","valor_num":2008},{"item_modelo_id":"%s","valor_txt":"2.0"}]',
         :'im_preco', :'im_ano', :'im_motor')::jsonb) ->> 'versao') is not null, 'remover item do modelo via RPC (D6) é permitido');
select t.ok(t.n(format('select 1 from public.v2_modelo_valores where modelo_id = %L', :'m1')) = 3, 'modelo ficou com 3 itens');
select t.ok(t.linhas(format('delete from public.v2_imagens where id = %L', :'img1')) = 1, 'imagem sem uso pode ser excluída');
select t.ok(t.linhas(format('delete from public.v2_itens_modelo where id = %L', :'im_foto')) = 1, 'item de modelo sem uso pode ser excluído');

-- exclusão de produto leva os valores junto, sem tocar em mais nada
select t.ok(t.linhas(format('delete from public.v2_produtos where id = %L', :'p3')) = 1, 'produto sem dependências pode ser excluído');
select t.ok(t.n(format('select 1 from public.v2_produto_valores where produto_id = %L', :'p3')) = 0, 'valores do produto excluído foram removidos');

-- =============================== herança dinâmica e conflitos de nome ===============================
select t.ok(t.n(format('select 1 from public.v2_vw_produto_efetivo where produto_id = %L', :'p1')) = 5,
  'P1 enxerga 3 itens herdados do modelo + 2 próprios');
select t.ok(t.n(format('select 1 from public.v2_vw_produto_efetivo where produto_id = %L and origem = %L', :'p1', 'modelo')) = 3, 'origem modelo = 3 itens');
select versao as v_m1 from public.v2_modelos where id = :'m1' \gset
select public.v2_salvar_modelo(:'ea', :'m1', :'v_m1'::int, 'CR-V 2006', 'geração 2006-2011',
  format('[{"item_modelo_id":"%s","valor_num":61000},{"item_modelo_id":"%s","valor_num":2008},{"item_modelo_id":"%s","valor_txt":"2.0"}]',
         :'im_preco', :'im_ano', :'im_motor')::jsonb);
select t.ok((select valor_num from public.v2_vw_produto_efetivo where produto_id = :'p1' and item_id = :'im_preco') = 61000,
  'alterar o valor no modelo reflete no produto (sem cópia)');
select t.ok(not exists (select 1 from public.v2_produto_valores where produto_id = :'p1' and item_produto_id::text = :'im_preco'),
  'não existe cópia do valor herdado em v2_produto_valores');

-- P2 tem item próprio "motor"; o modelo M2 ainda não tem "Motor"
select versao as v_m2 from public.v2_modelos where id = :'m2' \gset
select t.erro(format('select public.v2_salvar_modelo(%L, %L, %s, %L, %L, %L::jsonb)', :'ea', :'m2', :'v_m2', 'Civic', 'editado',
  format('[{"item_modelo_id":"%s","valor_num":2010},{"item_modelo_id":"%s","valor_num":40000},{"item_modelo_id":"%s","valor_txt":"1.8"}]',
         :'im_ano', :'im_preco', :'im_motor')), 'V2002', 'incluir no modelo um item com o mesmo nome de item próprio de produto associado é bloqueado');
-- criar produto já associado a modelo com conflito
select t.erro(format('select public.v2_salvar_produto(%L, null, null, %L, null, %L, %L::jsonb)', :'ea', 'Conflito', :'m1',
  format('[{"item_produto_id":"%s","valor_txt":"x"}]', :'ip_motor')), 'V2002', 'criar produto associado a modelo com nome herdado igual ao próprio é bloqueado');
-- associar depois
select (public.v2_salvar_produto(:'ea', null, null, 'Assoc', null, null,
  format('[{"item_produto_id":"%s","valor_txt":"x"}]', :'ip_motor')::jsonb) ->> 'id') as p4 \gset
select t.erro(format('select public.v2_salvar_produto(%L, %L, 1, %L, null, %L, %L::jsonb)', :'ea', :'p4', 'Assoc', :'m1',
  format('[{"item_produto_id":"%s","valor_txt":"x"}]', :'ip_motor')), 'V2002', 'associar produto a modelo com conflito de nomes é bloqueado');
select t.ok(coalesce((select modelo_id::text from public.v2_produtos where id = :'p4'), 'sem modelo') = 'sem modelo', 'após o bloqueio o produto segue sem modelo');
select t.ok((public.v2_salvar_produto(:'ea', :'p4', 1, 'Assoc', null, :'m1', '[]'::jsonb) ->> 'versao')::int = 2,
  'resolver o conflito (remover o item próprio) e associar no mesmo salvamento funciona');
select t.ok((select modelo_id::text from public.v2_produtos where id = :'p4') = :'m1', 'produto associado ao modelo');
-- renomear depois de associado
-- o conflito é POR PRODUTO: 'Km' é usado por "CR-V placa X" (modelo CR-V 2006, que tem o item 'Ano'),
-- então renomear 'Km' para 'Ano' cria ambiguidade nesse produto e é bloqueado.
select t.erro(format('update public.v2_itens_produto set nome = %L, versao = versao + 1 where id = %L', 'Ano', :'ip_km'),
  'V2002', 'renomear item de produto para o nome de item herdado por produto que o usa é bloqueado');
-- 'motor' só é usado por "Civic Y" (modelo Civic, sem item Motor): renomear para 'Motor' não gera ambiguidade em ninguém.
select t.ok(t.linhas(format('update public.v2_itens_produto set nome = %L, versao = versao + 1 where id = %L', 'Motor', :'ip_motor')) = 1,
  'renomear item de produto é aceito quando nenhum produto que o usa herda item de mesmo nome');
select t.ok(t.linhas(format('update public.v2_itens_produto set nome = %L, versao = versao + 1 where id = %L', 'motor', :'ip_motor')) = 1,
  'e pode voltar ao nome anterior');
-- desassociar
select t.ok((public.v2_salvar_produto(:'ea', :'p4', 2, 'Assoc', null, null, '[]'::jsonb) ->> 'versao')::int = 3, 'desassociar produto de modelo');

-- =============================== fórmulas: referências derivadas do texto ===============================
select t.erro(format('select public.v2_salvar_analise_formula(%L, null, null, %L, null, %L)', :'ea', 'mal', '[[x:123]] + 1'), 'V2013', 'marcador [[ ]] malformado é recusado');
select t.erro(format('select public.v2_salvar_analise_formula(%L, null, null, %L, null, %L)', :'ea', 'vazia', '   '), 'V2013', 'fórmula vazia é recusada');
select t.erro(format('select public.v2_salvar_analise_formula(%L, null, null, %L, null, %L)', :'ea', 'inex', '[[m:00000000-0000-0000-0000-000000000099]] + 1'), 'V2012', 'referência a item inexistente é recusada');
select t.erro(format('select public.v2_salvar_analise_formula(%L, null, null, %L, null, %L)', :'ea', 'txt', format('[[m:%s]] + 1', :'im_motor')), 'V2007', 'item textual não pode ser usado em fórmula');
select t.erro(format('select public.v2_salvar_analise_formula(%L, %L, 1, %L, null, %L)', :'ea', :'ag1', 'Nota custo', '1 + 1'), 'V2006', 'RPC de fórmula não edita um agregado');
select (public.v2_salvar_analise_formula(:'ea', null, null, 'F3', null,
  format('[[m:%s]] + [[m:%s]] + [[p:%s]] + [[m:%s]]', :'im_preco', :'im_preco', :'ip_km', :'im_ano')) ->> 'id') as f3 \gset
select t.ok(t.n(format('select 1 from public.v2_analise_refs where analise_id = %L', :'f3')) = 3, 'referências repetidas no texto viram 3 dependências distintas');
select public.v2_salvar_analise_formula(:'ea', :'f3', 1, 'F3', null, format('[[p:%s]] * 2', :'ip_km'));
select t.ok(t.n(format('select 1 from public.v2_analise_refs where analise_id = %L', :'f3')) = 1, 'editar a fórmula troca as dependências');

-- =============================== ciclos ===============================
select t.erro(format('select public.v2_salvar_analise_formula(%L, %L, %s, %L, null, %L)', :'ea', :'f1',
  (select versao from public.v2_itens_analise where id = :'f1'), 'Preço por km', format('[[a:%s]] + 1', :'f2')),
  'V2004', 'ciclo direto entre fórmulas (F1 -> F2 -> F1) é bloqueado');
select t.erro(format('select public.v2_salvar_analise_formula(%L, %L, %s, %L, null, %L)', :'ea', :'f2',
  (select versao from public.v2_itens_analise where id = :'f2'), 'Ajustada', format('[[a:%s]] + 1', :'f2')),
  'V2004', 'fórmula que referencia a si mesma é bloqueada');
select t.erro(format('select public.v2_salvar_analise_formula(%L, %L, %s, %L, null, %L)', :'ea', :'f1',
  (select versao from public.v2_itens_analise where id = :'f1'), 'Preço por km', format('[[a:%s]] + 1', :'ag2')),
  'V2004', 'ciclo fórmula -> agregado -> agregado -> fórmula é bloqueado');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, %L, %s, %L, null, 5, %L::jsonb)', :'ea', :'ag1',
  (select versao from public.v2_itens_analise where id = :'ag1'), 'Nota custo',
  format('[{"peso":5,"direcao":"maior","lmin":0,"lmax":10,"item_analise_id":"%s"},{"peso":3,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s"}]', :'ag2', :'im_ano')),
  'V2004', 'agregado que passaria a depender de si mesmo (via outro agregado) é bloqueado');

-- =============================== agregados ===============================
select t.erro(format('select public.v2_salvar_analise_agregado(%L, null, null, %L, null, 5, %L::jsonb)', :'ea', 'um',
  format('[{"peso":5,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s"}]', :'im_ano')), 'V2010', 'agregado com 1 componente é recusado');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, null, null, %L, null, 5, %L::jsonb)', :'ea', 'seis',
  (select jsonb_agg(jsonb_build_object('peso', 1, 'direcao', 'maior', 'lmin', 0, 'lmax', 10, 'item_modelo_id', :'im_ano')) from generate_series(1, 6))::text),
  'V2010', 'agregado com 6 componentes é recusado');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, null, null, %L, null, 5, %L::jsonb)', :'ea', 'lim',
  format('[{"peso":5,"direcao":"maior","lmin":5,"lmax":5,"item_modelo_id":"%s"},{"peso":3,"direcao":"maior","lmin":0,"lmax":10,"item_produto_id":"%s"}]', :'im_ano', :'ip_km')),
  '23514', 'limites iguais (lmin = lmax) são recusados');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, null, null, %L, null, 5, %L::jsonb)', :'ea', 'peso',
  format('[{"peso":11,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s"},{"peso":3,"direcao":"maior","lmin":0,"lmax":10,"item_produto_id":"%s"}]', :'im_ano', :'ip_km')),
  '23514', 'peso de componente fora de 1–10 é recusado');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, null, null, %L, null, 5, %L::jsonb)', :'ea', 'dir',
  format('[{"peso":5,"direcao":"x","lmin":0,"lmax":10,"item_modelo_id":"%s"},{"peso":3,"direcao":"maior","lmin":0,"lmax":10,"item_produto_id":"%s"}]', :'im_ano', :'ip_km')),
  '23514', 'direção inválida é recusada');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, null, null, %L, null, 11, %L::jsonb)', :'ea', 'pesoag',
  format('[{"peso":5,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s"},{"peso":3,"direcao":"maior","lmin":0,"lmax":10,"item_produto_id":"%s"}]', :'im_ano', :'ip_km')),
  '23514', 'peso do agregado fora de 1–10 é recusado');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, null, null, %L, null, 5, %L::jsonb)', :'ea', 'txt',
  format('[{"peso":5,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s"},{"peso":3,"direcao":"maior","lmin":0,"lmax":10,"item_produto_id":"%s"}]', :'im_motor', :'ip_km')),
  'V2007', 'componente textual é recusado');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, null, null, %L, null, 5, %L::jsonb)', :'ea', 'dupla',
  format('[{"peso":5,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s","item_produto_id":"%s"},{"peso":3,"direcao":"maior","lmin":0,"lmax":10,"item_produto_id":"%s"}]', :'im_ano', :'ip_km', :'ip_km')),
  'V2013', 'componente com duas referências é recusado');
select t.erro(format('select public.v2_salvar_analise_agregado(%L, %L, 1, %L, null, 5, %L::jsonb)', :'ea', :'f1', 'Preço por km',
  format('[{"peso":5,"direcao":"maior","lmin":0,"lmax":10,"item_modelo_id":"%s"},{"peso":3,"direcao":"maior","lmin":0,"lmax":10,"item_produto_id":"%s"}]', :'im_ano', :'ip_km')),
  'V2006', 'RPC de agregado não edita uma fórmula');
-- agregado aninhado válido (AG3 usa AG1 e AG2, sem ciclo) e o mesmo item com direções diferentes
select (public.v2_salvar_analise_agregado(:'ea', null, null, 'Nota 3', null, 4,
  format('[{"peso":5,"direcao":"maior","lmin":0,"lmax":10,"item_analise_id":"%s"},{"peso":3,"direcao":"menor","lmin":0,"lmax":10,"item_analise_id":"%s"}]', :'ag1', :'ag2')::jsonb) ->> 'id') as ag3 \gset
select t.ok(:'ag3' is not null, 'agregado aninhado válido é salvo');
select t.ok(t.n(format('select 1 from public.v2_agregado_componentes where agregado_id = %L', :'ag3')) = 2, 'agregado aninhado tem 2 componentes');
select t.ok(t.linhas(format('delete from public.v2_itens_analise where id = %L', :'ag3')) = 1, 'excluir agregado leva os componentes junto');

-- =============================== filtros ===============================
select t.erro(format('select public.v2_salvar_filtro(%L, null, null, %L, null, %L, %L::jsonb)', :'ea', 'f-txt', 'AND',
  format('[{"item_modelo_id":"%s","operador":"lt","valor_txt":"a"}]', :'im_motor')), 'V2008', 'item textual só aceita = e ≠');
select t.erro(format('select public.v2_salvar_filtro(%L, null, null, %L, null, %L, %L::jsonb)', :'ea', 'f-num', 'AND',
  format('[{"item_modelo_id":"%s","operador":"eq","valor_txt":"abc"}]', :'im_preco')), 'V2008', 'item numérico exige valor numérico');
select t.erro(format('select public.v2_salvar_filtro(%L, null, null, %L, null, %L, %L::jsonb)', :'ea', 'f-img', 'AND',
  format('[{"item_produto_id":"%s","operador":"eq","valor_txt":"abc"}]', :'ip_foto')), 'V2008', 'item de imagem não é filtrável');
select t.erro(format('select public.v2_salvar_filtro(%L, null, null, %L, null, %L, %L::jsonb)', :'ea', 'f-op', 'AND',
  format('[{"item_modelo_id":"%s","operador":"xx","valor_num":1}]', :'im_preco')), '23514', 'operador inválido é recusado');
select t.erro(format('select public.v2_salvar_filtro(%L, null, null, %L, null, %L, %L::jsonb)', :'ea', 'f-log', 'XOR', '[]'), '23514', 'lógica interna só AND/OR');
select t.erro(format('select public.v2_salvar_filtro(%L, null, null, %L, null, %L, %L::jsonb)', :'ea', 'f-2ref', 'AND',
  format('[{"item_modelo_id":"%s","item_produto_id":"%s","operador":"eq","valor_num":1}]', :'im_preco', :'ip_km')), 'V2013', 'condição com duas referências é recusada');
select (public.v2_salvar_filtro(:'ea', null, null, 'Faixa e motor', null, 'OR',
  format('[{"item_modelo_id":"%s","operador":"ge","valor_num":20000},{"item_modelo_id":"%s","operador":"le","valor_num":80000},
           {"item_modelo_id":"%s","operador":"eq","valor_txt":"2.0"},{"item_analise_id":"%s","operador":"gt","valor_num":1}]',
         :'im_preco', :'im_preco', :'im_motor', :'f2')::jsonb) ->> 'id') as ft2 \gset
select t.ok(t.n(format('select 1 from public.v2_filtro_condicoes where filtro_id = %L', :'ft2')) = 4, 'filtro com intervalo, texto e item de análise é salvo (4 condições)');
select t.erro(format('delete from public.v2_itens_analise where id = %L', :'f2'), '23503', 'item de análise usado por condição de filtro não pode ser excluído');
select t.erro(format('select public.v2_salvar_filtro(%L, %L, 99, %L, null, %L, %L::jsonb)', :'ea', :'ft2', 'Faixa e motor', 'AND', '[]'), 'V2001', 'filtro com versão antiga é bloqueado');
select t.ok(t.linhas(format('delete from public.v2_filtros where id = %L', :'ft2')) = 1, 'excluir filtro leva as condições junto');
select t.ok(t.n(format('select 1 from public.v2_filtro_condicoes where filtro_id = %L', :'ft2')) = 0, 'condições do filtro excluído foram removidas');

-- renomear não quebra referências (IDs estáveis)
select t.ok(t.linhas(format('update public.v2_itens_modelo set nome = %L, versao = versao + 1 where id = %L', 'Valor de venda', :'im_preco')) = 1, 'renomear item referenciado é permitido');
select t.ok(t.n(format('select 1 from public.v2_analise_refs where item_modelo_id = %L', :'im_preco')) = 1, 'a fórmula continua apontando para o item renomeado');
select t.ok(t.linhas(format('update public.v2_itens_modelo set nome = %L, versao = versao + 1 where id = %L', 'Preço', :'im_preco')) = 1, 'nome original restaurado');

-- =============================== configuração da análise ===============================
select versao as cfg_v from public.v2_config_analise where id = :'cfg' \gset
select t.erro(format('update public.v2_config_analise set agregado_ranking_id = %L, versao = %s where id = %L', :'f1', :'cfg_v'::int + 1, :'cfg'), 'V2009', 'ranking só aceita agregado');
select t.erro(format('update public.v2_config_analise set modo = %L, versao = %s where id = %L', 'xyz', :'cfg_v'::int + 1, :'cfg'), '23514', 'modo inválido é recusado');
select t.erro(format('update public.v2_config_analise set modo = %L where id = %L', 'modelos', :'cfg'), 'V2001', 'config sem versão é recusada');
select t.ok(t.linhas(format('update public.v2_config_analise set modo = %L, colunas = %L::jsonb, versao = %s where id = %L', 'produtos', '{"visiveis":["a","b"]}', :'cfg_v'::int + 1, :'cfg')) = 1, 'config válida é salva');
select t.erro(format('insert into public.v2_config_analise (escopo_id) values (%L)', :'ea2'), '42501', 'config só nasce junto com o escopo (INSERT direto é negado)');
select t.ok(t.n(format('select 1 from public.v2_config_analise where escopo_id = %L', :'ea2')) = 1, 'o escopo recém-criado já ganhou sua configuração');

reset role;

-- =============================== garantias no banco, sem passar pelas RPCs (superusuário) ===============================
-- Estas inserções simulam clientes que contornam a interface e as RPCs: o banco tem de recusar sozinho.
select t.erro(format($sql$
  do $x$ begin
    insert into public.v2_itens_analise (id, user_id, escopo_id, nome, tipo, peso) values ('00000000-0000-0000-0000-0000000000a1', %L, %L, 'sem comps', 'agregado', 3);
  end $x$ $sql$, :'ua', :'ea'), 'V2010', 'agregado criado sem componentes é recusado no commit');
select t.erro(format($sql$
  do $x$ begin
    insert into public.v2_itens_analise (id, user_id, escopo_id, nome, tipo, peso) values ('00000000-0000-0000-0000-0000000000a2', %L, %L, 'um comp', 'agregado', 3);
    insert into public.v2_agregado_componentes (agregado_id, user_id, escopo_id, ordem, peso, direcao, lmin, lmax, item_modelo_id)
      values ('00000000-0000-0000-0000-0000000000a2', %L, %L, 1, 1, 'maior', 0, 1, %L);
  end $x$ $sql$, :'ua', :'ea', :'ua', :'ea', :'im_ano'), 'V2010', 'agregado com 1 componente é recusado no commit (fora das RPCs)');
select t.erro(format($sql$
  do $x$ begin
    insert into public.v2_itens_analise (id, user_id, escopo_id, nome, tipo, formula_texto) values
      ('00000000-0000-0000-0000-0000000000b1', %L, %L, 'ciclo A', 'formula', 'x'),
      ('00000000-0000-0000-0000-0000000000b2', %L, %L, 'ciclo B', 'formula', 'y');
    insert into public.v2_analise_refs (analise_id, user_id, escopo_id, item_analise_id) values
      ('00000000-0000-0000-0000-0000000000b1', %L, %L, '00000000-0000-0000-0000-0000000000b2'),
      ('00000000-0000-0000-0000-0000000000b2', %L, %L, '00000000-0000-0000-0000-0000000000b1');
  end $x$ $sql$, :'ua', :'ea', :'ua', :'ea', :'ua', :'ea', :'ua', :'ea'), 'V2004', 'ciclo criado direto no banco (sem RPC) é recusado');
select t.erro(format($sql$
  do $x$ begin
    insert into public.v2_analise_refs (analise_id, user_id, escopo_id, item_modelo_id) values (%L, %L, %L, %L);
  end $x$ $sql$, :'ag1', :'ua', :'ea', :'im_ano'), 'V2007', 'referência de fórmula em item de análise que é agregado é recusada');
select t.erro(format($sql$
  do $x$ begin
    insert into public.v2_analise_refs (analise_id, user_id, escopo_id, item_modelo_id) values (%L, %L, %L, %L);
  end $x$ $sql$, :'f1', :'ua', :'ea2', :'im_ano'), '23503', 'referência cruzando escopos é recusada pela FK composta');
select t.erro(format($sql$
  do $x$ begin
    insert into public.v2_produto_valores (produto_id, item_produto_id, user_id, escopo_id, tipo, valor_num) values (%L, %L, %L, %L, 'numerico', 1);
  end $x$ $sql$, :'p1', :'ip_motor', :'ua', :'ea'), '23503', 'valor com tipo que não bate com o item é recusado (FK item+tipo)');
select t.erro(format($sql$
  do $x$ begin
    insert into public.v2_produto_valores (produto_id, item_produto_id, user_id, escopo_id, tipo, valor_txt, valor_num) values (%L, %L, %L, %L, 'textual', 'a', 1);
  end $x$ $sql$, :'p1', :'ip_motor', :'ua', :'ea'), '23514', 'valor com duas colunas preenchidas é recusado');
select t.erro(format($sql$
  do $x$ begin
    insert into public.v2_modelo_valores (modelo_id, item_modelo_id, user_id, escopo_id, tipo, valor_txt) values (%L, %L, %L, %L, 'textual', 'x');
  end $x$ $sql$, :'m2', :'im_motor', :'ub', :'ea'), '23503', 'valor com user_id diferente do dono do escopo é recusado');
