import { getSupabase } from '../lib/supabase';
import type { ConfigAnalise, DadosEscopo } from '../domain/types';
import { toAppError } from './errors';

const PAGE = 1000; // limite padrão do PostgREST: sem paginar, linhas seriam descartadas em silêncio

async function todas<T>(tabela: string, colunas: string, escopoId: string, ordem: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = getSupabase().from(tabela).select(colunas).eq('escopo_id', escopoId);
    for (const o of ordem) q = q.order(o);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw toAppError(error);
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

const ITEM = 'id, escopo_id, nome, descricao, tipo, unidade, casas_decimais, valor_min, valor_max, ordem, versao';

/** Carrega tudo o que pertence ao escopo (sem paginação na interface; a análise precisa do conjunto completo). */
export async function carregarEscopo(escopoId: string): Promise<DadosEscopo> {
  const sb = getSupabase();
  const esc = await sb.from('v2_escopos').select('id, nome, descricao, ultimo_acesso, versao').eq('id', escopoId).maybeSingle();
  if (esc.error) throw toAppError(esc.error);
  if (!esc.data) throw toAppError({ code: 'V2011' });

  const [itensModelo, itensProduto, modelos, produtos, imagens, modeloValores, produtoValores, itensAnalise, analiseRefs, agregadoComponentes, filtros, filtroCondicoes, cfg] =
    await Promise.all([
      todas<DadosEscopo['itensModelo'][number]>('v2_itens_modelo', ITEM, escopoId, ['ordem', 'id']),
      todas<DadosEscopo['itensProduto'][number]>('v2_itens_produto', ITEM, escopoId, ['ordem', 'id']),
      todas<DadosEscopo['modelos'][number]>('v2_modelos', 'id, escopo_id, nome, descricao, versao', escopoId, ['id']),
      todas<DadosEscopo['produtos'][number]>('v2_produtos', 'id, escopo_id, nome, descricao, modelo_id, versao', escopoId, ['id']),
      todas<DadosEscopo['imagens'][number]>('v2_imagens', 'id, escopo_id, storage_path, largura, altura, bytes, mime', escopoId, ['id']),
      todas<DadosEscopo['modeloValores'][number]>('v2_modelo_valores', 'modelo_id, item_modelo_id, tipo, valor_num, valor_txt, valor_img_id', escopoId, ['modelo_id', 'item_modelo_id']),
      todas<DadosEscopo['produtoValores'][number]>('v2_produto_valores', 'produto_id, item_produto_id, tipo, valor_num, valor_txt, valor_img_id', escopoId, ['produto_id', 'item_produto_id']),
      todas<DadosEscopo['itensAnalise'][number]>('v2_itens_analise', 'id, escopo_id, nome, descricao, tipo, formula_texto, peso, versao', escopoId, ['id']),
      todas<DadosEscopo['analiseRefs'][number]>('v2_analise_refs', 'id, analise_id, item_modelo_id, item_produto_id, item_analise_id', escopoId, ['id']),
      todas<DadosEscopo['agregadoComponentes'][number]>('v2_agregado_componentes', 'id, agregado_id, ordem, peso, direcao, lmin, lmax, item_modelo_id, item_produto_id, item_analise_id', escopoId, ['agregado_id', 'ordem']),
      todas<DadosEscopo['filtros'][number]>('v2_filtros', 'id, escopo_id, nome, descricao, logica, versao', escopoId, ['id']),
      todas<DadosEscopo['filtroCondicoes'][number]>('v2_filtro_condicoes', 'id, filtro_id, ordem, item_modelo_id, item_produto_id, item_analise_id, operador, valor_num, valor_txt', escopoId, ['filtro_id', 'ordem']),
      sb.from('v2_config_analise').select('id, escopo_id, modo, logica_global, agregado_ranking_id, colunas, ordenacao, versao').eq('escopo_id', escopoId).maybeSingle(),
    ]);
  if (cfg.error) throw toAppError(cfg.error);
  if (!cfg.data) throw toAppError({ message: 'Configuração da análise não encontrada para este escopo.' });

  return {
    escopo: esc.data,
    itensModelo, itensProduto, modelos, produtos, imagens, modeloValores, produtoValores,
    itensAnalise, analiseRefs, agregadoComponentes, filtros, filtroCondicoes,
    config: cfg.data as ConfigAnalise,
  };
}
