/** Configuração pública do cliente. Só chaves públicas (publishable/anon) são aceitas. */
export const STORAGE_PREFIX = 'sistemaDecisoesV2:';

export interface PublicConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

/** Lança erro claro se faltar variável ou se a chave parecer privilegiada. */
export function readConfig(env: Record<string, string | undefined>): PublicConfig {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example).',
    );
  }
  if (/service_role/i.test(supabaseKey) || supabaseKey.startsWith('sb_secret_') || jwtRole(supabaseKey) === 'service_role') {
    throw new Error('Chave privilegiada detectada. Use somente a chave publishable/anon no frontend.');
  }
  return { supabaseUrl, supabaseKey };
}

function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload: unknown = JSON.parse(json);
    if (payload && typeof payload === 'object' && 'role' in payload) {
      const role = (payload as { role: unknown }).role;
      return typeof role === 'string' ? role : null;
    }
  } catch {
    /* não é um JWT legível */
  }
  return null;
}
