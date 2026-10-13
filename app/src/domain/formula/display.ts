/**
 * Conversão entre a forma armazenada ([[m:uuid]]) e a forma exibida no editor ([m:Nome do item]).
 * A referência é sempre resolvida por id; o nome exibido só existe na tela.
 */
export interface NomesCatalogo {
  nome(kind: 'm' | 'p' | 'a', id: string): string | undefined;
  /** busca por nome (sem diferenciar maiúsculas/minúsculas) dentro do tipo */
  idPorNome(kind: 'm' | 'p' | 'a', nome: string): string | undefined;
}

const STORED = /\[\[(m|p|a):([0-9a-fA-F-]{36})\]\]/g;
const SHOWN = /\[(m|p|a):([^\]]*)\]/g;
export const CARACTERES_PROIBIDOS_EM_NOME = /[[\]]/;

export function paraExibicao(armazenado: string, cat: NomesCatalogo): string {
  return armazenado.replace(STORED, (_m, kind: 'm' | 'p' | 'a', id: string) => {
    const n = cat.nome(kind, id.toLowerCase());
    return n !== undefined ? `[${kind}:${n}]` : `[${kind}:?${id}]`; // item removido/desconhecido fica visível e inválido
  });
}

/** Devolve o texto a armazenar e os nomes que não foram resolvidos. */
export function paraArmazenamento(exibido: string, cat: NomesCatalogo): { texto: string; naoResolvidos: string[] } {
  const naoResolvidos: string[] = [];
  const texto = exibido.replace(SHOWN, (m, kind: 'm' | 'p' | 'a', nome: string) => {
    const t = nome.trim();
    if (t.startsWith('?')) {
      const id = t.slice(1);
      if (/^[0-9a-fA-F-]{36}$/.test(id)) return `[[${kind}:${id.toLowerCase()}]]`;
    }
    const id = cat.idPorNome(kind, t);
    if (!id) {
      naoResolvidos.push(m);
      return m;
    }
    return `[[${kind}:${id}]]`;
  });
  return { texto, naoResolvidos };
}
