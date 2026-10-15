import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigAnalise, DadosEscopo } from '../domain/types';
import { dadosFalsos, itemFalso } from '../test/dadosFalsos';

const U = (n: string) => `00000000-0000-4000-8000-0000000000${n}`;
const recarregar = vi.fn();
const notify = vi.fn();
const estado: { dados: DadosEscopo } = { dados: dadosFalsos() };
const patches: unknown[] = [];
const csv: unknown[] = [];
let falhaVersao = false;

vi.mock('../layout/ScopeProvider', () => ({ useScope: () => ({ ativo: { id: 'e1', nome: 'Veículos' }, escopos: [], loading: false, error: null }) }));
vi.mock('../layout/DadosProvider', () => ({ useDados: () => ({ dados: estado.dados, loading: false, error: null, recarregar, remotoVersao: 0 }) }));
vi.mock('../ui/Toasts', () => ({ useToasts: () => ({ notify }) }));
vi.mock('../services/exportacao', () => ({ exportarCsv: (...a: unknown[]) => { csv.push(a); }, exportarPdf: vi.fn() }));
vi.mock('../services/escrita', () => ({
  salvarConfig: (c: ConfigAnalise, patch: object) => {
    patches.push(patch);
    return falhaVersao ? Promise.reject({ code: 'V2001', message: 'x' }) : Promise.resolve({ ...c, ...patch, versao: c.versao + 1 });
  },
}));
vi.mock('../services/imagens', () => ({ urlsAssinadas: vi.fn().mockResolvedValue({}) }));

import { AnalisePage } from './AnalisePage';

const cenario = () => dadosFalsos({
  itensModelo: [itemFalso({ id: U('a1'), nome: 'Potência' })],
  modelos: [
    { id: U('d1'), escopo_id: 'e1', nome: 'Sedan', descricao: null, versao: 1 },
    { id: U('d2'), escopo_id: 'e1', nome: 'Hatch', descricao: null, versao: 1 },
  ],
  produtos: [{ id: U('e1'), escopo_id: 'e1', nome: 'Civic 2020', descricao: null, versao: 1, modelo_id: U('d1') }],
  modeloValores: [
    { modelo_id: U('d1'), item_modelo_id: U('a1'), tipo: 'numerico', valor_num: 180, valor_txt: null, valor_img_id: null },
    { modelo_id: U('d2'), item_modelo_id: U('a1'), tipo: 'numerico', valor_num: 100, valor_txt: null, valor_img_id: null },
  ],
  filtros: [{ id: U('f1'), escopo_id: 'e1', nome: 'Fortes', descricao: null, logica: 'AND', versao: 1 }],
  filtroCondicoes: [{ id: U('c1'), filtro_id: U('f1'), ordem: 1, operador: 'gt', valor_num: 150, valor_txt: null, item_modelo_id: U('a1'), item_produto_id: null, item_analise_id: null }],
  itensAnalise: [{ id: U('g1'), escopo_id: 'e1', nome: 'Nota', descricao: null, tipo: 'agregado', formula_texto: null, peso: 5, versao: 1 }],
  config: { id: 'cfg', escopo_id: 'e1', modo: 'ambos', logica_global: 'AND', agregado_ranking_id: null, colunas: {}, ordenacao: [], versao: 1 },
});
const montar = () => render(<MemoryRouter><AnalisePage /></MemoryRouter>);
const status = () => screen.getByRole('status').textContent ?? '';

beforeEach(() => { estado.dados = cenario(); patches.length = 0; csv.length = 0; falhaVersao = false; recarregar.mockReset(); notify.mockReset(); window.localStorage.clear(); });

describe('AnalisePage', () => {
  it('conta as linhas do modo atual (modelos e produtos)', () => {
    montar();
    expect(status()).toContain('3 de 3 linha(s)');
  });

  it('ativar um filtro reduz as linhas; desativar restaura; a escolha é lembrada por escopo', async () => {
    montar();
    await userEvent.click(screen.getByRole('checkbox', { name: /Fortes/ }));
    expect(status()).toContain('2 de 3 linha(s)'); // Sedan e o Civic herdado; Hatch (100) sai
    expect(status()).toContain('Filtros: Fortes');
    expect(window.localStorage.getItem(Object.keys(window.localStorage).find((k) => k.includes('filtrosAtivos'))!)).toContain(U('f1'));
    await userEvent.click(screen.getByRole('checkbox', { name: /Fortes/ }));
    expect(status()).toContain('3 de 3 linha(s)');
  });

  it('o filtro ativo volta ao reabrir a tela', async () => {
    const { unmount } = montar();
    await userEvent.click(screen.getByRole('checkbox', { name: /Fortes/ }));
    unmount();
    montar();
    expect((screen.getByRole('checkbox', { name: /Fortes/ }) as HTMLInputElement).checked).toBe(true);
    expect(status()).toContain('2 de 3 linha(s)');
  });

  it('a pesquisa filtra por texto sem gravar nada', async () => {
    montar();
    await userEvent.type(screen.getByLabelText('Pesquisar na tabela'), 'civic');
    expect(status()).toContain('1 de 3 linha(s)');
    expect(status()).toContain('busca: “civic”');
    expect(patches).toHaveLength(0);
  });

  it('trocar o modo atualiza a tela na hora e grava a preferência no escopo', async () => {
    montar();
    await userEvent.selectOptions(screen.getByLabelText(/^Modo/), 'Somente produtos');
    expect(status()).toContain('1 de 1 linha(s)');
    await vi.waitFor(() => expect(patches).toEqual([{ modo: 'produtos' }]));
  });

  it('escolher o agregado do ranking grava a configuração', async () => {
    montar();
    await userEvent.selectOptions(screen.getByLabelText(/Ranking por/), 'Nota');
    await vi.waitFor(() => expect(patches).toEqual([{ agregado_ranking_id: U('g1') }]));
  });

  it('conflito de versão na configuração avisa, recarrega e reverte a escolha local', async () => {
    falhaVersao = true;
    montar();
    await userEvent.selectOptions(screen.getByLabelText(/^Modo/), 'Somente produtos');
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith('warning', expect.stringMatching(/alterada em outro lugar/));
    expect((screen.getByLabelText(/^Modo/) as HTMLSelectElement).value).toBe('ambos');
  });

  it('exportar CSV usa a tabela da consulta atual (com filtros)', async () => {
    montar();
    await userEvent.click(screen.getByRole('checkbox', { name: /Fortes/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await vi.waitFor(() => expect(csv).toHaveLength(1));
    const tabela = (csv[0] as [{ linhas: unknown[] }, string])[0];
    expect(tabela.linhas).toHaveLength(2);
    expect((csv[0] as [unknown, string])[1]).toBe('Veículos');
  });

  it('sem filtros salvos, orienta a criar', () => {
    estado.dados = { ...cenario(), filtros: [], filtroCondicoes: [] };
    montar();
    expect(screen.getByText(/Nenhum filtro salvo/)).toBeTruthy();
  });

  it('escopo sem modelos nem produtos mostra estado vazio', () => {
    estado.dados = { ...cenario(), modelos: [], produtos: [], modeloValores: [] };
    montar();
    expect(screen.getByText(/Ainda não há modelos nem produtos/)).toBeTruthy();
  });

  it('filtro que exclui tudo mostra a mensagem de nenhuma linha', async () => {
    estado.dados = { ...cenario(), filtroCondicoes: [{ ...cenario().filtroCondicoes[0]!, valor_num: 9999 }] };
    montar();
    await userEvent.click(screen.getByRole('checkbox', { name: /Fortes/ }));
    expect(screen.getByText(/Nenhuma linha corresponde/)).toBeTruthy();
  });
});
