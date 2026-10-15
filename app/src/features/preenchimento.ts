import type { Item } from '../domain/types';
import { lerNumero, validarLimites } from './numeros';

export interface CampoPreenchido { texto: string }
export type ResultadoPreenchimento =
  | { ok: true; nome: string; descricao: string; valores: Record<string, CampoPreenchido> }
  | { ok: false; erros: string[] };

/** Rótulos dos campos na ordem em que a linha é lida (a mesma ordem do formulário). */
export function camposDaLinha(itens: Item[]): string[] {
  return ['Nome', 'Descrição', ...itens.map((i) => i.nome)];
}

/**
 * Interpreta uma linha com campos separados por ";" na ordem do formulário:
 * Nome; Descrição; <um campo por item, na ordem dos itens>.
 * ";;" (ou campo só com espaços) deixa o campo em branco. Campos que faltarem no fim ficam em branco.
 * Item em branco = item não incluído no modelo. Não há caractere de escape: o texto não pode conter ";".
 * Se houver qualquer erro, nada é aplicado.
 */
export function interpretarLinha(linha: string, itens: Item[]): ResultadoPreenchimento {
  const partes = linha.replace(/\r?\n/g, ' ').split(';').map((p) => p.trim());
  const nomes = camposDaLinha(itens);
  const erros: string[] = [];
  const sobra = partes.slice(nomes.length);
  if (sobra.some((p) => p !== '')) {
    erros.push(`A linha tem ${partes.length} campos, mas o formulário tem ${nomes.length} (${nomes.join('; ')}).`);
  }
  const valores: Record<string, CampoPreenchido> = {};
  itens.forEach((item, idx) => {
    const t = partes[idx + 2] ?? '';
    if (t === '') { valores[item.id] = { texto: '' }; return; }
    if (item.tipo === 'imagem') { erros.push(`"${item.nome}" é uma imagem e não pode ser preenchida por texto; deixe o campo em branco.`); return; }
    if (item.tipo === 'numerico') {
      const n = lerNumero(t);
      if (!n.ok) { erros.push(`"${item.nome}": ${n.erro}`); return; }
      const lim = validarLimites(n.valor, item.valor_min, item.valor_max);
      if (lim) { erros.push(`"${item.nome}": ${lim}`); return; }
    } else if (t.length > 2000) {
      erros.push(`"${item.nome}": texto muito longo (máximo 2000 caracteres).`);
      return;
    }
    valores[item.id] = { texto: t };
  });
  if (erros.length) return { ok: false, erros };
  return { ok: true, nome: partes[0] ?? '', descricao: partes[1] ?? '', valores };
}
