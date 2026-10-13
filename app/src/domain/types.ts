/** Tipos de domínio espelhando as tabelas v2_ (nomes de campos iguais aos do banco). */
export type TipoItem = 'numerico' | 'textual' | 'imagem';
export type RefKind = 'm' | 'p' | 'a'; // item de modelo, item de produto, item de análise

export interface Escopo {
  id: string;
  nome: string;
  descricao: string | null;
  ultimo_acesso: string;
  versao: number;
}

export interface Item {
  id: string;
  escopo_id: string;
  nome: string;
  descricao: string | null;
  tipo: TipoItem;
  unidade: string | null;
  casas_decimais: number | null;
  valor_min: number | null;
  valor_max: number | null;
  versao: number;
}
export type ItemModelo = Item;
export type ItemProduto = Item;

export interface Modelo {
  id: string;
  escopo_id: string;
  nome: string;
  descricao: string | null;
  versao: number;
}
export interface Produto extends Modelo {
  modelo_id: string | null;
}

/** Valor de um item (a existência da linha em modelo_valores significa "o item pertence ao modelo"). */
export interface ValorBase {
  tipo: TipoItem;
  valor_num: number | null;
  valor_txt: string | null;
  valor_img_id: string | null;
}
export interface ModeloValor extends ValorBase {
  modelo_id: string;
  item_modelo_id: string;
}
export interface ProdutoValor extends ValorBase {
  produto_id: string;
  item_produto_id: string;
}

export interface Imagem {
  id: string;
  escopo_id: string;
  storage_path: string;
  largura: number;
  altura: number;
  bytes: number;
  mime: string;
}

export type TipoAnalise = 'formula' | 'agregado';
export interface ItemAnalise {
  id: string;
  escopo_id: string;
  nome: string;
  descricao: string | null;
  tipo: TipoAnalise;
  formula_texto: string | null;
  peso: number | null;
  versao: number;
}

export interface RefIds {
  item_modelo_id: string | null;
  item_produto_id: string | null;
  item_analise_id: string | null;
}
export interface AnaliseRef extends RefIds {
  id: string;
  analise_id: string;
}

export type Direcao = 'maior' | 'menor';
export interface AgregadoComponente extends RefIds {
  id: string;
  agregado_id: string;
  ordem: number;
  peso: number;
  direcao: Direcao;
  lmin: number;
  lmax: number;
}

export type Operador = 'eq' | 'ne' | 'lt' | 'gt' | 'le' | 'ge';
export type Logica = 'AND' | 'OR';
export interface Filtro {
  id: string;
  escopo_id: string;
  nome: string;
  descricao: string | null;
  logica: Logica;
  versao: number;
}
export interface FiltroCondicao extends RefIds {
  id: string;
  filtro_id: string;
  ordem: number;
  operador: Operador;
  valor_num: number | null;
  valor_txt: string | null;
}

export type ModoAnalise = 'modelos' | 'produtos' | 'ambos' | 'itens_analise';
export interface ConfigAnalise {
  id: string;
  escopo_id: string;
  modo: ModoAnalise;
  logica_global: Logica;
  agregado_ranking_id: string | null;
  colunas: ColunasConfig;
  ordenacao: OrdenacaoItem[];
  versao: number;
}

/** Chave de coluna: "m:<id>", "p:<id>", "a:<id>" ou colunas fixas "nome", "tipo", "ranking". */
export type ColKey = string;
export interface ColunasConfig {
  visiveis?: ColKey[]; // ordem = ordem de exibição
  fixadas?: ColKey[];
  larguras?: Record<ColKey, number>;
}
export interface OrdenacaoItem {
  col: ColKey;
  dir: 'asc' | 'desc';
}

/** Tudo o que pertence a um escopo, já carregado. */
export interface DadosEscopo {
  escopo: Escopo;
  itensModelo: ItemModelo[];
  itensProduto: ItemProduto[];
  modelos: Modelo[];
  produtos: Produto[];
  imagens: Imagem[];
  modeloValores: ModeloValor[];
  produtoValores: ProdutoValor[];
  itensAnalise: ItemAnalise[];
  analiseRefs: AnaliseRef[];
  agregadoComponentes: AgregadoComponente[];
  filtros: Filtro[];
  filtroCondicoes: FiltroCondicao[];
  config: ConfigAnalise;
}
