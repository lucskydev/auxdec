\set ON_ERROR_STOP on
\ir support/helpers.sql
begin;
select pg_temp.guarda();
insert into auth.users (id, email) values (pg_temp.ua(), 'a@test.local');

do $$
declare
  e uuid; e2 uuid;
  im_q uuid; im_c uuid; im_preco uuid; ip_p uuid; ip_q uuid; ip_l uuid; im_area uuid;
  m uuid; m_v int; mo2 uuid;
  p1 uuid; p1v int; p2 uuid; p3 uuid; p3v int;
  r jsonb; v_n int; v_num numeric; v_txt text;
begin
  perform pg_temp.como(pg_temp.ua());
  insert into public.v2_escopos (nome) values ('Imoveis') returning id into e;
  insert into public.v2_escopos (nome) values ('Outro') returning id into e2;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Quartos', 'numerico') returning id into im_q;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Cor', 'textual') returning id into im_c;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'preço', 'numerico') returning id into im_preco;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e, 'Area', 'numerico') returning id into im_area;
  insert into public.v2_itens_produto (escopo_id, nome, tipo) values (e, 'Preço', 'numerico') returning id into ip_p;
  insert into public.v2_itens_produto (escopo_id, nome, tipo) values (e, 'quartos', 'numerico') returning id into ip_q;
  insert into public.v2_itens_produto (escopo_id, nome, tipo) values (e, 'Link', 'textual') returning id into ip_l;

  r := public.v2_salvar_modelo(null, e, null, 'Apto 2q', null,
         jsonb_build_array(pg_temp.vn(im_q, 3), pg_temp.vt(im_c, 'Branco')));
  m := (r ->> 'id')::uuid; m_v := (r ->> 'versao')::int;

  -- ===== produto com modelo: herda sem copiar =====
  r := public.v2_salvar_produto(null, e, null, 'Apto Centro', null, m,
         jsonb_build_array(pg_temp.vn(ip_p, 500000), pg_temp.vt(ip_l, 'http://anuncio/1')));
  p1 := (r ->> 'id')::uuid; p1v := (r ->> 'versao')::int;
  select count(*) into v_n from public.v2_vw_produto_efetivo where produto_id = p1 and origem = 'modelo';
  assert v_n = 2, format('esperados 2 itens herdados, vieram %s', v_n);
  select count(*) into v_n from public.v2_vw_produto_efetivo where produto_id = p1 and origem = 'proprio';
  assert v_n = 2, format('esperados 2 itens proprios, vieram %s', v_n);
  select count(*) into v_n from public.v2_produto_valores where produto_id = p1;
  assert v_n = 2, 'valores herdados NAO podem ser copiados para o produto';

  -- mudar o valor no modelo reflete no produto
  r := public.v2_salvar_modelo(m, e, m_v, 'Apto 2q', null,
         jsonb_build_array(pg_temp.vn(im_q, 4), pg_temp.vt(im_c, 'Branco')));
  m_v := (r ->> 'versao')::int;
  select valor_num into v_num from public.v2_vw_produto_efetivo where produto_id = p1 and item_id = im_q;
  assert v_num = 4, 'alteracao do modelo deveria aparecer no produto';

  -- item novo no modelo fica disponivel ao produto
  r := public.v2_salvar_modelo(m, e, m_v, 'Apto 2q', null,
         jsonb_build_array(pg_temp.vn(im_q, 4), pg_temp.vt(im_c, 'Branco'), pg_temp.vn(im_area, 70)));
  m_v := (r ->> 'versao')::int;
  select count(*) into v_n from public.v2_vw_produto_efetivo where produto_id = p1 and origem = 'modelo';
  assert v_n = 3, 'item novo do modelo deveria aparecer nos produtos associados';

  -- valores proprios nao mudam com o modelo
  select valor_num into v_num from public.v2_vw_produto_efetivo where produto_id = p1 and item_id = ip_p;
  assert v_num = 500000, 'valor proprio nao deveria mudar';

  -- ===== produto sem modelo =====
  r := public.v2_salvar_produto(null, e, null, 'Apto Sem Modelo', null, null,
         jsonb_build_array(pg_temp.vn(ip_p, 300000)));
  p2 := (r ->> 'id')::uuid;
  select count(*) into v_n from public.v2_vw_produto_efetivo where produto_id = p2;
  assert v_n = 1, 'produto sem modelo so tem itens proprios';

  -- ===== modelo de outro escopo e nomes duplicados =====
  mo2 := ((public.v2_salvar_modelo(null, e2, null, 'Modelo de outro escopo', null, '[]')) ->> 'id')::uuid;
  perform pg_temp.falha(format($q$select public.v2_salvar_produto(null, %L, null, 'X', null, %L, '[]')$q$, e, mo2), '23503');
  perform pg_temp.falha(format($q$select public.v2_salvar_produto(null, %L, null, 'APTO centro', null, null, '[]')$q$, e), '23505');

  -- ===== conflito de nomes herdado x proprio (D1) =====
  -- 1) associar a um modelo quando o produto ja tem item proprio com o mesmo nome ('quartos' x 'Quartos')
  r := public.v2_salvar_produto(null, e, null, 'Apto Conflito', null, null,
         jsonb_build_array(pg_temp.vn(ip_q, 2)));
  p3 := (r ->> 'id')::uuid; p3v := (r ->> 'versao')::int;
  perform pg_temp.falha(format($q$select public.v2_salvar_produto(%L, %L, %L, 'Apto Conflito', null, %L, %L::jsonb)$q$,
         p3, e, p3v, m, jsonb_build_array(pg_temp.vn(ip_q, 2))::text), 'V2002');
  -- 1b) criar ja associado e com o item conflitante
  perform pg_temp.falha(format($q$select public.v2_salvar_produto(null, %L, null, 'Outro Conflito', null, %L, %L::jsonb)$q$,
         e, m, jsonb_build_array(pg_temp.vn(ip_q, 2))::text), 'V2002');
  -- 2) produto ja associado ganha um item proprio com nome igual ao de um item do modelo
  perform pg_temp.falha(format($q$select public.v2_salvar_produto(%L, %L, %L, 'Apto Centro', null, %L, %L::jsonb)$q$,
         p1, e, p1v, m, jsonb_build_array(pg_temp.vn(ip_p, 500000), pg_temp.vt(ip_l, 'x'), pg_temp.vn(ip_q, 1))::text), 'V2002');
  -- 3) modelo ganha um item cujo nome ja existe como item proprio de um produto associado ('preço' x 'Preço')
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, %L, 'Apto 2q', null, %L::jsonb)$q$,
         m, e, m_v, jsonb_build_array(pg_temp.vn(im_q, 4), pg_temp.vt(im_c, 'Branco'), pg_temp.vn(im_area, 70), pg_temp.vn(im_preco, 1))::text), 'V2002');
  -- 4) renomear um item de modelo para o nome de um item proprio de produto associado
  perform pg_temp.falha(format($q$update public.v2_itens_modelo set nome = 'LINK', versao = versao + 1 where id = %L$q$, im_c), 'V2002');
  -- 5) renomear um item proprio para o nome de um item herdado
  perform pg_temp.falha(format($q$update public.v2_itens_produto set nome = 'cor', versao = versao + 1 where id = %L$q$, ip_l), 'V2002');
  -- o mesmo nome em itens que NAO estao juntos no mesmo produto e permitido
  perform pg_temp.passa(format($q$update public.v2_itens_modelo set nome = 'Dormitorios', versao = versao + 1 where id = %L$q$, im_q));
  perform pg_temp.passa(format($q$update public.v2_itens_modelo set nome = 'Quartos', versao = versao + 1 where id = %L$q$, im_q));
  -- 6) o conflito some quando o usuario remove o item proprio: associacao passa
  perform pg_temp.passa(format($q$select public.v2_salvar_produto(%L, %L, %L, 'Apto Conflito', null, %L, '[]')$q$, p3, e, p3v, m));

  -- ===== desassociar =====
  select versao into p1v from public.v2_produtos where id = p1;
  perform public.v2_salvar_produto(p1, e, p1v, 'Apto Centro', null, null,
            jsonb_build_array(pg_temp.vn(ip_p, 500000), pg_temp.vt(ip_l, 'http://anuncio/1')));
  select count(*) into v_n from public.v2_vw_produto_efetivo where produto_id = p1;
  assert v_n = 2, 'apos desassociar so restam os itens proprios';
  perform public.v2_salvar_produto(p1, e, p1v + 1, 'Apto Centro', null, m,
            jsonb_build_array(pg_temp.vn(ip_p, 500000), pg_temp.vt(ip_l, 'http://anuncio/1')));  -- reassocia

  -- ===== exclusao de modelo com produtos =====
  select versao into m_v from public.v2_modelos where id = m;
  perform pg_temp.falha(format($q$select public.v2_excluir_modelo(%L, %L)$q$, m, m_v), 'V2010');
  perform pg_temp.falha(format($q$delete from public.v2_modelos where id = %L$q$, m), '42501');
  r := public.v2_impacto_item_no_modelo(m, im_c);
  assert jsonb_array_length(r -> 'produtos_afetados') = 2, format('esperados 2 produtos afetados: %s', r);
  -- item cuja definicao esta em uso por um modelo nao pode ser excluido
  perform pg_temp.falha(format($q$delete from public.v2_itens_modelo where id = %L$q$, im_c), '23503');
  -- item proprio em uso por um produto tampouco
  perform pg_temp.falha(format($q$delete from public.v2_itens_produto where id = %L$q$, ip_p), '23503');
  assert jsonb_array_length((public.v2_dependencias('m', im_c)) -> 'modelos') = 1, 'dependencias do item de modelo';

  -- dissociando todos os produtos o modelo pode ser excluido
  select versao into p1v from public.v2_produtos where id = p1;
  perform public.v2_salvar_produto(p1, e, p1v, 'Apto Centro', null, null, '[]');
  select versao into p3v from public.v2_produtos where id = p3;
  perform public.v2_salvar_produto(p3, e, p3v, 'Apto Conflito', null, null, '[]');
  perform public.v2_excluir_modelo(m, m_v);
  select count(*) into v_n from public.v2_modelos where id = m;
  assert v_n = 0, 'modelo deveria ter sido excluido';
  select count(*) into v_n from public.v2_modelo_valores where modelo_id = m;
  assert v_n = 0, 'valores do modelo excluido deveriam ter ido junto';

  perform pg_temp.admin();
  raise notice 'OK 04_heranca_conflitos';
end $$;
rollback;
