import { useState, type ReactNode } from 'react';
import { useDados } from '../layout/DadosProvider';
import { Dialog } from './Dialog';
import { useUnsavedGuard } from './UnsavedChanges';

export interface Diff {
  campo: string;
  seu: string;
  atual: string;
}

/** Só devolve os campos que realmente diferem entre o que o usuário editou e o que está salvo agora. */
export function diferencas(pares: [campo: string, seu: string, atual: string][]): Diff[] {
  return pares.filter(([, a, b]) => a !== b).map(([campo, seu, atual]) => ({ campo, seu, atual }));
}

export interface ConflitoInfo {
  /** versão em que o usuário começou a editar */
  baseVersao: number;
  /** registro como está agora no servidor: undefined = ainda não atualizado; null = excluído */
  atual: { versao: number } | null | undefined;
  diffs: Diff[];
  /** passa a editar sobre a versão atual, mantendo o que o usuário digitou */
  onReaplicar: () => void;
}

interface Props {
  title: string;
  onClose: () => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  saveDisabled: boolean;
  erro: string | null;
  conflito: ConflitoInfo | null;
  children: ReactNode;
}

function PainelConflito({ c }: { c: ConflitoInfo }) {
  const { recarregar } = useDados();
  const [pedido, setPedido] = useState(false);
  const atualizado = c.atual !== undefined && (c.atual === null || c.atual.versao > c.baseVersao);
  return (
    <div className="notice notice-error" role="alert">
      <p><strong>Este registro foi modificado em outra sessão.</strong> Suas alterações foram preservadas e nada foi gravado.</p>
      {!atualizado && (
        <p>
          <button type="button" className="btn" onClick={() => { setPedido(true); recarregar(); }} disabled={pedido}>
            {pedido ? 'Atualizando…' : 'Atualizar dados e comparar'}
          </button>
        </p>
      )}
      {atualizado && c.atual === null && <p>O registro foi excluído em outra sessão. Copie o que precisar; para recriá-lo, feche e crie um novo.</p>}
      {atualizado && c.atual !== null && (
        <>
          {c.diffs.length === 0 ? (
            <p>A versão atual não difere do que você editou. Pode reaplicar e salvar.</p>
          ) : (
            <table className="tabela" aria-label="Diferenças entre sua edição e a versão atual">
              <thead><tr><th>Campo</th><th>Sua edição</th><th>Versão atual</th></tr></thead>
              <tbody>
                {c.diffs.map((d) => (
                  <tr key={d.campo}><td>{d.campo}</td><td>{d.seu || '—'}</td><td>{d.atual || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p><button type="button" className="btn btn-primary" onClick={c.onReaplicar}>Reaplicar minhas alterações sobre a versão atual</button></p>
        </>
      )}
    </div>
  );
}

/**
 * Moldura comum dos formulários de edição: alterações não salvas (Salvar / Descartar / Continuar editando),
 * aviso de atualização remota e tela de conflito de versão. A gravação em si continua sendo explícita.
 */
export function EditDialog({ title, onClose, onSave, dirty, saving, saveDisabled, erro, conflito, children }: Props) {
  const { remotoVersao } = useDados();
  const [remotoAoAbrir] = useState(remotoVersao);
  const [perguntando, setPerguntando] = useState(false);
  useUnsavedGuard(dirty);

  const tentarFechar = () => {
    if (saving) return;
    if (dirty) setPerguntando(true);
    else onClose();
  };

  return (
    <>
      <Dialog
        open
        variant="form"
        title={title}
        onClose={tentarFechar}
        actions={
          <>
            <button type="button" className="btn" onClick={tentarFechar} disabled={saving}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving || saveDisabled}>
              {saving ? 'Salvando…' : conflito ? 'Tentar salvar de novo' : 'Salvar'}
            </button>
          </>
        }
      >
        {remotoVersao > remotoAoAbrir && !conflito && (
          <p className="notice notice-warning" role="status">
            Os dados foram atualizados em outra sessão enquanto você editava. O que você digitou foi mantido; se o registro mudou, o servidor avisará ao salvar.
          </p>
        )}
        {children}
        {conflito && <PainelConflito c={conflito} />}
        {erro && !conflito && <p className="notice notice-error" role="alert">{erro}</p>}
      </Dialog>
      {perguntando && (
        <Dialog
          open
          title="Alterações não salvas"
          onClose={() => setPerguntando(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setPerguntando(false)}>Continuar editando</button>
              <button type="button" className="btn btn-danger" onClick={onClose}>Descartar</button>
              <button type="button" className="btn btn-primary" onClick={() => { setPerguntando(false); onSave(); }} disabled={saveDisabled}>Salvar</button>
            </>
          }
        >
          <p>Há alterações que ainda não foram salvas. O que deseja fazer?</p>
        </Dialog>
      )}
    </>
  );
}
