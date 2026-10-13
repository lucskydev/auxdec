/** Unicidade de nomes: sem diferenciar maiúsculas/minúsculas nem espaços nas pontas (igual ao índice do banco). */
export function chaveNome(nome: string): string {
  return nome.trim().toLowerCase();
}

export function nomeDuplicado(nome: string, existentes: { id: string; nome: string }[], ignorarId?: string | null): boolean {
  const k = chaveNome(nome);
  return existentes.some((e) => e.id !== ignorarId && chaveNome(e.nome) === k);
}

export function validarNome(nome: string, existentes: { id: string; nome: string }[], ignorarId?: string | null): string | null {
  if (nome.trim() === '') return 'O nome é obrigatório.';
  if (nome.length > 200) return 'O nome pode ter no máximo 200 caracteres.';
  if (nomeDuplicado(nome, existentes, ignorarId)) return 'Já existe um registro com este nome neste escopo (maiúsculas e minúsculas não diferenciam).';
  return null;
}
