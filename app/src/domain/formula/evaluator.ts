import type { Node } from './parser';

export type Resultado =
  | { kind: 'valor'; valor: number; cobertura?: { usados: number; total: number } }
  | { kind: 'indisponivel'; motivo: string }
  | { kind: 'erro'; mensagem: string };

/** Falha de cálculo em um registro (divisão por zero, tipo inválido, dependência com erro...). */
export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalcError';
  }
}
/** Dependência indisponível (ex.: agregado sem critérios válidos): propaga "indisponível". */
export class UnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnavailableError';
  }
}

export interface EvalContext {
  /** Valor numérico de um item de modelo/produto no registro; null = vazio ou inexistente. */
  getNumero(kind: 'm' | 'p', id: string): number | null;
  /** Resultado (já calculado) de um item de análise no mesmo registro. */
  getAnalise(id: string): Resultado;
}

type Val = number | boolean | null;

const EPS = 1e-12;
function aproxIgual(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= EPS * Math.max(Math.abs(a), Math.abs(b));
}

/** Arredonda "meio afasta de zero" sem erros de binário (ROUND(1.005, 2) = 1.01). */
export function arredondar(v: number, casas: number): number {
  const s = v < 0 ? -1 : 1;
  const a = Math.abs(v);
  if (a >= 1e15) return v;
  const r = Number(`${Math.round(Number(`${a}e${casas}`))}e-${casas}`);
  return Number.isFinite(r) ? s * r : s * Math.round(a * 10 ** casas) / 10 ** casas;
}

function num(v: Val, onde: string): number {
  if (v === null) return 0; // ausente vale zero
  if (typeof v === 'boolean') throw new CalcError(`${onde} exige número, mas recebeu um valor lógico (verdadeiro/falso).`);
  return v;
}
function bool(v: Val, onde: string): boolean {
  if (typeof v !== 'boolean') throw new CalcError(`${onde} exige condição lógica (comparação, AND, OR, NOT).`);
  return v;
}
function finito(v: number): number {
  if (!Number.isFinite(v)) throw new CalcError('O resultado está fora do intervalo numérico permitido.');
  return v;
}

function ev(n: Node, ctx: EvalContext): Val {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'ref': {
      if (n.kind === 'a') {
        const r = ctx.getAnalise(n.id);
        if (r.kind === 'valor') return r.valor;
        if (r.kind === 'indisponivel') throw new UnavailableError(`Depende de um item de análise indisponível: ${r.motivo}`);
        throw new CalcError(`Depende de um item de análise com erro: ${r.mensagem}`);
      }
      return ctx.getNumero(n.kind, n.id);
    }
    case 'neg':
      return -num(ev(n.x, ctx), 'O operador "-"');
    case 'bin': {
      const a = num(ev(n.l, ctx), `O operador "${n.op}"`);
      const b = num(ev(n.r, ctx), `O operador "${n.op}"`);
      if (n.op === '/') {
        if (b === 0) throw new CalcError('Divisão por zero.');
        return finito(a / b);
      }
      return finito(n.op === '+' ? a + b : n.op === '-' ? a - b : a * b);
    }
    case 'cmp': {
      const a = num(ev(n.l, ctx), `A comparação "${n.op}"`);
      const b = num(ev(n.r, ctx), `A comparação "${n.op}"`);
      switch (n.op) {
        case '=': return aproxIgual(a, b);
        case '≠': return !aproxIgual(a, b);
        case '<': return a < b && !aproxIgual(a, b);
        case '>': return a > b && !aproxIgual(a, b);
        case '≤': return a < b || aproxIgual(a, b);
        case '≥': return a > b || aproxIgual(a, b);
      }
      return false;
    }
    case 'logic': {
      const l = bool(ev(n.l, ctx), n.op);
      if (n.op === 'AND') return l ? bool(ev(n.r, ctx), 'AND') : false; // curto-circuito
      return l ? true : bool(ev(n.r, ctx), 'OR');
    }
    case 'not':
      return !bool(ev(n.x, ctx), 'NOT');
    case 'call': {
      if (n.fn === 'IF') {
        // avaliação preguiçosa: só o ramo escolhido é calculado (evita divisão por zero no outro)
        const c = bool(ev(n.args[0] as Node, ctx), 'IF');
        return ev((c ? n.args[1] : n.args[2]) as Node, ctx);
      }
      const vals = n.args.map((a) => ev(a, ctx));
      if (n.fn === 'COUNT') return vals.filter((v) => v !== null).length;
      if (n.fn === 'ABS') return Math.abs(num(vals[0] as Val, 'ABS'));
      if (n.fn === 'ROUND') {
        const casas = num(vals[1] as Val, 'ROUND');
        if (!Number.isInteger(casas) || casas < 0 || casas > 15) {
          throw new CalcError('ROUND exige um número inteiro de casas entre 0 e 15.');
        }
        return finito(arredondar(num(vals[0] as Val, 'ROUND'), casas));
      }
      const ns = vals.map((v) => num(v, n.fn));
      switch (n.fn) {
        case 'SUM': return finito(ns.reduce((s, x) => s + x, 0));
        case 'AVG': return finito(ns.reduce((s, x) => s + x, 0) / ns.length);
        case 'MIN': return Math.min(...ns);
        case 'MAX': return Math.max(...ns);
      }
      return 0;
    }
  }
}

/** Avalia a fórmula; o resultado final precisa ser numérico. Nunca lança: devolve Resultado. */
export function avaliar(ast: Node, ctx: EvalContext): Resultado {
  try {
    const v = ev(ast, ctx);
    if (typeof v === 'boolean') {
      return { kind: 'erro', mensagem: 'A fórmula resulta em verdadeiro/falso; use IF(condição, número, número) para obter um número.' };
    }
    return { kind: 'valor', valor: v === null ? 0 : v };
  } catch (e) {
    if (e instanceof UnavailableError) return { kind: 'indisponivel', motivo: e.message };
    if (e instanceof CalcError) return { kind: 'erro', mensagem: e.message };
    return { kind: 'erro', mensagem: 'Erro inesperado no cálculo.' };
  }
}
