import { FormulaSyntaxError, tokenize, type Token } from './lexer';

/**
 * Gramática (precedência da menor para a maior):
 *   expr    := or
 *   or      := and ( OR and )*
 *   and     := not ( AND not )*
 *   not     := NOT not | cmp
 *   cmp     := add ( ('=' | '≠' | '<' | '>' | '≤' | '≥') add )?      (não associativa)
 *   add     := mul ( ('+' | '-') mul )*
 *   mul     := unary ( ('*' | '/') unary )*
 *   unary   := '-' unary | '+' unary | primary
 *   primary := número | referência | FUNÇÃO '(' args ')' | '(' expr ')'
 */
export type Node =
  | { t: 'num'; v: number; pos: number }
  | { t: 'ref'; kind: 'm' | 'p' | 'a'; id: string; pos: number }
  | { t: 'neg'; x: Node; pos: number }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; l: Node; r: Node; pos: number }
  | { t: 'cmp'; op: '=' | '≠' | '<' | '>' | '≤' | '≥'; l: Node; r: Node; pos: number }
  | { t: 'logic'; op: 'AND' | 'OR'; l: Node; r: Node; pos: number }
  | { t: 'not'; x: Node; pos: number }
  | { t: 'call'; fn: FnName; args: Node[]; pos: number };

export type FnName = 'SUM' | 'MIN' | 'MAX' | 'AVG' | 'ROUND' | 'ABS' | 'COUNT' | 'IF';

/** [mínimo, máximo] de argumentos (máximo Infinity = variádica). */
export const FUNCTIONS: Record<FnName, [number, number]> = {
  SUM: [1, Infinity],
  MIN: [1, Infinity],
  MAX: [1, Infinity],
  AVG: [1, Infinity],
  COUNT: [1, Infinity],
  ROUND: [2, 2],
  ABS: [1, 1],
  IF: [3, 3],
};

const MAX_DEPTH = 100;

class Parser {
  private i = 0;
  private depth = 0;
  constructor(private toks: Token[]) {}

  private peek(): Token {
    return this.toks[this.i] as Token;
  }
  private next(): Token {
    return this.toks[this.i++] as Token;
  }
  private isKeyword(name: string): boolean {
    const t = this.peek();
    return t.type === 'ident' && t.text.toUpperCase() === name;
  }

  parse(): Node {
    const n = this.or();
    const t = this.peek();
    if (t.type !== 'eof') {
      throw new FormulaSyntaxError(
        t.type === 'rparen' ? 'Parêntese de fechamento sem abertura.' : `Trecho inesperado "${t.text}".`,
        t.pos,
      );
    }
    return n;
  }

  private enter(pos: number) {
    if (++this.depth > MAX_DEPTH) throw new FormulaSyntaxError('Expressão aninhada demais.', pos);
  }
  private leave() {
    this.depth--;
  }

  private or(): Node {
    let l = this.and();
    while (this.isKeyword('OR')) {
      const t = this.next();
      l = { t: 'logic', op: 'OR', l, r: this.and(), pos: t.pos };
    }
    return l;
  }
  private and(): Node {
    let l = this.not();
    while (this.isKeyword('AND')) {
      const t = this.next();
      l = { t: 'logic', op: 'AND', l, r: this.not(), pos: t.pos };
    }
    return l;
  }
  private not(): Node {
    if (this.isKeyword('NOT')) {
      const t = this.next();
      this.enter(t.pos);
      const x = this.not();
      this.leave();
      return { t: 'not', x, pos: t.pos };
    }
    return this.cmp();
  }
  private cmp(): Node {
    const l = this.add();
    const t = this.peek();
    if (t.type === 'op' && ['=', '≠', '<', '>', '≤', '≥'].includes(t.text)) {
      this.next();
      const r = this.add();
      const after = this.peek();
      if (after.type === 'op' && ['=', '≠', '<', '>', '≤', '≥'].includes(after.text)) {
        throw new FormulaSyntaxError('Comparações não podem ser encadeadas; combine-as com AND ou OR.', after.pos);
      }
      return { t: 'cmp', op: t.text as '=', l, r, pos: t.pos };
    }
    return l;
  }
  private add(): Node {
    let l = this.mul();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.text === '+' || t.text === '-')) {
        this.next();
        l = { t: 'bin', op: t.text, l, r: this.mul(), pos: t.pos };
      } else return l;
    }
  }
  private mul(): Node {
    let l = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.text === '*' || t.text === '/')) {
        this.next();
        l = { t: 'bin', op: t.text, l, r: this.unary(), pos: t.pos };
      } else return l;
    }
  }
  private unary(): Node {
    const t = this.peek();
    if (t.type === 'op' && (t.text === '-' || t.text === '+')) {
      this.next();
      this.enter(t.pos);
      const x = this.unary();
      this.leave();
      return t.text === '-' ? { t: 'neg', x, pos: t.pos } : x;
    }
    return this.primary();
  }
  private primary(): Node {
    const t = this.next();
    switch (t.type) {
      case 'num':
        return { t: 'num', v: t.num as number, pos: t.pos };
      case 'ref':
        return { t: 'ref', kind: t.kind as 'm', id: t.id as string, pos: t.pos };
      case 'lparen': {
        this.enter(t.pos);
        const e = this.or();
        this.leave();
        const close = this.next();
        if (close.type !== 'rparen') throw new FormulaSyntaxError('Faltou fechar o parêntese.', close.pos);
        return e;
      }
      case 'ident': {
        const name = t.text.toUpperCase();
        if (!(name in FUNCTIONS)) {
          throw new FormulaSyntaxError(
            ['AND', 'OR', 'NOT'].includes(name)
              ? `"${t.text}" está em posição inválida.`
              : `Função desconhecida "${t.text}". Permitidas: ${Object.keys(FUNCTIONS).join(', ')}.`,
            t.pos,
          );
        }
        const open = this.next();
        if (open.type !== 'lparen') throw new FormulaSyntaxError(`Use parênteses após ${name}.`, open.pos);
        this.enter(t.pos);
        const args: Node[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.or());
          while (this.peek().type === 'comma') {
            this.next();
            args.push(this.or());
          }
        }
        const close = this.next();
        this.leave();
        if (close.type !== 'rparen') throw new FormulaSyntaxError(`Faltou fechar o parêntese de ${name}.`, close.pos);
        const [min, max] = FUNCTIONS[name as FnName];
        if (args.length < min || args.length > max) {
          throw new FormulaSyntaxError(
            min === max
              ? `${name} exige exatamente ${min} argumento(s); recebeu ${args.length}.`
              : `${name} exige ao menos ${min} argumento(s); recebeu ${args.length}.`,
            t.pos,
          );
        }
        return { t: 'call', fn: name as FnName, args, pos: t.pos };
      }
      case 'eof':
        throw new FormulaSyntaxError('A expressão terminou antes do esperado.', t.pos);
      default:
        throw new FormulaSyntaxError(`Trecho inesperado "${t.text}".`, t.pos);
    }
  }
}

export function parseFormula(src: string): Node {
  if (src.trim() === '') throw new FormulaSyntaxError('A fórmula não pode ser vazia.', 0);
  return new Parser(tokenize(src)).parse();
}

/** Referências usadas pela fórmula, sem repetição. */
export function collectRefs(node: Node, acc: Map<string, { kind: 'm' | 'p' | 'a'; id: string }> = new Map()) {
  switch (node.t) {
    case 'ref':
      acc.set(`${node.kind}:${node.id}`, { kind: node.kind, id: node.id });
      break;
    case 'neg':
    case 'not':
      collectRefs(node.x, acc);
      break;
    case 'bin':
    case 'cmp':
    case 'logic':
      collectRefs(node.l, acc);
      collectRefs(node.r, acc);
      break;
    case 'call':
      node.args.forEach((a) => collectRefs(a, acc));
      break;
    default:
  }
  return [...acc.values()];
}
