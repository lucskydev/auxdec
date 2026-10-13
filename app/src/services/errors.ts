/** Tradução de erros do banco/rede em mensagens acionáveis (códigos V2xxx vêm das migrações v2_). */
export type ErrorKind = 'version' | 'validation' | 'dependency' | 'auth' | 'network' | 'notfound' | 'unknown';

export interface AppError {
  kind: ErrorKind;
  message: string;
  code?: string;
  detail?: string;
  retryable: boolean;
}

interface RawError {
  code?: string;
  message?: string;
  details?: string;
  detail?: string;
  status?: number;
  name?: string;
}

const BY_CODE: Record<string, { kind: ErrorKind; message: string }> = {
  V2001: { kind: 'version', message: 'Este registro foi modificado em outra sessão. Atualize os dados e reaplique suas alterações.' },
  V2002: { kind: 'validation', message: 'Conflito de nomes: um item próprio tem o mesmo nome de um item herdado do modelo.' },
  V2003: { kind: 'validation', message: 'Valor fora dos limites definidos para o item.' },
  V2004: { kind: 'validation', message: 'Dependência circular entre itens de análise.' },
  V2005: { kind: 'validation', message: 'Usuário e escopo de um registro não podem ser alterados.' },
  V2006: { kind: 'validation', message: 'O tipo de um item não pode ser alterado após a criação.' },
  V2007: { kind: 'validation', message: 'Referência inválida: apenas itens numéricos entram em fórmulas e agregados.' },
  V2008: { kind: 'validation', message: 'Condição de filtro inválida para o tipo do item.' },
  V2009: { kind: 'validation', message: 'O ranking só pode ser definido por um agregado.' },
  V2010: { kind: 'validation', message: 'Um agregado precisa de 2 a 5 componentes.' },
  V2011: { kind: 'notfound', message: 'Registro não encontrado. Ele pode ter sido excluído em outra sessão.' },
  V2012: { kind: 'validation', message: 'Referência inexistente neste escopo.' },
  V2013: { kind: 'validation', message: 'Dados enviados em formato inválido.' },
  V2014: { kind: 'validation', message: 'Confirmação inválida: digite o nome exato do escopo.' },
  '28000': { kind: 'auth', message: 'Sessão expirada. Entre novamente.' },
  '23505': { kind: 'validation', message: 'Já existe um registro com esse nome neste escopo (maiúsculas e minúsculas não diferenciam).' },
  '23503': { kind: 'dependency', message: 'Existem registros que dependem deste item. Remova as dependências antes de excluir.' },
  '23514': { kind: 'validation', message: 'Um dos valores informados não é permitido (verifique limites e números válidos).' },
  '42501': { kind: 'auth', message: 'Sem permissão para esta operação.' },
  PGRST301: { kind: 'auth', message: 'Sessão expirada. Entre novamente.' },
};

export function toAppError(err: unknown): AppError {
  const e: RawError = typeof err === 'object' && err !== null ? (err as RawError) : { message: String(err) };
  const detail = e.details ?? e.detail;

  if (e.code && BY_CODE[e.code]) {
    const m = BY_CODE[e.code]!;
    return { kind: m.kind, message: m.message, code: e.code, detail, retryable: false };
  }
  if (e.status === 401 || e.status === 403) {
    return { kind: 'auth', message: 'Sessão expirada ou sem permissão. Entre novamente.', code: e.code, detail, retryable: false };
  }
  const msg = (e.message ?? '').toLowerCase();
  if (e.name === 'TypeError' || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return { kind: 'network', message: 'Falha de conexão. Verifique a internet e tente novamente.', detail, retryable: true };
  }
  return { kind: 'unknown', message: e.message ? `Erro inesperado: ${e.message}` : 'Erro inesperado.', code: e.code, detail, retryable: false };
}
