import type {
  AgregadoComponente, DadosEscopo, Item, ItemAnalise, Modelo, ModeloValor, Produto, ProdutoValor, TipoItem,
} from './types';

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** Construtor de dados de teste: preenche o que não importa em cada teste. */
export class Fabrica {
  d: DadosEscopo = {
    escopo: { id: 'e', nome: 'Teste', descricao: null, ultimo_acesso: '', versao: 1 },
    itensModelo: [], itensProduto: [], modelos: [], produtos: [], imagens: [],
    modeloValores: [], produtoValores: [], itensAnalise: [], analiseRefs: [], agregadoComponentes: [],
    filtros: [], filtroCondicoes: [],
    config: { id: 'c', escopo_id: 'e', modo: 'ambos', logica_global: 'AND', agregado_ranking_id: null, colunas: {}, ordenacao: [], versao: 1 },
  };
  itemM(nome: string, tipo: TipoItem = 'numerico'): Item {
    const i: Item = { id: uid(), escopo_id: 'e', nome, descricao: null, tipo, unidade: null, casas_decimais: null, valor_min: null, valor_max: null, ordem: 0, versao: 1 };
    this.d.itensModelo.push(i);
    return i;
  }
  itemP(nome: string, tipo: TipoItem = 'numerico'): Item {
    const i: Item = { id: uid(), escopo_id: 'e', nome, descricao: null, tipo, unidade: null, casas_decimais: null, valor_min: null, valor_max: null, ordem: 0, versao: 1 };
    this.d.itensProduto.push(i);
    return i;
  }
  modelo(nome: string, valores: [Item, number | string | null][] = []): Modelo {
    const m: Modelo = { id: uid(), escopo_id: 'e', nome, descricao: null, versao: 1 };
    this.d.modelos.push(m);
    for (const [it, v] of valores) {
      const mv: ModeloValor = { modelo_id: m.id, item_modelo_id: it.id, tipo: it.tipo, valor_num: typeof v === 'number' ? v : null, valor_txt: typeof v === 'string' ? v : null, valor_img_id: null };
      this.d.modeloValores.push(mv);
    }
    return m;
  }
  produto(nome: string, modelo: Modelo | null, valores: [Item, number | string | null][] = []): Produto {
    const p: Produto = { id: uid(), escopo_id: 'e', nome, descricao: null, modelo_id: modelo?.id ?? null, versao: 1 };
    this.d.produtos.push(p);
    for (const [it, v] of valores) {
      const pv: ProdutoValor = { produto_id: p.id, item_produto_id: it.id, tipo: it.tipo, valor_num: typeof v === 'number' ? v : null, valor_txt: typeof v === 'string' ? v : null, valor_img_id: null };
      this.d.produtoValores.push(pv);
    }
    return p;
  }
  formula(nome: string, texto: string): ItemAnalise {
    const a: ItemAnalise = { id: uid(), escopo_id: 'e', nome, descricao: null, tipo: 'formula', formula_texto: texto, peso: null, versao: 1 };
    this.d.itensAnalise.push(a);
    return a;
  }
  agregado(nome: string, comps: Omit<AgregadoComponente, 'id' | 'agregado_id' | 'ordem' | 'item_modelo_id' | 'item_produto_id' | 'item_analise_id'>[] & { ref?: never }[] | unknown[], peso = 1): ItemAnalise {
    const a: ItemAnalise = { id: uid(), escopo_id: 'e', nome, descricao: null, tipo: 'agregado', formula_texto: null, peso, versao: 1 };
    this.d.itensAnalise.push(a);
    (comps as { ref: { kind: 'm' | 'p' | 'a'; id: string }; peso: number; direcao: 'maior' | 'menor'; lmin: number; lmax: number }[]).forEach((c, i) => {
      this.d.agregadoComponentes.push({
        id: uid(), agregado_id: a.id, ordem: i + 1, peso: c.peso, direcao: c.direcao, lmin: c.lmin, lmax: c.lmax,
        item_modelo_id: c.ref.kind === 'm' ? c.ref.id : null,
        item_produto_id: c.ref.kind === 'p' ? c.ref.id : null,
        item_analise_id: c.ref.kind === 'a' ? c.ref.id : null,
      });
    });
    return a;
  }
}

export const ref = (kind: 'm' | 'p' | 'a', id: string) => `[[${kind}:${id}]]`;
export const comp = (kind: 'm' | 'p' | 'a', id: string, peso: number, direcao: 'maior' | 'menor', lmin: number, lmax: number) => ({
  ref: { kind, id }, peso, direcao, lmin, lmax,
});
