import type { DadosEscopo } from './types';
import type { Catalogo } from './formula/validate';
import type { NomesCatalogo } from './formula/display';
import { chaveNome } from './names';

/** Dependências diretas de cada item de análise (fórmulas e componentes de agregado). */
export function dependenciasDiretas(d: DadosEscopo, id: string): string[] {
  const out = new Set<string>();
  for (const r of d.analiseRefs) if (r.analise_id === id && r.item_analise_id) out.add(r.item_analise_id);
  for (const c of d.agregadoComponentes) if (c.agregado_id === id && c.item_analise_id) out.add(c.item_analise_id);
  return [...out];
}

export function catalogoDe(d: DadosEscopo, ignorarId: string | null = null): Catalogo {
  const m = new Map(d.itensModelo.map((i) => [i.id, i.tipo]));
  const p = new Map(d.itensProduto.map((i) => [i.id, i.tipo]));
  const a = new Set(d.itensAnalise.map((i) => i.id));
  return {
    tipoItem: (kind, id) => (kind === 'm' ? m : p).get(id),
    existeAnalise: (id) => a.has(id),
    // o item em edição usa as dependências novas, não as gravadas
    dependenciasAnalise: (id) => (id === ignorarId ? [] : dependenciasDiretas(d, id)),
  };
}

export function nomesDe(d: DadosEscopo): NomesCatalogo {
  const lista = (kind: 'm' | 'p' | 'a') => (kind === 'm' ? d.itensModelo : kind === 'p' ? d.itensProduto : d.itensAnalise);
  return {
    nome: (kind, id) => lista(kind).find((i) => i.id === id)?.nome,
    idPorNome: (kind, nome) => lista(kind).find((i) => chaveNome(i.nome) === chaveNome(nome))?.id,
  };
}
