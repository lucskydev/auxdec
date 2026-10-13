import { getSupabase } from '../lib/supabase';
import type { Escopo } from '../domain/types';
import type { ZipLido } from './backupZip';
import { toAppError } from './errors';
import { removerArquivos } from './imagens';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const BUCKET = 'v2_imagens';

export type ModoImportacao = { tipo: 'novo' } | { tipo: 'substituir'; alvo: Escopo; confirmacao: string };

export interface ResultadoImportacao {
  escopoId: string;
  /** arquivos antigos que não puderam ser removidos do Storage (modo substituir) */
  orfaos: string[];
}

/**
 * Envia as imagens para caminhos novos e chama v2_importar_escopo (uma transação: novos ids, tudo ou nada).
 * Se a RPC falhar, as imagens enviadas são removidas.
 */
export async function importarBackup(zip: ZipLido, nome: string, descricao: string | null, modo: ModoImportacao): Promise<ResultadoImportacao> {
  if (!zip.backup) throw new Error('Backup inválido.');
  const sb = getSupabase();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw toAppError({ code: '28000' });
  const escopoId = modo.tipo === 'novo' ? crypto.randomUUID() : modo.alvo.id;

  const caminhos: Record<string, string> = {};
  const enviados: string[] = [];
  try {
    for (const img of zip.backup.imagens) {
      const bytes = zip.imagens.get(img.id);
      if (!bytes) throw new Error(`Imagem ausente: ${img.id}`);
      const caminho = `${uid}/${escopoId}/${crypto.randomUUID()}.${EXT[img.mime] ?? 'webp'}`;
      const up = await sb.storage.from(BUCKET).upload(caminho, new Blob([bytes as BlobPart], { type: img.mime }), { contentType: img.mime, upsert: false });
      if (up.error) throw toAppError(up.error);
      enviados.push(caminho);
      caminhos[img.id] = caminho;
    }
    const { data, error } = await sb.rpc('v2_importar_escopo', {
      p_payload: zip.backup,
      p_modo: modo.tipo,
      p_escopo_id: escopoId,
      p_nome: nome.trim(),
      p_descricao: descricao,
      p_versao: modo.tipo === 'substituir' ? modo.alvo.versao : null,
      p_confirmacao: modo.tipo === 'substituir' ? modo.confirmacao : null,
      p_caminhos: caminhos,
    });
    if (error) throw toAppError(error);
    const antigos = ((data as { caminhos_antigos?: string[] } | null)?.caminhos_antigos) ?? [];
    return { escopoId, orfaos: await removerArquivos(antigos) };
  } catch (e) {
    await removerArquivos(enviados);
    throw e;
  }
}
