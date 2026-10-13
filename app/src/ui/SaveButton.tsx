export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface Props {
  state: SaveState;
  onSave: () => void;
  disabled?: boolean;
}

const TEXT: Record<SaveState, string> = {
  idle: 'Salvar',
  dirty: 'Salvar alterações',
  saving: 'Salvando…',
  saved: 'Salvo ✓',
  error: 'Falhou — tentar novamente',
};

/** O estado vem do chamador: "Salvo" só deve ser passado depois da confirmação do Supabase. */
export function SaveButton({ state, onSave, disabled }: Props) {
  return (
    <span className="save-wrap">
      <button
        type="button"
        className={`btn btn-primary save-${state}`}
        onClick={onSave}
        disabled={disabled || state === 'saving' || state === 'idle' || state === 'saved'}
        aria-busy={state === 'saving'}
      >
        {TEXT[state]}
      </button>
      <span className="save-status" role="status" aria-live="polite">
        {state === 'dirty' && 'Alterações não salvas'}
        {state === 'saving' && 'Salvando no servidor'}
        {state === 'saved' && 'Salvo no servidor'}
        {state === 'error' && 'Erro ao salvar. Seus dados foram preservados.'}
      </span>
    </span>
  );
}
