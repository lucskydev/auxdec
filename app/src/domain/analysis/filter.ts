import type { Filtro, FiltroCondicao, Logica, Operador } from '../types';
import type { Resultado } from '../formula/evaluator';
import type { Linha } from './linhas';

export type Operando =
  | { kind: 'num'; v: number }
  | { kind: 'txt'; v: string }
  | { kind: 'vazio' }
  | { kind: 'indisponivel' };

/** Obtém o operando de uma condição para uma linha. */
export function operandoDe(c: FiltroCondicao, linha: Linha, resultados: Map<string, Resultado> | undefined): Operando {
  if (c.item_analise_id) {
    const r = resultados?.get(c.item_analise_id);
    return r && r.kind === 'valor' ? { kind: 'num', v: r.valor } : { kind: 'indisponivel' };
  }
  const chave = c.item_modelo_id ? `m:${c.item_modelo_id}` : `p:${c.item_produto_id}`;
  const v = linha.valores.get(chave);
  if (!v) return { kind: 'vazio' };
  if (v.tipo === 'numerico') return v.valor_num === null ? { kind: 'vazio' } : { kind: 'num', v: v.valor_num };
  if (v.tipo === 'textual') return v.valor_txt === null || v.valor_txt === '' ? { kind: 'vazio' } : { kind: 'txt', v: v.valor_txt };
  return { kind: 'indisponivel' }; // imagem não é filtrável
}

function cmpNum(op: Operador, a: number, b: number): boolean {
  switch (op) {
    case 'eq': return a === b;
    case 'ne': return a !== b;
    case 'lt': return a < b;
    case 'gt': return a > b;
    case 'le': return a <= b;
    case 'ge': return a >= b;
  }
}

/**
 * Regras: vazio satisfaz apenas "≠"; análise indisponível/com erro não satisfaz nenhuma condição;
 * texto só compara com = e ≠ (sem diferenciar maiúsculas/minúsculas); número com número.
 */
export function avaliarCondicao(c: FiltroCondicao, op: Operando): boolean {
  if (op.kind === 'indisponivel') return false;
  if (op.kind === 'vazio') return c.operador === 'ne';
  if (op.kind === 'txt') {
    if (c.valor_txt === null || (c.operador !== 'eq' && c.operador !== 'ne')) return false;
    const igual = op.v.trim().toLowerCase() === c.valor_txt.trim().toLowerCase();
    return c.operador === 'eq' ? igual : !igual;
  }
  if (c.valor_num === null) return false;
  return cmpNum(c.operador, op.v, c.valor_num);
}

export interface FiltroCompleto {
  filtro: Filtro;
  condicoes: FiltroCondicao[];
}

export function combinar(resultados: boolean[], logica: Logica): boolean {
  return logica === 'AND' ? resultados.every(Boolean) : resultados.some(Boolean);
}

/** Filtro sem condições é ignorado (não restringe). Sem filtros ativos, todas as linhas passam. */
export function linhaPassa(
  linha: Linha,
  resultados: Map<string, Resultado> | undefined,
  ativos: FiltroCompleto[],
  logicaGlobal: Logica,
): boolean {
  const efetivos = ativos.filter((f) => f.condicoes.length > 0);
  if (efetivos.length === 0) return true;
  const porFiltro = efetivos.map((f) =>
    combinar(
      f.condicoes.map((c) => avaliarCondicao(c, operandoDe(c, linha, resultados))),
      f.filtro.logica,
    ),
  );
  return combinar(porFiltro, logicaGlobal);
}
