import { useEffect, useState } from 'react';
import type { Imagem } from '../domain/types';
import { urlsAssinadas } from '../services/imagens';

/** Miniatura com URL assinada; se a imagem não puder ser carregada, mostra um aviso explícito. */
export function ImagemMiniatura({ imagem, tamanho = 64, onAmpliar }: { imagem: Imagem; tamanho?: number; onAmpliar?: (url: string) => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const caminho = imagem.storage_path;
  useEffect(() => {
    let viva = true;
    urlsAssinadas([caminho]).then(
      (m) => viva && setUrl(m.get(caminho) ?? null),
      () => viva && setUrl(null),
    );
    return () => { viva = false; };
  }, [caminho]);
  if (url === undefined) return <span className="muted" style={{ width: tamanho }}>…</span>;
  if (url === null) return <span className="cell-erro" title="Não foi possível carregar a imagem">imagem indisponível</span>;
  return (
    <button type="button" className="img-btn" onClick={() => onAmpliar?.(url)} aria-label="Ampliar imagem">
      <img src={url} alt="" width={tamanho} height={Math.round(tamanho * 0.75)} loading="lazy" style={{ objectFit: 'cover' }} />
    </button>
  );
}
