import { urlSegura } from '../../features/numeros';
import { formatarNumero } from '../../features/numeros';
import { calcularAnalise } from './compute';
import { linhaPassa, type FiltroCompleto } from './filter';
import { montarLinhas, type Linha } from './linhas';
import { classificar } from './rank';
import { ordenar, type Celula } from './sort';
import type { ColKey, DadosEscopo, Logica, ModoAnalise, OrdenacaoItem } from '../types';
import type { Resultado } from '../formula/evaluator';

export interface Coluna {
  key: ColKey;
  titulo: string;
  descricao: string | null;
  grupo: 'fixa' | 'modelo' | 'produto' | 'analise';
}

export type EstadoCelula = 'ok' | 'vazio' | 'erro' | 'indisponivel' | 'imagem' | 'link' | 'naoSeAplica';
export interface CelulaVista {
  estado: EstadoCelula;
  texto: string;
  /** valor para exportação (número cru ou texto) */
  bruto: number | string | null;
  imagemId?: string;
  detalhe?: string;
}

export const COL_NOME = 'nome';
export const COL_TIPO = 'tipo';
export const COL_RANKING = 'ranking';

export function todasColunas(d: DadosEscopo): Coluna[] {
  return [
    { key: COL_NOME, titulo: 'Nome', descricao: null, grupo: 'fixa' },
    { key: COL_TIPO, titulo: 'Tipo', descricao: null, grupo: 'fixa' },
    { key: COL_RANKING, titulo: 'Ranking', descricao: 'Posição pela pontuação do agregado de ranking, entre as linhas exibidas após os filtros.', grupo: 'fixa' },
    ...d.itensModelo.map((i) => ({ key: `m:${i.id}`, titulo: i.unidade ? `${i.nome} (${i.unidade})` : i.nome, descricao: i.descricao, grupo: 'modelo' as const })),
    ...d.itensProduto.map((i) => ({ key: `p:${i.id}`, titulo: i.unidade ? `${i.nome} (${i.unidade})` : i.nome, descricao: i.descricao, grupo: 'produto' as const })),
    ...d.itensAnalise.map((i) => ({ key: `a:${i.id}`, titulo: i.nome, descricao: i.descricao, grupo: 'analise' as const })),
  ];
}

/** Colunas na ordem configurada. Sem configuração: Nome, Tipo, Ranking (se houver) e todos os itens. Colunas removidas do escopo são ignoradas. */
export function colunasVisiveis(d: DadosEscopo, modo: ModoAnalise): Coluna[] {
  const todas = todasColunas(d);
  const porChave = new Map(todas.map((c) => [c.key, c]));
  const cfg = d.config.colunas.visiveis;
  let chaves: ColKey[];
  if (cfg && cfg.length > 0) chaves = cfg.filter((k) => porChave.has(k));
  else {
    chaves = [COL_NOME, COL_TIPO, ...(d.config.agregado_ranking_id ? [COL_RANKING] : []), ...todas.filter((c) => c.grupo !== 'fixa').map((c) => c.key)];
  }
  if (!chaves.includes(COL_NOME)) chaves = [COL_NOME, ...chaves];
  let cols = chaves.map((k) => porChave.get(k) as Coluna);
  if (modo === 'itens_analise') cols = cols.filter((c) => c.grupo === 'analise' || c.key === COL_NOME || c.key === COL_TIPO || c.key === COL_RANKING);
  if (modo === 'modelos') cols = cols.filter((c) => c.grupo !== 'produto');
  return cols;
}

export function linhasDoModo(linhas: Linha[], modo: ModoAnalise): Linha[] {
  if (modo === 'modelos') return linhas.filter((l) => l.kind === 'modelo');
  if (modo === 'produtos') return linhas.filter((l) => l.kind === 'produto');
  return linhas;
}

export interface LinhaVista {
  key: string;
  linha: Linha;
  ranking: number | null;
  celulas: Map<ColKey, CelulaVista>;
}

export interface OpcoesTabela {
  modo: ModoAnalise;
  filtrosAtivos: FiltroCompleto[];
  logicaGlobal: Logica;
  busca: string;
  ordenacao: OrdenacaoItem[];
}

export interface Tabela {
  colunas: Coluna[];
  linhas: LinhaVista[];
  /** linhas do modo antes de filtros e busca */
  totalModo: number;
  rankingDisponivel: boolean;
}

const fmtAnalise = (n: number) => formatarNumero(n, 2);

function celulaDe(d: DadosEscopo, l: Linha, col: Coluna, resultados: Map<string, Resultado> | undefined, ranking: number | null): CelulaVista {
  if (col.key === COL_NOME) return { estado: 'ok', texto: l.nome, bruto: l.nome };
  if (col.key === COL_TIPO) {
    const t = l.kind === 'modelo' ? 'Modelo' : 'Produto';
    return { estado: 'ok', texto: t, bruto: t };
  }
  if (col.key === COL_RANKING) return ranking === null ? { estado: 'vazio', texto: '—', bruto: null } : { estado: 'ok', texto: `${ranking}º`, bruto: ranking };
  const [k, id] = [col.key[0], col.key.slice(2)];
  if (k === 'a') {
    const r = resultados?.get(id);
    if (!r) return { estado: 'indisponivel', texto: 'indisp.', bruto: 'INDISPONÍVEL' };
    if (r.kind === 'valor') return { estado: 'ok', texto: fmtAnalise(r.valor), bruto: r.valor, detalhe: r.cobertura ? `${r.cobertura.usados} de ${r.cobertura.total} critérios` : undefined };
    if (r.kind === 'erro') return { estado: 'erro', texto: 'erro', bruto: 'ERRO', detalhe: r.mensagem };
    return { estado: 'indisponivel', texto: 'indisp.', bruto: 'INDISPONÍVEL', detalhe: r.motivo };
  }
  const item = (k === 'm' ? d.itensModelo : d.itensProduto).find((i) => i.id === id);
  const v = l.valores.get(col.key);
  // item de produto não se aplica a modelos; item de modelo não se aplica a produtos de outro modelo
  if (!v) return { estado: l.kind === 'modelo' && k === 'p' ? 'naoSeAplica' : 'vazio', texto: l.kind === 'modelo' && k === 'p' ? 'n/a' : '—', bruto: null };
  if (v.tipo === 'numerico') return v.valor_num === null ? { estado: 'vazio', texto: '—', bruto: null } : { estado: 'ok', texto: formatarNumero(v.valor_num, item?.casas_decimais ?? null), bruto: v.valor_num };
  if (v.tipo === 'textual') {
    if (v.valor_txt === null || v.valor_txt === '') return { estado: 'vazio', texto: '—', bruto: null };
    return { estado: urlSegura(v.valor_txt) ? 'link' : 'ok', texto: v.valor_txt, bruto: v.valor_txt };
  }
  return v.valor_img_id ? { estado: 'imagem', texto: '[imagem]', bruto: '[imagem]', imagemId: v.valor_img_id } : { estado: 'vazio', texto: '—', bruto: null };
}

const paraOrdem = (c: CelulaVista): Celula => (typeof c.bruto === 'number' ? { kind: 'num', v: c.bruto } : typeof c.bruto === 'string' && c.estado !== 'erro' && c.estado !== 'indisponivel' && c.estado !== 'imagem' ? { kind: 'txt', v: c.bruto } : { kind: 'vazio' });

/** Constrói a tabela completa (todas as linhas; a virtualização é só da tela). */
export function construirTabela(d: DadosEscopo, o: OpcoesTabela): Tabela {
  const todas = montarLinhas(d);
  const doModo = linhasDoModo(todas, o.modo);
  const resultados = calcularAnalise(d, doModo);
  const filtradas = doModo.filter((l) => linhaPassa(l, resultados.get(l.key), o.filtrosAtivos, o.logicaGlobal));

  const rankId = d.config.agregado_ranking_id;
  const posicoes = new Map<string, number>();
  if (rankId) {
    const cl = classificar(filtradas.map((l) => {
      const r = resultados.get(l.key)?.get(rankId);
      return { key: l.key, pontuacao: r && r.kind === 'valor' ? r.valor : null };
    }));
    cl.forEach((p, k) => posicoes.set(k, p));
  }

  const colunas = colunasVisiveis(d, o.modo);
  // a busca e a ordenação precisam enxergar todas as colunas visíveis; colunas ocultas ordenáveis são calculadas sob demanda
  const todasPorChave = new Map(todasColunas(d).map((c) => [c.key, c]));
  const vistas: LinhaVista[] = filtradas.map((l) => {
    const celulas = new Map<ColKey, CelulaVista>();
    for (const c of colunas) celulas.set(c.key, celulaDe(d, l, c, resultados.get(l.key), posicoes.get(l.key) ?? null));
    return { key: l.key, linha: l, ranking: posicoes.get(l.key) ?? null, celulas };
  });

  const q = o.busca.trim().toLowerCase();
  const buscadas = q === '' ? vistas : vistas.filter((v) => [...v.celulas.values()].some((c) => c.estado !== 'imagem' && c.texto.toLowerCase().includes(q)));

  const ordenadas = ordenar(buscadas, o.ordenacao, (v, col) => {
    let c = v.celulas.get(col);
    if (!c) {
      const def = todasPorChave.get(col);
      if (!def) return { kind: 'vazio' };
      c = celulaDe(d, v.linha, def, resultados.get(v.linha.key), v.ranking);
    }
    return paraOrdem(c);
  });

  return { colunas, linhas: ordenadas, totalModo: doModo.length, rankingDisponivel: rankId !== null };
}

/** Linhas para exportação (CSV/PDF): todas as linhas da consulta atual, valores crus. */
export function paraExportacao(t: Tabela): { cabecalho: string[]; linhas: (string | number | null)[][] } {
  return {
    cabecalho: t.colunas.map((c) => c.titulo),
    linhas: t.linhas.map((l) => t.colunas.map((c) => l.celulas.get(c.key)?.bruto ?? null)),
  };
}
