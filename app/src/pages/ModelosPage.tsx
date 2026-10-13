import { useState } from 'react';
import type { DadosEscopo, Modelo } from '../domain/types';
import { impactoRemoverItemDoModelo, produtosDoModelo } from '../domain/dependencias';
import { conflitosAoAcrescentarNoModelo } from '../domain/inheritance';
import { validarNome } from '../domain/names';
import { desfazerEnvios, erroDoValor, estadoInicial, montarValores, ValoresEditor, type EstadoValores } from '../features/ValoresEditor';
import { excluirModelo, salvarModelo } from '../services/escrita';
import { toAppError } from '../services/errors';
import { Carga } from '../ui/Carga';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { useToasts } from '../ui/Toasts';

interface Edicao { modelo: Modelo | null; copiaDe: Modelo | null }

function FormModelo({ d, edicao, onClose, onSaved }: { d: DadosEscopo; edicao: Edicao; onClose: () => void; onSaved: () => void }) {
  const origem = edicao.modelo ?? edicao.copiaDe;
  const valoresOrigem = origem ? d.modeloValores.filter((v) => v.modelo_id === origem.id).map((v) => ({ item_id: v.item_modelo_id, ...v })) : [];
  const [nome, setNome] = useState(edicao.copiaDe ? `${edicao.copiaDe.nome} (cópia)` : (edicao.modelo?.nome ?? ''));
  const [descricao, setDescricao] = useState(origem?.descricao ?? '');
  const [estado, setEstado] = useState<EstadoValores>(() => estadoInicial(d.itensModelo, valoresOrigem));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [impacto, setImpacto] = useState<{ itens: string[]; produtos: string[]; analises: string[] } | null>(null);

  const erroNome = nome === '' && !edicao.modelo ? null : validarNome(nome, d.modelos, edicao.modelo?.id);
  const errosValores = d.itensModelo.filter((i) => erroDoValor(i, estado[i.id]!) !== null);
  const invalido = validarNome(nome, d.modelos, edicao.modelo?.id) !== null || errosValores.length > 0;

  const idsOriginais = new Set(edicao.modelo ? valoresOrigem.map((v) => v.item_id) : []);
  const idsAtuais = d.itensModelo.filter((i) => estado[i.id]?.incluido).map((i) => i.id);
  const removidos = [...idsOriginais].filter((id) => !idsAtuais.includes(id));
  const acrescentados = idsAtuais.filter((id) => !idsOriginais.has(id));

  async function gravar() {
    setSalvando(true);
    setErro(null);
    const itens = d.itensModelo;
    let enviadas: Awaited<ReturnType<typeof montarValores>>['enviadas'] = [];
    try {
      const m = await montarValores(d.escopo.id, itens, estado);
      enviadas = m.enviadas;
      await salvarModelo({ escopoId: d.escopo.id, id: edicao.modelo?.id ?? null, versao: edicao.modelo?.versao ?? null, nome, descricao: descricao.trim() || null, valores: m.valores });
      onSaved();
    } catch (e) {
      await desfazerEnvios(enviadas);
      setErro(toAppError(e).message);
      setSalvando(false);
    }
  }

  function tentarSalvar() {
    if (invalido) return;
    if (edicao.modelo) {
      const conf = conflitosAoAcrescentarNoModelo(d, edicao.modelo.id, acrescentados);
      if (conf.length > 0) {
        setErro(`Não é possível acrescentar estes itens: ${[...new Set(conf.map((c) => c.nome))].join(', ')} já existe como item próprio de produtos deste modelo.`);
        return;
      }
      const produtos = new Map<string, string>();
      const analises = new Map<string, string>();
      for (const id of removidos) {
        const imp = impactoRemoverItemDoModelo(d, edicao.modelo.id, id);
        imp.produtos.forEach((p) => produtos.set(p.id, p.nome));
        imp.analises.forEach((a) => analises.set(a.tipo + a.id, `${a.tipo}: ${a.nome}`));
      }
      if (removidos.length > 0 && (produtos.size > 0 || analises.size > 0)) {
        setImpacto({ itens: removidos.map((id) => d.itensModelo.find((i) => i.id === id)?.nome ?? '?'), produtos: [...produtos.values()], analises: [...analises.values()] });
        return;
      }
    }
    void gravar();
  }

  return (
    <>
      <Dialog open title={edicao.modelo ? 'Editar modelo' : 'Novo modelo'} onClose={() => !salvando && onClose()}
        actions={<>
          <button type="button" className="btn" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={tentarSalvar} disabled={salvando || invalido}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </>}>
        <FormField label="Nome" error={erroNome}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoFocus /></FormField>
        <FormField label="Descrição (opcional)"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500} /></FormField>
        <h3>Itens do modelo</h3>
        <p className="muted">Marque os itens que este modelo possui e informe os valores.</p>
        <ValoresEditor d={d} itens={d.itensModelo} estado={estado} onChange={setEstado} selecionavel desabilitar={salvando} />
        {erro && <p className="notice notice-error" role="alert">{erro}</p>}
      </Dialog>
      <ConfirmDialog open={impacto !== null} title="Remover itens do modelo" danger confirmLabel="Remover e salvar" busy={salvando}
        onCancel={() => setImpacto(null)} onConfirm={() => { setImpacto(null); void gravar(); }}>
        <p>Você está removendo do modelo: <strong>{impacto?.itens.join(', ')}</strong>.</p>
        {impacto && impacto.produtos.length > 0 && <><p>Produtos afetados (perdem este atributo herdado):</p><ul>{impacto.produtos.map((p) => <li key={p}>{p}</li>)}</ul></>}
        {impacto && impacto.analises.length > 0 && <><p>Análises que usam esse item e passarão a mostrar “indisponível”:</p><ul>{impacto.analises.map((a) => <li key={a}>{a}</li>)}</ul></>}
      </ConfirmDialog>
    </>
  );
}

export function ModelosPage() {
  const { notify } = useToasts();
  const [edit, setEdit] = useState<Edicao | null>(null);
  const [del, setDel] = useState<Modelo | null>(null);
  const [busy, setBusy] = useState(false);
  const [delErro, setDelErro] = useState<string | null>(null);
  return (
    <Carga titulo="Modelos">
      {(d, recarregar) => {
        const prods = del ? produtosDoModelo(d, del.id) : [];
        return (
          <section>
            <h1>Modelos</h1>
            <p className="muted">Um modelo define quais atributos seus produtos herdam, com os valores do modelo.</p>
            <p><button type="button" className="btn btn-primary" onClick={() => setEdit({ modelo: null, copiaDe: null })}>Novo modelo</button></p>
            {d.modelos.length === 0 ? <div className="card"><p>Nenhum modelo ainda.</p></div> : (
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Itens</th><th>Produtos</th><th>Ações</th></tr></thead>
                <tbody>
                  {d.modelos.map((m) => (
                    <tr key={m.id}>
                      <td>{m.nome}{m.descricao && <div className="muted">{m.descricao}</div>}</td>
                      <td>{d.modeloValores.filter((v) => v.modelo_id === m.id).length}</td>
                      <td>{produtosDoModelo(d, m.id).length}</td>
                      <td className="row-actions">
                        <button type="button" className="btn" onClick={() => setEdit({ modelo: m, copiaDe: null })}>Editar</button>
                        <button type="button" className="btn" onClick={() => setEdit({ modelo: null, copiaDe: m })}>Duplicar</button>
                        <button type="button" className="btn btn-danger" onClick={() => { setDel(m); setDelErro(null); }}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {edit && <FormModelo key={edit.modelo?.id ?? edit.copiaDe?.id ?? 'novo'} d={d} edicao={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); notify('success', 'Modelo salvo.'); recarregar(); }} />}
            <ConfirmDialog open={del !== null} title="Excluir modelo" danger confirmLabel="Excluir" busy={busy} confirmDisabled={prods.length > 0}
              onCancel={() => setDel(null)}
              onConfirm={() => {
                if (!del) return;
                setBusy(true);
                excluirModelo(del.id).then(
                  () => { setBusy(false); setDel(null); notify('success', 'Modelo excluído.'); recarregar(); },
                  (e: unknown) => { setBusy(false); setDelErro(toAppError(e).message); },
                );
              }}>
              {prods.length > 0 ? (
                <><p>O modelo <strong>{del?.nome}</strong> tem produtos associados e não pode ser excluído:</p><ul>{prods.map((p) => <li key={p.id}>{p.nome}</li>)}</ul><p>Exclua os produtos ou mude o modelo deles antes.</p></>
              ) : <p>Excluir o modelo <strong>{del?.nome}</strong>? Esta ação não pode ser desfeita.</p>}
              {delErro && <p className="notice notice-error" role="alert">{delErro}</p>}
            </ConfirmDialog>
          </section>
        );
      }}
    </Carga>
  );
}
