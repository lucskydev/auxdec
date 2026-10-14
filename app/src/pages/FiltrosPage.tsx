import { useState } from 'react';
import type { DadosEscopo, Filtro, Logica, Operador } from '../domain/types';
import { nomesDe } from '../domain/catalogo';
import { validarNome } from '../domain/names';
import { lerNumero, numeroParaTexto } from '../features/numeros';
import { excluirFiltro, salvarFiltro, type CondicaoEntrada } from '../services/escrita';
import { toAppError } from '../services/errors';
import { Carga } from '../ui/Carga';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { diferencas, EditDialog, type ConflitoInfo } from '../ui/EditDialog';
import { FormField } from '../ui/FormField';
import { useToasts } from '../ui/Toasts';

export const ROTULO_OPERADOR: Record<Operador, string> = { eq: '=', ne: '≠', lt: '<', gt: '>', le: '≤', ge: '≥' };
interface CondForm { chave: number; ref: string; op: Operador; valor: string }
let seq = 1;

/** Itens filtráveis: numéricos e textuais (imagem não) e itens de análise. */
function opcoes(d: DadosEscopo) {
  return [
    ...d.itensModelo.filter((i) => i.tipo !== 'imagem').map((i) => ({ valor: `m:${i.id}`, rotulo: `Modelo · ${i.nome}`, texto: i.tipo === 'textual' })),
    ...d.itensProduto.filter((i) => i.tipo !== 'imagem').map((i) => ({ valor: `p:${i.id}`, rotulo: `Produto · ${i.nome}`, texto: i.tipo === 'textual' })),
    ...d.itensAnalise.map((i) => ({ valor: `a:${i.id}`, rotulo: `Análise · ${i.nome}`, texto: false })),
  ];
}

function FormFiltro({ d, filtro, onClose, onSaved }: { d: DadosEscopo; filtro: Filtro | null; onClose: () => void; onSaved: () => void }) {
  const ops = opcoes(d);
  const [base0, setBase] = useState(filtro);
  const [emConflito, setEmConflito] = useState(false);
  const [nome, setNome] = useState(filtro?.nome ?? '');
  const [descricao, setDescricao] = useState(filtro?.descricao ?? '');
  const [logica, setLogica] = useState<Logica>(filtro?.logica ?? 'AND');
  const [conds, setConds] = useState<CondForm[]>(() =>
    filtro ? d.filtroCondicoes.filter((c) => c.filtro_id === filtro.id).sort((a, b) => a.ordem - b.ordem).map((c) => ({
      chave: seq++,
      ref: c.item_modelo_id ? `m:${c.item_modelo_id}` : c.item_produto_id ? `p:${c.item_produto_id}` : `a:${c.item_analise_id}`,
      op: c.operador, valor: c.valor_txt ?? numeroParaTexto(c.valor_num),
    })) : [{ chave: seq++, ref: '', op: 'eq', valor: '' }],
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const erroNome = nome === '' && !base0 ? null : validarNome(nome, d.filtros, base0?.id);
  const erros: string[] = [];
  const entradas: CondicaoEntrada[] = [];
  if (conds.length === 0) erros.push('Inclua ao menos uma condição.');
  conds.forEach((c, i) => {
    const op = ops.find((o) => o.valor === c.ref);
    if (!op) { erros.push(`Condição ${i + 1}: escolha um item.`); return; }
    const k = c.ref[0], id = c.ref.slice(2);
    const base = { operador: c.op, item_modelo_id: k === 'm' ? id : null, item_produto_id: k === 'p' ? id : null, item_analise_id: k === 'a' ? id : null };
    if (op.texto) {
      if (c.op !== 'eq' && c.op !== 'ne') erros.push(`Condição ${i + 1}: itens de texto só aceitam = e ≠.`);
      else if (c.valor.trim() === '') erros.push(`Condição ${i + 1}: informe o texto.`);
      else entradas.push({ ...base, valor_txt: c.valor.trim() });
    } else {
      const n = lerNumero(c.valor);
      if (!n.ok || n.valor === null) erros.push(`Condição ${i + 1}: informe um número válido.`);
      else entradas.push({ ...base, valor_num: n.valor });
    }
  });
  const invalido = validarNome(nome, d.filtros, base0?.id) !== null || erros.length > 0;
  const upd = (chave: number, p: Partial<CondForm>) => setConds((l) => l.map((c) => (c.chave === chave ? { ...c, ...p } : c)));

  async function salvar() {
    if (invalido) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarFiltro({ escopoId: d.escopo.id, id: base0?.id ?? null, versao: base0?.versao ?? null, nome, descricao: descricao.trim() || null, logica, condicoes: entradas });
      onSaved();
    } catch (e) {
      const ae = toAppError(e);
      if (base0 && (ae.kind === 'version' || ae.kind === 'notfound')) setEmConflito(true);
      setErro(ae.message);
      setSalvando(false);
    }
  }

  const resumoConds = (l: { ref: string; op: Operador; valor: string }[]) => l.map((c) => `${c.ref}|${c.op}|${c.valor.trim()}`).join('\n');
  const instantaneo = JSON.stringify([nome, descricao, logica, resumoConds(conds)]);
  const [inicial] = useState(instantaneo);
  const atual = emConflito && base0 ? (d.filtros.find((f) => f.id === base0.id) ?? null) : undefined;
  const condsAtuais = atual
    ? d.filtroCondicoes.filter((c) => c.filtro_id === atual.id).sort((a, b) => a.ordem - b.ordem).map((c) => ({
      ref: c.item_modelo_id ? `m:${c.item_modelo_id}` : c.item_produto_id ? `p:${c.item_produto_id}` : `a:${c.item_analise_id}`,
      op: c.operador, valor: (c.valor_txt ?? numeroParaTexto(c.valor_num)).trim(),
    })) : [];
  const conflito: ConflitoInfo | null = emConflito && base0 ? {
    baseVersao: base0.versao,
    atual,
    diffs: atual ? diferencas([
      ['Nome', nome, atual.nome], ['Descrição', descricao, atual.descricao ?? ''], ['Lógica', logica, atual.logica],
      ['Condições', resumoConds(conds), resumoConds(condsAtuais)],
    ]) : [],
    onReaplicar: () => { if (atual) { setBase(atual); setEmConflito(false); setErro(null); } },
  } : null;

  return (
    <EditDialog title={base0 ? 'Editar filtro' : 'Novo filtro'} onClose={onClose} onSave={() => void salvar()} dirty={instantaneo !== inicial} saving={salvando} saveDisabled={invalido} erro={erro} conflito={conflito}>
      <FormField label="Nome" error={erroNome}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoFocus /></FormField>
      <FormField label="Descrição (opcional)"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500} /></FormField>
      <FormField label="Combinar condições com">
        <select value={logica} onChange={(e) => setLogica(e.target.value as Logica)}>
          <option value="AND">E (todas devem valer)</option>
          <option value="OR">OU (basta uma valer)</option>
        </select>
      </FormField>
      <h3>Condições</h3>
      {conds.map((c, i) => {
        const op = ops.find((o) => o.valor === c.ref);
        return (
          <fieldset key={c.chave} className="componente">
            <legend>Condição {i + 1}</legend>
            <FormField label="Item">
              <select value={c.ref} onChange={(e) => upd(c.chave, { ref: e.target.value, op: 'eq' })}>
                <option value="">Escolha…</option>
                {ops.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            </FormField>
            <FormField label="Operador">
              <select value={c.op} onChange={(e) => upd(c.chave, { op: e.target.value as Operador })}>
                {(Object.keys(ROTULO_OPERADOR) as Operador[]).filter((o) => !op?.texto || o === 'eq' || o === 'ne').map((o) => <option key={o} value={o}>{ROTULO_OPERADOR[o]}</option>)}
              </select>
            </FormField>
            <FormField label="Valor"><input value={c.valor} onChange={(e) => upd(c.chave, { valor: e.target.value })} /></FormField>
            <button type="button" className="btn btn-danger" onClick={() => setConds((l) => l.filter((x) => x.chave !== c.chave))}>Remover condição</button>
          </fieldset>
        );
      })}
      <p><button type="button" className="btn" onClick={() => setConds((l) => [...l, { chave: seq++, ref: '', op: 'eq', valor: '' }])}>Adicionar condição</button></p>
      {erros.length > 0 && <ul className="field-error" role="alert">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
    </EditDialog>
  );
}

export function FiltrosPage() {
  const { notify } = useToasts();
  const [edit, setEdit] = useState<{ filtro: Filtro | null } | null>(null);
  const [del, setDel] = useState<Filtro | null>(null);
  const [busy, setBusy] = useState(false);
  const [delErro, setDelErro] = useState<string | null>(null);
  return (
    <Carga titulo="Filtros">
      {(d, recarregar) => {
        const nomes = nomesDe(d);
        const resumo = (f: Filtro) =>
          d.filtroCondicoes.filter((c) => c.filtro_id === f.id).sort((a, b) => a.ordem - b.ordem).map((c) => {
            const k = c.item_modelo_id ? 'm' : c.item_produto_id ? 'p' : 'a';
            const id = (c.item_modelo_id ?? c.item_produto_id ?? c.item_analise_id) as string;
            return `${nomes.nome(k, id) ?? '?'} ${ROTULO_OPERADOR[c.operador]} ${c.valor_txt ?? c.valor_num}`;
          }).join(f.logica === 'AND' ? ' E ' : ' OU ');
        return (
          <section>
            <h1>Filtros</h1>
            <p className="muted">Filtros salvos ficam disponíveis na tela de análise, onde podem ser ativados e combinados.</p>
            <p><button type="button" className="btn btn-primary" onClick={() => setEdit({ filtro: null })}>Novo filtro</button></p>
            {d.filtros.length === 0 ? <div className="card"><p>Nenhum filtro ainda.</p></div> : (
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Condições</th><th>Ações</th></tr></thead>
                <tbody>
                  {d.filtros.map((f) => (
                    <tr key={f.id}>
                      <td>{f.nome}{f.descricao && <div className="muted">{f.descricao}</div>}</td>
                      <td>{resumo(f)}</td>
                      <td className="row-actions">
                        <button type="button" className="btn" onClick={() => setEdit({ filtro: f })}>Editar</button>
                        <button type="button" className="btn btn-danger" onClick={() => { setDel(f); setDelErro(null); }}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {edit && <FormFiltro key={edit.filtro?.id ?? 'novo'} d={d} filtro={edit.filtro} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); notify('success', 'Filtro salvo.'); recarregar(); }} />}
            <ConfirmDialog open={del !== null} title="Excluir filtro" danger confirmLabel="Excluir" busy={busy} onCancel={() => setDel(null)}
              onConfirm={() => {
                if (!del) return;
                setBusy(true);
                excluirFiltro(del.id).then(
                  () => { setBusy(false); setDel(null); notify('success', 'Filtro excluído.'); recarregar(); },
                  (e: unknown) => { setBusy(false); setDelErro(toAppError(e).message); },
                );
              }}>
              <p>Excluir o filtro <strong>{del?.nome}</strong>?</p>
              {delErro && <p className="notice notice-error" role="alert">{delErro}</p>}
            </ConfirmDialog>
          </section>
        );
      }}
    </Carga>
  );
}
