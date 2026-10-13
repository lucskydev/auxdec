/** Analisador léxico das fórmulas. A forma armazenada referencia itens por id: [[m:<uuid>]] etc. */
export type TokenType =
  | 'num' | 'ref' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';

export interface Token {
  type: TokenType;
  text: string;
  pos: number;
  /** para 'num' */
  num?: number;
  /** para 'ref' */
  kind?: 'm' | 'p' | 'a';
  id?: string;
}

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
    this.name = 'FormulaSyntaxError';
  }
}

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const REF_RE = new RegExp(`^\\[\\[(m|p|a):(${UUID})\\]\\]`);
const NUM_RE = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;
const IDENT_RE = /^[A-Za-z_][A-Za-z_0-9]*/;

export const MAX_FORMULA_LENGTH = 2000;

export function tokenize(src: string): Token[] {
  if (src.length > MAX_FORMULA_LENGTH) {
    throw new FormulaSyntaxError(`A fórmula excede ${MAX_FORMULA_LENGTH} caracteres.`, 0);
  }
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '[') {
      const m = REF_RE.exec(rest);
      if (!m) throw new FormulaSyntaxError('Referência malformada. Use a lista "Inserir item" para referenciar itens.', i);
      out.push({ type: 'ref', text: m[0], pos: i, kind: m[1] as 'm' | 'p' | 'a', id: (m[2] as string).toLowerCase() });
      i += m[0].length;
      continue;
    }
    const n = NUM_RE.exec(rest);
    if (n) {
      const value = Number(n[0]);
      if (!Number.isFinite(value)) throw new FormulaSyntaxError('Número fora do intervalo permitido.', i);
      out.push({ type: 'num', text: n[0], pos: i, num: value });
      i += n[0].length;
      continue;
    }
    const id = IDENT_RE.exec(rest);
    if (id) {
      out.push({ type: 'ident', text: id[0], pos: i });
      i += id[0].length;
      continue;
    }
    // operadores de dois caracteres primeiro
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>' || two === '!=') {
      out.push({ type: 'op', text: two === '<>' || two === '!=' ? '≠' : two === '<=' ? '≤' : '≥', pos: i });
      i += 2;
      continue;
    }
    if ('+-*/=<>≠≤≥'.includes(c)) {
      out.push({ type: 'op', text: c, pos: i });
      i++;
      continue;
    }
    if (c === '(') out.push({ type: 'lparen', text: c, pos: i });
    else if (c === ')') out.push({ type: 'rparen', text: c, pos: i });
    else if (c === ',') out.push({ type: 'comma', text: c, pos: i });
    else throw new FormulaSyntaxError(`Caractere não permitido: "${c}".`, i);
    i++;
  }
  out.push({ type: 'eof', text: '', pos: src.length });
  return out;
}
