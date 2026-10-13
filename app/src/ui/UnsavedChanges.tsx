import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { Dialog } from './Dialog';

/** Uma tela de edição registra: há alterações? e como salvar. */
interface Registration {
  dirty: boolean;
  save?: () => Promise<boolean>;
}

interface GuardApi {
  register: (r: Registration | null) => void;
  /** Executa a ação; se houver alterações pendentes, pergunta Salvar / Descartar / Cancelar. */
  run: (action: () => void) => void;
}

const GuardContext = createContext<GuardApi | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const reg = useRef<Registration | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const blocker = useBlocker(() => reg.current?.dirty === true);

  const register = useCallback((r: Registration | null) => {
    reg.current = r;
    setCanSave(Boolean(r?.save));
  }, []);

  const run = useCallback((action: () => void) => {
    if (reg.current?.dirty) setPending(() => action);
    else action();
  }, []);

  // Navegação interna bloqueada pelo roteador
  const blocked = blocker.state === 'blocked';
  const open = blocked || pending !== null;

  // Fechar/recarregar a aba
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (reg.current?.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const proceed = () => {
    if (blocked) blocker.proceed();
    else pending?.();
    setPending(null);
  };
  const cancel = () => {
    if (blocked) blocker.reset();
    setPending(null);
  };
  const discard = () => {
    reg.current = null; // descarte explícito pelo usuário
    proceed();
  };
  const saveAndLeave = async () => {
    if (!reg.current?.save) return;
    setBusy(true);
    const ok = await reg.current.save();
    setBusy(false);
    if (ok) proceed(); // se falhar, permanece na tela com os dados preservados
  };

  const api = useMemo(() => ({ register, run }), [register, run]);

  return (
    <GuardContext.Provider value={api}>
      {children}
      <Dialog
        open={open}
        title="Alterações não salvas"
        onClose={cancel}
        actions={
          <>
            <button type="button" className="btn" onClick={cancel} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={discard} disabled={busy}>
              Descartar
            </button>
            {canSave && (
              <button type="button" className="btn btn-primary" onClick={() => void saveAndLeave()} disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
            )}
          </>
        }
      >
        <p>Há alterações que ainda não foram salvas. O que deseja fazer?</p>
      </Dialog>
    </GuardContext.Provider>
  );
}

/** Uso nas telas de edição: useUnsavedGuard(dirty, salvar). */
export function useUnsavedGuard(dirty: boolean, save?: () => Promise<boolean>): void {
  const ctx = useContext(GuardContext);
  if (!ctx) throw new Error('useUnsavedGuard deve ser usado dentro de UnsavedChangesProvider');
  const { register } = ctx;
  useEffect(() => {
    register({ dirty, save });
    return () => register(null);
  }, [dirty, save, register]);
}

export function useGuardedAction(): GuardApi['run'] {
  const ctx = useContext(GuardContext);
  if (!ctx) throw new Error('useGuardedAction deve ser usado dentro de UnsavedChangesProvider');
  return ctx.run;
}
