import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Escopo } from '../domain/types';
import { useScope } from '../layout/ScopeProvider';
import { atualizarEscopo, criarEscopo, excluirEscopo } from '../services/escrita';
import { toAppError } from '../services/errors';
import { carregarEscopo } from '../services/loader';
import { exportarEscopo, baixarBlob } from '../services/backupZip';
import { removerArquivos } from '../services/imagens';
import { validarNome } from '../domain/names';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { ImportarBackup } from './ImportarBackup';
import { Spinner } from '../ui/Spinner';
import { useToasts } from '../ui/Toasts';

type Modo = { tipo: 'novo' } | { tipo: 'editar'; escopo: Escopo } | null;

function FormEscopo({ modo, escopos, onClose, onSaved }: { modo: NonNullable<Modo>; escopos: Escopo[]; onClose: () => void; onSaved: (e: Escopo) => void }) {
  const editando = modo.tipo === 'editar' ? modo.escopo : null;
  const [nome, setNome] = useState(editando?.nome ?? '');
  const [descricao, setDescricao] = useState(editando?.descricao ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const erroNome = nome === '' && !editando ? null : validarNome(nome, escopos, editando?.id);

  async function salvar() {
    if (validarNome(nome, escopos, editando?.id)) return;
    setSalvando(true);
    setErroServidor(null);
    try {
      const d = descricao.trim() === '' ? null : descricao.trim();
      onSaved(editando ? await atualizarEscopo(editando, nome, d) : await criarEscopo(nome, d));
    } catch (e) {
      setErroServidor(toAppError(e).message);
      setSalvando(false);
    }
  }
  return (
    <Dialog
      open
      title={editando ? 'Editar escopo' : 'Novo escopo'}
      onClose={() => !salvando && onClose()}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando || validarNome(nome, escopos, editando?.id) !== null}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <FormField label="Nome" error={erroNome}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />
      </FormField>
      <FormField label="Descrição (opcional)">
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={500} />
      </FormField>
      {erroServidor && <p className="notice notice-error" role="alert">{erroServidor}</p>}
    </Dialog>
  );
}

export function DashboardPage() {
  const { escopos, loading, error, recarregar, selecionar } = useScope();
  const { notify } = useToasts();
  const [modo, setModo] = useState<Modo>(null);
  const [excluir, setExcluir] = useState<Escopo | null>(null);
  const [etapaExcluir, setEtapaExcluir] = useState<'inicio' | 'preparando' | 'pronto'>('inicio');
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  if (loading) return <Spinner label="Carregando escopos…" />;
  if (error) {
    return (
      <section>
        <h1>Dashboard</h1>
        <p className="notice notice-error" role="alert">Erro: {error.message}</p>
        <button type="button" className="btn" onClick={() => void recarregar()}>Tentar novamente</button>
      </section>
    );
  }

  function abrirExclusao(e: Escopo) {
    setExcluir(e);
    setEtapaExcluir('inicio');
    setErroExcluir(null);
  }

  /** O backup é gerado, verificado (lido de volta) e baixado ANTES de liberar a exclusão. */
  async function prepararBackup() {
    if (!excluir) return;
    setEtapaExcluir('preparando');
    setErroExcluir(null);
    try {
      const dados = await carregarEscopo(excluir.id);
      const r = await exportarEscopo(dados);
      if (r.falhas.length > 0) {
        throw new Error(`Backup incompleto: ${r.falhas.length} imagem(ns) não puderam ser baixadas. Exclusão bloqueada.`);
      }
      baixarBlob(r.blob, r.nomeArquivo);
      setEtapaExcluir('pronto');
    } catch (e) {
      setErroExcluir(e instanceof Error ? e.message : toAppError(e).message);
      setEtapaExcluir('inicio');
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      const caminhos = await excluirEscopo(excluir.id, excluir.versao, excluir.nome);
      const falhas = await removerArquivos(caminhos);
      notify('success', `Escopo "${excluir.nome}" excluído.`);
      if (falhas.length) notify('warning', `${falhas.length} arquivo(s) de imagem não foram removidos do armazenamento e ficaram órfãos.`);
      setExcluir(null);
      await recarregar();
    } catch (e) {
      setErroExcluir(toAppError(e).message);
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <section>
      <h1>Dashboard</h1>
      <p><button type="button" className="btn btn-primary" onClick={() => setModo({ tipo: 'novo' })}>Novo escopo</button>{' '}<button type="button" className="btn" onClick={() => setImportando(true)}>Importar backup</button></p>
      {escopos.length === 0 ? (
        <div className="card">
          <h2>Nenhum escopo ainda</h2>
          <p>Um escopo é uma categoria de comparação (por exemplo, Veículos ou Imóveis). Crie o primeiro para começar.</p>
        </div>
      ) : (
        <>
          <h2>Escopos recentes</h2>
          <ul className="card-list">
            {escopos.map((s) => (
              <li key={s.id} className="card">
                <h3>{s.nome}</h3>
                {s.descricao && <p className="muted">{s.descricao}</p>}
                <p className="muted">Último acesso: {new Date(s.ultimo_acesso).toLocaleString('pt-BR')}</p>
                <div className="row-actions">
                  <Link to="/analise" className="btn" onClick={() => selecionar(s.id)}>Abrir análise</Link>
                  <button type="button" className="btn" onClick={() => setModo({ tipo: 'editar', escopo: s })}>Editar</button>
                  <button type="button" className="btn btn-danger" onClick={() => abrirExclusao(s)}>Excluir</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {importando && (
        <ImportarBackup
          escopos={escopos}
          onClose={() => setImportando(false)}
          onDone={(id, orfaos) => {
            setImportando(false);
            notify('success', 'Backup importado.');
            if (orfaos.length) notify('warning', `${orfaos.length} arquivo(s) de imagem antigos não foram removidos do armazenamento.`);
            selecionar(id);
            void recarregar();
          }}
        />
      )}

      {modo && (
        <FormEscopo
          key={modo.tipo === 'editar' ? modo.escopo.id : 'novo'}
          modo={modo}
          escopos={escopos}
          onClose={() => setModo(null)}
          onSaved={(e) => {
            const novo = modo.tipo === 'novo';
            setModo(null);
            notify('success', novo ? `Escopo "${e.nome}" criado.` : 'Escopo atualizado.');
            if (novo) selecionar(e.id);
            void recarregar();
          }}
        />
      )}

      <ConfirmDialog
        open={excluir !== null}
        title="Excluir escopo"
        danger
        confirmLabel="Excluir definitivamente"
        typeToConfirm={excluir?.nome}
        confirmDisabled={etapaExcluir !== 'pronto'}
        busy={excluindo}
        onConfirm={() => void confirmarExclusao()}
        onCancel={() => setExcluir(null)}
      >
        <p>
          Excluir <strong>{excluir?.nome}</strong> apaga todos os seus modelos, produtos, itens, análises, filtros e imagens. Isso não pode ser desfeito.
        </p>
        <p>
          Primeiro gere o backup. A exclusão só é liberada depois que o arquivo for criado e verificado.
        </p>
        <p>
          <button type="button" className="btn" onClick={() => void prepararBackup()} disabled={etapaExcluir === 'preparando' || excluindo}>
            {etapaExcluir === 'preparando' ? 'Gerando backup…' : etapaExcluir === 'pronto' ? 'Backup baixado ✓ (baixar de novo)' : 'Baixar backup (.zip)'}
          </button>
        </p>
        {erroExcluir && <p className="notice notice-error" role="alert">{erroExcluir}</p>}
      </ConfirmDialog>
    </section>
  );
}
