import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormField } from './FormField';
import { SaveButton } from './SaveButton';
import { ToastProvider, useToasts } from './Toasts';

describe('SaveButton', () => {
  it('só permite salvar quando há alterações e informa o estado em texto', async () => {
    const onSave = vi.fn();
    const { rerender } = render(<SaveButton state="idle" onSave={onSave} />);
    expect(screen.getByRole('button')).toBeDisabled();

    rerender(<SaveButton state="dirty" onSave={onSave} />);
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    rerender(<SaveButton state="saving" onSave={onSave} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');

    rerender(<SaveButton state="error" onSave={onSave} />);
    expect(screen.getByRole('button')).toBeEnabled();
    expect(screen.getByText(/dados foram preservados/)).toBeInTheDocument();

    rerender(<SaveButton state="saved" onSave={onSave} />);
    expect(screen.getByText('Salvo no servidor')).toBeInTheDocument();
  });
});

describe('FormField', () => {
  it('associa rótulo, dica e erro ao campo', () => {
    render(
      <FormField label="Nome" hint="Único no escopo" error="obrigatório">
        <input />
      </FormField>,
    );
    const input = screen.getByLabelText('Nome');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toMatch(/hint.*err/);
    expect(screen.getByRole('alert')).toHaveTextContent('Erro: obrigatório');
  });
});

function Disparador() {
  const { notify } = useToasts();
  return (
    <>
      <button onClick={() => notify('success', 'Salvo')}>ok</button>
      <button onClick={() => notify('error', 'Falhou')}>falha</button>
    </>
  );
}

describe('Toasts', () => {
  it('rotula o tipo em texto e usa alert apenas para erros', async () => {
    render(
      <ToastProvider>
        <Disparador />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('ok'));
    expect(screen.getByRole('status')).toHaveTextContent('Sucesso: Salvo');
    await userEvent.click(screen.getByText('falha'));
    expect(screen.getByRole('alert')).toHaveTextContent('Erro: Falhou');
    await userEvent.click(screen.getAllByLabelText('Fechar notificação')[1]!);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
