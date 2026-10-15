import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
  /** 'form': janela larga de cadastro/edição, com Cancelar/Salvar fixos no topo. */
  variant?: 'form';
}

/** Diálogo modal nativo (<dialog>): foco preso, Esc fecha, utilizável por teclado. */
export function Dialog({ open, title, onClose, children, actions, variant }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={variant === 'form' ? 'dialog dialog-form' : 'dialog'}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        variant === 'form' ? (
          <div>
            <div className="dialog-head">
              <h2 id="dialog-title">{title}</h2>
              <div className="dialog-actions">{actions}</div>
            </div>
            <div className="dialog-body">{children}</div>
          </div>
        ) : (
          <div>
            <h2 id="dialog-title">{title}</h2>
            <div className="dialog-body">{children}</div>
            <div className="dialog-actions">{actions}</div>
          </div>
        )
      )}
    </dialog>
  );
}
