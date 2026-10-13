import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import { montarBackup, validarBackup, type Backup, type ResultadoValidacao } from '../domain/backup';
import type { DadosEscopo } from '../domain/types';
import { baixarArquivo } from './imagens';

export const MAX_ZIP_BYTES = 60 * 1024 * 1024;
const ARQ_JSON = 'backup.json';

export interface ResultadoExport {
  blob: Blob;
  nomeArquivo: string;
  imagens: number;
  /** imagens que não puderam ser baixadas — o backup NÃO deve ser considerado completo se houver alguma */
  falhas: string[];
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'escopo';

/** Monta o .zip (backup.json + imagens/). Compara o conteúdo gerado com o esperado antes de devolver. */
export async function exportarEscopo(d: DadosEscopo): Promise<ResultadoExport> {
  const backup = montarBackup(d);
  const arquivos: Record<string, Uint8Array> = { [ARQ_JSON]: strToU8(JSON.stringify(backup, null, 2)) };
  const falhas: string[] = [];
  for (const [i, img] of d.imagens.entries()) {
    try {
      const blob = await baixarArquivo(img.storage_path);
      arquivos[backup.imagens[i]!.arquivo] = new Uint8Array(await blob.arrayBuffer());
    } catch {
      falhas.push(backup.imagens[i]!.arquivo);
    }
  }
  const zip = zipSync(arquivos, { level: 6 });
  // verificação: o que foi gravado deve ler de volta válido
  const lido = lerZip(zip);
  if (!lido.validacao.ok) throw new Error('O backup gerado não passou na verificação interna.');
  const data = new Date().toISOString().slice(0, 10);
  return { blob: new Blob([zip as BlobPart], { type: 'application/zip' }), nomeArquivo: `auxdec-${slug(d.escopo.nome)}-${data}.zip`, imagens: d.imagens.length, falhas };
}

export interface ZipLido {
  backup: Backup | null;
  imagens: Map<string, Uint8Array>;
  validacao: ResultadoValidacao;
}

/** Lê e valida um .zip de backup (arquivo não confiável). Não grava nada. */
export function lerZip(bytes: Uint8Array): ZipLido {
  const vazio = (m: string): ZipLido => ({ backup: null, imagens: new Map(), validacao: { ok: false, erros: [m], resumo: null } });
  if (bytes.length > MAX_ZIP_BYTES) return vazio('Arquivo maior que o limite de 60 MB.');
  let conteudo: Record<string, Uint8Array>;
  try {
    conteudo = unzipSync(bytes, { filter: (f) => f.originalSize <= 20 * 1024 * 1024 });
  } catch {
    return vazio('O arquivo não é um .zip válido.');
  }
  const bruto = conteudo[ARQ_JSON];
  if (!bruto) return vazio(`O .zip não contém ${ARQ_JSON}.`);
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(bruto));
  } catch {
    return vazio(`${ARQ_JSON} não é um JSON válido.`);
  }
  const validacao = validarBackup(json);
  if (!validacao.ok) return { backup: null, imagens: new Map(), validacao };
  const backup = json as Backup;
  const imagens = new Map<string, Uint8Array>();
  for (const img of backup.imagens) {
    const b = conteudo[img.arquivo];
    if (!b) validacao.erros.push(`Imagem ausente no .zip: ${img.arquivo}`);
    else if (b.length !== img.bytes) validacao.erros.push(`Imagem com tamanho diferente do declarado: ${img.arquivo}`);
    else imagens.set(img.id, b);
  }
  if (validacao.erros.length) validacao.ok = false;
  return { backup: validacao.ok ? backup : null, imagens, validacao };
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
