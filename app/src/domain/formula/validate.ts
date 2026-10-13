import { FormulaSyntaxError } from './lexer';
import { collectRefs, parseFormula, type Node } from './parser';

export interface RefInfo {
  kind: 'm' | 'p' | 'a';
  id: string;
}
export interface Catalogo {
  /** tipo do item de modelo/produto, ou undefined se não existe */
  tipoItem(kind: 'm' | 'p', id: string): 'numerico' | 'textual' | 'imagem' | undefined;
  existeAnalise(id: string): boolean;
  /** dependências diretas (itens de análise) de cada item de análise, exceto o que está sendo validado */
  dependenciasAnalise(id: string): string[];
}
export interface Validacao {
  ok: boolean;
  ast: Node | null;
  refs: RefInfo[];
  erros: { mensagem: string; pos?: number }[];
}

/** Há caminho de `from` até `alvo` seguindo dependências? */
export function alcanca(from: string, alvo: string, deps: (id: string) => string[]): boolean {
  const visto = new Set<string>();
  const pilha = [from];
  while (pilha.length) {
    const atual = pilha.pop() as string;
    if (atual === alvo) return true;
    if (visto.has(atual)) continue;
    visto.add(atual);
    pilha.push(...deps(atual));
  }
  return false;
}

/** Valida sintaxe, existência, tipo numérico das referências e ciclos. `selfId` = item sendo editado (ou null). */
export function validarFormula(src: string, cat: Catalogo, selfId: string | null): Validacao {
  const erros: Validacao['erros'] = [];
  let ast: Node;
  let refs: RefInfo[];
  try {
    ast = parseFormula(src);
    refs = collectRefs(ast);
  } catch (e) {
    if (e instanceof FormulaSyntaxError) return { ok: false, ast: null, refs: [], erros: [{ mensagem: e.message, pos: e.pos }] };
    throw e;
  }
  for (const r of refs) {
    if (r.kind === 'a') {
      if (!cat.existeAnalise(r.id)) erros.push({ mensagem: 'Referência a item de análise que não existe neste escopo.' });
      else if (selfId && (r.id === selfId || alcanca(r.id, selfId, cat.dependenciasAnalise))) {
        erros.push({ mensagem: 'Dependência circular: a fórmula passaria a depender de si mesma.' });
      }
    } else {
      const t = cat.tipoItem(r.kind, r.id);
      if (!t) erros.push({ mensagem: `Referência a item de ${r.kind === 'm' ? 'modelo' : 'produto'} que não existe neste escopo.` });
      else if (t !== 'numerico') erros.push({ mensagem: 'Apenas itens numéricos podem ser usados em fórmulas.' });
    }
  }
  return { ok: erros.length === 0, ast, refs, erros };
}
