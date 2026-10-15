import { useId, type ReactElement, cloneElement } from 'react';

interface Props {
  label: string;
  error?: string | null;
  hint?: string;
  /** ocupa a linha inteira nos formulários em colunas (descrições, fórmulas) */
  largo?: boolean;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}

/** Associa rótulo, dica e erro ao controle (acessibilidade). */
export function FormField({ label, error, hint, largo, children }: Props) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={largo ? 'field largo' : 'field'}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <small id={`${id}-hint`} className="hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-err`} className="field-error" role="alert">
          Erro: {error}
        </small>
      )}
    </div>
  );
}
