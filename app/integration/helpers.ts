import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Testes de integração contra o Supabase REAL. Só rodam se as variáveis abaixo existirem.
 *   INT_SUPABASE_URL, INT_SUPABASE_KEY (chave publishable/anon, nunca service_role)
 *   INT_USER_A_EMAIL, INT_USER_A_PASSWORD  (dono dos dados temporários; use o usuário de teste)
 *   INT_USER_B_EMAIL, INT_USER_B_PASSWORD  (atacante: só tenta acessar o que é do A)
 * Todos os dados criados ficam num escopo temporário do A, com nome "ZZ_INT_…", e são excluídos no final.
 */
const vars = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
export const env = {
  url: vars.INT_SUPABASE_URL ?? '',
  key: vars.INT_SUPABASE_KEY ?? '',
  aEmail: vars.INT_USER_A_EMAIL ?? '',
  aSenha: vars.INT_USER_A_PASSWORD ?? '',
  bEmail: vars.INT_USER_B_EMAIL ?? '',
  bSenha: vars.INT_USER_B_PASSWORD ?? '',
};
export const configurado = Object.values(env).every((v) => v !== '');

export async function entrar(email: string, senha: string): Promise<{ sb: SupabaseClient; uid: string }> {
  if (/service_role|sb_secret_/.test(env.key)) throw new Error('Use apenas a chave publishable/anon.');
  const sb = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error || !data.user) throw new Error(`Login de teste falhou: ${error?.message ?? 'sem usuário'}`);
  return { sb, uid: data.user.id };
}

export const codigo = (e: unknown): string => String((e as { code?: string } | null)?.code ?? '');
export const sufixo = () => Math.random().toString(36).slice(2, 8);
