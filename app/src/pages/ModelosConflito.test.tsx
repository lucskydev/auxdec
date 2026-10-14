import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DadosEscopo, ModeloValor } from '../domain/types';
import { dadosFalsos, itemFalso } from '../test/dadosFalsos';

const recarregar = vi.fn();
const estado: { dados: DadosEscopo } = { dados: dadosFalsos() };
const salvas: { p: { versao: number | null; valores: { item_id: string; valor_num?: number | null }[] } }[] = [];
let comportamento: 'ok' | 'versao' = 'ok';

vi.mock('../layout/ScopeProvider', () => ({ useScope: () => ({ ativo: { id: 'e1', nome: 'Veículos' }, escopos: [], loading: false, error: null }) }));
vi.mock('../layout/DadosProvider', () => ({ useDados: () => ({ dados: estado.dados, loading: false, error: null, recarregar, remotoVersao: 0 }) }));
vi.mock('../ui/UnsavedChanges', () => ({ useUnsavedGuard: vi.fn() }));
vi.mock('../ui/Toasts', () => ({ useToasts: () => ({ notify: vi.fn() }) }));
vi.mock('../services/imagens', () => ({ enviarImagem: vi.fn(), excluirImagem: vi.fn(), prepararImagem: vi.fn(), urlsAssinadas: vi.fn().mockResolvedValue({}) }));
vi.mock('../services/escrita', () => ({
  excluirModelo: vi.fn(),
  salvarModelo: (p: never) => { salvas.push({ p }); return comportamento === 'ok' ? Promise.resolve({ id: 'm1', versao: 2 }) : Promise.reject({ code: 'V2001', message: 'x' }); },
}));

import { ModelosPage } from './ModelosPage';

const valor = (modelo: string, item: string, n: number): ModeloValor => ({ modelo_id: modelo, item_modelo_id: item, tipo: 'numerico', valor_num: n, valor_txt: null, valor_img_id: null });
const cenario = (potencia: number, versao = 1) => dadosFalsos({
  itensModelo: [itemFalso({ id: 'i1', nome: 'Potência' }), itemFalso({ id: 'i2', nome: 'Peso' })],
  modelos: [{ id: 'm1', escopo_id: 'e1', nome: 'Sedan', descricao: null, versao }],
  modeloValores: [valor('m1', 'i1', potencia), valor('m1', 'i2', 1200)],
});
const campo = (nome: string) => screen.getByLabelText(`Valor de ${nome}`) as HTMLInputElement;
const montar = () => render(<MemoryRouter><ModelosPage /></MemoryRouter>);

beforeEach(() => { comportamento = 'ok'; salvas.length = 0; recarregar.mockReset(); estado.dados = cenario(100); });

describe('ModelosPage', () => {
  it('salva com a versão carregada e os valores editados', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.clear(campo('Potência'));
    await userEvent.type(campo('Potência'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(salvas).toHaveLength(1));
    expect(salvas[0]?.p.versao).toBe(1);
    expect(salvas[0]?.p.valores.find((v) => v.item_id === 'i1')?.valor_num).toBe(150);
  });

  it('conflito: preserva a edição, mostra o valor atual e regrava sobre a versão nova', async () => {
    comportamento = 'versao';
    const { rerender } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.clear(campo('Potência'));
    await userEvent.type(campo('Potência'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await userEvent.click(await screen.findByRole('button', { name: /Atualizar dados e comparar/ }));
    expect(recarregar).toHaveBeenCalled();
    expect(campo('Potência').value).toBe('150');

    estado.dados = cenario(120, 2); // outra sessão alterou a potência
    rerender(<MemoryRouter><ModelosPage /></MemoryRouter>);
    const diff = await screen.findByRole('table', { name: /Diferenças/ });
    expect(within(diff).getByText('Itens e valores')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Reaplicar minhas alterações/ }));
    expect(campo('Potência').value).toBe('150');

    comportamento = 'ok';
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(salvas).toHaveLength(2));
    expect(salvas[1]?.p.versao).toBe(2);
    expect(salvas[1]?.p.valores.find((v) => v.item_id === 'i1')?.valor_num).toBe(150);
  });

  it('remover um item herdado por produtos exige confirmação de impacto antes de gravar', async () => {
    estado.dados = {
      ...cenario(100),
      produtos: [{ id: 'p1', escopo_id: 'e1', nome: 'Civic 2020', descricao: null, versao: 1, modelo_id: 'm1' }],
    };
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Peso/ })); // desmarca o item
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Civic 2020/)).toBeTruthy();
    expect(salvas).toHaveLength(0); // nada gravado ainda
    await userEvent.click(screen.getByRole('button', { name: /Remover e salvar/ }));
    await vi.waitFor(() => expect(salvas).toHaveLength(1));
    expect(salvas[0]?.p.valores.map((v) => v.item_id)).toEqual(['i1']);
  });

  it('valor fora dos limites bloqueia o salvamento', async () => {
    estado.dados = dadosFalsos({
      itensModelo: [itemFalso({ id: 'i1', nome: 'Potência', valor_min: 0, valor_max: 500 })],
      modelos: [{ id: 'm1', escopo_id: 'e1', nome: 'Sedan', descricao: null, versao: 1 }],
      modeloValores: [valor('m1', 'i1', 100)],
    });
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.clear(campo('Potência'));
    await userEvent.type(campo('Potência'), '900');
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
