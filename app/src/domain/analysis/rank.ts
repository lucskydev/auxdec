/** Classificação competitiva (1º, 1º, 3º). Igualdade pela precisão interna; sem pontuação = sem posição. */
export function classificar(itens: { key: string; pontuacao: number | null }[]): Map<string, number> {
  const validos = itens.filter((i): i is { key: string; pontuacao: number } => i.pontuacao !== null && Number.isFinite(i.pontuacao));
  validos.sort((a, b) => b.pontuacao - a.pontuacao);
  const out = new Map<string, number>();
  let posicao = 0;
  let anterior: number | null = null;
  validos.forEach((it, idx) => {
    if (anterior === null || it.pontuacao !== anterior) {
      posicao = idx + 1;
      anterior = it.pontuacao;
    }
    out.set(it.key, posicao);
  });
  return out;
}
