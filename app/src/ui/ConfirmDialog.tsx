import { useState } from 'react';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  title: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  /** Se definido, o usuário precisa digitar exatamente este texto (confirmação reforçada). */
  typeToConfirm?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

export function ConfirmDialog(p: Props) {
  const [typed, setTyped] = useState('');
  const liberado = (p.typeToConfirm === undefined || typed === p.typeToConfirm) && !p.confirmDisabled;
  const fechar = () => {
    setTyped('');
    p.onCancel();
  };
  return (
    <Dialog
      open={p.open}
      title={p.title}
      onClose={fechar}
      actions={
        <>
          <button type="button" className="btn" onClick={fechar} disabled={p.busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${p.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={p.onConfirm}
            disabled={!liberado || p.busy}
          >
            {p.busy ? 'Aguarde…' : p.confirmLabel}
          </button>
        </>
      }
    >
      {p.children}
      {p.typeToConfirm !== undefined && (
        <div className="field">
          <label htmlFor="confirm-text">
            Para confirmar, digite exatamente: <strong>{p.typeToConfirm}</strong>
          </label>
          <input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      )}
    </Dialog>
  );
}
