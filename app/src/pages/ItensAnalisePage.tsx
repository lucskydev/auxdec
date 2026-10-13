import { useRef, useState } from 'react';
import type { DadosEscopo, Direcao, ItemAnalise } from '../domain/types';
import { catalogoDe, dependenciasDiretas, nomesDe } from '../domain/catalogo';
import { dependenciasItemAnalise } from '../domain/dependencias';
import { alcanca, validarFormula } from '../domain/formula/validate';
import { paraArmazenamento, paraExibicao, CARACTERES_PROIBIDOS_EM_NOME } from '../domain/formula/display';
import { MAX_FORMULA_LENGTH } from '../domain/formula/lexer';
import { FUNCTIONS } from '../domain/formula/parser';
import { validarNome } from '../domain/names';
import { lerNumero, numeroParaTexto } from '../features/numeros';
import { excluirItemAnalise, salvarAgregado, salvarFormula, type ComponenteEntrada } from '../services/escrita';
import { toAppError } from '../services/errors';
import { Carga } from '../ui/Carga';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { useToasts } from '../ui/Toasts';

interface CompForm { chave: number; ref: string; peso: string; direcao: Direcao; lmin: string; lmax: string }
let chaveSeq = 1;

function opcoesDeReferencia(d: DadosEscopo, selfId: string | null) {
  return [
    ...d.itensModelo.filter((i) => i.tipo === 'numerico').map((i) => ({ valor: `m:${i.id}`, rotulo: `Modelo · ${i.nome}` })),
    ...d.itensProduto.filter((i) => i.tipo === 'numerico').map((i) => ({ valor: `p:${i.id}`, rotulo: `Produto · ${i.nome}` })),
    ...d.itensAnalise.filter((i) => i.id !== selfId).map((i) => ({ valor: `a:${i.id}`, rotulo: `Análise · ${i.nome}` })),
  ];
}

function FormAnalise({ d, item, tipoNovo, onClose, onSaved }: { d: DadosEscopo; item: ItemAnalise | null; tipoNovo: 'formula' | 'agregado'; onClose: () => void; onSaved: () => void }) {
  const tipo = item?.tipo ?? tipoNovo;
  const nomes = nomesDe(d);
  const [nome, setNome] = useState(item?.nome ?? '');
  const [descricao, setDescricao] = useState(item?.descricao ?? '');
  const [texto, setTexto] = useState(() => (item?.formula_texto ? paraExibicao(item.formula_texto, nomes) : ''));
  const [peso, setPeso] = useState(numeroParaTexto(item?.peso ?? 1));
  const [comps, setComps] = useState<CompForm[]>(() => {
    if (!item || item.tipo !== 'agregado') return [];
    return d.agregadoComponentes.filter((c) => c.agregado_id === item.id).sort((a, b) => a.ordem - b.ordem).map((c) => ({
      chave: chaveSeq++,
      ref: c.item_modelo_id ? `m:${c.item_modelo_id}` : c.item_produto_id ? `p:${c.item_produto_id}` : `a:${c.item_analise_id}`,
      peso: numeroParaTexto(c.peso), direcao: c.direcao, lmin: numeroParaTexto(c.lmin), lmax: numeroParaTexto(c.lmax),
    }));
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [insercao, setInsercao] = useState('');

  const erroNomeBase = nome === '' && !item ? null : validarNome(nome, d.itensAnalise, item?.id);
  const erroNome = erroNomeBase ?? (CARACTERES_PROIBIDOS_EM_NOME.test(nome) ? 'O nome não pode conter colchetes [ ou ].' : null);
  const opcoes = opcoesDeReferencia(d, item?.id ?? null);

  // ---- fórmula
  const conv = tipo === 'formula' ? paraArmazenamento(texto, nomes) : { texto: '', naoResolvidos: [] };
  const errosFormula: string[] = [];
  let refsUsadas: { kind: 'm' | 'p' | 'a'; id: string }[] = [];
  if (tipo === 'formula') {
    if (texto.trim() === '') errosFormula.push('Digite a fórmula.');
    else if (texto.length > MAX_FORMULA_LENGTH) errosFormula.push(`A fórmula excede ${MAX_FORMULA_LENGTH} caracteres.`);
    else if (conv.naoResolvidos.length) errosFormula.push(`Item não encontrado: ${conv.naoResolvidos.join(', ')}`);
    else {
      const v = validarFormula(conv.texto, catalogoDe(d, item?.id ?? null), item?.id ?? null);
      v.erros.forEach((e) => errosFormula.push(e.pos !== undefined ? `${e.mensagem} (posição ${e.pos + 1})` : e.mensagem));
      refsUsadas = v.refs;
    }
  }

  // ---- agregado
  const pesoNum = lerNumero(peso);
  const erroPeso = tipo !== 'agregado' ? null : !pesoNum.ok ? pesoNum.erro : pesoNum.valor === null || pesoNum.valor < 1 || pesoNum.valor > 10 ? 'O peso deve ficar entre 1 e 10.' : null;
  const errosComp: string[] = [];
  const entradas: ComponenteEntrada[] = [];
  if (tipo === 'agregado') {
    if (comps.length < 2 || comps.length > 5) errosComp.push('Um agregado precisa de 2 a 5 componentes.');
    const vistos = new Set<string>();
    comps.forEach((c, idx) => {
      const n = idx + 1;
      const p = lerNumero(c.peso), a = lerNumero(c.lmin), b = lerNumero(c.lmax);
      if (!c.ref) errosComp.push(`Componente ${n}: escolha um item.`);
      else if (vistos.has(c.ref)) errosComp.push(`Componente ${n}: item repetido.`);
      vistos.add(c.ref);
      if (!p.ok || p.valor === null || p.valor < 1 || p.valor > 10) errosComp.push(`Componente ${n}: peso entre 1 e 10.`);
      if (!a.ok || a.valor === null || !b.ok || b.valor === null) errosComp.push(`Componente ${n}: informe os dois limites de normalização.`);
      else if (a.valor === b.valor) errosComp.push(`Componente ${n}: os limites não podem ser iguais.`);
      if (c.ref.startsWith('a:') && item) {
        const alvo = c.ref.slice(2);
        if (alvo === item.id || alcanca(alvo, item.id, (x) => dependenciasDiretas(d, x))) errosComp.push(`Componente ${n}: criaria dependência circular.`);
      }
      if (c.ref && p.ok && p.valor !== null && a.ok && a.valor !== null && b.ok && b.valor !== null) {
        const k = c.ref[0];
        const id = c.ref.slice(2);
        entradas.push({
          peso: p.valor, direcao: c.direcao, lmin: a.valor, lmax: b.valor,
          item_modelo_id: k === 'm' ? id : null, item_produto_id: k === 'p' ? id : null, item_analise_id: k === 'a' ? id : null,
        });
      }
    });
  }

  const invalido = erroNomeBase !== null || CARACTERES_PROIBIDOS_EM_NOME.test(nome) || (tipo === 'formula' ? errosFormula.length > 0 : erroPeso !== null || errosComp.length > 0);

  function inserir() {
    if (!insercao) return;
    const [k, ...resto] = insercao.split(':');
    const id = resto.join(':');
    const n = nomes.nome(k as 'm' | 'p' | 'a', id);
    if (!n) return;
    const trecho = `[${k}:${n}]`;
    const el = areaRef.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + trecho + texto.slice(fim));
    setInsercao('');
    el?.focus();
  }

  async function salvar() {
    if (invalido) return;
    setSalvando(true);
    setErro(null);
    try {
      const base = { escopoId: d.escopo.id, id: item?.id ?? null, versao: item?.versao ?? null, nome, descricao: descricao.trim() || null };
      if (tipo === 'formula') await salvarFormula({ ...base, texto: conv.texto });
      else await salvarAgregado({ ...base, peso: pesoNum.ok && pesoNum.valor !== null ? pesoNum.valor : 1, componentes: entradas });
      onSaved();
    } catch (e) {
      setErro(toAppError(e).message);
      setSalvando(false);
    }
  }

  const upd = (chave: number, p: Partial<CompForm>) => setComps((l) => l.map((c) => (c.chave === chave ? { ...c, ...p } : c)));

  return (
    <Dialog open title={`${item ? 'Editar' : 'Novo'} ${tipo === 'formula' ? 'item de fórmula' : 'item agregado'}`} onClose={() => !salvando && onClose()}
      actions={<>
        <button type="button" className="btn" onClick={onClose} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando || invalido}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <FormField label="Nome" error={erroNome}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoFocus /></FormField>
      <FormField label="Descrição (opcional)"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500} /></FormField>

      {tipo === 'formula' && (
        <>
          <FormField label="Fórmula" hint={`Operadores + - * / ^ ( ), comparações e funções: ${Object.keys(FUNCTIONS).join(', ')}. Referencie itens como [m:Nome], [p:Nome] ou [a:Nome].`} error={errosFormula[0] ?? null}>
            <textarea ref={areaRef} value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} spellCheck={false} className="mono" />
          </FormField>
          <div className="field">
            <label htmlFor="ins">Inserir item na fórmula</label>
            <span className="row-actions">
              <select id="ins" value={insercao} onChange={(e) => setInsercao(e.target.value)}>
                <option value="">Escolha…</option>
                {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
              <button type="button" className="btn" onClick={inserir} disabled={!insercao}>Inserir</button>
            </span>
          </div>
          {errosFormula.length > 1 && <ul className="field-error">{errosFormula.slice(1).map((e) => <li key={e}>{e}</li>)}</ul>}
          {errosFormula.length === 0 && <p className="muted" role="status">Fórmula válida. Itens usados: {refsUsadas.length ? refsUsadas.map((r) => nomes.nome(r.kind, r.id)).join(', ') : 'nenhum'}.</p>}
        </>
      )}

      {tipo === 'agregado' && (
        <>
          <FormField label="Peso deste agregado (1–10)" error={erroPeso}><input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></FormField>
          <h3>Componentes ({comps.length}/5)</h3>
          <p className="muted">Cada componente é normalizado de 0 a 10 entre os limites informados; “maior é melhor” dá 10 ao limite superior, “menor é melhor” inverte.</p>
          {comps.map((c, idx) => (
            <fieldset key={c.chave} className="componente">
              <legend>Componente {idx + 1}</legend>
              <FormField label="Item">
                <select value={c.ref} onChange={(e) => upd(c.chave, { ref: e.target.value })}>
                  <option value="">Escolha…</option>
                  {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              </FormField>
              <FormField label="Peso (1–10)"><input inputMode="decimal" value={c.peso} onChange={(e) => upd(c.chave, { peso: e.target.value })} /></FormField>
              <FormField label="Direção">
                <select value={c.direcao} onChange={(e) => upd(c.chave, { direcao: e.target.value as Direcao })}>
                  <option value="maior">Maior é melhor</option>
                  <option value="menor">Menor é melhor</option>
                </select>
              </FormField>
              <FormField label="Limite inferior"><input inputMode="decimal" value={c.lmin} onChange={(e) => upd(c.chave, { lmin: e.target.value })} /></FormField>
              <FormField label="Limite superior"><input inputMode="decimal" value={c.lmax} onChange={(e) => upd(c.chave, { lmax: e.target.value })} /></FormField>
              <button type="button" className="btn btn-danger" onClick={() => setComps((l) => l.filter((x) => x.chave !== c.chave))}>Remover componente</button>
            </fieldset>
          ))}
          <p><button type="button" className="btn" disabled={comps.length >= 5} onClick={() => setComps((l) => [...l, { chave: chaveSeq++, ref: '', peso: '1', direcao: 'maior', lmin: '0', lmax: '100' }])}>Adicionar componente</button></p>
          {errosComp.length > 0 && <ul className="field-error" role="alert">{[...new Set(errosComp)].map((e) => <li key={e}>{e}</li>)}</ul>}
        </>
      )}
      {erro && <p className="notice notice-error" role="alert">{erro}</p>}
    </Dialog>
  );
}

export function ItensAnalisePage() {
  const { notify } = useToasts();
  const [edit, setEdit] = useState<{ item: ItemAnalise | null; tipo: 'formula' | 'agregado' } | null>(null);
  const [del, setDel] = useState<ItemAnalise | null>(null);
  const [busy, setBusy] = useState(false);
  const [delErro, setDelErro] = useState<string | null>(null);
  return (
    <Carga titulo="Itens de análise">
      {(d, recarregar) => {
        const deps = del ? dependenciasItemAnalise(d, del.id) : [];
        const nomes = nomesDe(d);
        return (
          <section>
            <h1>Itens de análise</h1>
            <p className="muted">Valores calculados a partir dos itens: fórmulas livres ou agregados ponderados (pontuação de 0 a 10).</p>
            <p className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => setEdit({ item: null, tipo: 'formula' })}>Nova fórmula</button>
              <button type="button" className="btn btn-primary" onClick={() => setEdit({ item: null, tipo: 'agregado' })}>Novo agregado</button>
            </p>
            {d.itensAnalise.length === 0 ? <div className="card"><p>Nenhum item de análise ainda.</p></div> : (
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Tipo</th><th>Definição</th><th>Ações</th></tr></thead>
                <tbody>
                  {d.itensAnalise.map((a) => (
                    <tr key={a.id}>
                      <td>{a.nome}{d.config.agregado_ranking_id === a.id && <div className="muted">Usado no ranking</div>}</td>
                      <td>{a.tipo === 'formula' ? 'Fórmula' : 'Agregado'}</td>
                      <td className="mono">{a.tipo === 'formula' ? paraExibicao(a.formula_texto ?? '', nomes) : `${d.agregadoComponentes.filter((c) => c.agregado_id === a.id).length} componentes · peso ${a.peso}`}</td>
                      <td className="row-actions">
                        <button type="button" className="btn" onClick={() => setEdit({ item: a, tipo: a.tipo })}>Editar</button>
                        <button type="button" className="btn btn-danger" onClick={() => { setDel(a); setDelErro(null); }}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {edit && <FormAnalise key={edit.item?.id ?? edit.tipo} d={d} item={edit.item} tipoNovo={edit.tipo} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); notify('success', 'Item de análise salvo.'); recarregar(); }} />}
            <ConfirmDialog open={del !== null} title="Excluir item de análise" danger confirmLabel="Excluir" busy={busy} confirmDisabled={deps.length > 0} onCancel={() => setDel(null)}
              onConfirm={() => {
                if (!del) return;
                setBusy(true);
                excluirItemAnalise(del.id).then(
                  () => { setBusy(false); setDel(null); notify('success', 'Item excluído.'); recarregar(); },
                  (e: unknown) => { setBusy(false); setDelErro(toAppError(e).message); },
                );
              }}>
              {deps.length > 0 ? (
                <><p><strong>{del?.nome}</strong> não pode ser excluído porque é usado em:</p><ul>{deps.map((x) => <li key={x.tipo + x.id}>{x.tipo}: {x.nome}</li>)}</ul></>
              ) : <p>Excluir <strong>{del?.nome}</strong>? Esta ação não pode ser desfeita.</p>}
              {delErro && <p className="notice notice-error" role="alert">{delErro}</p>}
            </ConfirmDialog>
          </section>
        );
      }}
    </Carga>
  );
}
