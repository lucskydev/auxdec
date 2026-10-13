import type { DadosEscopo } from './types';

export interface Dependencia {
  tipo: 'modelo' | 'produto' | 'formula' | 'agregado' | 'filtro' | 'ranking' | 'item';
  nome: string;
  id: string;
}

const dedup = (l: Dependencia[]) => {
  const vistos = new Set<string>();
  return l.filter((d) => (vistos.has(d.tipo + d.id) ? false : (vistos.add(d.tipo + d.id), true)));
};

function usosEmAnalise(d: DadosEscopo, campo: 'item_modelo_id' | 'item_produto_id' | 'item_analise_id', id: string): Dependencia[] {
  const out: Dependencia[] = [];
  const analises = new Map(d.itensAnalise.map((a) => [a.id, a]));
  for (const r of d.analiseRefs) if (r[campo] === id) out.push({ tipo: 'formula', id: r.analise_id, nome: analises.get(r.analise_id)?.nome ?? '?' });
  for (const c of d.agregadoComponentes) if (c[campo] === id) out.push({ tipo: 'agregado', id: c.agregado_id, nome: analises.get(c.agregado_id)?.nome ?? '?' });
  const filtros = new Map(d.filtros.map((f) => [f.id, f]));
  for (const c of d.filtroCondicoes) if (c[campo] === id) out.push({ tipo: 'filtro', id: c.filtro_id, nome: filtros.get(c.filtro_id)?.nome ?? '?' });
  return out;
}

/** Quem impede a exclusão da DEFINIÇÃO de um item de modelo (o banco também bloqueia). */
export function dependenciasItemModelo(d: DadosEscopo, id: string): Dependencia[] {
  const modelos = new Map(d.modelos.map((m) => [m.id, m]));
  const out: Dependencia[] = d.modeloValores
    .filter((v) => v.item_modelo_id === id)
    .map((v) => ({ tipo: 'modelo' as const, id: v.modelo_id, nome: modelos.get(v.modelo_id)?.nome ?? '?' }));
  return dedup([...out, ...usosEmAnalise(d, 'item_modelo_id', id)]);
}

export function dependenciasItemProduto(d: DadosEscopo, id: string): Dependencia[] {
  const produtos = new Map(d.produtos.map((p) => [p.id, p]));
  const out: Dependencia[] = d.produtoValores
    .filter((v) => v.item_produto_id === id)
    .map((v) => ({ tipo: 'produto' as const, id: v.produto_id, nome: produtos.get(v.produto_id)?.nome ?? '?' }));
  return dedup([...out, ...usosEmAnalise(d, 'item_produto_id', id)]);
}

/** Itens de análise que referenciam este, filtros que o usam e o ranking que o define. Os componentes próprios não contam. */
export function dependenciasItemAnalise(d: DadosEscopo, id: string): Dependencia[] {
  const out = usosEmAnalise(d, 'item_analise_id', id).filter((x) => x.id !== id);
  if (d.config.agregado_ranking_id === id) out.push({ tipo: 'ranking', id, nome: 'Ranking da análise' });
  return dedup(out);
}

export function produtosDoModelo(d: DadosEscopo, modeloId: string) {
  return d.produtos.filter((p) => p.modelo_id === modeloId);
}

/** Impacto de remover um item de um modelo (D6): produtos afetados e análises que o usam. */
export function impactoRemoverItemDoModelo(d: DadosEscopo, modeloId: string, itemId: string) {
  return {
    produtos: produtosDoModelo(d, modeloId),
    analises: usosEmAnalise(d, 'item_modelo_id', itemId),
  };
}
