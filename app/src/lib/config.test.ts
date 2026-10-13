import { describe, expect, it } from 'vitest';
import { readConfig, STORAGE_PREFIX } from './config';

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`;

describe('readConfig', () => {
  it('exige URL e chave', () => {
    expect(() => readConfig({})).toThrow(/Configuração ausente/);
    expect(() => readConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toThrow(/Configuração ausente/);
  });
  it('aceita chave publishable e JWT anon', () => {
    expect(readConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toEqual({
      supabaseUrl: 'https://x.supabase.co',
      supabaseKey: 'sb_publishable_abc',
    });
    expect(() => readConfig({ VITE_SUPABASE_URL: 'https://x', VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') })).not.toThrow();
  });
  it('recusa chaves privilegiadas', () => {
    expect(() => readConfig({ VITE_SUPABASE_URL: 'https://x', VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') })).toThrow(/privilegiada/);
    expect(() => readConfig({ VITE_SUPABASE_URL: 'https://x', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow(/privilegiada/);
  });
  it('usa o prefixo próprio da v2 e não o da versão atual', () => {
    expect(STORAGE_PREFIX).toBe('sistemaDecisoesV2:');
  });
});
