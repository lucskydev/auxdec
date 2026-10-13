import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}
interface ToastApi {
  notify: (kind: ToastKind, text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const LABEL: Record<ToastKind, string> = { success: 'Sucesso', error: 'Erro', warning: 'Aviso', info: 'Informação' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (kind: ToastKind, text: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      // erros ficam mais tempo na tela
      window.setTimeout(() => dismiss(id), kind === 'error' ? 10000 : 5000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notificações" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <strong>{LABEL[t.kind]}:</strong> <span>{t.text}</span>
            <button type="button" className="icon-btn" aria-label="Fechar notificação" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts deve ser usado dentro de ToastProvider');
  return ctx;
}
