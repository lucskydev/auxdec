import type { DadosEscopo, Item } from '../domain/types';

export const ESCOPO_ID = 'e1';

export function itemFalso(p: Partial<Item> & { id: string; nome: string }): Item {
  return { escopo_id: ESCOPO_ID, descricao: null, tipo: 'numerico', unidade: null, casas_decimais: null, valor_min: null, valor_max: null, ordem: 0, versao: 1, ...p };
}

export function dadosFalsos(p: Partial<DadosEscopo> = {}): DadosEscopo {
  return {
    escopo: { id: ESCOPO_ID, nome: 'Veículos', descricao: null, ultimo_acesso: '2026-01-01T00:00:00Z', versao: 1 },
    itensModelo: [], itensProduto: [], modelos: [], produtos: [], imagens: [],
    modeloValores: [], produtoValores: [], itensAnalise: [], analiseRefs: [], agregadoComponentes: [],
    filtros: [], filtroCondicoes: [],
    config: { modo: 'ambos', logica_global: 'AND', agregado_ranking_id: null, colunas: {}, ordenacao: [], versao: 1 } as unknown as DadosEscopo['config'],
    ...p,
  };
}
