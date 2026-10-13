-- =====================================================================
-- v2_0005 — RLS, privilégios e Storage.
-- Defesa em camadas:
--   1) RLS ligado em TODAS as tabelas v2_, com as 4 policies "próprio".
--   2) Privilégios mínimos: anon não tem nada; authenticated só escreve
--      direto onde não há filhos; o resto passa pelas RPCs de v2_0004.
--   3) Storage: bucket privado v2_imagens, só a pasta do próprio usuário.
-- Nenhum DROP / ALTER em objeto sem o prefixo v2_. Nenhuma policy existente
-- é tocada (as de decisoes_* continuam exatamente como estão).
-- =====================================================================

-- ---------- RLS e policies ---------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'v2_escopos','v2_itens_modelo','v2_itens_produto','v2_modelos','v2_produtos','v2_imagens',
    'v2_modelo_valores','v2_produto_valores','v2_itens_analise','v2_analise_refs',
    'v2_agregado_componentes','v2_filtros','v2_filtro_condicoes','v2_config_analise'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format($f$create policy %I on public.%I for select to authenticated
                      using ((select auth.uid()) = user_id)$f$, t || '_select_proprio', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
                      with check ((select auth.uid()) = user_id)$f$, t || '_insert_proprio', t);
    execute format($f$create policy %I on public.%I for update to authenticated
                      using ((select auth.uid()) = user_id)
                      with check ((select auth.uid()) = user_id)$f$, t || '_update_proprio', t);
    execute format($f$create policy %I on public.%I for delete to authenticated
                      using ((select auth.uid()) = user_id)$f$, t || '_delete_proprio', t);

    -- Parte do zero: tira o que os privilégios padrão do Supabase concederam.
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ---------- privilégios das tabelas ------------------------------------

-- Escrita direta permitida (registros sem filhos):
grant select, insert, update         on public.v2_escopos          to authenticated;  -- exclusão: v2_excluir_escopo
grant select, insert, update, delete on public.v2_itens_modelo     to authenticated;
grant select, insert, update, delete on public.v2_itens_produto    to authenticated;
grant select, insert, delete         on public.v2_imagens          to authenticated;
grant select, update                 on public.v2_config_analise   to authenticated;  -- criada pelo trigger do escopo

-- Gravação só por RPC; exclusão direta permitida onde não há imagens a limpar:
grant select, delete                 on public.v2_itens_analise    to authenticated;
grant select, delete                 on public.v2_filtros          to authenticated;

-- Somente leitura direta (gravação por RPC; modelos/produtos também excluem por RPC):
grant select on public.v2_modelos             to authenticated;
grant select on public.v2_produtos            to authenticated;
grant select on public.v2_modelo_valores      to authenticated;
grant select on public.v2_produto_valores     to authenticated;
grant select on public.v2_analise_refs        to authenticated;
grant select on public.v2_agregado_componentes to authenticated;
grant select on public.v2_filtro_condicoes    to authenticated;

-- A visão de herança herda a RLS do chamador (security_invoker).
revoke all on public.v2_vw_produto_efetivo from public, anon, authenticated;
grant select on public.v2_vw_produto_efetivo to authenticated;

-- ---------- privilégios das funções ------------------------------------

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'v2\_%' escape '\'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;

-- Somente as RPCs públicas ficam executáveis, e só por usuários autenticados.
grant execute on function public.v2_salvar_modelo(uuid, uuid, integer, text, text, jsonb)          to authenticated;
grant execute on function public.v2_excluir_modelo(uuid, integer)                                  to authenticated;
grant execute on function public.v2_salvar_produto(uuid, uuid, integer, text, text, uuid, jsonb)   to authenticated;
grant execute on function public.v2_excluir_produto(uuid, integer)                                 to authenticated;
grant execute on function public.v2_salvar_formula(uuid, uuid, integer, text, text, text, jsonb)   to authenticated;
grant execute on function public.v2_salvar_agregado(uuid, uuid, integer, text, text, integer, jsonb) to authenticated;
grant execute on function public.v2_salvar_filtro(uuid, uuid, integer, text, text, text, jsonb)    to authenticated;
grant execute on function public.v2_excluir_escopo(uuid, integer, text)                            to authenticated;
grant execute on function public.v2_dependencias(text, uuid)                                       to authenticated;
grant execute on function public.v2_impacto_item_no_modelo(uuid, uuid)                             to authenticated;

-- ---------- Storage: bucket privado e policies próprias ----------------
-- As policies de storage.objects valem para o projeto inteiro (somam-se por OR),
-- por isso cada uma filtra bucket_id = 'v2_imagens' e tem nome único com prefixo.
-- Não existe policy de UPDATE: trocar a imagem = enviar um novo arquivo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('v2_imagens', 'v2_imagens', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy v2_img_select_proprio on storage.objects
  for select to authenticated
  using (bucket_id = 'v2_imagens'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy v2_img_insert_proprio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'v2_imagens'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy v2_img_delete_proprio on storage.objects
  for delete to authenticated
  using (bucket_id = 'v2_imagens'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
