import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DadosEscopo } from '../domain/types';
import { dadosFalsos, itemFalso } from '../test/dadosFalsos';

const recarregar = vi.fn();
const estado: { dados: DadosEscopo } = { dados: dadosFalsos() };
type Chamada = { id: string | null; versao: number | null; nome: string; modeloId: string | null; valores: { item_id: string; valor_num?: number | null }[] };
const salvas: Chamada[] = [];
const excluidos: string[] = [];

vi.mock('../layout/ScopeProvider', () => ({ useScope: () => ({ ativo: { id: 'e1', nome: 'Veículos' }, escopos: [], loading: false, error: null }) }));
vi.mock('../layout/DadosProvider', () => ({ useDados: () => ({ dados: estado.dados, loading: false, error: null, recarregar, remotoVersao: 0 }) }));
vi.mock('../ui/UnsavedChanges', () => ({ useUnsavedGuard: vi.fn() }));
vi.mock('../ui/Toasts', () => ({ useToasts: () => ({ notify: vi.fn() }) }));
vi.mock('../services/imagens', () => ({ enviarImagem: vi.fn(), excluirImagem: vi.fn(), prepararImagem: vi.fn(), urlsAssinadas: vi.fn().mockResolvedValue({}) }));
vi.mock('../services/escrita', () => ({
  salvarProduto: (p: Chamada) => { salvas.push(p); return Promise.resolve({ id: 'p9', versao: 2 }); },
  excluirProduto: (id: string) => { excluidos.push(id); return Promise.resolve(); },
}));

import { ProdutosPage } from './ProdutosPage';

const cenario = () => dadosFalsos({
  itensModelo: [itemFalso({ id: 'im1', nome: 'Potência', unidade: 'cv', casas_decimais: 0 }), itemFalso({ id: 'im2', nome: 'Cor', tipo: 'textual' })],
  itensProduto: [itemFalso({ id: 'ip1', nome: 'Quilometragem' }), itemFalso({ id: 'ip2', nome: 'Cor', tipo: 'textual' })],
  modelos: [{ id: 'm1', escopo_id: 'e1', nome: 'Sedan', descricao: null, versao: 1 }],
  produtos: [
    { id: 'p1', escopo_id: 'e1', nome: 'Civic 2020', descricao: null, versao: 1, modelo_id: 'm1' },
    { id: 'p2', escopo_id: 'e1', nome: 'Corolla', descricao: null, versao: 1, modelo_id: null },
  ],
  modeloValores: [
    { modelo_id: 'm1', item_modelo_id: 'im1', tipo: 'numerico', valor_num: 180, valor_txt: null, valor_img_id: null },
    { modelo_id: 'm1', item_modelo_id: 'im2', tipo: 'textual', valor_num: null, valor_txt: 'Prata', valor_img_id: null },
  ],
  produtoValores: [{ produto_id: 'p1', item_produto_id: 'ip1', tipo: 'numerico', valor_num: 45000, valor_txt: null, valor_img_id: null }],
});
const montar = () => render(<MemoryRouter><ProdutosPage /></MemoryRouter>);
const salvar = () => screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
const linhaDe = (nome: string) => screen.getByText(nome).closest('tr') as HTMLElement;
const botaoDa = (nome: string, rotulo: string) => Array.from(linhaDe(nome).querySelectorAll('button')).find((b) => b.textContent === rotulo) as HTMLButtonElement;

beforeEach(() => { estado.dados = cenario(); salvas.length = 0; excluidos.length = 0; recarregar.mockReset(); });

describe('ProdutosPage', () => {
  it('lista produtos com modelo e quantidade de itens próprios; a busca filtra por nome', async () => {
    montar();
    expect(linhaDe('Civic 2020').textContent).toContain('Sedan');
    expect(linhaDe('Corolla').textContent).toContain('—');
    await userEvent.type(screen.getByLabelText('Buscar produto'), 'coro');
    expect(screen.queryByText('Civic 2020')).toBeNull();
    expect(screen.getByText('Corolla')).toBeTruthy();
    await userEvent.clear(screen.getByLabelText('Buscar produto'));
    await userEvent.type(screen.getByLabelText('Buscar produto'), 'zzz');
    expect(screen.getByText(/Nenhum produto encontrado/)).toBeTruthy();
  });

  it('mostra os valores herdados do modelo como somente leitura', async () => {
    montar();
    await userEvent.click(botaoDa('Civic 2020', 'Editar'));
    expect(screen.getByText(/Herdado do modelo/)).toBeTruthy();
    expect(screen.getByText(/Potência: 180/)).toBeTruthy();
    expect(screen.getByText(/Cor: Prata/)).toBeTruthy();
  });

  it('novo produto com modelo e item próprio envia modelo, versão nula e valores', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Novo produto' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Camry');
    await userEvent.selectOptions(screen.getByLabelText('Modelo'), 'Sedan');
    await userEvent.click(screen.getByRole('checkbox', { name: /Quilometragem/ }));
    await userEvent.type(screen.getByLabelText('Valor de Quilometragem'), '12000');
    await userEvent.click(salvar());
    await vi.waitFor(() => expect(salvas).toHaveLength(1));
    expect(salvas[0]).toMatchObject({ id: null, versao: null, nome: 'Camry', modeloId: 'm1' });
    expect(salvas[0]?.valores).toEqual([{ item_id: 'ip1', valor_num: 12000, valor_txt: null, valor_img_id: null }].map((v) => expect.objectContaining({ item_id: v.item_id, valor_num: v.valor_num })));
    expect(recarregar).toHaveBeenCalled();
  });

  it('item próprio com o mesmo nome de um item do modelo escolhido é bloqueado', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Novo produto' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Camry');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Cor/ })); // item próprio "Cor"
    expect(salvar().disabled).toBe(false); // sem modelo ainda não há conflito
    await userEvent.selectOptions(screen.getByLabelText('Modelo'), 'Sedan');
    expect(await screen.findByText(/Conflito de nomes: Cor/)).toBeTruthy();
    expect(salvar().disabled).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /^Cor/ })); // remove o item próprio
    expect(salvar().disabled).toBe(false);
  });

  it('nome repetido de produto é recusado', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Novo produto' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'civic 2020');
    expect(salvar().disabled).toBe(true);
  });

  it('duplicar abre um novo produto com "(cópia)" e copia modelo e valores próprios', async () => {
    montar();
    await userEvent.click(botaoDa('Civic 2020', 'Duplicar'));
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Civic 2020 (cópia)');
    expect((screen.getByLabelText('Valor de Quilometragem') as HTMLInputElement).value).toBe('45000');
    await userEvent.click(salvar());
    await vi.waitFor(() => expect(salvas).toHaveLength(1));
    expect(salvas[0]).toMatchObject({ id: null, versao: null, modeloId: 'm1' });
  });

  it('editar envia a versão carregada', async () => {
    montar();
    await userEvent.click(botaoDa('Corolla', 'Editar'));
    await userEvent.type(screen.getByLabelText('Nome'), ' LE');
    await userEvent.click(salvar());
    await vi.waitFor(() => expect(salvas).toHaveLength(1));
    expect(salvas[0]).toMatchObject({ id: 'p2', versao: 1, nome: 'Corolla LE' });
  });

  it('excluir pede confirmação e só então exclui', async () => {
    montar();
    await userEvent.click(botaoDa('Corolla', 'Excluir'));
    expect(excluidos).toHaveLength(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Excluir' }).at(-1)!);
    await vi.waitFor(() => expect(excluidos).toEqual(['p2']));
  });
});
