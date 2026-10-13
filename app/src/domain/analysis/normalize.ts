export type Direcao = 'maior' | 'menor';

export class LimitesInvalidos extends Error {}

/** Pontuação 0–10 com saturação. Lmin e Lmax devem ser finitos e diferentes. Sem arredondamento. */
export function normalizar(valor: number, lmin: number, lmax: number, direcao: Direcao): number {
  if (!Number.isFinite(lmin) || !Number.isFinite(lmax) || lmin === lmax) {
    throw new LimitesInvalidos('Os limites de normalização devem ser números diferentes.');
  }
  const bruto = direcao === 'maior' ? (10 * (valor - lmin)) / (lmax - lmin) : (10 * (lmax - valor)) / (lmax - lmin);
  return Math.min(10, Math.max(0, bruto));
}

/** Média ponderada; itens sem pontuação já devem ter sido excluídos pelo chamador. */
export function mediaPonderada(itens: { peso: number; pontuacao: number }[]): number | null {
  if (itens.length === 0) return null;
  let soma = 0;
  let pesos = 0;
  for (const i of itens) {
    soma += i.peso * i.pontuacao;
    pesos += i.peso;
  }
  return soma / pesos;
}
