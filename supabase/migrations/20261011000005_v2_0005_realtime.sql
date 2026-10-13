-- v2_0005_realtime.sql
-- Auxdec v2 — Supabase Realtime para as tabelas v2_.
--
-- ATENÇÃO (regra 1 do arquivo de segurança): "ALTER PUBLICATION supabase_realtime" altera um
-- objeto SEM prefixo v2_ (a publication é do projeto inteiro). Este comando foi AUTORIZADO
-- EXPLICITAMENTE pelo usuário em 2026-10-09, somente para adicionar tabelas v2_. A publication
-- hoje está vazia, e este arquivo não remove nem altera nenhuma tabela dela (só ADD TABLE).
-- Este arquivo é separado de propósito: só deve ser aplicado após a confirmação específica.
--
-- Objetos afetados:
--   REPLICA IDENTITY FULL em 14 tabelas v2_ (necessário para DELETE/UPDATE trazerem a linha antiga)
--   publication supabase_realtime: ADD TABLE das mesmas 14 tabelas v2_
-- O Realtime respeita as policies de SELECT (RLS) das tabelas, então cada usuário só recebe
-- eventos das próprias linhas.

alter table public.v2_escopos              replica identity full;
alter table public.v2_itens_modelo         replica identity full;
alter table public.v2_itens_produto        replica identity full;
alter table public.v2_modelos              replica identity full;
alter table public.v2_produtos             replica identity full;
alter table public.v2_imagens              replica identity full;
alter table public.v2_modelo_valores       replica identity full;
alter table public.v2_produto_valores      replica identity full;
alter table public.v2_itens_analise        replica identity full;
alter table public.v2_analise_refs         replica identity full;
alter table public.v2_agregado_componentes replica identity full;
alter table public.v2_filtros              replica identity full;
alter table public.v2_filtro_condicoes     replica identity full;
alter table public.v2_config_analise       replica identity full;

alter publication supabase_realtime add table
  public.v2_escopos, public.v2_itens_modelo, public.v2_itens_produto, public.v2_modelos,
  public.v2_produtos, public.v2_imagens, public.v2_modelo_valores, public.v2_produto_valores,
  public.v2_itens_analise, public.v2_analise_refs, public.v2_agregado_componentes,
  public.v2_filtros, public.v2_filtro_condicoes, public.v2_config_analise;
