-- v2_0003_rls_storage.sql
-- Auxdec v2 — RLS, privilégios e Storage.
-- Objetos criados/alterados (todos v2_):
--   RLS ativado em 14 tabelas v2_ e 1 view com security_invoker
--   policies de tabela: v2_<tabela>_select_proprio / _insert_proprio / _update_proprio / _delete_proprio
--   bucket: v2_imagens (privado)
--   policies de storage.objects: v2_img_select_proprio, v2_img_insert_proprio, v2_img_delete_proprio
-- Nenhuma policy existente é removida ou alterada. Nenhum "using (true)".
--
-- Modelo de escrita:
--   * escrita direta (PostgREST): v2_escopos (insert/update), v2_itens_modelo, v2_itens_produto,
--     v2_imagens (insert/delete), v2_config_analise (update)
--   * exclusão direta de pais: v2_modelos, v2_produtos, v2_itens_analise, v2_filtros
--   * tudo o mais (valores, referências, componentes, condições e a criação/edição dos pais acima)
--     só por RPC v2_salvar_* (migração v2_0004), que grava pai e filhos numa transação.
--   * exclusão de escopo só pela RPC v2_excluir_escopo.

-- ----------------------------------------------------------------- RLS ativo
alter table public.v2_escopos              enable row level security;
alter table public.v2_itens_modelo         enable row level security;
alter table public.v2_itens_produto        enable row level security;
alter table public.v2_modelos              enable row level security;
alter table public.v2_produtos             enable row level security;
alter table public.v2_imagens              enable row level security;
alter table public.v2_modelo_valores       enable row level security;
alter table public.v2_produto_valores      enable row level security;
alter table public.v2_itens_analise        enable row level security;
alter table public.v2_analise_refs         enable row level security;
alter table public.v2_agregado_componentes enable row level security;
alter table public.v2_filtros              enable row level security;
alter table public.v2_filtro_condicoes     enable row level security;
alter table public.v2_config_analise       enable row level security;

-- ---------------------------------------------------------------- privilégios
-- O Supabase concede privilégios amplos por padrão em tabelas novas; aqui tudo é revogado
-- e só o necessário é concedido de volta. 'anon' não recebe nada.
revoke all on table
  public.v2_escopos, public.v2_itens_modelo, public.v2_itens_produto, public.v2_modelos,
  public.v2_produtos, public.v2_imagens, public.v2_modelo_valores, public.v2_produto_valores,
  public.v2_itens_analise, public.v2_analise_refs, public.v2_agregado_componentes,
  public.v2_filtros, public.v2_filtro_condicoes, public.v2_config_analise,
  public.v2_vw_produto_efetivo
from public, anon, authenticated;

grant select on
  public.v2_escopos, public.v2_itens_modelo, public.v2_itens_produto, public.v2_modelos,
  public.v2_produtos, public.v2_imagens, public.v2_modelo_valores, public.v2_produto_valores,
  public.v2_itens_analise, public.v2_analise_refs, public.v2_agregado_componentes,
  public.v2_filtros, public.v2_filtro_condicoes, public.v2_config_analise,
  public.v2_vw_produto_efetivo
to authenticated;

grant insert, update on public.v2_escopos       to authenticated;
grant insert, update, delete on public.v2_itens_modelo, public.v2_itens_produto to authenticated;
grant insert, delete on public.v2_imagens       to authenticated;
grant update on public.v2_config_analise        to authenticated;
grant delete on public.v2_modelos, public.v2_produtos, public.v2_itens_analise, public.v2_filtros to authenticated;

-- ------------------------------------------------------------ policies de tabela
-- SELECT em todas
create policy v2_escopos_select_proprio              on public.v2_escopos              for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_itens_modelo_select_proprio         on public.v2_itens_modelo         for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_itens_produto_select_proprio        on public.v2_itens_produto        for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_modelos_select_proprio              on public.v2_modelos              for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_produtos_select_proprio             on public.v2_produtos             for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_imagens_select_proprio              on public.v2_imagens              for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_modelo_valores_select_proprio       on public.v2_modelo_valores       for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_produto_valores_select_proprio      on public.v2_produto_valores      for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_itens_analise_select_proprio        on public.v2_itens_analise        for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_analise_refs_select_proprio         on public.v2_analise_refs         for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_agregado_componentes_select_proprio on public.v2_agregado_componentes for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_filtros_select_proprio              on public.v2_filtros              for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_filtro_condicoes_select_proprio     on public.v2_filtro_condicoes     for select to authenticated using ((select auth.uid()) = user_id);
create policy v2_config_analise_select_proprio       on public.v2_config_analise       for select to authenticated using ((select auth.uid()) = user_id);

-- INSERT
create policy v2_escopos_insert_proprio       on public.v2_escopos       for insert to authenticated with check ((select auth.uid()) = user_id);
create policy v2_itens_modelo_insert_proprio  on public.v2_itens_modelo  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy v2_itens_produto_insert_proprio on public.v2_itens_produto for insert to authenticated with check ((select auth.uid()) = user_id);
create policy v2_imagens_insert_proprio       on public.v2_imagens       for insert to authenticated with check ((select auth.uid()) = user_id);

-- UPDATE
create policy v2_escopos_update_proprio       on public.v2_escopos       for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy v2_itens_modelo_update_proprio  on public.v2_itens_modelo  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy v2_itens_produto_update_proprio on public.v2_itens_produto for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy v2_config_analise_update_proprio on public.v2_config_analise for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- DELETE
create policy v2_itens_modelo_delete_proprio  on public.v2_itens_modelo  for delete to authenticated using ((select auth.uid()) = user_id);
create policy v2_itens_produto_delete_proprio on public.v2_itens_produto for delete to authenticated using ((select auth.uid()) = user_id);
create policy v2_imagens_delete_proprio       on public.v2_imagens       for delete to authenticated using ((select auth.uid()) = user_id);
create policy v2_modelos_delete_proprio       on public.v2_modelos       for delete to authenticated using ((select auth.uid()) = user_id);
create policy v2_produtos_delete_proprio      on public.v2_produtos      for delete to authenticated using ((select auth.uid()) = user_id);
create policy v2_itens_analise_delete_proprio on public.v2_itens_analise for delete to authenticated using ((select auth.uid()) = user_id);
create policy v2_filtros_delete_proprio       on public.v2_filtros       for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------- Storage
-- Bucket privado, só imagens, até 2 MB (o cliente redimensiona para no máximo 800x600).
-- Não toca no bucket decisoes-imagens.
-- INSERT simples (sem ON CONFLICT): se o bucket já existir, a migração falha em vez de deixar
-- silenciosamente um bucket com outra configuração (por exemplo, público).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('v2_imagens', 'v2_imagens', false, 2097152, array['image/webp', 'image/jpeg', 'image/png']);

-- Policies de storage.objects valem para o projeto inteiro: nomes únicos v2_ e filtro por bucket_id.
-- Sem UPDATE: trocar imagem = enviar novo arquivo.
create policy v2_img_select_proprio on storage.objects for select to authenticated
  using (bucket_id = 'v2_imagens' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy v2_img_insert_proprio on storage.objects for insert to authenticated
  with check (bucket_id = 'v2_imagens' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy v2_img_delete_proprio on storage.objects for delete to authenticated
  using (bucket_id = 'v2_imagens' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- --------------------------------------------- funções de trigger: sem acesso direto
revoke all on function
  public.v2_trg_versao(), public.v2_trg_imutaveis(), public.v2_trg_bloqueia_troca_tipo(),
  public.v2_trg_config_inicial(), public.v2_trg_valor_limites(), public.v2_trg_item_limites(),
  public.v2_trg_conflito_nomes(), public.v2_trg_ref_numerica(), public.v2_trg_filtro_cond(),
  public.v2_trg_config_ranking(), public.v2_trg_ciclo(), public.v2_trg_agregado_contagem()
from public, anon, authenticated;
