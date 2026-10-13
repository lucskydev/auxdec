import { getSupabase } from '../lib/supabase';
import type { Imagem } from '../domain/types';
import { toAppError } from './errors';

const BUCKET = 'v2_imagens';
export const MAX_LARGURA = 800;
export const MAX_ALTURA = 600;
export const MAX_BYTES_ORIGINAL = 15 * 1024 * 1024;
const MIMES_ENTRADA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Dimensões finais mantendo a proporção, sem ampliar. */
export function dimensoesAlvo(w: number, h: number): { largura: number; altura: number } {
  const f = Math.min(1, MAX_LARGURA / w, MAX_ALTURA / h);
  return { largura: Math.max(1, Math.round(w * f)), altura: Math.max(1, Math.round(h * f)) };
}

export interface ImagemPreparada {
  blob: Blob;
  largura: number;
  altura: number;
  mime: 'image/webp' | 'image/jpeg';
  preview: string;
}

/** Valida e reduz a imagem no navegador (≤ 800×600, WebP). Nada é enviado aqui: o upload só ocorre ao salvar. */
export async function prepararImagem(arquivo: File): Promise<ImagemPreparada> {
  if (!MIMES_ENTRADA.includes(arquivo.type)) throw new Error('Formato não suportado. Use JPEG, PNG ou WebP.');
  if (arquivo.size > MAX_BYTES_ORIGINAL) throw new Error('Imagem muito grande (máximo 15 MB).');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(arquivo);
  } catch {
    throw new Error('Não foi possível ler a imagem (arquivo corrompido?).');
  }
  const { largura, altura } = dimensoesAlvo(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Navegador sem suporte a processamento de imagem.');
  ctx.drawImage(bmp, 0, 0, largura, altura);
  bmp.close();
  const gerar = (mime: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, mime, q));
  let blob = await gerar('image/webp', 0.85);
  let mime: 'image/webp' | 'image/jpeg' = 'image/webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await gerar('image/jpeg', 0.85);
    mime = 'image/jpeg';
  }
  if (!blob) throw new Error('Falha ao converter a imagem.');
  if (blob.size > 2 * 1024 * 1024) throw new Error('Imagem ainda excede 2 MB após a compressão.');
  return { blob, largura, altura, mime, preview: URL.createObjectURL(blob) };
}

const ext = (m: string) => (m === 'image/png' ? 'png' : m === 'image/jpeg' ? 'jpg' : 'webp');

/** Envia o arquivo e cria a linha em v2_imagens. Se a linha falhar, o arquivo enviado é removido. */
export async function enviarImagem(escopoId: string, img: { blob: Blob; largura: number; altura: number; mime: string }): Promise<Imagem> {
  const sb = getSupabase();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw toAppError({ code: '28000' });
  const caminho = `${uid}/${escopoId}/${crypto.randomUUID()}.${ext(img.mime)}`;
  const up = await sb.storage.from(BUCKET).upload(caminho, img.blob, { contentType: img.mime, upsert: false });
  if (up.error) throw toAppError(up.error);
  const ins = await sb.from('v2_imagens')
    .insert({ escopo_id: escopoId, storage_path: caminho, largura: img.largura, altura: img.altura, bytes: img.blob.size, mime: img.mime })
    .select('*').single();
  if (ins.error || !ins.data) {
    await sb.storage.from(BUCKET).remove([caminho]);
    throw toAppError(ins.error ?? { code: 'V2011' });
  }
  return ins.data as Imagem;
}

/** Remove arquivos do Storage; devolve os caminhos que falharam (para avisar o usuário). */
export async function removerArquivos(caminhos: string[]): Promise<string[]> {
  if (caminhos.length === 0) return [];
  const { data, error } = await getSupabase().storage.from(BUCKET).remove(caminhos);
  if (error) return caminhos;
  const removidos = new Set((data ?? []).map((o) => o.name));
  return caminhos.filter((c) => !removidos.has(c));
}

/** Exclui a linha e o arquivo de uma imagem. Chamar só se nenhum valor a referencia (o banco também protege). */
export async function excluirImagem(img: Imagem): Promise<string[]> {
  const { error } = await getSupabase().from('v2_imagens').delete().eq('id', img.id);
  if (error) throw toAppError(error);
  return removerArquivos([img.storage_path]);
}

export async function baixarArquivo(caminho: string): Promise<Blob> {
  const { data, error } = await getSupabase().storage.from(BUCKET).download(caminho);
  if (error || !data) throw toAppError(error ?? { code: 'V2011' });
  return data;
}

/** URLs assinadas (1 h). Falhas individuais ficam de fora; a tela mostra a célula como "imagem indisponível". */
export async function urlsAssinadas(caminhos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (caminhos.length === 0) return mapa;
  const { data } = await getSupabase().storage.from(BUCKET).createSignedUrls(caminhos, 3600);
  for (const r of data ?? []) if (r.path && r.signedUrl) mapa.set(r.path, r.signedUrl);
  return mapa;
}
