-- 06_exclusao_escopo.sql — exclusão de escopo de ponta a ponta (RPC e exclusão do usuário)
-- Popula as 14 tabelas e prova: guardas da RPC, cascata completa, isolamento dos outros escopos
-- e a limpeza ordenada quando o usuário inteiro é removido de auth.users. Banco descartável.

reset role;

-- Popula um escopo (como o usuário da sessão) usando só a API pública: escrita direta onde
-- existe, RPCs no resto. Devolve o caminho da imagem registrada. 19 linhas no total.
create or replace function t.popular(p_escopo uuid, p_user uuid) returns text
language plpgsql as $$
declare
  v_im uuid; v_foto uuid; v_ip uuid; v_img uuid; v_path text; v_mod uuid;
  v_f uuid; v_ag uuid; v_cfg uuid; v_cfgv integer;
begin
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (p_escopo, 'Num', 'numerico') returning id into v_im;
  insert into public.v2_itens_modelo (escopo_id, nome, tipo) values (p_escopo, 'Foto', 'imagem') returning id into v_foto;
  insert into public.v2_itens_produto (escopo_id, nome, tipo) values (p_escopo, 'Qtd', 'numerico') returning id into v_ip;
  v_path := p_user::text || '/' || p_escopo::text || '/' || gen_random_uuid()::text || '.webp';
  insert into public.v2_imagens (escopo_id, storage_path, largura, altura, bytes, mime)
    values (p_escopo, v_path, 800, 600, 1000, 'image/webp') returning id into v_img;
  set constraints all deferred; -- cada RPC termina em modo imediato; aqui várias RPCs dividem uma transação
  v_mod := (public.v2_salvar_modelo(p_escopo, null, null, 'Modelo', null, jsonb_build_array(
      jsonb_build_object('item_modelo_id', v_im, 'valor_num', 5),
      jsonb_build_object('item_modelo_id', v_foto, 'valor_img_id', v_img))) ->> 'id')::uuid;
  set constraints all deferred; -- cada RPC termina em modo imediato; aqui várias RPCs dividem uma transação
  perform public.v2_salvar_produto(p_escopo, null, null, 'Produto', null, v_mod, jsonb_build_array(
      jsonb_build_object('item_produto_id', v_ip, 'valor_num', 2)));
  set constraints all deferred; -- cada RPC termina em modo imediato; aqui várias RPCs dividem uma transação
  v_f := (public.v2_salvar_analise_formula(p_escopo, null, null, 'Formula', null,
      format('[[m:%s]] * [[p:%s]]', v_im, v_ip)) ->> 'id')::uuid;
  set constraints all deferred; -- cada RPC termina em modo imediato; aqui várias RPCs dividem uma transação
  v_ag := (public.v2_salvar_analise_agregado(p_escopo, null, null, 'Agregado', null, 5, jsonb_build_array(
      jsonb_build_object('peso', 1, 'direcao', 'maior', 'lmin', 0, 'lmax', 10, 'item_modelo_id', v_im),
      jsonb_build_object('peso', 2, 'direcao', 'menor', 'lmin', 0, 'lmax', 10, 'item_analise_id', v_f))) ->> 'id')::uuid;
  set constraints all deferred; -- cada RPC termina em modo imediato; aqui várias RPCs dividem uma transação
  perform public.v2_salvar_filtro(p_escopo, null, null, 'Filtro', null, 'AND', jsonb_build_array(
      jsonb_build_object('item_modelo_id', v_im, 'operador', 'lt', 'valor_num', 100)));
  select id, versao into v_cfg, v_cfgv from public.v2_config_analise where escopo_id = p_escopo;
  update public.v2_config_analise set agregado_ranking_id = v_ag, versao = v_cfgv + 1 where id = v_cfg;
  return v_path;
end $$;
grant execute on function t.popular(uuid, uuid) to authenticated;

-- Conta o que sobrou, nas 14 tabelas, por escopo ou por usuário (rodar como dono do banco).
create or replace function t.restos_escopo(p_escopo uuid) returns bigint language sql as $$
  select (select count(*) from public.v2_escopos where id = p_escopo)
       + (select count(*) from public.v2_itens_modelo where escopo_id = p_escopo)
       + (select count(*) from public.v2_itens_produto where escopo_id = p_escopo)
       + (select count(*) from public.v2_modelos where escopo_id = p_escopo)
       + (select count(*) from public.v2_produtos where escopo_id = p_escopo)
       + (select count(*) from public.v2_imagens where escopo_id = p_escopo)
       + (select count(*) from public.v2_modelo_valores where escopo_id = p_escopo)
       + (select count(*) from public.v2_produto_valores where escopo_id = p_escopo)
       + (select count(*) from public.v2_itens_analise where escopo_id = p_escopo)
       + (select count(*) from public.v2_analise_refs where escopo_id = p_escopo)
       + (select count(*) from public.v2_agregado_componentes where escopo_id = p_escopo)
       + (select count(*) from public.v2_filtros where escopo_id = p_escopo)
       + (select count(*) from public.v2_filtro_condicoes where escopo_id = p_escopo)
       + (select count(*) from public.v2_config_analise where escopo_id = p_escopo)
$$;
create or replace function t.restos_usuario(p_user uuid) returns bigint language sql as $$
  select (select count(*) from public.v2_escopos where user_id = p_user)
       + (select count(*) from public.v2_itens_modelo where user_id = p_user)
       + (select count(*) from public.v2_itens_produto where user_id = p_user)
       + (select count(*) from public.v2_modelos where user_id = p_user)
       + (select count(*) from public.v2_produtos where user_id = p_user)
       + (select count(*) from public.v2_imagens where user_id = p_user)
       + (select count(*) from public.v2_modelo_valores where user_id = p_user)
       + (select count(*) from public.v2_produto_valores where user_id = p_user)
       + (select count(*) from public.v2_itens_analise where user_id = p_user)
       + (select count(*) from public.v2_analise_refs where user_id = p_user)
       + (select count(*) from public.v2_agregado_componentes where user_id = p_user)
       + (select count(*) from public.v2_filtros where user_id = p_user)
       + (select count(*) from public.v2_filtro_condicoes where user_id = p_user)
       + (select count(*) from public.v2_config_analise where user_id = p_user)
$$;

-- ============================ A cria um escopo completo ============================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
insert into public.v2_escopos (nome) values ('Para excluir');
select id as ex, versao as ex_v from public.v2_escopos where nome = 'Para excluir' \gset
select t.popular(:'ex', :'ua') as ex_img \gset

reset role;
select t.ok(t.restos_escopo(:'ex') = 19, 'escopo de teste populado: 19 linhas nas 14 tabelas');
-- fotografia dos outros escopos, para provar que a exclusão não encosta neles
select t.restos_escopo(:'ea') as ea_antes, t.restos_escopo(:'ea2') as ea2_antes, t.restos_escopo(:'eb') as eb_antes \gset

-- ============================ guardas da RPC ============================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
select t.erro(format('select public.v2_excluir_escopo(%L, %s, %L)', :'ex', :'ex_v', 'nome errado'),
  'V2014', 'confirmação com nome diferente é recusada');
select t.erro(format('select public.v2_excluir_escopo(%L, %s, %L)', :'ex', :'ex_v', 'para excluir'),
  'V2014', 'a confirmação exige o nome exato (caixa conta)');
select t.erro(format('select public.v2_excluir_escopo(%L, %s, %L)', :'ex', :'ex_v'::int + 5, 'Para excluir'),
  'V2001', 'versão desatualizada é recusada');
select t.erro(format('select public.v2_excluir_escopo(%L, null, %L)', :'ex', 'Para excluir'),
  'V2001', 'sem versão é recusada');
select t.erro(format('delete from public.v2_escopos where id = %L', :'ex'),
  '42501', 'o usuário não exclui escopo por DELETE direto');

select set_config('request.jwt.claim.sub', :'ub', false);
select t.erro(format('select public.v2_excluir_escopo(%L, %s, %L)', :'ex', :'ex_v', 'Para excluir'),
  'V2011', 'B não exclui escopo do A, mesmo sabendo versão e nome');

reset role;
select t.ok(t.restos_escopo(:'ex') = 19, 'nenhuma tentativa recusada alterou o escopo');

-- ============================ exclusão válida ============================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;
select public.v2_excluir_escopo(:'ex', :'ex_v'::int, 'Para excluir') as res \gset

select t.ok(jsonb_exists(:'res'::jsonb -> 'caminhos', :'ex_img'),
  'a RPC devolve o caminho da imagem para o cliente remover do Storage');
select t.ok(jsonb_array_length(:'res'::jsonb -> 'caminhos') = 1, 'e só o caminho das imagens desse escopo');

reset role;
select t.ok(t.restos_escopo(:'ex') = 0, 'o escopo e as 18 linhas filhas foram removidos (14 tabelas)');
select t.ok(t.restos_escopo(:'ea') = :'ea_antes'::bigint, 'outro escopo do A (Veículos) intacto');
select t.ok(t.restos_escopo(:'ea2') = :'ea2_antes'::bigint, 'outro escopo do A (Imóveis) intacto');
select t.ok(t.restos_escopo(:'eb') = :'eb_antes'::bigint, 'escopo do B intacto');

-- ============================ exclusão do usuário inteiro ============================
-- Apagar o usuário em auth.users dispara a cascata de v2_escopos; a limpeza ordenada precisa
-- vencer os vínculos NO ACTION entre tabelas irmãs, que não têm ordem garantida na cascata.
select set_config('request.jwt.claim.sub', :'uc', false);
set role authenticated;
insert into public.v2_escopos (nome) values ('Escopo do C');
select id as ec from public.v2_escopos where nome = 'Escopo do C' \gset
select t.popular(:'ec', :'uc') as ec_img \gset
insert into public.v2_escopos (nome) values ('Segundo do C');
select id as ec2 from public.v2_escopos where nome = 'Segundo do C' \gset
select t.popular(:'ec2', :'uc') as ec2_img \gset

reset role;
select t.ok(t.restos_usuario(:'uc') = 38, 'usuário C populado: 2 escopos x 19 linhas');
select t.restos_usuario(:'ua') as ua_antes, t.restos_usuario(:'ub') as ub_antes \gset

delete from auth.users where id = :'uc';
select t.ok(t.restos_usuario(:'uc') = 0, 'excluir o usuário remove todas as linhas v2_ dele, sem erro de vínculo');
select t.ok(t.restos_usuario(:'ua') = :'ua_antes'::bigint, 'dados do A intactos após excluir o C');
select t.ok(t.restos_usuario(:'ub') = :'ub_antes'::bigint, 'dados do B intactos após excluir o C');
