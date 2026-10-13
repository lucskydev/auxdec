import { chaveNome } from './names';
import type { DadosEscopo } from './types';

export interface ConflitoNome {
  nome: string;
  itemModeloId: string;
  itemProdutoId: string;
}

/**
 * Conflitos entre itens herdados do modelo e itens próprios do produto (regra 5.3 / D1).
 * `itensProprios` = ids de itens de produto que o produto possui (ou possuirá).
 */
export function conflitosDeNomes(d: DadosEscopo, modeloId: string | null, itensProprios: Iterable<string>): ConflitoNome[] {
  if (!modeloId) return [];
  const herdados = new Map<string, string>(); // chave de nome -> item de modelo
  const idsMod = new Set(d.modeloValores.filter((v) => v.modelo_id === modeloId).map((v) => v.item_modelo_id));
  for (const im of d.itensModelo) if (idsMod.has(im.id)) herdados.set(chaveNome(im.nome), im.id);
  const out: ConflitoNome[] = [];
  const porId = new Map(d.itensProduto.map((i) => [i.id, i]));
  for (const id of itensProprios) {
    const ip = porId.get(id);
    if (!ip) continue;
    const m = herdados.get(chaveNome(ip.nome));
    if (m) out.push({ nome: ip.nome, itemModeloId: m, itemProdutoId: ip.id });
  }
  return out;
}

/** Conflitos que surgiriam ao ACRESCENTAR itens a um modelo que já tem produtos associados. */
export function conflitosAoAcrescentarNoModelo(d: DadosEscopo, modeloId: string, novosItensModelo: Iterable<string>): { produtoId: string; nome: string }[] {
  const out: { produtoId: string; nome: string }[] = [];
  const nomesNovos = new Map<string, string>();
  const itens = new Map(d.itensModelo.map((i) => [i.id, i]));
  for (const id of novosItensModelo) {
    const it = itens.get(id);
    if (it) nomesNovos.set(chaveNome(it.nome), it.nome);
  }
  for (const p of d.produtos.filter((x) => x.modelo_id === modeloId)) {
    for (const pv of d.produtoValores.filter((v) => v.produto_id === p.id)) {
      const ip = d.itensProduto.find((i) => i.id === pv.item_produto_id);
      if (ip && nomesNovos.has(chaveNome(ip.nome))) out.push({ produtoId: p.id, nome: ip.nome });
    }
  }
  return out;
}
