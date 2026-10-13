import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ConfigAnalise, DadosEscopo, Logica, ModoAnalise, OrdenacaoItem } from '../domain/types';
import { COL_NOME, COL_RANKING, colunasVisiveis, construirTabela, todasColunas, type CelulaVista, type Coluna } from '../domain/analysis/tabela';
import type { FiltroCompleto } from '../domain/analysis/filter';
import { ROTULO_OPERADOR } from './FiltrosPage';
import { prefs } from '../lib/storage';
import { salvarConfig, type ConfigPatch } from '../services/escrita';
import { toAppError } from '../services/errors';
import { exportarCsv, exportarPdf } from '../services/exportacao';
import { Carga } from '../ui/Carga';
import { Dialog } from '../ui/Dialog';
import { ImagemMiniatura } from '../ui/ImagemMiniatura';
import { useToasts } from '../ui/Toasts';

const MODOS: Record<ModoAnalise, string> = { modelos: 'Somente modelos', produtos: 'Somente produtos', ambos: 'Modelos e produtos', itens_analise: 'Somente itens de análise' };
const LARGURA_PADRAO = 160;
const ALTURA_LINHA = 56;

const larguraDe = (cfg: ConfigAnalise, c: Coluna) => cfg.colunas.larguras?.[c.key] ?? (c.key === COL_NOME ? 220 : c.key === COL_RANKING ? 90 : LARGURA_PADRAO);

function lerAtivos(escopoId: string): string[] {
  try {
    const v: unknown = JSON.parse(prefs.get(`filtrosAtivos:${escopoId}`) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function EditorColunas({ d, cfg, modo, onClose, onApply }: { d: DadosEscopo; cfg: ConfigAnalise; modo: ModoAnalise; onClose: () => void; onApply: (c: ConfigAnalise['colunas']) => void }) {
  const todas = todasColunas(d);
  const atuais = colunasVisiveis({ ...d, config: cfg }, 'ambos').map((c) => c.key);
  const [ordem, setOrdem] = useState<string[]>(() => [...atuais, ...todas.map((c) => c.key).filter((k) => !atuais.includes(k))]);
  const [visiveis, setVisiveis] = useState<Set<string>>(new Set(atuais));
  const [fixadas, setFixadas] = useState<Set<string>>(new Set(cfg.colunas.fixadas ?? []));
  const [larguras, setLarguras] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(cfg.colunas.larguras ?? {}).map(([k, v]) => [k, String(v)])));
  const porChave = new Map(todas.map((c) => [c.key, c]));
  const mover = (i: number, delta: number) => setOrdem((o) => {
    const j = i + delta;
    if (j < 0 || j >= o.length) return o;
    const n = [...o];
    [n[i], n[j]] = [n[j]!, n[i]!];
    return n;
  });
  const alt = (s: Set<string>, k: string, on: boolean) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; };
  void modo;
  return (
    <Dialog open title="Colunas da análise" onClose={onClose}
      actions={<>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => {
          const larg: Record<string, number> = {};
          for (const [k, v] of Object.entries(larguras)) { const n = Number(v.replace(',', '.')); if (Number.isFinite(n) && n >= 60 && n <= 800) larg[k] = Math.round(n); }
          onApply({ visiveis: ordem.filter((k) => visiveis.has(k) || k === COL_NOME), fixadas: ordem.filter((k) => fixadas.has(k)), larguras: larg });
        }}>Aplicar</button>
      </>}>
      <p className="muted">Largura de 60 a 800 px. A coluna Nome é sempre exibida.</p>
      <ul className="lista-colunas">
        {ordem.map((k, i) => {
          const c = porChave.get(k);
          if (!c) return null;
          return (
            <li key={k}>
              <label><input type="checkbox" checked={visiveis.has(k) || k === COL_NOME} disabled={k === COL_NOME} onChange={(e) => setVisiveis((s) => alt(s, k, e.target.checked))} /> {c.titulo}</label>
              <label><input type="checkbox" checked={fixadas.has(k)} onChange={(e) => setFixadas((s) => alt(s, k, e.target.checked))} /> fixar</label>
              <input aria-label={`Largura de ${c.titulo}`} className="largura" inputMode="numeric" placeholder="largura" value={larguras[k] ?? ''} onChange={(e) => setLarguras((l) => ({ ...l, [k]: e.target.value }))} />
              <button type="button" className="btn" aria-label={`Mover ${c.titulo} para cima`} onClick={() => mover(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="btn" aria-label={`Mover ${c.titulo} para baixo`} onClick={() => mover(i, 1)} disabled={i === ordem.length - 1}>↓</button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

function Celula({ c, d, onTexto, onImagem }: { c: CelulaVista; d: DadosEscopo; onTexto: (t: string) => void; onImagem: (u: string) => void }) {
  if (c.estado === 'imagem') {
    const img = d.imagens.find((i) => i.id === c.imagemId);
    return img ? <ImagemMiniatura imagem={img} tamanho={56} onAmpliar={onImagem} /> : <span className="cell-erro">imagem indisponível</span>;
  }
  if (c.estado === 'erro') return <span className="cell-erro" title={c.detalhe}>⚠ erro</span>;
  if (c.estado === 'indisponivel') return <span className="cell-indisp" title={c.detalhe}>⦸ indisponível</span>;
  if (c.estado === 'vazio') return <span className="cell-vazio" title="Sem valor">—</span>;
  if (c.estado === 'naoSeAplica') return <span className="cell-vazio" title="Não se aplica a modelos">n/a</span>;
  if (c.estado === 'link') return <a href={c.texto.trim()} target="_blank" rel="noopener noreferrer" title={c.texto}>🔗 {c.texto.replace(/^https?:\/\//, '').slice(0, 28)}</a>;
  const longo = c.texto.length > 40;
  return (
    <span title={c.detalhe ?? (longo ? c.texto : undefined)} className={longo ? 'cell-longo' : undefined}>
      {longo ? <>{c.texto.slice(0, 40)}… <button type="button" className="link-btn" onClick={() => onTexto(c.texto)}>ver tudo</button></> : c.texto}
    </span>
  );
}

function Analise({ d }: { d: DadosEscopo }) {
  const { notify } = useToasts();
  const [local, setLocal] = useState<ConfigAnalise | null>(null);
  const cfg = local && local.versao >= d.config.versao ? local : d.config;
  const dd = useMemo<DadosEscopo>(() => ({ ...d, config: cfg }), [d, cfg]);
  const ultima = useRef<ConfigAnalise>(cfg);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const [busca, setBusca] = useState('');
  const [ativosIds, setAtivosIds] = useState<string[]>(() => lerAtivos(d.escopo.id));
  const [colunasAberto, setColunasAberto] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);
  const [imagem, setImagem] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'csv' | 'pdf' | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  /** Alterações de apresentação são persistidas por escopo (compartilhadas entre abas); gravações são serializadas para respeitar a versão. */
  function aplicar(patch: ConfigPatch) {
    const otimista = { ...cfg, ...patch } as ConfigAnalise;
    setLocal(otimista);
    fila.current = fila.current.then(async () => {
      try {
        const salvo = await salvarConfig(ultima.current.versao >= d.config.versao ? ultima.current : d.config, patch);
        ultima.current = salvo;
        setLocal(salvo);
      } catch (e) {
        notify('error', `Não foi possível salvar a configuração: ${toAppError(e).message}`);
        setLocal(null);
      }
    });
  }

  const filtrosAtivos = useMemo<FiltroCompleto[]>(
    () => d.filtros.filter((f) => ativosIds.includes(f.id)).map((f) => ({ filtro: f, condicoes: d.filtroCondicoes.filter((c) => c.filtro_id === f.id).sort((a, b) => a.ordem - b.ordem) })),
    [d, ativosIds],
  );
  const tabela = useMemo(
    () => construirTabela(dd, { modo: cfg.modo, filtrosAtivos, logicaGlobal: cfg.logica_global, busca, ordenacao: cfg.ordenacao }),
    [dd, cfg.modo, cfg.logica_global, cfg.ordenacao, filtrosAtivos, busca],
  );

  // colunas fixadas primeiro, com deslocamento acumulado
  const fixSet = new Set(cfg.colunas.fixadas ?? []);
  const colunas = [...tabela.colunas.filter((c) => fixSet.has(c.key)), ...tabela.colunas.filter((c) => !fixSet.has(c.key))];
  const offsets = new Map<string, number>();
  let acc = 0;
  for (const c of colunas) { if (fixSet.has(c.key)) { offsets.set(c.key, acc); acc += larguraDe(cfg, c); } }
  const largTotal = colunas.reduce((s, c) => s + larguraDe(cfg, c), 0);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virt = useVirtualizer({ count: tabela.linhas.length, getScrollElement: () => scroller.current, estimateSize: () => ALTURA_LINHA, overscan: 12 });

  function alternarFiltro(id: string, on: boolean) {
    const n = on ? [...ativosIds, id] : ativosIds.filter((x) => x !== id);
    setAtivosIds(n);
    prefs.set(`filtrosAtivos:${d.escopo.id}`, JSON.stringify(n));
  }
  function ordenarPor(col: string, multi: boolean) {
    const atual = cfg.ordenacao.find((o) => o.col === col);
    const dir: OrdenacaoItem['dir'] = atual?.dir === 'asc' ? 'desc' : 'asc';
    let nova: OrdenacaoItem[];
    if (multi) nova = atual ? cfg.ordenacao.map((o) => (o.col === col ? { col, dir } : o)) : [...cfg.ordenacao, { col, dir }];
    else nova = [{ col, dir }];
    aplicar({ ordenacao: nova.slice(0, 5) });
  }
  const resumoFiltros = filtrosAtivos.length === 0 ? '' : `Filtros: ${filtrosAtivos.map((f) => f.filtro.nome).join(` ${cfg.logica_global === 'AND' ? 'E' : 'OU'} `)}`;
  const agregados = d.itensAnalise.filter((i) => i.tipo === 'agregado');

  async function exportar(tipo: 'csv' | 'pdf') {
    setExportando(tipo);
    try {
      await new Promise((r) => window.setTimeout(r, 0));
      if (tipo === 'csv') exportarCsv(tabela, d.escopo.nome);
      else await exportarPdf(tabela, d.escopo.nome, resumoFiltros);
    } catch (e) {
      notify('error', `Falha ao exportar: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    } finally {
      setExportando(null);
    }
  }

  return (
    <section className="analise">
      <h1>Análise</h1>
      <div className="toolbar" role="toolbar" aria-label="Controles da análise">
        <label>Modo{' '}
          <select value={cfg.modo} onChange={(e) => aplicar({ modo: e.target.value as ModoAnalise })}>
            {Object.entries(MODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <input type="search" aria-label="Pesquisar na tabela" placeholder="Pesquisar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label>Ranking por{' '}
          <select value={cfg.agregado_ranking_id ?? ''} onChange={(e) => aplicar({ agregado_ranking_id: e.target.value || null })}>
            <option value="">(sem ranking)</option>
            {agregados.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => setColunasAberto(true)}>Colunas</button>
        <button type="button" className="btn" onClick={() => void exportar('csv')} disabled={exportando !== null}>{exportando === 'csv' ? 'Gerando…' : 'Exportar CSV'}</button>
        <button type="button" className="btn" onClick={() => void exportar('pdf')} disabled={exportando !== null}>{exportando === 'pdf' ? 'Gerando…' : 'Exportar PDF'}</button>
      </div>

      <fieldset className="filtros-ativos">
        <legend>Filtros (somente nesta sessão do navegador)</legend>
        {d.filtros.length === 0 ? <span className="muted">Nenhum filtro salvo. Crie filtros na tela Filtros.</span> : (
          <>
            {d.filtros.map((f) => {
              const conds = d.filtroCondicoes.filter((c) => c.filtro_id === f.id);
              return (
                <label key={f.id} title={conds.map((c) => ROTULO_OPERADOR[c.operador]).join(' ')}>
                  <input type="checkbox" checked={ativosIds.includes(f.id)} onChange={(e) => alternarFiltro(f.id, e.target.checked)} /> {f.nome}{conds.length === 0 ? ' (sem condições: ignorado)' : ''}
                </label>
              );
            })}
            <label>Combinar filtros com{' '}
              <select value={cfg.logica_global} onChange={(e) => aplicar({ logica_global: e.target.value as Logica })}>
                <option value="AND">E</option>
                <option value="OR">OU</option>
              </select>
            </label>
          </>
        )}
      </fieldset>
      <p className="muted" role="status">
        {tabela.linhas.length} de {tabela.totalModo} linha(s) exibida(s){resumoFiltros ? ` · ${resumoFiltros}` : ''}{busca ? ` · busca: “${busca}”` : ''}
        {cfg.ordenacao.length > 0 && ` · ordem: ${cfg.ordenacao.map((o) => `${todasColunas(d).find((c) => c.key === o.col)?.titulo ?? '?'} ${o.dir === 'asc' ? '↑' : '↓'}`).join(', ')}`}
      </p>

      {d.modelos.length + d.produtos.length === 0 ? (
        <div className="card"><p>Ainda não há modelos nem produtos neste escopo.</p></div>
      ) : tabela.linhas.length === 0 ? (
        <div className="card"><p>Nenhuma linha corresponde aos filtros e à pesquisa atuais.</p></div>
      ) : (
        <div ref={scroller} className="grade-scroll" tabIndex={0} aria-label="Tabela de análise" role="region">
          <div role="table" aria-rowcount={tabela.linhas.length + 1} style={{ width: largTotal, minWidth: '100%' }}>
            <div role="row" className="grade-linha grade-cab">
              {colunas.map((c) => {
                const ord = cfg.ordenacao.findIndex((o) => o.col === c.key);
                const fix = offsets.get(c.key);
                return (
                  <div key={c.key} role="columnheader" aria-sort={ord >= 0 ? (cfg.ordenacao[ord]!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`grade-cel${fix !== undefined ? ' fixa' : ''}`} style={{ width: larguraDe(cfg, c), left: fix }} title={c.descricao ?? undefined}>
                    <button type="button" className="link-btn" onClick={(e) => ordenarPor(c.key, e.shiftKey)} title="Clique para ordenar; Shift+clique soma critérios">
                      {c.titulo}{ord >= 0 ? ` ${cfg.ordenacao[ord]!.dir === 'asc' ? '↑' : '↓'}${cfg.ordenacao.length > 1 ? ord + 1 : ''}` : ''}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
              {virt.getVirtualItems().map((vi) => {
                const l = tabela.linhas[vi.index]!;
                return (
                  <div key={l.key} role="row" aria-rowindex={vi.index + 2} className="grade-linha" style={{ position: 'absolute', top: 0, transform: `translateY(${vi.start}px)`, height: ALTURA_LINHA }}>
                    {colunas.map((c) => {
                      const cel = l.celulas.get(c.key);
                      const fix = offsets.get(c.key);
                      return (
                        <div key={c.key} role="cell" className={`grade-cel${fix !== undefined ? ' fixa' : ''}${cel && (cel.estado === 'ok' && typeof cel.bruto === 'number') ? ' num' : ''}`} style={{ width: larguraDe(cfg, c), left: fix }}>
                          {cel && <Celula c={cel} d={d} onTexto={setTexto} onImagem={setImagem} />}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {colunasAberto && <EditorColunas d={dd} cfg={cfg} modo={cfg.modo} onClose={() => setColunasAberto(false)} onApply={(c) => { setColunasAberto(false); aplicar({ colunas: c }); }} />}
      <Dialog open={texto !== null} title="Conteúdo completo" onClose={() => setTexto(null)} actions={<button type="button" className="btn" onClick={() => setTexto(null)}>Fechar</button>}>
        <p className="texto-completo">{texto}</p>
      </Dialog>
      <Dialog open={imagem !== null} title="Imagem" onClose={() => setImagem(null)} actions={<button type="button" className="btn" onClick={() => setImagem(null)}>Fechar</button>}>
        {imagem && <img src={imagem} alt="Imagem ampliada" style={{ maxWidth: '100%' }} />}
      </Dialog>
    </section>
  );
}

export function AnalisePage() {
  return <Carga titulo="Análise">{(d) => <Analise d={d} />}</Carga>;
}
