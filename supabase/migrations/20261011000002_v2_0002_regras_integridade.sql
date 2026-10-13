-- v2_0002_regras_integridade.sql
-- Auxdec v2 — triggers e funções de integridade (versão, tipo imutável, limites,
-- conflito de nomes herdado × próprio, referências numéricas, ciclos, agregados 2–5).
-- Objetos criados (todos com prefixo v2_): funções v2_trg_* e v2_nomes_*, triggers v2_*.
-- Todas as funções são SECURITY INVOKER (padrão) com search_path vazio.
-- Exceção: v2_trg_config_inicial (SECURITY DEFINER), que só insere a configuração do escopo recém-criado.

-- ---------------------------------------------------------------- versão
-- Exige NEW.versao = OLD.versao + 1. A checagem roda dentro do bloqueio da linha (atômica).
-- Única exceção: atualizar somente v2_escopos.ultimo_acesso (não conta como edição).
create function public.v2_trg_versao() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'v2_escopos'
     and new.versao = old.versao
     and (to_jsonb(new) - 'ultimo_acesso' - 'updated_at') = (to_jsonb(old) - 'ultimo_acesso' - 'updated_at') then
    return new;
  end if;
  if new.versao is distinct from old.versao + 1 then
    raise exception 'conflito_versao' using errcode = 'V2001',
      detail = format('tabela=%s id=%s versao_persistida=%s', tg_table_name, old.id, old.versao);
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger v2_escopos_versao        before update on public.v2_escopos        for each row execute function public.v2_trg_versao();
create trigger v2_itens_modelo_versao   before update on public.v2_itens_modelo   for each row execute function public.v2_trg_versao();
create trigger v2_itens_produto_versao  before update on public.v2_itens_produto  for each row execute function public.v2_trg_versao();
create trigger v2_modelos_versao        before update on public.v2_modelos        for each row execute function public.v2_trg_versao();
create trigger v2_produtos_versao       before update on public.v2_produtos       for each row execute function public.v2_trg_versao();
create trigger v2_itens_analise_versao  before update on public.v2_itens_analise  for each row execute function public.v2_trg_versao();
create trigger v2_filtros_versao        before update on public.v2_filtros        for each row execute function public.v2_trg_versao();
create trigger v2_config_analise_versao before update on public.v2_config_analise for each row execute function public.v2_trg_versao();

-- ------------------------------------------- usuário e escopo são imutáveis
create function public.v2_trg_imutaveis() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (to_jsonb(new) ->> 'user_id')   is distinct from (to_jsonb(old) ->> 'user_id')
  or (to_jsonb(new) ->> 'escopo_id') is distinct from (to_jsonb(old) ->> 'escopo_id') then
    raise exception 'campo_imutavel' using errcode = 'V2005',
      detail = format('user_id e escopo_id não podem ser alterados (%s)', tg_table_name);
  end if;
  return new;
end $$;

create trigger v2_escopos_imutaveis            before update on public.v2_escopos              for each row execute function public.v2_trg_imutaveis();
create trigger v2_itens_modelo_imutaveis       before update on public.v2_itens_modelo         for each row execute function public.v2_trg_imutaveis();
create trigger v2_itens_produto_imutaveis      before update on public.v2_itens_produto        for each row execute function public.v2_trg_imutaveis();
create trigger v2_modelos_imutaveis            before update on public.v2_modelos              for each row execute function public.v2_trg_imutaveis();
create trigger v2_produtos_imutaveis           before update on public.v2_produtos             for each row execute function public.v2_trg_imutaveis();
create trigger v2_imagens_imutaveis            before update on public.v2_imagens              for each row execute function public.v2_trg_imutaveis();
create trigger v2_modelo_valores_imutaveis     before update on public.v2_modelo_valores       for each row execute function public.v2_trg_imutaveis();
create trigger v2_produto_valores_imutaveis    before update on public.v2_produto_valores      for each row execute function public.v2_trg_imutaveis();
create trigger v2_itens_analise_imutaveis      before update on public.v2_itens_analise        for each row execute function public.v2_trg_imutaveis();
create trigger v2_analise_refs_imutaveis       before update on public.v2_analise_refs         for each row execute function public.v2_trg_imutaveis();
create trigger v2_agregado_comp_imutaveis      before update on public.v2_agregado_componentes for each row execute function public.v2_trg_imutaveis();
create trigger v2_filtros_imutaveis            before update on public.v2_filtros              for each row execute function public.v2_trg_imutaveis();
create trigger v2_filtro_cond_imutaveis        before update on public.v2_filtro_condicoes     for each row execute function public.v2_trg_imutaveis();
create trigger v2_config_analise_imutaveis     before update on public.v2_config_analise       for each row execute function public.v2_trg_imutaveis();

-- ------------------------------------------------------- tipo imutável
create function public.v2_trg_bloqueia_troca_tipo() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo then
    raise exception 'tipo_imutavel' using errcode = 'V2006',
      detail = format('o tipo não pode ser alterado após a criação (%s: %s -> %s)', tg_table_name, old.tipo, new.tipo);
  end if;
  return new;
end $$;

create trigger v2_itens_modelo_tipo   before update on public.v2_itens_modelo  for each row execute function public.v2_trg_bloqueia_troca_tipo();
create trigger v2_itens_produto_tipo  before update on public.v2_itens_produto for each row execute function public.v2_trg_bloqueia_troca_tipo();
create trigger v2_itens_analise_tipo  before update on public.v2_itens_analise for each row execute function public.v2_trg_bloqueia_troca_tipo();

-- ------------------------------------------- configuração inicial do escopo
create function public.v2_trg_config_inicial() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.v2_config_analise (user_id, escopo_id) values (new.user_id, new.id);
  return new;
end $$;

create trigger v2_escopos_config_inicial after insert on public.v2_escopos
  for each row execute function public.v2_trg_config_inicial();

-- ------------------------------------------------ limites numéricos dos valores
-- Bloqueia valor fora de [valor_min, valor_max] do item. FOR SHARE impede que os limites
-- do item mudem entre esta leitura e o commit (serializa com v2_trg_item_limites).
create function public.v2_trg_valor_limites() returns trigger
language plpgsql set search_path = ''
as $$
declare v_min numeric; v_max numeric; v_nome text;
begin
  if new.tipo <> 'numerico' or new.valor_num is null then
    return new;
  end if;
  if tg_table_name = 'v2_modelo_valores' then
    select valor_min, valor_max, nome into v_min, v_max, v_nome
      from public.v2_itens_modelo where id = new.item_modelo_id for share;
  else
    select valor_min, valor_max, nome into v_min, v_max, v_nome
      from public.v2_itens_produto where id = new.item_produto_id for share;
  end if;
  if (v_min is not null and new.valor_num < v_min) or (v_max is not null and new.valor_num > v_max) then
    raise exception 'valor_fora_dos_limites' using errcode = 'V2003',
      detail = format('item "%s": valor %s fora de [%s, %s]', v_nome, new.valor_num,
                      coalesce(v_min::text, '-∞'), coalesce(v_max::text, '+∞'));
  end if;
  return new;
end $$;

create trigger v2_modelo_valores_limites  before insert or update on public.v2_modelo_valores
  for each row execute function public.v2_trg_valor_limites();
create trigger v2_produto_valores_limites before insert or update on public.v2_produto_valores
  for each row execute function public.v2_trg_valor_limites();

-- Ao mudar os limites do item, bloqueia se existirem valores já gravados fora deles.
create function public.v2_trg_item_limites() returns trigger
language plpgsql set search_path = ''
as $$
declare v_viol integer;
begin
  if new.valor_min is not distinct from old.valor_min and new.valor_max is not distinct from old.valor_max then
    return new;
  end if;
  if tg_table_name = 'v2_itens_modelo' then
    select count(*) into v_viol from public.v2_modelo_valores v
     where v.item_modelo_id = new.id and v.valor_num is not null
       and ((new.valor_min is not null and v.valor_num < new.valor_min)
         or (new.valor_max is not null and v.valor_num > new.valor_max));
  else
    select count(*) into v_viol from public.v2_produto_valores v
     where v.item_produto_id = new.id and v.valor_num is not null
       and ((new.valor_min is not null and v.valor_num < new.valor_min)
         or (new.valor_max is not null and v.valor_num > new.valor_max));
  end if;
  if v_viol > 0 then
    raise exception 'limites_incompativeis_com_valores' using errcode = 'V2003',
      detail = format('%s valor(es) já gravado(s) ficariam fora dos novos limites', v_viol);
  end if;
  return new;
end $$;

create trigger v2_itens_modelo_limites  before update of valor_min, valor_max on public.v2_itens_modelo
  for each row execute function public.v2_trg_item_limites();
create trigger v2_itens_produto_limites before update of valor_min, valor_max on public.v2_itens_produto
  for each row execute function public.v2_trg_item_limites();

-- ------------------------------------- conflito de nomes: herdado × próprio (D1)
-- Constraint triggers DEFERRED: avaliam o estado final da transação, então um fluxo que
-- troca o modelo e renomeia/remove itens próprios no mesmo salvamento não gera falso conflito.
create function public.v2_trg_conflito_nomes() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_produto uuid; v_modelo uuid; v_im uuid; v_ip uuid;
  v_nomes text[];
begin
  -- Serializa, por escopo, as transações que checam conflito de nomes: sem isso, duas transações
  -- concorrentes (cada uma criando "metade" do conflito) passariam, pois só enxergam dados já
  -- commitados. O lock é liberado no fim da transação; depois de obtê-lo, o SELECT abaixo já
  -- enxerga o que a outra transação commitou (READ COMMITTED).
  perform pg_advisory_xact_lock(hashtextextended('v2:nomes:' || new.escopo_id::text, 0));

  if tg_table_name = 'v2_produtos' then
    v_produto := new.id;
  elsif tg_table_name = 'v2_produto_valores' then
    v_produto := new.produto_id;
  elsif tg_table_name = 'v2_modelo_valores' then
    v_modelo := new.modelo_id;
  elsif tg_table_name = 'v2_itens_modelo' then
    v_im := new.id;
  elsif tg_table_name = 'v2_itens_produto' then
    v_ip := new.id;
  end if;

  select array_agg(distinct x.nome order by x.nome) into v_nomes from (
    select im.nome
      from public.v2_produtos p
      join public.v2_modelo_valores mv on mv.modelo_id = p.modelo_id
      join public.v2_itens_modelo im   on im.id = mv.item_modelo_id
      join public.v2_produto_valores pv on pv.produto_id = p.id
      join public.v2_itens_produto ip  on ip.id = pv.item_produto_id
     where lower(btrim(im.nome)) = lower(btrim(ip.nome))
       and (v_produto is null or p.id = v_produto)
       and (v_modelo  is null or p.modelo_id = v_modelo)
       and (v_im      is null or im.id = v_im)
       and (v_ip      is null or ip.id = v_ip)
  ) x;

  if v_nomes is not null then
    raise exception 'conflito_nome_herdado' using errcode = 'V2002',
      detail = array_to_string(v_nomes, ', ');
  end if;
  return null;
end $$;

create constraint trigger v2_produtos_conflito_nomes
  after insert or update of modelo_id on public.v2_produtos
  deferrable initially deferred for each row execute function public.v2_trg_conflito_nomes();
create constraint trigger v2_produto_valores_conflito_nomes
  after insert on public.v2_produto_valores
  deferrable initially deferred for each row execute function public.v2_trg_conflito_nomes();
create constraint trigger v2_modelo_valores_conflito_nomes
  after insert on public.v2_modelo_valores
  deferrable initially deferred for each row execute function public.v2_trg_conflito_nomes();
create constraint trigger v2_itens_modelo_conflito_nomes
  after update of nome on public.v2_itens_modelo
  deferrable initially deferred for each row execute function public.v2_trg_conflito_nomes();
create constraint trigger v2_itens_produto_conflito_nomes
  after update of nome on public.v2_itens_produto
  deferrable initially deferred for each row execute function public.v2_trg_conflito_nomes();

-- ------------------------- tipo dos itens referenciados (fórmulas e agregados)
-- Fórmulas e componentes de agregado só aceitam itens NUMÉRICOS de modelo/produto.
create function public.v2_trg_ref_numerica() returns trigger
language plpgsql set search_path = ''
as $$
declare v_tipo text; v_pai_tipo text;
begin
  if tg_table_name = 'v2_analise_refs' then
    select tipo into v_pai_tipo from public.v2_itens_analise where id = new.analise_id;
    if v_pai_tipo is distinct from 'formula' then
      raise exception 'pai_invalido' using errcode = 'V2007',
        detail = 'v2_analise_refs só pode pertencer a um item de análise do tipo fórmula';
    end if;
  else
    select tipo into v_pai_tipo from public.v2_itens_analise where id = new.agregado_id;
    if v_pai_tipo is distinct from 'agregado' then
      raise exception 'pai_invalido' using errcode = 'V2007',
        detail = 'v2_agregado_componentes só pode pertencer a um item de análise do tipo agregado';
    end if;
  end if;

  if new.item_modelo_id is not null then
    select tipo into v_tipo from public.v2_itens_modelo where id = new.item_modelo_id;
  elsif new.item_produto_id is not null then
    select tipo into v_tipo from public.v2_itens_produto where id = new.item_produto_id;
  else
    return new;
  end if;
  if v_tipo is distinct from 'numerico' then
    raise exception 'referencia_nao_numerica' using errcode = 'V2007',
      detail = 'apenas itens numéricos podem ser usados em fórmulas e agregados';
  end if;
  return new;
end $$;

create trigger v2_analise_refs_numerica before insert or update on public.v2_analise_refs
  for each row execute function public.v2_trg_ref_numerica();
create trigger v2_agregado_comp_numerica before insert or update on public.v2_agregado_componentes
  for each row execute function public.v2_trg_ref_numerica();

-- --------------------------------------------- validação das condições de filtro
-- numérico/análise: exige valor_num; textual: exige valor_txt e só aceita eq/ne; imagem: não filtrável.
create function public.v2_trg_filtro_cond() returns trigger
language plpgsql set search_path = ''
as $$
declare v_tipo text;
begin
  if new.item_modelo_id is not null then
    select tipo into v_tipo from public.v2_itens_modelo where id = new.item_modelo_id;
  elsif new.item_produto_id is not null then
    select tipo into v_tipo from public.v2_itens_produto where id = new.item_produto_id;
  else
    v_tipo := 'numerico'; -- resultado de item de análise é numérico
  end if;

  if v_tipo = 'imagem' then
    raise exception 'tipo_nao_filtravel' using errcode = 'V2008', detail = 'itens de imagem não podem ser filtrados';
  elsif v_tipo = 'textual' then
    if new.valor_txt is null then
      raise exception 'valor_invalido' using errcode = 'V2008', detail = 'condição de texto exige valor_txt';
    end if;
    if new.operador not in ('eq', 'ne') then
      raise exception 'operador_invalido' using errcode = 'V2008', detail = 'itens textuais só aceitam = e ≠';
    end if;
  else
    if new.valor_num is null then
      raise exception 'valor_invalido' using errcode = 'V2008', detail = 'condição numérica exige valor_num';
    end if;
  end if;
  return new;
end $$;

create trigger v2_filtro_condicoes_valida before insert or update on public.v2_filtro_condicoes
  for each row execute function public.v2_trg_filtro_cond();

-- -------------------------------------------- ranking só aceita agregado
create function public.v2_trg_config_ranking() returns trigger
language plpgsql set search_path = ''
as $$
declare v_tipo text;
begin
  if new.agregado_ranking_id is not null then
    select tipo into v_tipo from public.v2_itens_analise where id = new.agregado_ranking_id;
    if v_tipo is distinct from 'agregado' then
      raise exception 'ranking_invalido' using errcode = 'V2009', detail = 'o ranking só pode ser definido por um agregado';
    end if;
  end if;
  return new;
end $$;

create trigger v2_config_analise_ranking before insert or update of agregado_ranking_id on public.v2_config_analise
  for each row execute function public.v2_trg_config_ranking();

-- ----------------------------------------------------------- dependências circulares
-- Grafo: fórmula -> itens de análise que ela usa; agregado -> itens de análise que o compõem.
-- UNION (sem ALL) deduplica nós, então a recursão termina mesmo se houver ciclo.
create function public.v2_trg_ciclo() returns trigger
language plpgsql set search_path = ''
as $$
declare v_inicio uuid; v_ciclo boolean;
begin
  -- Mesmo motivo do conflito de nomes: duas transações podem criar, cada uma, uma aresta que
  -- sozinha não fecha ciclo mas juntas fecham. Serializa por escopo antes de ler o grafo.
  perform pg_advisory_xact_lock(hashtextextended('v2:ciclo:' || new.escopo_id::text, 0));

  if tg_table_name = 'v2_analise_refs' then
    v_inicio := new.analise_id;
  else
    v_inicio := new.agregado_id;
  end if;

  with recursive g(src, dst) as (
      select analise_id, item_analise_id from public.v2_analise_refs
       where escopo_id = new.escopo_id and item_analise_id is not null
      union all
      select agregado_id, item_analise_id from public.v2_agregado_componentes
       where escopo_id = new.escopo_id and item_analise_id is not null
  ), percurso(no) as (
      select dst from g where src = v_inicio
      union
      select g.dst from g join percurso p on g.src = p.no
  )
  select exists (select 1 from percurso where no = v_inicio) into v_ciclo;

  if v_ciclo then
    raise exception 'dependencia_circular' using errcode = 'V2004',
      detail = format('o item de análise %s passaria a depender de si mesmo', v_inicio);
  end if;
  return null;
end $$;

create constraint trigger v2_analise_refs_ciclo
  after insert or update on public.v2_analise_refs
  deferrable initially deferred for each row
  when (new.item_analise_id is not null)
  execute function public.v2_trg_ciclo();
create constraint trigger v2_agregado_comp_ciclo
  after insert or update on public.v2_agregado_componentes
  deferrable initially deferred for each row
  when (new.item_analise_id is not null)
  execute function public.v2_trg_ciclo();

-- ----------------------------------------------- agregado com 2 a 5 componentes
-- Verificado no COMMIT (deferred), para permitir inserir os componentes um a um.
create function public.v2_trg_agregado_contagem() returns trigger
language plpgsql set search_path = ''
as $$
declare v_id uuid; v_tipo text; v_n integer;
begin
  if tg_table_name = 'v2_itens_analise' then
    v_id := new.id;
  elsif tg_op = 'DELETE' then
    v_id := old.agregado_id;
  else
    v_id := new.agregado_id;
  end if;

  select tipo into v_tipo from public.v2_itens_analise where id = v_id;
  if v_tipo is distinct from 'agregado' then
    return null; -- agregado inexistente (ex.: excluído na mesma transação) ou não é agregado
  end if;

  select count(*) into v_n from public.v2_agregado_componentes where agregado_id = v_id;
  if v_n < 2 or v_n > 5 then
    raise exception 'agregado_componentes_invalido' using errcode = 'V2010',
      detail = format('um agregado deve ter de 2 a 5 componentes (tem %s)', v_n);
  end if;
  return null;
end $$;

create constraint trigger v2_agregado_comp_contagem
  after insert or update or delete on public.v2_agregado_componentes
  deferrable initially deferred for each row execute function public.v2_trg_agregado_contagem();
create constraint trigger v2_itens_analise_contagem
  after insert on public.v2_itens_analise
  deferrable initially deferred for each row
  when (new.tipo = 'agregado')
  execute function public.v2_trg_agregado_contagem();

-- ------------------------------------------------ herança: visão do produto efetivo
-- Sem cópias: valores herdados vêm de v2_modelo_valores via produtos.modelo_id.
create view public.v2_vw_produto_efetivo with (security_invoker = true) as
  select p.id as produto_id, p.escopo_id, p.user_id, 'modelo'::text as origem,
         mv.item_modelo_id as item_id, mv.tipo, mv.valor_num, mv.valor_txt, mv.valor_img_id
    from public.v2_produtos p
    join public.v2_modelo_valores mv on mv.modelo_id = p.modelo_id
  union all
  select pv.produto_id, pv.escopo_id, pv.user_id, 'proprio'::text,
         pv.item_produto_id, pv.tipo, pv.valor_num, pv.valor_txt, pv.valor_img_id
    from public.v2_produto_valores pv;
