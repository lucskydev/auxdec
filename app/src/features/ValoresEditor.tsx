import { useState } from 'react';
import type { DadosEscopo, Item, Imagem } from '../domain/types';
import { formatarNumero, lerNumero, numeroParaTexto, urlSegura, validarLimites } from './numeros';
import { enviarImagem, excluirImagem, prepararImagem, type ImagemPreparada } from '../services/imagens';
import type { ValorEntrada } from '../services/escrita';
import { ImagemMiniatura } from '../ui/ImagemMiniatura';

export interface EstadoValor {
  incluido: boolean;
  texto: string;
  imgId: string | null;
  nova: ImagemPreparada | null;
}
export type EstadoValores = Record<string, EstadoValor>;

export const valorVazio = (): EstadoValor => ({ incluido: false, texto: '', imgId: null, nova: null });

export function estadoInicial(itens: Item[], valores: { item_id: string; valor_num: number | null; valor_txt: string | null; valor_img_id: string | null }[]): EstadoValores {
  const e: EstadoValores = {};
  for (const i of itens) e[i.id] = valorVazio();
  for (const v of valores) {
    e[v.item_id] = { incluido: true, texto: v.valor_num !== null ? numeroParaTexto(v.valor_num) : (v.valor_txt ?? ''), imgId: v.valor_img_id, nova: null };
  }
  return e;
}

export function erroDoValor(item: Item, v: EstadoValor): string | null {
  if (!v.incluido) return null;
  if (item.tipo === 'numerico') {
    const n = lerNumero(v.texto);
    if (!n.ok) return n.erro;
    return validarLimites(n.valor, item.valor_min, item.valor_max);
  }
  if (item.tipo === 'textual' && v.texto.length > 2000) return 'Texto muito longo (máximo 2000 caracteres).';
  return null;
}

/** Converte o estado em payload. Envia imagens novas; devolve também o que foi enviado, para desfazer se o salvamento falhar. */
export async function montarValores(escopoId: string, itens: Item[], estado: EstadoValores): Promise<{ valores: ValorEntrada[]; enviadas: Imagem[] }> {
  const valores: ValorEntrada[] = [];
  const enviadas: Imagem[] = [];
  try {
    for (const i of itens) {
      const v = estado[i.id];
      if (!v?.incluido) continue;
      if (i.tipo === 'numerico') {
        const n = lerNumero(v.texto);
        valores.push({ item_id: i.id, valor_num: n.ok ? n.valor : null });
      } else if (i.tipo === 'textual') {
        valores.push({ item_id: i.id, valor_txt: v.texto.trim() === '' ? null : v.texto.trim() });
      } else if (v.nova) {
        const img = await enviarImagem(escopoId, v.nova);
        enviadas.push(img);
        valores.push({ item_id: i.id, valor_img_id: img.id });
      } else {
        valores.push({ item_id: i.id, valor_img_id: v.imgId });
      }
    }
  } catch (e) {
    await desfazerEnvios(enviadas);
    throw e;
  }
  return { valores, enviadas };
}

export async function desfazerEnvios(imgs: Imagem[]) {
  for (const i of imgs) {
    try { await excluirImagem(i); } catch { /* órfã será tratada na limpeza */ }
  }
}

interface Props {
  d: DadosEscopo;
  itens: Item[];
  estado: EstadoValores;
  onChange: (e: EstadoValores) => void;
  /** true: o usuário escolhe quais itens existem (checkbox). */
  selecionavel: boolean;
  desabilitar?: boolean;
}

export function ValoresEditor({ d, itens, estado, onChange, selecionavel, desabilitar }: Props) {
  const [erroImg, setErroImg] = useState<Record<string, string>>({});
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const set = (id: string, p: Partial<EstadoValor>) => onChange({ ...estado, [id]: { ...(estado[id] ?? valorVazio()), ...p } });
  const imagens = new Map(d.imagens.map((i) => [i.id, i]));

  if (itens.length === 0) return <p className="muted">Nenhum item disponível. Crie itens primeiro.</p>;
  return (
    <div className="valores">
      {itens.map((i) => {
        const v = estado[i.id] ?? valorVazio();
        const erro = erroDoValor(i, v);
        const ativo = v.incluido;
        const img = v.imgId ? imagens.get(v.imgId) : undefined;
        return (
          <div key={i.id} className="valor-linha">
            <label className="valor-nome">
              {selecionavel ? (
                <input type="checkbox" checked={ativo} disabled={desabilitar} onChange={(e) => set(i.id, { incluido: e.target.checked })} />
              ) : null}{' '}
              {i.nome}{i.unidade ? ` (${i.unidade})` : ''}
            </label>
            {ativo && i.tipo === 'numerico' && (
              <input aria-label={`Valor de ${i.nome}`} inputMode="decimal" value={v.texto} disabled={desabilitar} onChange={(e) => set(i.id, { texto: e.target.value })} placeholder={i.valor_min !== null || i.valor_max !== null ? `${formatarNumero(i.valor_min)} a ${formatarNumero(i.valor_max)}` : ''} aria-invalid={erro ? true : undefined} />
            )}
            {ativo && i.tipo === 'textual' && (
              <input aria-label={`Valor de ${i.nome}`} value={v.texto} disabled={desabilitar} onChange={(e) => set(i.id, { texto: e.target.value })} />
            )}
            {ativo && i.tipo === 'imagem' && (
              <span className="valor-img">
                {v.nova ? <img src={v.nova.preview} alt="" width={64} height={Math.round(64 * 0.75)} /> : img ? <ImagemMiniatura imagem={img} onAmpliar={setAmpliada} /> : <span className="muted">sem imagem</span>}
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Imagem de ${i.nome}`} disabled={desabilitar}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    prepararImagem(f).then(
                      (p) => { setErroImg((x) => ({ ...x, [i.id]: '' })); set(i.id, { nova: p }); },
                      (err: unknown) => setErroImg((x) => ({ ...x, [i.id]: err instanceof Error ? err.message : 'Imagem inválida.' })),
                    );
                    e.target.value = '';
                  }} />
                {(v.nova || v.imgId) && <button type="button" className="btn" disabled={desabilitar} onClick={() => set(i.id, { nova: null, imgId: null })}>Remover imagem</button>}
              </span>
            )}
            {ativo && i.tipo === 'textual' && urlSegura(v.texto) && <a href={v.texto.trim()} target="_blank" rel="noopener noreferrer">abrir link</a>}
            {(erro || erroImg[i.id]) && <small className="field-error" role="alert">Erro: {erro || erroImg[i.id]}</small>}
          </div>
        );
      })}
      {ampliada && (
        <dialog open className="dialog" onClick={() => setAmpliada(null)}>
          <img src={ampliada} alt="Imagem ampliada" style={{ maxWidth: '100%' }} />
          <p><button type="button" className="btn" onClick={() => setAmpliada(null)}>Fechar</button></p>
        </dialog>
      )}
    </div>
  );
}
