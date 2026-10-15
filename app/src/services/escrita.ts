import { getSupabase } from '../lib/supabase';
import type {
  ColunasConfig, ConfigAnalise, Escopo, Item, Logica, OrdenacaoItem, ModoAnalise, Operador, Direcao,
} from '../domain/types';
import { toAppError } from './errors';

export type TabelaItem = 'v2_itens_modelo' | 'v2_itens_produto';
export interface ItemEntrada {
  nome: string;
  descricao: string | null;
  tipo: Item['tipo'];
  unidade: string | null;
  casas_decimais: number | null;
  valor_min: number | null;
  valor_max: number | null;
}
export interface ValorEntrada {
  item_id: string;
  valor_num?: number | null;
  valor_txt?: string | null;
  valor_img_id?: string | null;
}

async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toAppError(error);
  return data;
}

async function linha<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toAppError(error);
  if (data === null) throw toAppError({ code: 'V2011' });
  return data;
}

/** A versão enviada é sempre a versão editada + 1; o banco recusa (V2001) se a persistida mudou. */
export const proxima = (v: number) => v + 1;

// ---------------------------------------------------------------- escopos
export async function criarEscopo(nome: string, descricao: string | null): Promise<Escopo> {
  return linha(getSupabase().from('v2_escopos').insert({ nome: nome.trim(), descricao }).select('id, nome, descricao, ultimo_acesso, versao').single());
}
export async function atualizarEscopo(e: Escopo, nome: string, descricao: string | null): Promise<Escopo> {
  return linha(
    getSupabase().from('v2_escopos').update({ nome: nome.trim(), descricao, versao: proxima(e.versao) }).eq('id', e.id)
      .select('id, nome, descricao, ultimo_acesso, versao').single(),
  );
}
/** Registrar o acesso não conta como edição (o banco não exige versão neste caso). Falha silenciosa: é só conveniência. */
export async function registrarAcesso(id: string): Promise<void> {
  try {
    await getSupabase().from('v2_escopos').update({ ultimo_acesso: new Date().toISOString() }).eq('id', id);
  } catch {
    /* conveniência: falha não interrompe o uso */
  }
}
export async function excluirEscopo(id: string, versao: number, confirmacao: string): Promise<string[]> {
  const r = await ok(getSupabase().rpc('v2_excluir_escopo', { p_id: id, p_versao: versao, p_confirmacao: confirmacao }));
  const caminhos = (r as { caminhos?: string[] }).caminhos ?? [];
  return caminhos;
}

// ----------------------------------------------------------------- itens
export async function criarItem(tabela: TabelaItem, escopoId: string, e: ItemEntrada): Promise<Item> {
  return linha(getSupabase().from(tabela).insert({ escopo_id: escopoId, ...e, nome: e.nome.trim() }).select('*').single());
}
/** O tipo não é enviado: é imutável (o banco também bloqueia). */
export async function atualizarItem(tabela: TabelaItem, item: Item, e: Omit<ItemEntrada, 'tipo'>): Promise<Item> {
  return linha(getSupabase().from(tabela).update({ ...e, nome: e.nome.trim(), versao: proxima(item.versao) }).eq('id', item.id).select('*').single());
}
/** `ids` = TODOS os itens do escopo na nova ordem. Não mexe na versão dos itens. */
export async function reordenarItens(escopoId: string, tabela: TabelaItem, ids: string[]): Promise<void> {
  await ok(getSupabase().rpc('v2_reordenar_itens', { p_escopo_id: escopoId, p_tabela: tabela.replace('v2_', ''), p_ids: ids }));
}
export async function excluirItem(tabela: TabelaItem, id: string): Promise<void> {
  await ok(getSupabase().from(tabela).delete().eq('id', id));
}

// --------------------------------------------------------- modelos/produtos
export async function salvarModelo(p: { escopoId: string; id: string | null; versao: number | null; nome: string; descricao: string | null; valores: ValorEntrada[] | null }) {
  const valores = p.valores?.map((v) => ({ item_modelo_id: v.item_id, valor_num: v.valor_num ?? null, valor_txt: v.valor_txt ?? null, valor_img_id: v.valor_img_id ?? null })) ?? null;
  return ok(getSupabase().rpc('v2_salvar_modelo', { p_escopo_id: p.escopoId, p_id: p.id, p_versao: p.versao, p_nome: p.nome.trim(), p_descricao: p.descricao, p_valores: valores })) as Promise<{ id: string; versao: number }>;
}
export async function salvarProduto(p: { escopoId: string; id: string | null; versao: number | null; nome: string; descricao: string | null; modeloId: string | null; valores: ValorEntrada[] | null }) {
  const valores = p.valores?.map((v) => ({ item_produto_id: v.item_id, valor_num: v.valor_num ?? null, valor_txt: v.valor_txt ?? null, valor_img_id: v.valor_img_id ?? null })) ?? null;
  return ok(getSupabase().rpc('v2_salvar_produto', { p_escopo_id: p.escopoId, p_id: p.id, p_versao: p.versao, p_nome: p.nome.trim(), p_descricao: p.descricao, p_modelo_id: p.modeloId, p_valores: valores })) as Promise<{ id: string; versao: number }>;
}
export async function excluirModelo(id: string) {
  await ok(getSupabase().from('v2_modelos').delete().eq('id', id));
}
export async function excluirProduto(id: string) {
  await ok(getSupabase().from('v2_produtos').delete().eq('id', id));
}

// ----------------------------------------------------------------- análise
export async function salvarFormula(p: { escopoId: string; id: string | null; versao: number | null; nome: string; descricao: string | null; texto: string }) {
  return ok(getSupabase().rpc('v2_salvar_analise_formula', { p_escopo_id: p.escopoId, p_id: p.id, p_versao: p.versao, p_nome: p.nome.trim(), p_descricao: p.descricao, p_formula_texto: p.texto })) as Promise<{ id: string; versao: number }>;
}
export interface ComponenteEntrada {
  peso: number;
  direcao: Direcao;
  lmin: number;
  lmax: number;
  item_modelo_id?: string | null;
  item_produto_id?: string | null;
  item_analise_id?: string | null;
}
export async function salvarAgregado(p: { escopoId: string; id: string | null; versao: number | null; nome: string; descricao: string | null; peso: number; componentes: ComponenteEntrada[] }) {
  return ok(getSupabase().rpc('v2_salvar_analise_agregado', { p_escopo_id: p.escopoId, p_id: p.id, p_versao: p.versao, p_nome: p.nome.trim(), p_descricao: p.descricao, p_peso: p.peso, p_componentes: p.componentes })) as Promise<{ id: string; versao: number }>;
}
export async function excluirItemAnalise(id: string) {
  await ok(getSupabase().from('v2_itens_analise').delete().eq('id', id));
}

// ----------------------------------------------------------------- filtros
export interface CondicaoEntrada {
  item_modelo_id?: string | null;
  item_produto_id?: string | null;
  item_analise_id?: string | null;
  operador: Operador;
  valor_num?: number | null;
  valor_txt?: string | null;
}
export async function salvarFiltro(p: { escopoId: string; id: string | null; versao: number | null; nome: string; descricao: string | null; logica: Logica; condicoes: CondicaoEntrada[] }) {
  return ok(getSupabase().rpc('v2_salvar_filtro', { p_escopo_id: p.escopoId, p_id: p.id, p_versao: p.versao, p_nome: p.nome.trim(), p_descricao: p.descricao, p_logica: p.logica, p_condicoes: p.condicoes })) as Promise<{ id: string; versao: number }>;
}
export async function excluirFiltro(id: string) {
  await ok(getSupabase().from('v2_filtros').delete().eq('id', id));
}

// ------------------------------------------------------------------ config
export interface ConfigPatch {
  modo?: ModoAnalise;
  logica_global?: Logica;
  agregado_ranking_id?: string | null;
  colunas?: ColunasConfig;
  ordenacao?: OrdenacaoItem[];
}
export async function salvarConfig(c: ConfigAnalise, patch: ConfigPatch): Promise<ConfigAnalise> {
  return linha(
    getSupabase().from('v2_config_analise').update({ ...patch, versao: proxima(c.versao) }).eq('id', c.id)
      .select('id, escopo_id, modo, logica_global, agregado_ranking_id, colunas, ordenacao, versao').single(),
  ) as Promise<ConfigAnalise>;
}
