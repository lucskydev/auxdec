import { avaliar, type EvalContext, type Resultado } from '../formula/evaluator';
import { FormulaSyntaxError } from '../formula/lexer';
import { parseFormula, type Node } from '../formula/parser';
import type { AgregadoComponente, DadosEscopo, ItemAnalise } from '../types';
import type { Linha } from './linhas';
import { LimitesInvalidos, mediaPonderada, normalizar } from './normalize';

export type ResultadosLinha = Map<string, Resultado>; // por id de item de análise

interface Plano {
  asts: Map<string, Node | Error>;
  comps: Map<string, AgregadoComponente[]>;
  itens: Map<string, ItemAnalise>;
}

function planejar(d: DadosEscopo): Plano {
  const asts = new Map<string, Node | Error>();
  const comps = new Map<string, AgregadoComponente[]>();
  const itens = new Map<string, ItemAnalise>();
  for (const it of d.itensAnalise) {
    itens.set(it.id, it);
    if (it.tipo === 'formula') {
      try {
        asts.set(it.id, parseFormula(it.formula_texto ?? ''));
      } catch (e) {
        asts.set(it.id, e instanceof FormulaSyntaxError ? e : new Error('Fórmula inválida.'));
      }
    }
  }
  for (const c of d.agregadoComponentes) {
    const l = comps.get(c.agregado_id);
    if (l) l.push(c);
    else comps.set(c.agregado_id, [c]);
  }
  for (const l of comps.values()) l.sort((a, b) => a.ordem - b.ordem);
  return { asts, comps, itens };
}

/** Calcula todos os itens de análise para uma linha. Falhas ficam restritas ao item afetado. */
function calcularLinha(plano: Plano, linha: Linha): ResultadosLinha {
  const memo: ResultadosLinha = new Map();
  const emCurso = new Set<string>();

  const numero = (kind: 'm' | 'p', id: string): number | null => {
    const v = linha.valores.get(`${kind}:${id}`);
    if (!v || v.tipo !== 'numerico') return null;
    return v.valor_num;
  };

  const resolver = (id: string): Resultado => {
    const pronto = memo.get(id);
    if (pronto) return pronto;
    if (emCurso.has(id)) return { kind: 'erro', mensagem: 'Dependência circular entre itens de análise.' };
    const item = plano.itens.get(id);
    if (!item) return { kind: 'erro', mensagem: 'Item de análise inexistente.' };
    emCurso.add(id);
    const r = item.tipo === 'formula' ? calcFormula(id) : calcAgregado(id);
    emCurso.delete(id);
    memo.set(id, r);
    return r;
  };

  const ctx: EvalContext = { getNumero: numero, getAnalise: resolver };

  const calcFormula = (id: string): Resultado => {
    const ast = plano.asts.get(id);
    if (!ast) return { kind: 'erro', mensagem: 'Fórmula ausente.' };
    if (ast instanceof Error) return { kind: 'erro', mensagem: `Fórmula inválida: ${ast.message}` };
    return avaliar(ast, ctx);
  };

  const calcAgregado = (id: string): Resultado => {
    const comps = plano.comps.get(id) ?? [];
    if (comps.length < 2 || comps.length > 5) {
      return { kind: 'erro', mensagem: 'O agregado precisa de 2 a 5 componentes.' };
    }
    const considerados: { peso: number; pontuacao: number }[] = [];
    for (const c of comps) {
      let valor: number | null = null;
      if (c.item_analise_id) {
        const r = resolver(c.item_analise_id);
        if (r.kind === 'erro') return { kind: 'erro', mensagem: `Componente com erro: ${r.mensagem}` };
        if (r.kind === 'valor') valor = r.valor; // indisponível: excluído do cálculo
      } else {
        valor = numero(c.item_modelo_id ? 'm' : 'p', (c.item_modelo_id ?? c.item_produto_id) as string);
      }
      if (valor === null) continue; // sem dado válido: excluído; o peso não entra no denominador
      try {
        considerados.push({ peso: c.peso, pontuacao: normalizar(valor, c.lmin, c.lmax, c.direcao) });
      } catch (e) {
        if (e instanceof LimitesInvalidos) return { kind: 'erro', mensagem: e.message };
        throw e;
      }
    }
    const media = mediaPonderada(considerados);
    if (media === null) return { kind: 'indisponivel', motivo: 'Nenhum critério com dados válidos.' };
    return { kind: 'valor', valor: media, cobertura: { usados: considerados.length, total: comps.length } };
  };

  for (const id of plano.itens.keys()) resolver(id);
  return memo;
}

/** Resultados de todos os itens de análise para todas as linhas. */
export function calcularAnalise(d: DadosEscopo, linhas: Linha[]): Map<string, ResultadosLinha> {
  const plano = planejar(d);
  const out = new Map<string, ResultadosLinha>();
  for (const l of linhas) out.set(l.key, calcularLinha(plano, l));
  return out;
}
