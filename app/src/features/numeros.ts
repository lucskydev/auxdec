/** Conversão de campos numéricos da interface (aceita vírgula ou ponto decimal; vazio = null). */
export type NumeroLido = { ok: true; valor: number | null } | { ok: false; erro: string };

export function lerNumero(texto: string): NumeroLido {
  const t = texto.trim();
  if (t === '') return { ok: true, valor: null };
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return { ok: false, erro: 'Informe um número válido (ex.: 1234,56).' };
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return { ok: false, erro: 'Número fora do intervalo permitido.' };
  return { ok: true, valor: n };
}

export function numeroParaTexto(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n).replace('.', ',');
}

/** Exibição: respeita casas decimais configuradas; vazio aparece como "—" (diferente de 0). */
export function formatarNumero(n: number | null | undefined, casas: number | null = null): string {
  if (n === null || n === undefined) return '—';
  return casas === null ? n.toLocaleString('pt-BR', { maximumFractionDigits: 10 }) : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Valida limites e restrições de um item numérico para um valor. Devolve mensagem de erro ou null. */
export function validarLimites(valor: number | null, min: number | null, max: number | null): string | null {
  if (valor === null) return null;
  if (min !== null && valor < min) return `O valor deve ser maior ou igual a ${formatarNumero(min)}.`;
  if (max !== null && valor > max) return `O valor deve ser menor ou igual a ${formatarNumero(max)}.`;
  return null;
}

export function urlSegura(texto: string): boolean {
  try {
    const u = new URL(texto.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
