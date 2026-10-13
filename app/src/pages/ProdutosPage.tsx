import { useState } from 'react';
import type { DadosEscopo, Produto } from '../domain/types';
import { conflitosDeNomes } from '../domain/inheritance';
import { validarNome } from '../domain/names';
import { desfazerEnvios, erroDoValor, estadoInicial, montarValores, ValoresEditor, type EstadoValores } from '../features/ValoresEditor';
import { formatarNumero } from '../features/numeros';
import { excluirProduto, salvarProduto } from '../services/escrita';
import { toAppError } from '../services/errors';
import { Carga } from '../ui/Carga';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { useToasts } from '../ui/Toasts';

interface Edicao { produto: Produto | null; copiaDe: Produto | null }

function FormProduto({ d, edicao, onClose, onSaved }: { d: DadosEscopo; edicao: Edicao; onClose: () => void; onSaved: () => void }) {
  const origem = edicao.produto ?? edicao.copiaDe;
  const valoresOrigem = origem ? d.produtoValores.filter((v) => v.produto_id === origem.id).map((v) => ({ item_id: v.item_produto_id, ...v })) : [];
  const [nome, setNome] = useState(edicao.copiaDe ? `${edicao.copiaDe.nome} (cópia)` : (edicao.produto?.nome ?? ''));
  const [descricao, setDescricao] = useState(origem?.descricao ?? '');
  const [modeloId, setModeloId] = useState<string>(origem?.modelo_id ?? '');
  const [estado, setEstado] = useState<EstadoValores>(() => estadoInicial(d.itensProduto, valoresOrigem));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const proprios = d.itensProduto.filter((i) => estado[i.id]?.incluido).map((i) => i.id);
  const conflitos = conflitosDeNomes(d, modeloId || null, proprios);
  const erroNome = nome === '' && !edicao.produto ? null : validarNome(nome, d.produtos, edicao.produto?.id);
  const errosValores = d.itensProduto.filter((i) => erroDoValor(i, estado[i.id]!) !== null);
  const invalido = validarNome(nome, d.produtos, edicao.produto?.id) !== null || errosValores.length > 0 || conflitos.length > 0;

  const herdados = modeloId ? d.modeloValores.filter((v) => v.modelo_id === modeloId) : [];
  const itensModelo = new Map(d.itensModelo.map((i) => [i.id, i]));

  async function salvar() {
    if (invalido) return;
    setSalvando(true);
    setErro(null);
    let enviadas: Awaited<ReturnType<typeof montarValores>>['enviadas'] = [];
    try {
      const m = await montarValores(d.escopo.id, d.itensProduto, estado);
      enviadas = m.enviadas;
      await salvarProduto({ escopoId: d.escopo.id, id: edicao.produto?.id ?? null, versao: edicao.produto?.versao ?? null, nome, descricao: descricao.trim() || null, modeloId: modeloId || null, valores: m.valores });
      onSaved();
    } catch (e) {
      await desfazerEnvios(enviadas);
      setErro(toAppError(e).message);
      setSalvando(false);
    }
  }

  return (
    <Dialog open title={edicao.produto ? 'Editar produto' : 'Novo produto'} onClose={() => !salvando && onClose()}
      actions={<>
        <button type="button" className="btn" onClick={onClose} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando || invalido}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <FormField label="Nome" error={erroNome}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoFocus /></FormField>
      <FormField label="Descrição (opcional)"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500} /></FormField>
      <FormField label="Modelo">
        <select value={modeloId} onChange={(e) => setModeloId(e.target.value)} disabled={salvando}>
          <option value="">(sem modelo)</option>
          {d.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </FormField>
      {conflitos.length > 0 && (
        <p className="notice notice-error" role="alert">
          Conflito de nomes: {conflitos.map((c) => c.nome).join(', ')} existe no modelo escolhido e como item próprio. Remova o item próprio ou escolha outro modelo.
        </p>
      )}
      {herdados.length > 0 && (
        <>
          <h3>Herdado do modelo (somente leitura)</h3>
          <ul>
            {herdados.map((v) => {
              const it = itensModelo.get(v.item_modelo_id);
              return <li key={v.item_modelo_id}>{it?.nome ?? '?'}: {v.valor_num !== null ? formatarNumero(v.valor_num, it?.casas_decimais ?? null) : (v.valor_txt ?? (v.valor_img_id ? '(imagem)' : '—'))}</li>;
            })}
          </ul>
        </>
      )}
      <h3>Itens próprios</h3>
      <ValoresEditor d={d} itens={d.itensProduto} estado={estado} onChange={setEstado} selecionavel desabilitar={salvando} />
      {erro && <p className="notice notice-error" role="alert">{erro}</p>}
    </Dialog>
  );
}

export function ProdutosPage() {
  const { notify } = useToasts();
  const [edit, setEdit] = useState<Edicao | null>(null);
  const [del, setDel] = useState<Produto | null>(null);
  const [busy, setBusy] = useState(false);
  const [delErro, setDelErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  return (
    <Carga titulo="Produtos">
      {(d, recarregar) => {
        const modelos = new Map(d.modelos.map((m) => [m.id, m.nome]));
        const lista = d.produtos.filter((p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()));
        return (
          <section>
            <h1>Produtos</h1>
            <p>
              <button type="button" className="btn btn-primary" onClick={() => setEdit({ produto: null, copiaDe: null })}>Novo produto</button>{' '}
              <input type="search" aria-label="Buscar produto" placeholder="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </p>
            {d.produtos.length === 0 ? <div className="card"><p>Nenhum produto ainda.</p></div> : lista.length === 0 ? <p>Nenhum produto encontrado para “{busca}”.</p> : (
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Modelo</th><th>Itens próprios</th><th>Ações</th></tr></thead>
                <tbody>
                  {lista.map((p) => (
                    <tr key={p.id}>
                      <td>{p.nome}{p.descricao && <div className="muted">{p.descricao}</div>}</td>
                      <td>{p.modelo_id ? (modelos.get(p.modelo_id) ?? '?') : '—'}</td>
                      <td>{d.produtoValores.filter((v) => v.produto_id === p.id).length}</td>
                      <td className="row-actions">
                        <button type="button" className="btn" onClick={() => setEdit({ produto: p, copiaDe: null })}>Editar</button>
                        <button type="button" className="btn" onClick={() => setEdit({ produto: null, copiaDe: p })}>Duplicar</button>
                        <button type="button" className="btn btn-danger" onClick={() => { setDel(p); setDelErro(null); }}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {edit && <FormProduto key={edit.produto?.id ?? edit.copiaDe?.id ?? 'novo'} d={d} edicao={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); notify('success', 'Produto salvo.'); recarregar(); }} />}
            <ConfirmDialog open={del !== null} title="Excluir produto" danger confirmLabel="Excluir" busy={busy} onCancel={() => setDel(null)}
              onConfirm={() => {
                if (!del) return;
                setBusy(true);
                excluirProduto(del.id).then(
                  () => { setBusy(false); setDel(null); notify('success', 'Produto excluído.'); recarregar(); },
                  (e: unknown) => { setBusy(false); setDelErro(toAppError(e).message); },
                );
              }}>
              <p>Excluir o produto <strong>{del?.nome}</strong>? Esta ação não pode ser desfeita.</p>
              {delErro && <p className="notice notice-error" role="alert">{delErro}</p>}
            </ConfirmDialog>
          </section>
        );
      }}
    </Carga>
  );
}
