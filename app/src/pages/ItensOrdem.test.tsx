import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DadosEscopo } from '../domain/types';
import { dadosFalsos, itemFalso } from '../test/dadosFalsos';

const recarregar = vi.fn();
const notify = vi.fn();
const estado: { dados: DadosEscopo } = { dados: dadosFalsos() };
const chamadas: unknown[][] = [];
let falhar = false;

vi.mock('../layout/ScopeProvider', () => ({ useScope: () => ({ ativo: { id: 'e1', nome: 'Veículos' }, escopos: [], loading: false, error: null }) }));
vi.mock('../layout/DadosProvider', () => ({
  useDados: () => ({ dados: estado.dados, loading: false, error: null, recarregar, remotoVersao: 0 }),
}));
vi.mock('../ui/UnsavedChanges', () => ({ useUnsavedGuard: vi.fn() }));
vi.mock('../ui/Toasts', () => ({ useToasts: () => ({ notify }) }));
vi.mock('../services/escrita', () => ({
  criarItem: vi.fn(), excluirItem: vi.fn(), atualizarItem: vi.fn(),
  reordenarItens: (...a: unknown[]) => { chamadas.push(a); return falhar ? Promise.reject({ code: 'V2013', message: 'lista inválida' }) : Promise.resolve(); },
}));

import { ItensPage } from './ItensPage';

const nomes = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1]?.textContent);

beforeEach(() => {
  falhar = false;
  chamadas.length = 0;
  recarregar.mockReset();
  notify.mockReset();
  estado.dados = dadosFalsos({
    itensProduto: [
      itemFalso({ id: 'a', nome: 'Alfa', ordem: 1 }), itemFalso({ id: 'b', nome: 'Beta', ordem: 2 }), itemFalso({ id: 'c', nome: 'Gama', ordem: 3 }),
    ],
  });
});

const montar = () => render(<MemoryRouter><ItensPage tabela="v2_itens_produto" /></MemoryRouter>);

describe('ItensPage: reordenar', () => {
  it('mostra os itens na ordem recebida e envia a lista completa ao mover com os botões', async () => {
    montar();
    expect(nomes()).toEqual(['Alfa', 'Beta', 'Gama']);
    await userEvent.click(screen.getByRole('button', { name: 'Mover Gama para cima' }));
    expect(chamadas).toEqual([['e1', 'v2_itens_produto', ['a', 'c', 'b']]]);
    expect(nomes()).toEqual(['Alfa', 'Gama', 'Beta']); // otimista
    expect(recarregar).toHaveBeenCalled();
  });

  it('primeiro não sobe e último não desce', () => {
    montar();
    expect((screen.getByRole('button', { name: 'Mover Alfa para cima' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Mover Gama para baixo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('arrastar uma linha para a frente de outra reordena', () => {
    montar();
    const linhas = screen.getAllByRole('row').slice(1);
    const dt = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(linhas[2]!, { dataTransfer: dt });
    fireEvent.dragOver(linhas[0]!, { dataTransfer: dt });
    fireEvent.drop(linhas[0]!, { dataTransfer: dt });
    expect(chamadas).toEqual([['e1', 'v2_itens_produto', ['c', 'a', 'b']]]);
  });

  it('falha do servidor desfaz a ordem otimista e avisa', async () => {
    falhar = true;
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Mover Beta para baixo' }));
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('Não foi possível reordenar')));
    expect(nomes()).toEqual(['Alfa', 'Beta', 'Gama']);
  });

  it('quando a ordem do servidor muda, ela prevalece sobre a otimista', async () => {
    const { rerender } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Mover Alfa para baixo' }));
    expect(nomes()).toEqual(['Beta', 'Alfa', 'Gama']);
    estado.dados = dadosFalsos({
      itensProduto: [itemFalso({ id: 'c', nome: 'Gama', ordem: 1 }), itemFalso({ id: 'a', nome: 'Alfa', ordem: 2 }), itemFalso({ id: 'b', nome: 'Beta', ordem: 3 })],
    });
    rerender(<MemoryRouter><ItensPage tabela="v2_itens_produto" /></MemoryRouter>);
    expect(nomes()).toEqual(['Gama', 'Alfa', 'Beta']);
  });
});
