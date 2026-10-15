import { useState } from 'react';
import type { Escopo } from '../domain/types';
import { lerZip, exportarEscopo, baixarBlob, type ZipLido } from '../services/backupZip';
import { carregarEscopo } from '../services/loader';
import { importarBackup } from '../services/importacao';
import { toAppError } from '../services/errors';
import { validarNome } from '../domain/names';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';

interface Props {
  escopos: Escopo[];
  onClose: () => void;
  onDone: (escopoId: string, orfaos: string[]) => void;
}

export function ImportarBackup({ escopos, onClose, onDone }: Props) {
  const [zip, setZip] = useState<ZipLido | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [modo, setModo] = useState<'novo' | 'substituir'>('novo');
  const [nome, setNome] = useState('');
  const [alvoId, setAlvoId] = useState('');
  const [backupFeito, setBackupFeito] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alvo = escopos.find((e) => e.id === alvoId) ?? null;
  const erroNome = modo === 'novo' ? validarNome(nome, escopos) : alvo ? validarNome(nome, escopos, alvo.id) : null;
  const pronto = zip?.validacao.ok === true && erroNome === null && (modo === 'novo' || (alvo !== null && backupFeito && confirmacao === alvo.nome));

  async function escolher(f: File) {
    setErro(null);
    setNomeArquivo(f.name);
    const lido = lerZip(new Uint8Array(await f.arrayBuffer()));
    setZip(lido);
    if (lido.backup) {
      const base = lido.backup.escopo.nome;
      setNome(escopos.some((e) => e.nome.trim().toLowerCase() === base.trim().toLowerCase()) ? `${base} (importado)` : base);
    }
  }

  async function fazerBackupDoAlvo() {
    if (!alvo) return;
    setPreparando(true);
    setErro(null);
    try {
      const r = await exportarEscopo(await carregarEscopo(alvo.id));
      if (r.falhas.length) throw new Error(`Backup incompleto (${r.falhas.length} imagem(ns) não baixadas). Substituição bloqueada.`);
      baixarBlob(r.blob, r.nomeArquivo);
      setBackupFeito(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : toAppError(e).message);
    } finally {
      setPreparando(false);
    }
  }

  async function importar() {
    if (!zip?.backup || !pronto) return;
    setTrabalhando(true);
    setErro(null);
    try {
      const r = await importarBackup(zip, nome, zip.backup.escopo.descricao, modo === 'novo' ? { tipo: 'novo' } : { tipo: 'substituir', alvo: alvo as Escopo, confirmacao });
      onDone(r.escopoId, r.orfaos);
    } catch (e) {
      setErro(toAppError(e).message);
      setTrabalhando(false);
    }
  }

  const r = zip?.validacao.resumo;
  return (
    <Dialog open variant="form" title="Importar backup" onClose={() => !trabalhando && onClose()}
      actions={<>
        <button type="button" className="btn" onClick={onClose} disabled={trabalhando}>Cancelar</button>
        <button type="button" className={`btn ${modo === 'substituir' ? 'btn-danger' : 'btn-primary'}`} onClick={() => void importar()} disabled={!pronto || trabalhando}>
          {trabalhando ? 'Importando…' : modo === 'novo' ? 'Importar como novo escopo' : 'Substituir escopo'}
        </button>
      </>}>
      <FormField label="Arquivo de backup (.zip)">
        <input type="file" accept=".zip,application/zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolher(f); }} disabled={trabalhando} />
      </FormField>
      {zip && !zip.validacao.ok && (
        <div className="notice notice-error" role="alert">
          <p>O arquivo “{nomeArquivo}” não pôde ser importado. Nada foi alterado.</p>
          <ul>{zip.validacao.erros.slice(0, 10).map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {zip?.validacao.ok && r && (
        <>
          <p role="status">Backup válido: {r.modelos} modelo(s), {r.produtos} produto(s), {r.itensModelo} item(ns) de modelo, {r.itensProduto} de produto, {r.itensAnalise} de análise, {r.filtros} filtro(s), {r.imagens} imagem(ns).</p>
          <fieldset>
            <legend>Destino</legend>
            <label><input type="radio" checked={modo === 'novo'} onChange={() => setModo('novo')} /> Criar novo escopo</label>{' '}
            <label><input type="radio" checked={modo === 'substituir'} onChange={() => setModo('substituir')} disabled={escopos.length === 0} /> Substituir um escopo existente</label>
          </fieldset>
          {modo === 'substituir' && (
            <>
              <FormField label="Escopo a substituir">
                <select value={alvoId} onChange={(e) => { setAlvoId(e.target.value); setBackupFeito(false); setConfirmacao(''); }}>
                  <option value="">Escolha…</option>
                  {escopos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </FormField>
              {alvo && (
                <>
                  <p className="notice notice-warning">Todo o conteúdo atual de “{alvo.nome}” será apagado e trocado pelo do backup. Baixe o backup do escopo atual primeiro.</p>
                  <p><button type="button" className="btn" onClick={() => void fazerBackupDoAlvo()} disabled={preparando}>{preparando ? 'Gerando…' : backupFeito ? 'Backup baixado ✓' : 'Baixar backup do escopo atual'}</button></p>
                  <FormField label={`Para confirmar, digite: ${alvo.nome}`}>
                    <input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="off" disabled={!backupFeito} />
                  </FormField>
                </>
              )}
            </>
          )}
          <FormField label="Nome do escopo" error={erroNome}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} /></FormField>
        </>
      )}
      {erro && <p className="notice notice-error" role="alert">{erro}</p>}
    </Dialog>
  );
}
