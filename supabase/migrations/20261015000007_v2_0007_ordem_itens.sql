-- Auxdec v2 — migração 0007: ordem manual dos itens de modelo e de produto
-- Objetos criados/alterados:
--   colunas: v2_itens_modelo.ordem, v2_itens_produto.ordem (integer not null)
--   função alterada: v2_trg_versao (reordenar não gera conflito de versão nem altera a versão)
--   função/trigger novos: v2_trg_item_ordem (itens novos entram no fim da lista)
--   RPC nova: v2_reordenar_itens(p_escopo_id, p_tabela, p_ids)
-- Itens já existentes recebem ordem pela data de criação (e nome, no desempate).
-- Importação de backup: v2_importar_escopo não foi alterada; os itens entram na ordem em que
-- aparecem no arquivo, porque o trigger numera cada linha inserida.

alter table public.v2_itens_modelo  add column if not exists ordem integer not null default 0;
alter table public.v2_itens_produto add column if not exists ordem integer not null default 0;

-- Reordenar muda só a coluna "ordem": isenta de controle de versão (como ultimo_acesso).
create or replace function public.v2_trg_versao() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'v2_escopos'
     and new.versao = old.versao
     and (to_jsonb(new) - 'ultimo_acesso' - 'updated_at') = (to_jsonb(old) - 'ultimo_acesso' - 'updated_at') then
    return new;
  end if;
  if tg_table_name in ('v2_itens_modelo', 'v2_itens_produto')
     and new.versao = old.versao
     and (to_jsonb(new) - 'ordem' - 'updated_at') = (to_jsonb(old) - 'ordem' - 'updated_at') then
    return new;
  end if;
  if new.versao is distinct from old.versao + 1 then
    raise exception 'conflito_versao' using errcode = 'V2001',
      detail = format('tabela=%s id=%s versao_persistida=%s', tg_table_name, old.id, old.versao);
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Preenche a ordem dos itens que já existem (depois da função acima, que isenta mudanças só de ordem).
update public.v2_itens_modelo t set ordem = r.pos
  from (select id, row_number() over (partition by escopo_id order by created_at, nome, id) as pos
          from public.v2_itens_modelo) r where r.id = t.id;
update public.v2_itens_produto t set ordem = r.pos
  from (select id, row_number() over (partition by escopo_id order by created_at, nome, id) as pos
          from public.v2_itens_produto) r where r.id = t.id;

-- Item novo vai para o fim da lista do escopo.
create or replace function public.v2_trg_item_ordem() returns trigger
language plpgsql set search_path = ''
as $$
declare v_max integer;
begin
  if new.ordem is null or new.ordem = 0 then
    execute format('select coalesce(max(ordem), 0) from public.%I where escopo_id = $1', tg_table_name)
      into v_max using new.escopo_id;
    new.ordem := v_max + 1;
  end if;
  return new;
end $$;

revoke all on function public.v2_trg_item_ordem() from public, anon, authenticated;

drop trigger if exists v2_itens_modelo_ordem on public.v2_itens_modelo;
create trigger v2_itens_modelo_ordem  before insert on public.v2_itens_modelo  for each row execute function public.v2_trg_item_ordem();
drop trigger if exists v2_itens_produto_ordem on public.v2_itens_produto;
create trigger v2_itens_produto_ordem before insert on public.v2_itens_produto for each row execute function public.v2_trg_item_ordem();

-- p_tabela: 'itens_modelo' | 'itens_produto'. p_ids: TODOS os itens do escopo, na nova ordem.
create or replace function public.v2_reordenar_itens(p_escopo_id uuid, p_tabela text, p_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existentes uuid[];
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;
  if p_tabela not in ('itens_modelo', 'itens_produto') or p_ids is null then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'tabela ou lista inválida';
  end if;
  perform 1 from public.v2_escopos where id = p_escopo_id and user_id = v_uid for update;
  if not found then raise exception 'registro_nao_encontrado' using errcode = 'V2011'; end if;

  if (select count(distinct x) from unnest(p_ids) x) <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'payload_invalido' using errcode = 'V2013', detail = 'ids repetidos';
  end if;
  execute format('select coalesce(array_agg(id), ''{}'') from public.%I where escopo_id = $1 and user_id = $2', 'v2_' || p_tabela)
    into v_existentes using p_escopo_id, v_uid;
  if not (v_existentes @> p_ids and p_ids @> v_existentes) then
    raise exception 'payload_invalido' using errcode = 'V2013',
      detail = 'a lista deve conter exatamente os itens do escopo';
  end if;

  execute format('update public.%I t set ordem = o.pos from unnest($1) with ordinality as o(id, pos) where t.id = o.id and t.escopo_id = $2 and t.user_id = $3', 'v2_' || p_tabela)
    using p_ids, p_escopo_id, v_uid;
end $$;

revoke all on function public.v2_reordenar_itens(uuid, text, uuid[]) from public, anon;
grant execute on function public.v2_reordenar_itens(uuid, text, uuid[]) to authenticated;
