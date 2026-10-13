import { getSupabase } from '../lib/supabase';
import type { Escopo } from '../domain/types';
import { toAppError } from './errors';

/** Lista os escopos do usuário (RLS garante que só os próprios aparecem), mais recentes primeiro. */
export async function listarEscopos(): Promise<Escopo[]> {
  const { data, error } = await getSupabase()
    .from('v2_escopos')
    .select('id, nome, descricao, ultimo_acesso, versao')
    .order('ultimo_acesso', { ascending: false });
  if (error) throw toAppError(error);
  return data ?? [];
}
