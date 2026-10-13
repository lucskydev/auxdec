/** CSV RFC 4180: vírgula, CRLF, aspas duplicadas, UTF-8 com BOM (Excel reconhece acentos). */
const PERIGOSO = /^[=+\-@\t\r]/;

export function escaparCelula(valor: string | number | null | undefined, ehTexto = typeof valor === 'string'): string {
  if (valor === null || valor === undefined) return '';
  let s = String(valor);
  // Injeção de fórmula em planilhas: textos que começam com = + - @ ganham apóstrofo; números não são alterados.
  if (ehTexto && PERIGOSO.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function gerarCsv(cabecalho: string[], linhas: (string | number | null)[][]): string {
  const out = [cabecalho.map((c) => escaparCelula(c, true)).join(',')];
  for (const l of linhas) out.push(l.map((c) => escaparCelula(c)).join(','));
  return '﻿' + out.join('\r\n') + '\r\n';
}
