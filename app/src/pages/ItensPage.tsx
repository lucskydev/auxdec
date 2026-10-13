import { useState } from 'react';
import type { DadosEscopo, Item, TipoItem } from '../domain/types';
import { CARACTERES_PROIBIDOS_EM_NOME } from '../domain/formula/display';
import { dependenciasItemModelo, dependenciasItemProduto } from '../domain/dependencias';
import { chaveNome, validarNome } from '../domain/names';
import { lerNumero, numeroParaTexto } from '../features/numeros';
import { criarItem, atualizarItem, excluirItem, type TabelaItem, type ItemEntrada } from '../services/escrita';
import { toAppError } from '../services/errors';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Carga } from '../ui/Carga';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { useToasts } from '../ui/Toasts';

const TIPOS: Record<TipoItem, string> = { numerico: 'Numérico', textual: 'Texto', imagem: 'Imagem' };

/** Nome único no escopo + sem colchetes + sem repetir nome entre itens herdados e próprios de um mesmo produto (o banco também valida: V2002). */
function validarNomeItem(nome: string, existentes: Item[], itemId: string | null, d: DadosEscopo, tabela: TabelaItem): string | null {
  const base = validarNome(nome, existentes, itemId);
  if (base) return base;
  if (CARACTERES_PROIBIDOS_EM_NOME.test(nome)) return 'O nome não pode conter colchetes [ ou ].';
  if (!itemId) return null; // item novo ainda não está em nenhum modelo/produto
  const chave = chaveNome(nome);
  if (tabela === 'v2_itens_modelo') {
    const modelos = new Set(d.modeloValores.filter((v) => v.item_modelo_id === itemId).map((v) => v.modelo_id));
    const proprios = new Set(d.itensProduto.filter((i) => chaveNome(i.nome) === chave).map((i) => i.id));
    const choque = d.produtos.find((p) => p.modelo_id && modelos.has(p.modelo_id) && d.produtoValores.some((v) => v.produto_id === p.id && proprios.has(v.item_produto_id)));
    if (choque) return `Conflito no produto "${choque.nome}": ele já tem um item próprio com este nome.`;
  } else {
    const iguais = new Set(d.itensModelo.filter((i) => chaveNome(i.nome) === chave).map((i) => i.id));
    const choque = d.produtos.find((p) => d.produtoValores.some((v) => v.produto_id === p.id && v.item_produto_id === itemId)
      && p.modelo_id && d.modeloValores.some((v) => v.modelo_id === p.modelo_id && iguais.has(v.item_modelo_id)));
    if (choque) return `Conflito no produto "${choque.nome}": o modelo dele já tem um item com este nome.`;
  }
  return null;
}

function FormItem({ tabela, item, d, onClose, onSaved }: { tabela: TabelaItem; item: Item | null; d: DadosEscopo; onClose: () => void; onSaved: () => void }) {
  const existentes = tabela === 'v2_itens_modelo' ? d.itensModelo : d.itensProduto;
  const [nome, setNome] = useState(item?.nome ?? '');
  const [descricao, setDescricao] = useState(item?.descricao ?? '');
  const [tipo, setTipo] = useState<TipoItem>(item?.tipo ?? 'numerico');
  const [unidade, setUnidade] = useState(item?.unidade ?? '');
  const [casas, setCasas] = useState(numeroParaTexto(item?.casas_decimais));
  const [vmin, setVmin] = useState(numeroParaTexto(item?.valor_min));
  const [vmax, setVmax] = useState(numeroParaTexto(item?.valor_max));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const erroNome = nome === '' && !item ? null : validarNomeItem(nome, existentes, item?.id ?? null, d, tabela);
  const num = tipo === 'numerico';
  const c = lerNumero(casas), mi = lerNumero(vmin), ma = lerNumero(vmax);
  const erroCasas = !num ? null : !c.ok ? c.erro : c.valor !== null && (!Number.isInteger(c.valor) || c.valor < 0 || c.valor > 10) ? 'Use um inteiro de 0 a 10.' : null;
  const erroMin = !num ? null : !mi.ok ? mi.erro : null;
  const erroMax = !num ? null : !ma.ok ? ma.erro : mi.ok && ma.ok && mi.valor !== null && ma.valor !== null && mi.valor > ma.valor ? 'O máximo não pode ser menor que o mínimo.' : null;
  const invalido = validarNomeItem(nome, existentes, item?.id ?? null, d, tabela) !== null || !!erroCasas || !!erroMin || !!erroMax;

  async function salvar() {
    if (invalido || !c.ok || !mi.ok || !ma.ok) return;
    setSalvando(true);
    setErro(null);
    const base = {
      nome, descricao: descricao.trim() || null,
      unidade: num ? unidade.trim() || null : null,
      casas_decimais: num ? c.valor : null,
      valor_min: num ? mi.valor : null,
      valor_max: num ? ma.valor : null,
    };
    try {
      if (item) await atualizarItem(tabela, item, base);
      else await criarItem(tabela, d.escopo.id, { ...base, tipo } satisfies ItemEntrada);
      onSaved();
    } catch (e) {
      setErro(toAppError(e).message);
      setSalvando(false);
    }
  }

  return (
    <Dialog
      open
      title={item ? 'Editar item' : 'Novo item'}
      onClose={() => !salvando && onClose()}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando || invalido}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </>
      }
    >
      <FormField label="Nome" error={erroNome}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoFocus /></FormField>
      <FormField label="Tipo" hint={item ? 'O tipo não pode ser alterado depois de criado.' : undefined}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoItem)} disabled={item !== null}>
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </FormField>
      <FormField label="Descrição (opcional)"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500} /></FormField>
      {num && (
        <>
          <FormField label="Unidade (opcional)"><input value={unidade} onChange={(e) => setUnidade(e.target.value)} maxLength={20} /></FormField>
          <FormField label="Casas decimais (0–10, opcional)" error={erroCasas}><input inputMode="numeric" value={casas} onChange={(e) => setCasas(e.target.value)} /></FormField>
          <FormField label="Valor mínimo (opcional)" error={erroMin}><input inputMode="decimal" value={vmin} onChange={(e) => setVmin(e.target.value)} /></FormField>
          <FormField label="Valor máximo (opcional)" error={erroMax}><input inputMode="decimal" value={vmax} onChange={(e) => setVmax(e.target.value)} /></FormField>
        </>
      )}
      {erro && <p className="notice notice-error" role="alert">{erro}</p>}
    </Dialog>
  );
}

export function ItensPage({ tabela }: { tabela: TabelaItem }) {
  const titulo = tabela === 'v2_itens_modelo' ? 'Itens de modelo' : 'Itens de produto';
  const { notify } = useToasts();
  const [edit, setEdit] = useState<{ item: Item | null } | null>(null);
  const [del, setDel] = useState<Item | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErro, setDelErro] = useState<string | null>(null);

  return (
    <Carga titulo={titulo}>
      {(d, recarregar) => {
        const itens = tabela === 'v2_itens_modelo' ? d.itensModelo : d.itensProduto;
        const deps = del ? (tabela === 'v2_itens_modelo' ? dependenciasItemModelo(d, del.id) : dependenciasItemProduto(d, del.id)) : [];
        return (
          <section>
            <h1>{titulo}</h1>
            <p className="muted">
              {tabela === 'v2_itens_modelo'
                ? 'Atributos reutilizáveis que compõem os modelos. Cada modelo escolhe quais itens possui.'
                : 'Atributos próprios de produto (específicos do exemplar, como cor ou quilometragem).'}
            </p>
            <p><button type="button" className="btn btn-primary" onClick={() => setEdit({ item: null })}>Novo item</button></p>
            {itens.length === 0 ? (
              <div className="card"><p>Nenhum item ainda.</p></div>
            ) : (
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Tipo</th><th>Unidade</th><th>Limites</th><th>Ações</th></tr></thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.id}>
                      <td>{i.nome}{i.descricao && <div className="muted">{i.descricao}</div>}</td>
                      <td>{TIPOS[i.tipo]}</td>
                      <td>{i.unidade ?? '—'}</td>
                      <td>{i.tipo === 'numerico' ? `${i.valor_min ?? '—'} a ${i.valor_max ?? '—'}` : '—'}</td>
                      <td className="row-actions">
                        <button type="button" className="btn" onClick={() => setEdit({ item: i })}>Editar</button>
                        <button type="button" className="btn btn-danger" onClick={() => { setDel(i); setDelErro(null); }}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {edit && (
              <FormItem
                key={edit.item?.id ?? 'novo'} tabela={tabela} item={edit.item} d={d}
                onClose={() => setEdit(null)}
                onSaved={() => { setEdit(null); notify('success', 'Item salvo.'); recarregar(); }}
              />
            )}
            <ConfirmDialog
              open={del !== null} title="Excluir item" danger confirmLabel="Excluir" busy={delBusy}
              confirmDisabled={deps.length > 0}
              onCancel={() => setDel(null)}
              onConfirm={() => {
                if (!del) return;
                setDelBusy(true);
                excluirItem(tabela, del.id).then(
                  () => { setDelBusy(false); setDel(null); notify('success', 'Item excluído.'); recarregar(); },
                  (e: unknown) => { setDelBusy(false); setDelErro(toAppError(e).message); },
                );
              }}
            >
              {deps.length > 0 ? (
                <>
                  <p>O item <strong>{del?.nome}</strong> não pode ser excluído porque é usado em:</p>
                  <ul>{deps.map((x) => <li key={x.tipo + x.id}>{x.tipo}: {x.nome}</li>)}</ul>
                  <p>Remova esses usos primeiro.</p>
                </>
              ) : (
                <p>Excluir o item <strong>{del?.nome}</strong>? Esta ação não pode ser desfeita.</p>
              )}
              {delErro && <p className="notice notice-error" role="alert">{delErro}</p>}
            </ConfirmDialog>
          </section>
        );
      }}
    </Carga>
  );
}
