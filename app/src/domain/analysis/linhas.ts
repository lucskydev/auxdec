import type { DadosEscopo, ValorBase } from '../types';

/** Linha da análise: um modelo OU um produto. Valores por chave "m:<itemId>" / "p:<itemId>". */
export interface Linha {
  key: string; // "modelo:<id>" | "produto:<id>"
  kind: 'modelo' | 'produto';
  id: string;
  nome: string;
  modeloId: string | null;
  valores: Map<string, ValorBase>;
}

/** Herança dinâmica: valores do modelo são lidos do modelo, nunca copiados para o produto. */
export function montarLinhas(d: DadosEscopo): Linha[] {
  const porModelo = new Map<string, Map<string, ValorBase>>();
  for (const mv of d.modeloValores) {
    let m = porModelo.get(mv.modelo_id);
    if (!m) porModelo.set(mv.modelo_id, (m = new Map()));
    m.set(`m:${mv.item_modelo_id}`, mv);
  }
  const porProduto = new Map<string, Map<string, ValorBase>>();
  for (const pv of d.produtoValores) {
    let m = porProduto.get(pv.produto_id);
    if (!m) porProduto.set(pv.produto_id, (m = new Map()));
    m.set(`p:${pv.item_produto_id}`, pv);
  }
  const linhas: Linha[] = [];
  for (const m of d.modelos) {
    linhas.push({ key: `modelo:${m.id}`, kind: 'modelo', id: m.id, nome: m.nome, modeloId: null, valores: new Map(porModelo.get(m.id) ?? []) });
  }
  for (const p of d.produtos) {
    const valores = new Map<string, ValorBase>(p.modelo_id ? (porModelo.get(p.modelo_id) ?? []) : []);
    for (const [k, v] of porProduto.get(p.id) ?? []) valores.set(k, v);
    linhas.push({ key: `produto:${p.id}`, kind: 'produto', id: p.id, nome: p.nome, modeloId: p.modelo_id, valores });
  }
  return linhas;
}
