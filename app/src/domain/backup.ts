import { chaveNome } from './names';
import { alcanca, validarFormula, type Catalogo } from './formula/validate';
import type { ColunasConfig, DadosEscopo, Direcao, Logica, ModoAnalise, Operador, OrdenacaoItem, TipoItem } from './types';

export const FORMATO = 'auxdec-backup';
export const VERSAO_FORMATO = 1;

export interface BValor { item_id: string; valor_num: number | null; valor_txt: string | null; valor_img_id: string | null }
export interface BItem { id: string; nome: string; descricao: string | null; tipo: TipoItem; unidade: string | null; casas_decimais: number | null; valor_min: number | null; valor_max: number | null }
export interface BImagem { id: string; arquivo: string; largura: number; altura: number; bytes: number; mime: string }
export interface BComponente { ordem: number; peso: number; direcao: Direcao; lmin: number; lmax: number; item_modelo_id: string | null; item_produto_id: string | null; item_analise_id: string | null }
export interface BCondicao { ordem: number; item_modelo_id: string | null; item_produto_id: string | null; item_analise_id: string | null; operador: Operador; valor_num: number | null; valor_txt: string | null }

export interface Backup {
  formato: typeof FORMATO;
  versao_formato: number;
  exportado_em: string;
  escopo: { nome: string; descricao: string | null };
  itens_modelo: BItem[];
  itens_produto: BItem[];
  modelos: { id: string; nome: string; descricao: string | null; valores: BValor[] }[];
  produtos: { id: string; nome: string; descricao: string | null; modelo_id: string | null; valores: BValor[] }[];
  imagens: BImagem[];
  itens_analise: { id: string; nome: string; descricao: string | null; tipo: 'formula' | 'agregado'; formula_texto: string | null; peso: number | null; componentes: BComponente[] }[];
  filtros: { id: string; nome: string; descricao: string | null; logica: Logica; condicoes: BCondicao[] }[];
  config: { modo: ModoAnalise; logica_global: Logica; agregado_ranking_id: string | null; colunas: ColunasConfig; ordenacao: OrdenacaoItem[] };
}

const extensao = (mime: string) => (mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp');

/** Gera o conteúdo do backup (sem as imagens binárias, que vão ao lado no .zip). Nunca inclui user_id nem segredos. */
export function montarBackup(d: DadosEscopo, agora = new Date()): Backup {
  const item = (i: DadosEscopo['itensModelo'][number]): BItem => ({
    id: i.id, nome: i.nome, descricao: i.descricao, tipo: i.tipo, unidade: i.unidade,
    casas_decimais: i.casas_decimais, valor_min: i.valor_min, valor_max: i.valor_max,
  });
  const val = (v: { valor_num: number | null; valor_txt: string | null; valor_img_id: string | null }, item_id: string): BValor => ({
    item_id, valor_num: v.valor_num, valor_txt: v.valor_txt, valor_img_id: v.valor_img_id,
  });
  return {
    formato: FORMATO,
    versao_formato: VERSAO_FORMATO,
    exportado_em: agora.toISOString(),
    escopo: { nome: d.escopo.nome, descricao: d.escopo.descricao },
    itens_modelo: d.itensModelo.map(item),
    itens_produto: d.itensProduto.map(item),
    modelos: d.modelos.map((m) => ({
      id: m.id, nome: m.nome, descricao: m.descricao,
      valores: d.modeloValores.filter((v) => v.modelo_id === m.id).map((v) => val(v, v.item_modelo_id)),
    })),
    produtos: d.produtos.map((p) => ({
      id: p.id, nome: p.nome, descricao: p.descricao, modelo_id: p.modelo_id,
      valores: d.produtoValores.filter((v) => v.produto_id === p.id).map((v) => val(v, v.item_produto_id)),
    })),
    imagens: d.imagens.map((i) => ({ id: i.id, arquivo: `imagens/${i.id}.${extensao(i.mime)}`, largura: i.largura, altura: i.altura, bytes: i.bytes, mime: i.mime })),
    itens_analise: d.itensAnalise.map((a) => ({
      id: a.id, nome: a.nome, descricao: a.descricao, tipo: a.tipo, formula_texto: a.formula_texto, peso: a.peso,
      componentes: d.agregadoComponentes.filter((c) => c.agregado_id === a.id).sort((x, y) => x.ordem - y.ordem).map((c) => ({
        ordem: c.ordem, peso: c.peso, direcao: c.direcao, lmin: c.lmin, lmax: c.lmax,
        item_modelo_id: c.item_modelo_id, item_produto_id: c.item_produto_id, item_analise_id: c.item_analise_id,
      })),
    })),
    filtros: d.filtros.map((f) => ({
      id: f.id, nome: f.nome, descricao: f.descricao, logica: f.logica,
      condicoes: d.filtroCondicoes.filter((c) => c.filtro_id === f.id).sort((x, y) => x.ordem - y.ordem).map((c) => ({
        ordem: c.ordem, item_modelo_id: c.item_modelo_id, item_produto_id: c.item_produto_id, item_analise_id: c.item_analise_id,
        operador: c.operador, valor_num: c.valor_num, valor_txt: c.valor_txt,
      })),
    })),
    config: {
      modo: d.config.modo, logica_global: d.config.logica_global, agregado_ranking_id: d.config.agregado_ranking_id,
      colunas: d.config.colunas, ordenacao: d.config.ordenacao,
    },
  };
}

export interface ResultadoValidacao {
  ok: boolean;
  erros: string[];
  resumo: { itensModelo: number; itensProduto: number; modelos: number; produtos: number; itensAnalise: number; filtros: number; imagens: number } | null;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNumOuNull = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));
const isStrOuNull = (x: unknown) => x === null || typeof x === 'string';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida um backup lido de arquivo (dado não confiável). Não altera nada.
 * Cobre: formato/versão, formas, ids únicos, nomes únicos, referências, tipos, fórmulas, ciclos, agregados, filtros e configuração.
 */
export function validarBackup(raw: unknown): ResultadoValidacao {
  const erros: string[] = [];
  const falha = (m: string) => {
    if (erros.length < 50) erros.push(m);
  };
  if (!isObj(raw)) return { ok: false, erros: ['O arquivo não contém um objeto JSON válido.'], resumo: null };
  if (raw.formato !== FORMATO) return { ok: false, erros: [`Formato desconhecido (esperado "${FORMATO}").`], resumo: null };
  if (raw.versao_formato !== VERSAO_FORMATO) {
    return { ok: false, erros: [`Versão do formato não suportada: ${String(raw.versao_formato)} (suportada: ${VERSAO_FORMATO}).`], resumo: null };
  }
  const arr = (k: string): unknown[] => {
    const v = raw[k];
    if (!Array.isArray(v)) {
      falha(`Campo "${k}" ausente ou inválido.`);
      return [];
    }
    return v;
  };
  const esc = raw.escopo;
  if (!isObj(esc) || !isStr(esc.nome) || esc.nome.trim() === '' || !isStrOuNull(esc.descricao)) falha('Dados do escopo ausentes ou inválidos.');

  // ------ itens
  const lerItens = (k: 'itens_modelo' | 'itens_produto') => {
    const mapa = new Map<string, BItem>();
    const nomes = new Set<string>();
    for (const x of arr(k)) {
      if (!isObj(x) || !isStr(x.id) || !isStr(x.nome) || !['numerico', 'textual', 'imagem'].includes(x.tipo as string)) {
        falha(`${k}: registro inválido.`);
        continue;
      }
      if (!UUID_RE.test(x.id)) falha(`${k}: identificador inválido "${x.id}".`);
      if (mapa.has(x.id)) falha(`${k}: identificador repetido "${x.id}".`);
      if (x.nome.trim() === '') falha(`${k}: nome vazio.`);
      if (nomes.has(chaveNome(x.nome))) falha(`${k}: nome duplicado "${x.nome}".`);
      nomes.add(chaveNome(x.nome));
      if (![x.valor_min, x.valor_max, x.casas_decimais].every(isNumOuNull) || !isStrOuNull(x.unidade) || !isStrOuNull(x.descricao)) falha(`${k} "${x.nome}": campos numéricos ou de texto inválidos.`);
      const min = x.valor_min as number | null;
      const max = x.valor_max as number | null;
      if (min !== null && max !== null && min > max) falha(`${k} "${x.nome}": mínimo maior que o máximo.`);
      if (x.tipo !== 'numerico' && (min !== null || max !== null || x.unidade || x.casas_decimais !== null)) falha(`${k} "${x.nome}": unidade, casas e limites só existem em itens numéricos.`);
      const cd = x.casas_decimais as number | null;
      if (cd !== null && (!Number.isInteger(cd) || cd < 0 || cd > 10)) falha(`${k} "${x.nome}": casas decimais devem ir de 0 a 10.`);
      mapa.set(x.id, x as unknown as BItem);
    }
    return mapa;
  };
  const im = lerItens('itens_modelo');
  const ip = lerItens('itens_produto');

  // ------ imagens
  const imgs = new Map<string, BImagem>();
  const arquivos = new Set<string>();
  for (const x of arr('imagens')) {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.arquivo) || !['image/webp', 'image/jpeg', 'image/png'].includes(x.mime as string)) {
      falha('imagens: registro inválido.');
      continue;
    }
    if (imgs.has(x.id)) falha(`imagens: identificador repetido "${x.id}".`);
    if (!/^imagens\/[0-9a-zA-Z-]+\.(webp|jpg|png)$/.test(x.arquivo) || arquivos.has(x.arquivo)) falha(`imagens: caminho de arquivo inválido ou repetido "${x.arquivo}".`);
    arquivos.add(x.arquivo);
    const l = x.largura as number;
    const a = x.altura as number;
    if (!Number.isInteger(l) || !Number.isInteger(a) || l < 1 || l > 800 || a < 1 || a > 600) falha(`imagens "${x.id}": dimensões fora de 800×600.`);
    if (!Number.isInteger(x.bytes) || (x.bytes as number) <= 0) falha(`imagens "${x.id}": tamanho inválido.`);
    imgs.set(x.id, x as unknown as BImagem);
  }

  // ------ valores
  const checarValores = (dono: string, valores: unknown, itens: Map<string, BItem>) => {
    if (!Array.isArray(valores)) return falha(`${dono}: lista de valores inválida.`);
    const vistos = new Set<string>();
    for (const v of valores) {
      if (!isObj(v) || !isStr(v.item_id)) {
        falha(`${dono}: valor inválido.`);
        continue;
      }
      const item = itens.get(v.item_id);
      if (!item) {
        falha(`${dono}: valor referencia item inexistente.`);
        continue;
      }
      if (vistos.has(v.item_id)) falha(`${dono}: item "${item.nome}" repetido.`);
      vistos.add(v.item_id);
      const num = v.valor_num, txt = v.valor_txt, img = v.valor_img_id;
      if (!isNumOuNull(num) || !isStrOuNull(txt) || !isStrOuNull(img)) {
        falha(`${dono} / "${item.nome}": valor inválido.`);
        continue;
      }
      if (item.tipo === 'numerico' && (txt !== null || img !== null)) falha(`${dono} / "${item.nome}": item numérico com valor de outro tipo.`);
      if (item.tipo === 'textual' && (num !== null || img !== null)) falha(`${dono} / "${item.nome}": item textual com valor de outro tipo.`);
      if (item.tipo === 'imagem' && (num !== null || txt !== null)) falha(`${dono} / "${item.nome}": item de imagem com valor de outro tipo.`);
      if (item.tipo === 'numerico' && typeof num === 'number') {
        if (item.valor_min !== null && num < item.valor_min) falha(`${dono} / "${item.nome}": valor abaixo do mínimo.`);
        if (item.valor_max !== null && num > item.valor_max) falha(`${dono} / "${item.nome}": valor acima do máximo.`);
      }
      if (typeof img === 'string' && !imgs.has(img)) falha(`${dono} / "${item.nome}": imagem inexistente no backup.`);
    }
  };

  const modelos = new Map<string, { id: string; nome: string }>();
  const nomesMod = new Set<string>();
  const nomesItensPorModelo = new Map<string, Set<string>>();
  for (const x of arr('modelos')) {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.nome) || x.nome.trim() === '') {
      falha('modelos: registro inválido.');
      continue;
    }
    if (modelos.has(x.id)) falha(`modelos: identificador repetido "${x.id}".`);
    if (nomesMod.has(chaveNome(x.nome))) falha(`modelos: nome duplicado "${x.nome}".`);
    nomesMod.add(chaveNome(x.nome));
    modelos.set(x.id, x as { id: string; nome: string });
    checarValores(`Modelo "${x.nome}"`, x.valores, im);
    if (Array.isArray(x.valores)) {
      nomesItensPorModelo.set(x.id, new Set((x.valores as BValor[]).map((v) => chaveNome(im.get(v.item_id)?.nome ?? ''))));
    }
  }
  const nomesProd = new Set<string>();
  const prodIds = new Set<string>();
  for (const x of arr('produtos')) {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.nome) || x.nome.trim() === '' || !isStrOuNull(x.modelo_id)) {
      falha('produtos: registro inválido.');
      continue;
    }
    if (prodIds.has(x.id)) falha(`produtos: identificador repetido "${x.id}".`);
    prodIds.add(x.id);
    if (nomesProd.has(chaveNome(x.nome))) falha(`produtos: nome duplicado "${x.nome}".`);
    nomesProd.add(chaveNome(x.nome));
    if (x.modelo_id !== null && !modelos.has(x.modelo_id as string)) falha(`Produto "${x.nome}": modelo inexistente no backup.`);
    checarValores(`Produto "${x.nome}"`, x.valores, ip);
    // conflito de nomes herdado × próprio
    const herdados = x.modelo_id ? nomesItensPorModelo.get(x.modelo_id as string) : undefined;
    if (herdados && Array.isArray(x.valores)) {
      for (const v of x.valores as BValor[]) {
        const n = ip.get(v.item_id)?.nome;
        if (n && herdados.has(chaveNome(n))) falha(`Produto "${x.nome}": o item próprio "${n}" tem o mesmo nome de um item herdado do modelo.`);
      }
    }
  }

  // ------ itens de análise
  type A = Backup['itens_analise'][number];
  const analises = new Map<string, A>();
  const nomesAn = new Set<string>();
  const lista = arr('itens_analise');
  for (const x of lista) {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.nome) || x.nome.trim() === '' || !['formula', 'agregado'].includes(x.tipo as string)) {
      falha('itens_analise: registro inválido.');
      continue;
    }
    if (analises.has(x.id)) falha(`itens_analise: identificador repetido "${x.id}".`);
    if (nomesAn.has(chaveNome(x.nome))) falha(`itens_analise: nome duplicado "${x.nome}".`);
    nomesAn.add(chaveNome(x.nome));
    analises.set(x.id, x as unknown as A);
  }
  const depsDe = new Map<string, string[]>();
  for (const a of analises.values()) {
    const deps: string[] = [];
    if (a.tipo === 'formula') {
      if (!isStr(a.formula_texto) || a.peso !== null) falha(`Fórmula "${a.nome}": campos inválidos.`);
      if (Array.isArray(a.componentes) && a.componentes.length) falha(`Fórmula "${a.nome}": não pode ter componentes.`);
    } else {
      if (a.formula_texto !== null) falha(`Agregado "${a.nome}": não pode ter texto de fórmula.`);
      if (!Number.isInteger(a.peso) || (a.peso as number) < 1 || (a.peso as number) > 10) falha(`Agregado "${a.nome}": peso deve ser inteiro de 1 a 10.`);
      const comps = Array.isArray(a.componentes) ? a.componentes : [];
      if (comps.length < 2 || comps.length > 5) falha(`Agregado "${a.nome}": deve ter de 2 a 5 componentes (tem ${comps.length}).`);
      const ordens = new Set<number>();
      for (const c of comps) {
        const n = [c.item_modelo_id, c.item_produto_id, c.item_analise_id].filter((r) => r !== null && r !== undefined).length;
        if (n !== 1) falha(`Agregado "${a.nome}": cada componente deve referenciar exatamente um item.`);
        if (!Number.isInteger(c.peso) || c.peso < 1 || c.peso > 10) falha(`Agregado "${a.nome}": peso de componente fora de 1–10.`);
        if (!['maior', 'menor'].includes(c.direcao)) falha(`Agregado "${a.nome}": direção inválida.`);
        if (typeof c.lmin !== 'number' || typeof c.lmax !== 'number' || !Number.isFinite(c.lmin) || !Number.isFinite(c.lmax)) falha(`Agregado "${a.nome}": limites inválidos.`);
        else if (c.lmin === c.lmax) falha(`Agregado "${a.nome}": limites de normalização iguais.`);
        if (!Number.isInteger(c.ordem) || c.ordem < 1 || c.ordem > 5 || ordens.has(c.ordem)) falha(`Agregado "${a.nome}": ordem de componente inválida ou repetida.`);
        ordens.add(c.ordem);
        if (c.item_modelo_id) {
          const t = im.get(c.item_modelo_id)?.tipo;
          if (!t) falha(`Agregado "${a.nome}": item de modelo inexistente.`);
          else if (t !== 'numerico') falha(`Agregado "${a.nome}": só itens numéricos são aceitos.`);
        }
        if (c.item_produto_id) {
          const t = ip.get(c.item_produto_id)?.tipo;
          if (!t) falha(`Agregado "${a.nome}": item de produto inexistente.`);
          else if (t !== 'numerico') falha(`Agregado "${a.nome}": só itens numéricos são aceitos.`);
        }
        if (c.item_analise_id) {
          if (!analises.has(c.item_analise_id)) falha(`Agregado "${a.nome}": item de análise inexistente.`);
          else deps.push(c.item_analise_id);
        }
      }
    }
    depsDe.set(a.id, deps);
  }
  // fórmulas: sintaxe, referências e dependências
  const cat: Catalogo = {
    tipoItem: (k, id) => (k === 'm' ? im : ip).get(id)?.tipo,
    existeAnalise: (id) => analises.has(id),
    dependenciasAnalise: (id) => depsDe.get(id) ?? [],
  };
  for (const a of analises.values()) {
    if (a.tipo !== 'formula' || !isStr(a.formula_texto)) continue;
    const v = validarFormula(a.formula_texto, cat, null);
    for (const e of v.erros) falha(`Fórmula "${a.nome}": ${e.mensagem}`);
    depsDe.set(a.id, v.refs.filter((r) => r.kind === 'a').map((r) => r.id));
  }
  for (const id of analises.keys()) {
    if ((depsDe.get(id) ?? []).some((dep) => alcanca(dep, id, (x) => depsDe.get(x) ?? []))) {
      falha(`Dependência circular envolvendo "${analises.get(id)?.nome}".`);
    }
  }

  // ------ filtros
  const nomesF = new Set<string>();
  const fids = new Set<string>();
  for (const x of arr('filtros')) {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.nome) || x.nome.trim() === '' || !['AND', 'OR'].includes(x.logica as string) || !Array.isArray(x.condicoes)) {
      falha('filtros: registro inválido.');
      continue;
    }
    if (fids.has(x.id)) falha(`filtros: identificador repetido "${x.id}".`);
    fids.add(x.id);
    if (nomesF.has(chaveNome(x.nome))) falha(`filtros: nome duplicado "${x.nome}".`);
    nomesF.add(chaveNome(x.nome));
    const ordens = new Set<number>();
    for (const c of x.condicoes as BCondicao[]) {
      if (!isObj(c)) { falha(`Filtro "${x.nome}": condição inválida.`); continue; }
      const refs = [c.item_modelo_id, c.item_produto_id, c.item_analise_id].filter((r) => r !== null && r !== undefined).length;
      if (refs !== 1) falha(`Filtro "${x.nome}": cada condição deve referenciar exatamente um item.`);
      if (!['eq', 'ne', 'lt', 'gt', 'le', 'ge'].includes(c.operador)) falha(`Filtro "${x.nome}": operador inválido.`);
      if (!Number.isInteger(c.ordem) || ordens.has(c.ordem)) falha(`Filtro "${x.nome}": ordem de condição inválida ou repetida.`);
      ordens.add(c.ordem);
      let tipo: TipoItem | undefined = 'numerico';
      if (c.item_modelo_id) tipo = im.get(c.item_modelo_id)?.tipo;
      else if (c.item_produto_id) tipo = ip.get(c.item_produto_id)?.tipo;
      else if (c.item_analise_id && !analises.has(c.item_analise_id)) tipo = undefined;
      if (!tipo) { falha(`Filtro "${x.nome}": item referenciado não existe.`); continue; }
      if (tipo === 'imagem') falha(`Filtro "${x.nome}": itens de imagem não podem ser filtrados.`);
      else if (tipo === 'textual') {
        if (c.valor_txt === null || c.valor_txt === undefined || (c.valor_num ?? null) !== null) falha(`Filtro "${x.nome}": condição de texto exige apenas valor de texto.`);
        if (c.operador !== 'eq' && c.operador !== 'ne') falha(`Filtro "${x.nome}": itens textuais só aceitam = e ≠.`);
      } else if (typeof c.valor_num !== 'number' || !Number.isFinite(c.valor_num) || (c.valor_txt ?? null) !== null) falha(`Filtro "${x.nome}": condição numérica exige apenas valor numérico.`);
    }
  }

  // ------ configuração
  const cfg = raw.config;
  if (!isObj(cfg)) falha('Configuração da análise ausente.');
  else {
    if (!['modelos', 'produtos', 'ambos', 'itens_analise'].includes(cfg.modo as string)) falha('Configuração: modo inválido.');
    if (!['AND', 'OR'].includes(cfg.logica_global as string)) falha('Configuração: lógica global inválida.');
    if (cfg.agregado_ranking_id !== null) {
      const a = isStr(cfg.agregado_ranking_id) ? analises.get(cfg.agregado_ranking_id) : undefined;
      if (!a) falha('Configuração: o agregado do ranking não existe no backup.');
      else if (a.tipo !== 'agregado') falha('Configuração: o ranking só pode ser definido por um agregado.');
    }
    if (!isObj(cfg.colunas) || !Array.isArray(cfg.ordenacao)) falha('Configuração: colunas ou ordenação inválidas.');
  }

  const resumo = erros.length
    ? null
    : { itensModelo: im.size, itensProduto: ip.size, modelos: modelos.size, produtos: prodIds.size, itensAnalise: analises.size, filtros: fids.size, imagens: imgs.size };
  return { ok: erros.length === 0, erros, resumo };
}
