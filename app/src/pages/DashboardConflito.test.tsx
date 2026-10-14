import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Escopo } from '../domain/types';

const escopo: Escopo = { id: 'e1', nome: 'Veículos', descricao: null, ultimo_acesso: '2026-01-01T00:00:00Z', versao: 1 };
const estado = { escopos: [escopo], loading: false, error: null, recarregar: vi.fn(), selecionar: vi.fn() };
const atualizar = vi.fn();

vi.mock('../layout/ScopeProvider', () => ({ useScope: () => estado }));
vi.mock('../layout/DadosProvider', () => ({ useDados: () => ({ remotoVersao: 0, recarregar: vi.fn() }) }));
vi.mock('../ui/UnsavedChanges', () => ({ useUnsavedGuard: vi.fn() }));
vi.mock('../ui/Toasts', () => ({ useToasts: () => ({ notify: vi.fn() }) }));
vi.mock('../services/escrita', () => ({ atualizarEscopo: (...a: unknown[]) => atualizar(...a), criarEscopo: vi.fn(), excluirEscopo: vi.fn() }));
vi.mock('../services/loader', () => ({ carregarEscopo: vi.fn() }));
vi.mock('../services/backupZip', () => ({ exportarEscopo: vi.fn(), baixarBlob: vi.fn() }));
vi.mock('../services/imagens', () => ({ removerArquivos: vi.fn() }));
vi.mock('./ImportarBackup', () => ({ ImportarBackup: () => null }));

import { DashboardPage } from './DashboardPage';

describe('edição de escopo com conflito de versão', () => {
  beforeEach(() => { atualizar.mockReset(); estado.escopos = [escopo]; });

  it('preserva o que foi digitado e mostra a diferença para a versão atual', async () => {
    atualizar.mockRejectedValue({ code: 'V2001', message: 'x' });
    const { rerender } = render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const campo = screen.getByLabelText('Nome');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Carros');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('button', { name: /Atualizar dados e comparar/ })).toBeTruthy();
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Carros');

    // outra sessão renomeou: a lista de escopos chega com a versão nova
    estado.escopos = [{ ...escopo, nome: 'Automóveis', versao: 2 }];
    rerender(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect((await screen.findAllByText('Automóveis')).length).toBeGreaterThan(1);
    await userEvent.click(screen.getByRole('button', { name: /Reaplicar minhas alterações/ }));
    atualizar.mockResolvedValue({ ...escopo, nome: 'Carros', versao: 3 });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(atualizar).toHaveBeenLastCalledWith(expect.objectContaining({ versao: 2 }), 'Carros', null);
  });

  it('falha de rede mantém o formulário aberto com os dados digitados', async () => {
    atualizar.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByLabelText('Nome'), ' 2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Falha de conexão/)).toBeTruthy();
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Veículos 2');
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
