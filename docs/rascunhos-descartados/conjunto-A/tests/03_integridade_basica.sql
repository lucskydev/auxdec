\set ON_ERROR_STOP on
\ir support/helpers.sql
begin;
select pg_temp.guarda();
insert into auth.users (id, email) values (pg_temp.ua(), 'a@test.local');

do $$
declare
  e1 uuid; e2 uuid; iq uuid; iq2 uuid; it uuid; ii uuid; img uuid; mod1 uuid; r jsonb; v_n int; v_v int;
begin
  perform pg_temp.como(pg_temp.ua());
  insert into public.v2_escopos (nome) values ('Imoveis') returning id into e1;
  insert into public.v2_escopos (nome) values ('Veiculos') returning id into e2;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo, unidade, casas_decimais, valor_min, valor_max)
    values (e1, 'Quartos', 'numerico', 'un', 0, 0, 10) returning id into iq;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e1, 'Cor', 'textual') returning id into it;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e1, 'Foto', 'imagem') returning id into ii;

  -- ===== nomes: unicos sem distincao de caixa/espacos, por escopo =====
  perform pg_temp.falha(format($q$insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, ' QUARTOS ', 'textual')$q$, e1), '23505');
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (e2, 'Quartos', 'numerico') returning id into iq2;
  perform pg_temp.falha($q$insert into public.v2_escopos (nome) values ('  imoveis')$q$, '23505');
  perform pg_temp.falha(format($q$insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, '   ', 'textual')$q$, e1), '23514');

  -- ===== consistencia dos campos por tipo =====
  perform pg_temp.falha(format($q$insert into public.v2_itens_modelo (escopo_id, nome, tipo, unidade) values (%L, 'Obs', 'textual', 'kg')$q$, e1), '23514');
  perform pg_temp.falha(format($q$insert into public.v2_itens_modelo (escopo_id, nome, tipo, valor_min, valor_max) values (%L, 'Area', 'numerico', 10, 1)$q$, e1), '23514');
  perform pg_temp.falha(format($q$insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (%L, 'Qualquer', 'booleano')$q$, e1), '23514');

  -- ===== tipo e escopo sao imutaveis =====
  perform pg_temp.falha(format($q$update public.v2_itens_modelo set tipo = 'textual', versao = versao + 1 where id = %L$q$, iq), 'V2003');
  perform pg_temp.falha(format($q$update public.v2_itens_modelo set escopo_id = %L, versao = versao + 1 where id = %L$q$, e2, iq), 'V2003');

  -- ===== controle de versao otimista =====
  perform pg_temp.passa(format($q$update public.v2_itens_modelo set descricao = 'n de quartos', versao = 2 where id = %L$q$, iq));
  select versao into v_v from public.v2_itens_modelo where id = iq;
  assert v_v = 2, 'versao deveria ser 2';
  -- outra sessao ainda acha que a versao e 1 e tenta salvar "versao 2": rejeitado
  perform pg_temp.falha(format($q$update public.v2_itens_modelo set descricao = 'obsoleto', versao = 2 where id = %L$q$, iq), 'V2001');
  -- omitir a versao tambem e rejeitado
  perform pg_temp.falha(format($q$update public.v2_itens_modelo set descricao = 'sem versao' where id = %L$q$, iq), 'V2001');
  -- saltar versoes tambem
  perform pg_temp.falha(format($q$update public.v2_itens_modelo set descricao = 'salto', versao = 9 where id = %L$q$, iq), 'V2001');
  -- registrar acesso ao escopo nao exige nem altera a versao
  select versao into v_v from public.v2_escopos where id = e1;
  update public.v2_escopos set ultimo_acesso = now() + interval '1 minute' where id = e1;
  assert (select versao from public.v2_escopos where id = e1) = v_v, 'ultimo_acesso nao deveria mudar a versao';
  -- mas renomear sem versao correta falha
  perform pg_temp.falha(format($q$update public.v2_escopos set nome = 'Casas' where id = %L$q$, e1), 'V2001');

  -- ===== limites numericos =====
  r := public.v2_salvar_modelo(null, e1, null, 'Apto 2q', null,
         jsonb_build_array(jsonb_build_object('item_id', iq, 'valor_num', 0)));
  mod1 := (r ->> 'id')::uuid;
  assert (r ->> 'versao')::int = 1, 'versao inicial do modelo deveria ser 1';
  perform pg_temp.passa(format($q$select public.v2_salvar_modelo(%L, %L, 1, 'Apto 2q', null,
      '[{"item_id":"%s","valor_num":10}]')$q$, mod1, e1, iq));   -- limite superior inclusivo (versao 2)
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, 2, 'Apto 2q', null,
      '[{"item_id":"%s","valor_num":11}]')$q$, mod1, e1, iq), 'V2004');
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, 2, 'Apto 2q', null,
      '[{"item_id":"%s","valor_num":-1}]')$q$, mod1, e1, iq), 'V2004');
  -- reduzir o limite abaixo de um valor ja gravado (10) e bloqueado
  perform pg_temp.falha(format($q$update public.v2_itens_modelo set valor_max = 5, versao = versao + 1 where id = %L$q$, iq), 'V2004');
  perform pg_temp.passa(format($q$update public.v2_itens_modelo set valor_max = 20, versao = versao + 1 where id = %L$q$, iq));

  -- ===== valor precisa combinar com o tipo do item =====
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, 2, 'Apto 2q', null,
      '[{"item_id":"%s","valor_txt":"abc"}]')$q$, mod1, e1, iq), '23514');
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, 2, 'Apto 2q', null,
      '[{"item_id":"%s","valor_num":5}]')$q$, mod1, e1, it), '23514');
  -- item inexistente ou de outro escopo (o escopo do registro vem do banco, nao do parametro)
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, 2, 'Apto 2q', null,
      '[{"item_id":"%s","valor_num":5}]')$q$, mod1, e1, iq2), 'V2008');
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, 2, 'Apto 2q', null,
      '[{"item_id":"%s","valor_num":5}]')$q$, mod1, e1, gen_random_uuid()), 'V2008');

  -- ===== RPC tambem respeita a versao =====
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, 1, 'Apto 2q', 'obsoleto', '[]')$q$, mod1, e1), 'V2001');
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(%L, %L, null, 'Apto 2q', 'sem versao', '[]')$q$, mod1, e1), 'V2001');
  -- nome duplicado de modelo (caixa diferente)
  perform pg_temp.falha(format($q$select public.v2_salvar_modelo(null, %L, null, 'APTO 2Q', null, '[]')$q$, e1), '23505');

  -- ===== imagens =====
  perform pg_temp.falha(format($q$insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime)
      values (%L, 'outro/caminho.webp', 100, 100, 10, 'image/webp')$q$, e1), '23514');
  perform pg_temp.falha(format($q$insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime)
      values (%L, '%s/%s/a.webp', 801, 100, 10, 'image/webp')$q$, e1, pg_temp.ua(), e1), '23514');
  perform pg_temp.falha(format($q$insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime)
      values (%L, '%s/%s/a.gif', 100, 100, 10, 'image/gif')$q$, e1, pg_temp.ua(), e1), '23514');
  -- caminho pertencendo a outro escopo do mesmo usuario tambem e recusado
  perform pg_temp.falha(format($q$insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime)
      values (%L, '%s/%s/a.webp', 100, 100, 10, 'image/webp')$q$, e1, pg_temp.ua(), e2), '23514');
  insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime)
    values (e1, pg_temp.ua() || '/' || e1 || '/foto1.webp', 800, 600, 1234, 'image/webp') returning id into img;
  r := public.v2_salvar_modelo(mod1, e1, 2, 'Apto 2q', null,
         jsonb_build_array(jsonb_build_object('item_id', ii, 'valor_img_id', img)));
  -- imagem em uso nao pode ser apagada
  perform pg_temp.falha(format($q$delete from public.v2_imagens where id = %L$q$, img), '23503');
  -- trocar o valor devolve o caminho a remover do Storage e apaga o registro
  r := public.v2_salvar_modelo(mod1, e1, (r ->> 'versao')::int, 'Apto 2q', null, '[]');
  assert r -> 'imagens_removidas' = to_jsonb(array[pg_temp.ua() || '/' || e1 || '/foto1.webp']),
         format('imagens_removidas inesperado: %s', r);
  select count(*) into v_n from public.v2_imagens where id = img;
  assert v_n = 0, 'registro da imagem deveria ter sido removido';

  perform pg_temp.admin();
  raise notice 'OK 03_integridade_basica';
end $$;
rollback;
