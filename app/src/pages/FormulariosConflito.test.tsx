import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DadosEscopo } from '../domain/types';
import { dadosFalsos, itemFalso } from '../test/dadosFalsos';

const recarregar = vi.fn();
const estado: { dados: DadosEscopo } = { dados: dadosFalsos() };
const chamadas = { atualizarItem: [] as unknown[][], salvarFiltro: [] as unknown[][] };
let comportamento: 'ok' | 'versao' | 'rede' = 'ok';
const falha = () => (comportamento === 'versao' ? Promise.reject({ code: 'V2001', message: 'x' }) : Promise.reject(new TypeError('Failed to fetch')));

vi.mock('../layout/ScopeProvider', () => ({ useScope: () => ({ ativo: { id: 'e1', nome: 'Veículos' }, escopos: [], loading: false, error: null }) }));
vi.mock('../layout/DadosProvider', () => ({
  useDados: () => ({ dados: estado.dados, loading: false, error: null, recarregar, remotoVersao: 0 }),
}));
vi.mock('../ui/UnsavedChanges', () => ({ useUnsavedGuard: vi.fn() }));
vi.mock('../ui/Toasts', () => ({ useToasts: () => ({ notify: vi.fn() }) }));
vi.mock('../services/escrita', () => ({
  criarItem: vi.fn(), excluirItem: vi.fn(), excluirFiltro: vi.fn(),
  atualizarItem: (...a: unknown[]) => { chamadas.atualizarItem.push(a); return comportamento === 'ok' ? Promise.resolve({}) : falha(); },
  salvarFiltro: (...a: unknown[]) => { chamadas.salvarFiltro.push(a); return comportamento === 'ok' ? Promise.resolve({ id: 'f1', versao: 3 }) : falha(); },
}));

import { ItensPage } from './ItensPage';
import { FiltrosPage } from './FiltrosPage';

const montar = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const campo = (rotulo: string) => screen.getByLabelText(new RegExp('^' + rotulo)) as HTMLInputElement;

beforeEach(() => {
  comportamento = 'ok';
  chamadas.atualizarItem.length = 0;
  chamadas.salvarFiltro.length = 0;
  recarregar.mockReset();
});

describe('ItensPage: edição com conflito e falhas', () => {
  beforeEach(() => { estado.dados = dadosFalsos({ itensModelo: [itemFalso({ id: 'i1', nome: 'Potência', unidade: 'cv' })] }); });

  it('conflito de versão mantém o digitado, compara com a versão atual e reaplica sobre ela', async () => {
    comportamento = 'versao';
    const { rerender } = montar(<ItensPage tabela="v2_itens_modelo" />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.clear(campo('Unidade'));
    await userEvent.type(campo('Unidade'), 'kW');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('button', { name: /Atualizar dados e comparar/ })).toBeTruthy();
    expect(campo('Unidade').value).toBe('kW');

    await userEvent.click(screen.getByRole('button', { name: /Atualizar dados e comparar/ }));
    expect(recarregar).toHaveBeenCalled();
    // os dados atualizados chegam: outra sessão mudou a unidade e a versão
    estado.dados = dadosFalsos({ itensModelo: [itemFalso({ id: 'i1', nome: 'Potência', unidade: 'hp', versao: 2 })] });
    rerender(<MemoryRouter><ItensPage tabela="v2_itens_modelo" /></MemoryRouter>);
    const tabelaDiff = await screen.findByRole('table', { name: /Diferenças/ });
    expect(within(tabelaDiff).getByText('hp')).toBeTruthy(); // valor atual
    expect(within(tabelaDiff).getByText('kW')).toBeTruthy(); // o que o usuário digitou
    await userEvent.click(screen.getByRole('button', { name: /Reaplicar minhas alterações/ }));
    expect(campo('Unidade').value).toBe('kW');

    comportamento = 'ok';
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(chamadas.atualizarItem).toHaveLength(2));
    expect((chamadas.atualizarItem[1]?.[1] as { versao: number }).versao).toBe(2); // agora sobre a versão 2
  });

  it('item excluído por outra sessão é indicado e o digitado é preservado', async () => {
    comportamento = 'versao';
    const { rerender } = montar(<ItensPage tabela="v2_itens_modelo" />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(campo('Unidade'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('button', { name: /Atualizar dados e comparar/ });
    estado.dados = dadosFalsos({ itensModelo: [] });
    rerender(<MemoryRouter><ItensPage tabela="v2_itens_modelo" /></MemoryRouter>);
    expect(await screen.findByText(/exclu/i)).toBeTruthy();
    expect(campo('Unidade').value).toBe('cvx');
  });

  it('falha de rede: formulário aberto, dados preservados, pode tentar de novo', async () => {
    comportamento = 'rede';
    montar(<ItensPage tabela="v2_itens_modelo" />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(campo('Unidade'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Falha de conexão/)).toBeTruthy();
    expect(campo('Unidade').value).toBe('cv2');
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /Atualizar dados e comparar/ })).toBeNull(); // não é conflito
  });

  it('cancelar com alterações pede confirmação; descartar fecha', async () => {
    montar(<ItensPage tabela="v2_itens_modelo" />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(campo('Unidade'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Continuar editando' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByLabelText(/^Unidade/)).toBeNull();
  });
});

describe('FiltrosPage: edição de filtro', () => {
  beforeEach(() => {
    estado.dados = dadosFalsos({
      itensModelo: [itemFalso({ id: 'i1', nome: 'Potência' })],
      filtros: [{ id: 'f1', escopo_id: 'e1', nome: 'Fortes', descricao: null, logica: 'AND', versao: 1 }],
      filtroCondicoes: [{ id: 'c1', filtro_id: 'f1', ordem: 1, operador: 'gt', valor_num: 100, valor_txt: null, item_modelo_id: 'i1', item_produto_id: null, item_analise_id: null }],
    });
  });

  it('salva enviando a versão carregada e as condições', async () => {
    montar(<FiltrosPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.clear(campo('Valor'));
    await userEvent.type(campo('Valor'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(chamadas.salvarFiltro).toHaveLength(1));
    const p = chamadas.salvarFiltro[0]?.[0] as { versao: number; condicoes: { valor_num: number }[] };
    expect(p.versao).toBe(1);
    expect(p.condicoes[0]?.valor_num).toBe(150);
  });

  it('conflito mostra a diferença de condições e preserva o digitado', async () => {
    comportamento = 'versao';
    montar(<FiltrosPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.clear(campo('Valor'));
    await userEvent.type(campo('Valor'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('button', { name: /Atualizar dados e comparar/ })).toBeTruthy();
    expect(campo('Valor').value).toBe('150');
  });

  it('não permite salvar sem escolher o item da condição', async () => {
    estado.dados = dadosFalsos({ itensModelo: [itemFalso({ id: 'i1', nome: 'Potência' })] });
    montar(<FiltrosPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Novo filtro' }));
    await userEvent.type(campo('Nome'), 'Novo');
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
