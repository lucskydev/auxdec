import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { diferencas, EditDialog, type ConflitoInfo } from './EditDialog';

const dados = { remotoVersao: 0, recarregar: vi.fn() };
vi.mock('../layout/DadosProvider', () => ({ useDados: () => dados }));
vi.mock('./UnsavedChanges', () => ({ useUnsavedGuard: vi.fn() }));

function montar(p: Partial<Parameters<typeof EditDialog>[0]> = {}) {
  const props = { title: 'T', onClose: vi.fn(), onSave: vi.fn(), dirty: false, saving: false, saveDisabled: false, erro: null, conflito: null, ...p };
  render(<MemoryRouter><EditDialog {...props}><input aria-label="campo" /></EditDialog></MemoryRouter>);
  return props;
}

describe('diferencas', () => {
  it('lista só o que mudou', () => {
    expect(diferencas([['Nome', 'a', 'a'], ['Unidade', 'km', 'm']])).toEqual([{ campo: 'Unidade', seu: 'km', atual: 'm' }]);
  });
});

describe('EditDialog', () => {
  it('sem alterações, Cancelar fecha direto', async () => {
    const p = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(p.onClose).toHaveBeenCalled();
  });
  it('com alterações, Cancelar pergunta; Continuar editando não fecha; Descartar fecha', async () => {
    const p = montar({ dirty: true });
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(p.onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(p.onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
  it('Salvar da pergunta grava sem descartar', async () => {
    const p = montar({ dirty: true });
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    const botoes = screen.getAllByRole('button', { name: 'Salvar' });
    await userEvent.click(botoes[botoes.length - 1]!);
    expect(p.onSave).toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  });
  it('conflito: preserva, pede atualização e depois mostra diferenças e reaplica', async () => {
    const reaplicar = vi.fn();
    const base: ConflitoInfo = { baseVersao: 1, atual: undefined, diffs: [], onReaplicar: reaplicar };
    montar({ conflito: base });
    expect(screen.getByText(/modificado em outra sessão/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar dados e comparar' }));
    expect(dados.recarregar).toHaveBeenCalled();
  });
  it('conflito com versão atual mostra tabela de diferenças', async () => {
    const reaplicar = vi.fn();
    montar({ conflito: { baseVersao: 1, atual: { versao: 2 }, diffs: [{ campo: 'Nome', seu: 'Meu', atual: 'Dele' }], onReaplicar: reaplicar } });
    expect(screen.getByText('Dele')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Reaplicar minhas alterações/ }));
    expect(reaplicar).toHaveBeenCalled();
  });
  it('registro excluído em outra sessão é informado', () => {
    montar({ conflito: { baseVersao: 1, atual: null, diffs: [], onReaplicar: vi.fn() } });
    expect(screen.getByText(/excluído em outra sessão/)).toBeInTheDocument();
  });
  it('erro comum aparece como alerta', () => {
    montar({ erro: 'Falha X' });
    expect(screen.getByRole('alert')).toHaveTextContent('Falha X');
  });
});
