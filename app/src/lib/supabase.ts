import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readConfig, STORAGE_PREFIX } from './config';

let client: SupabaseClient | null = null;

/** Cliente único. A sessão é guardada com chave própria da v2 (não colide com a versão atual). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const cfg = readConfig(import.meta.env as Record<string, string | undefined>);
    client = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: {
        storageKey: `${STORAGE_PREFIX}auth`,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
