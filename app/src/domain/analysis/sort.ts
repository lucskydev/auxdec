import type { OrdenacaoItem } from '../types';

export type Celula = { kind: 'num'; v: number } | { kind: 'txt'; v: string } | { kind: 'vazio' };

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Vazios, erros e indisponíveis ficam sempre por último, em qualquer direção. */
export function compararCelulas(a: Celula, b: Celula, dir: 'asc' | 'desc'): number {
  if (a.kind === 'vazio' && b.kind === 'vazio') return 0;
  if (a.kind === 'vazio') return 1;
  if (b.kind === 'vazio') return -1;
  let r: number;
  if (a.kind === 'num' && b.kind === 'num') r = a.v - b.v;
  else if (a.kind === 'txt' && b.kind === 'txt') r = collator.compare(a.v, b.v);
  else r = a.kind === 'num' ? -1 : 1; // números antes de textos
  return dir === 'asc' ? r : -r;
}

/** Ordenação estável por múltiplas colunas; a ordem do vetor é a prioridade. */
export function ordenar<T>(linhas: T[], ordenacao: OrdenacaoItem[], celula: (l: T, col: string) => Celula): T[] {
  if (ordenacao.length === 0) return linhas;
  const comIndice = linhas.map((l, i) => ({ l, i }));
  comIndice.sort((x, y) => {
    for (const o of ordenacao) {
      const r = compararCelulas(celula(x.l, o.col), celula(y.l, o.col), o.dir);
      if (r !== 0) return r;
    }
    return x.i - y.i;
  });
  return comIndice.map((x) => x.l);
}
