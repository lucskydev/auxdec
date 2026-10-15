import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DadosEscopo } from '../domain/types';
import { dadosFalsos, itemFalso } from '../test/dadosFalsos';

const recarregar = vi.fn();
const estado: { dados: DadosEscopo } = { dados: dadosFalsos() };
const formulas: { id: string | null; versao: number | null; nome: string; texto: string }[] = [];
const agregados: { id: string | null; nome: string; peso: number; componentes: { item_modelo_id?: string | null; item_produto_id?: string | null; peso: number; direcao: string; lmin: number; lmax: number }[] }[] = [];
const excluidos: string[] = [];
let versao = false;

vi.mock('../layout/ScopeProvider', () => ({ useScope: () => ({ ativo: { id: 'e1', nome: 'Veículos' }, escopos: [], loading: false, error: null }) }));
vi.mock('../layout/DadosProvider', () => ({ useDados: () => ({ dados: estado.dados, loading: false, error: null, recarregar, remotoVersao: 0 }) }));
vi.mock('../ui/UnsavedChanges', () => ({ useUnsavedGuard: vi.fn() }));
vi.mock('../ui/Toasts', () => ({ useToasts: () => ({ notify: vi.fn() }) }));
vi.mock('../services/escrita', () => ({
  salvarFormula: (p: (typeof formulas)[number]) => { formulas.push(p); return versao ? Promise.reject({ code: 'V2001', message: 'x' }) : Promise.resolve({ id: 'a9', versao: 2 }); },
  salvarAgregado: (p: (typeof agregados)[number]) => { agregados.push(p); return Promise.resolve({ id: 'a9', versao: 2 }); },
  excluirItemAnalise: (id: string) => { excluidos.push(id); return Promise.resolve(); },
}));

import { ItensAnalisePage } from './ItensAnalisePage';

const analise = (id: string, nome: string, formula: string, v = 1) => ({ id, escopo_id: 'e1', nome, descricao: null, tipo: 'formula' as const, formula_texto: formula, peso: null, versao: v });
const cenario = () => dadosFalsos({
  itensModelo: [itemFalso({ id: '00000000-0000-4000-8000-0000000000a1', nome: 'Preço' }), itemFalso({ id: '00000000-0000-4000-8000-0000000000a2', nome: 'Potência' })],
  itensProduto: [itemFalso({ id: '00000000-0000-4000-8000-0000000000b1', nome: 'Quilometragem' })],
  itensAnalise: [analise('00000000-0000-4000-8000-0000000000c1', 'Base', '[[m:00000000-0000-4000-8000-0000000000a1]] * 2'), analise('00000000-0000-4000-8000-0000000000c2', 'Derivada', '[[a:00000000-0000-4000-8000-0000000000c1]] + 1')],
  analiseRefs: [
    { id: 'r1', analise_id: '00000000-0000-4000-8000-0000000000c1', item_modelo_id: '00000000-0000-4000-8000-0000000000a1', item_produto_id: null, item_analise_id: null },
    { id: 'r2', analise_id: '00000000-0000-4000-8000-0000000000c2', item_modelo_id: null, item_produto_id: null, item_analise_id: '00000000-0000-4000-8000-0000000000c1' },
  ],
});
const montar = () => render(<MemoryRouter><ItensAnalisePage /></MemoryRouter>);
const salvar = () => screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
const linhaDe = (nome: string) => screen.getByText(nome).closest('tr') as HTMLElement;
const botaoDa = (nome: string, rotulo: string) => Array.from(linhaDe(nome).querySelectorAll('button')).find((b) => b.textContent === rotulo) as HTMLButtonElement;
async function digitarFormula(texto: string) {
  const area = screen.getByLabelText(/^Fórmula/);
  await userEvent.clear(area);
  await userEvent.click(area);
  await userEvent.paste(texto); // paste: o type() interpreta colchetes como teclas especiais
}

beforeEach(() => { estado.dados = cenario(); formulas.length = 0; agregados.length = 0; excluidos.length = 0; versao = false; recarregar.mockReset(); });

describe('ItensAnalisePage: fórmulas', () => {
  it('mostra a fórmula com nomes legíveis na lista', () => {
    montar();
    expect(linhaDe('Derivada').textContent).toContain('[a:Base] + 1');
  });

  it('fórmula válida é gravada com referências por id', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Nova fórmula' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Preço por cv');
    await digitarFormula('[m:Preço] / [m:Potência]');
    expect(await screen.findByText(/Fórmula válida/)).toBeTruthy();
    await userEvent.click(salvar());
    await vi.waitFor(() => expect(formulas).toHaveLength(1));
    expect(formulas[0]).toMatchObject({ id: null, versao: null, nome: 'Preço por cv', texto: '[[m:00000000-0000-4000-8000-0000000000a1]] / [[m:00000000-0000-4000-8000-0000000000a2]]' });
  });

  it('item inexistente e fórmula incompleta bloqueiam o salvamento', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Nova fórmula' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Ruim');
    await digitarFormula('[m:Inexistente] + 1');
    expect(await screen.findByText(/Item não encontrado: .*Inexistente/)).toBeTruthy();
    expect(salvar().disabled).toBe(true);
    await digitarFormula('[m:Preço] +');
    expect(salvar().disabled).toBe(true);
    await digitarFormula('[m:Preço] + 1');
    expect(salvar().disabled).toBe(false);
  });

  it('dependência circular entre fórmulas é bloqueada', async () => {
    montar();
    await userEvent.click(botaoDa('Base', 'Editar'));
    await digitarFormula('[a:Derivada] + 1'); // Derivada já depende de Base
    expect(salvar().disabled).toBe(true);
    await digitarFormula('[m:Potência] + 1');
    expect(salvar().disabled).toBe(false);
  });

  it('nome repetido e nome com colchetes são recusados', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Nova fórmula' }));
    await digitarFormula('[m:Preço]');
    await userEvent.type(screen.getByLabelText('Nome'), 'base');
    expect(salvar().disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText('Nome'));
    await userEvent.click(screen.getByLabelText('Nome'));
    await userEvent.paste('a[b]');
    expect(salvar().disabled).toBe(true);
  });

  it('conflito de versão em fórmula mostra a diferença e preserva o digitado', async () => {
    versao = true;
    const { rerender } = montar();
    await userEvent.click(botaoDa('Base', 'Editar'));
    await digitarFormula('[m:Preço] * 3');
    await userEvent.click(salvar());
    await userEvent.click(await screen.findByRole('button', { name: /Atualizar dados e comparar/ }));
    estado.dados = { ...cenario(), itensAnalise: [analise('00000000-0000-4000-8000-0000000000c1', 'Base', '[[m:00000000-0000-4000-8000-0000000000a2]] * 5', 2), analise('00000000-0000-4000-8000-0000000000c2', 'Derivada', '[[a:00000000-0000-4000-8000-0000000000c1]] + 1')] };
    rerender(<MemoryRouter><ItensAnalisePage /></MemoryRouter>);
    const diff = await screen.findByRole('table', { name: /Diferenças/ });
    expect(within(diff).getByText('Fórmula')).toBeTruthy();
    expect(within(diff).getByText('[m:Preço] * 3')).toBeTruthy();
    expect(within(diff).getByText('[m:Potência] * 5')).toBeTruthy();
    expect((screen.getByLabelText(/^Fórmula/) as HTMLTextAreaElement).value).toBe('[m:Preço] * 3');
  });

  it('excluir item usado por outro é bloqueado e lista quem usa', async () => {
    montar();
    await userEvent.click(botaoDa('Base', 'Excluir'));
    expect(screen.getByText(/não pode ser excluído/)).toBeTruthy();
    expect(screen.getByText(/Derivada/, { selector: 'li' })).toBeTruthy();
    expect((screen.getAllByRole('button', { name: 'Excluir' }).at(-1) as HTMLButtonElement).disabled).toBe(true);
    expect(excluidos).toHaveLength(0);
  });

  it('excluir item sem dependentes funciona após confirmar', async () => {
    montar();
    await userEvent.click(botaoDa('Derivada', 'Excluir'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Excluir' }).at(-1)!);
    await vi.waitFor(() => expect(excluidos).toEqual(['00000000-0000-4000-8000-0000000000c2']));
  });
});

describe('ItensAnalisePage: agregados', () => {
  async function abrirAgregado() {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Novo agregado' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Nota geral');
  }
  const itensDoComponente = (n: number) => screen.getAllByLabelText('Item')[n] as HTMLSelectElement;

  it('exige de 2 a 5 componentes', async () => {
    await abrirAgregado();
    expect(salvar().disabled).toBe(true);
    expect(screen.getByText(/2 a 5 componentes/)).toBeTruthy();
    for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole('button', { name: 'Adicionar componente' }));
    expect((screen.getByRole('button', { name: 'Adicionar componente' }) as HTMLButtonElement).disabled).toBe(true); // máximo 5
  });

  it('grava componentes normalizados com peso, direção e limites', async () => {
    await abrirAgregado();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar componente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar componente' }));
    await userEvent.selectOptions(itensDoComponente(0), 'Modelo · Preço');
    await userEvent.selectOptions(screen.getAllByLabelText('Direção')[0]!, 'menor');
    await userEvent.clear(screen.getAllByLabelText('Limite superior')[0]!);
    await userEvent.type(screen.getAllByLabelText('Limite superior')[0]!, '200000');
    await userEvent.selectOptions(itensDoComponente(1), 'Produto · Quilometragem');
    expect(salvar().disabled).toBe(false);
    await userEvent.click(salvar());
    await vi.waitFor(() => expect(agregados).toHaveLength(1));
    expect(agregados[0]).toMatchObject({ id: null, nome: 'Nota geral', peso: 1 });
    expect(agregados[0]?.componentes[0]).toMatchObject({ item_modelo_id: '00000000-0000-4000-8000-0000000000a1', direcao: 'menor', lmin: 0, lmax: 200000, peso: 1 });
    expect(agregados[0]?.componentes[1]).toMatchObject({ item_produto_id: '00000000-0000-4000-8000-0000000000b1', direcao: 'maior' });
  });

  it('item repetido e limites iguais bloqueiam', async () => {
    await abrirAgregado();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar componente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar componente' }));
    await userEvent.selectOptions(itensDoComponente(0), 'Modelo · Preço');
    await userEvent.selectOptions(itensDoComponente(1), 'Modelo · Preço');
    expect(screen.getByText(/item repetido/)).toBeTruthy();
    expect(salvar().disabled).toBe(true);
    await userEvent.selectOptions(itensDoComponente(1), 'Modelo · Potência');
    await userEvent.clear(screen.getAllByLabelText('Limite superior')[1]!);
    await userEvent.type(screen.getAllByLabelText('Limite superior')[1]!, '0');
    expect(screen.getByText(/limites não podem ser iguais/)).toBeTruthy();
    expect(salvar().disabled).toBe(true);
  });

  it('peso fora de 1–10 bloqueia', async () => {
    await abrirAgregado();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar componente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar componente' }));
    await userEvent.selectOptions(itensDoComponente(0), 'Modelo · Preço');
    await userEvent.selectOptions(itensDoComponente(1), 'Modelo · Potência');
    expect(salvar().disabled).toBe(false);
    await userEvent.clear(screen.getByLabelText(/Peso deste agregado/));
    await userEvent.type(screen.getByLabelText(/Peso deste agregado/), '11');
    expect(salvar().disabled).toBe(true);
  });
});
