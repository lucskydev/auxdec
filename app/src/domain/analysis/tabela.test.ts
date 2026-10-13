import { describe, expect, it } from 'vitest';
import { comp, Fabrica, ref } from '../testkit';
import { construirTabela, colunasVisiveis, paraExportacao, type OpcoesTabela } from './tabela';

const base: OpcoesTabela = { modo: 'ambos', filtrosAtivos: [], logicaGlobal: 'AND', busca: '', ordenacao: [] };

function cenario() {
  const f = new Fabrica();
  const preco = f.itemM('Preço');
  const km = f.itemP('Km');
  const link = f.itemP('Site', 'textual');
  const m = f.modelo('Gol', [[preco, 50]]);
  f.produto('A', m, [[km, 10], [link, 'https://x.com']]);
  f.produto('B', m, [[km, 0]]);
  f.produto('C', null, []);
  const nota = f.agregado('Nota', [comp('m', preco.id, 1, 'menor', 0, 100), comp('p', km.id, 1, 'menor', 0, 100)]);
  f.d.config.agregado_ranking_id = nota.id;
  return { f, preco, km, link, nota };
}

describe('tabela de análise', () => {
  it('modos: modelos, produtos, ambos como linhas independentes', () => {
    const { f } = cenario();
    expect(construirTabela(f.d, { ...base, modo: 'modelos' }).linhas).toHaveLength(1);
    expect(construirTabela(f.d, { ...base, modo: 'produtos' }).linhas).toHaveLength(3);
    expect(construirTabela(f.d, base).linhas).toHaveLength(4);
  });
  it('modo itens de análise só mostra colunas de análise (mais nome/tipo)', () => {
    const { f } = cenario();
    const cols = colunasVisiveis(f.d, 'itens_analise').map((c) => c.grupo);
    expect(cols.every((g) => g === 'analise' || g === 'fixa')).toBe(true);
  });
  it('vazio é diferente de zero; link é identificado; item de produto não se aplica a modelo', () => {
    const { f, km, link } = cenario();
    const t = construirTabela(f.d, base);
    const a = t.linhas.find((l) => l.linha.nome === 'A')!;
    const b = t.linhas.find((l) => l.linha.nome === 'B')!;
    const c = t.linhas.find((l) => l.linha.nome === 'C')!;
    const gol = t.linhas.find((l) => l.linha.nome === 'Gol')!;
    expect(b.celulas.get(`p:${km.id}`)).toMatchObject({ estado: 'ok', texto: '0' });
    expect(c.celulas.get(`p:${km.id}`)).toMatchObject({ estado: 'vazio', texto: '—' });
    expect(a.celulas.get(`p:${link.id}`)?.estado).toBe('link');
    expect(gol.celulas.get(`p:${km.id}`)?.estado).toBe('naoSeAplica');
  });
  it('ranking: melhor pontuação em primeiro; sem pontuação não tem posição', () => {
    const { f } = cenario();
    const t = construirTabela(f.d, { ...base, modo: 'produtos' });
    const pos = Object.fromEntries(t.linhas.map((l) => [l.linha.nome, l.ranking]));
    expect(pos.B).toBe(1);
    expect(pos.A).toBe(2);
    expect(pos.C).toBe(null);
  });
  it('ordenação por coluna numérica coloca vazios por último', () => {
    const { f, km } = cenario();
    const t = construirTabela(f.d, { ...base, modo: 'produtos', ordenacao: [{ col: `p:${km.id}`, dir: 'desc' }] });
    expect(t.linhas.map((l) => l.linha.nome)).toEqual(['A', 'B', 'C']);
  });
  it('ordena por coluna oculta', () => {
    const { f, km } = cenario();
    f.d.config.colunas = { visiveis: ['nome'] };
    const t = construirTabela(f.d, { ...base, modo: 'produtos', ordenacao: [{ col: `p:${km.id}`, dir: 'asc' }] });
    expect(t.linhas.map((l) => l.linha.nome)).toEqual(['B', 'A', 'C']);
  });
  it('busca textual ignora maiúsculas e filtra linhas', () => {
    const { f } = cenario();
    expect(construirTabela(f.d, { ...base, busca: 'gOl' }).linhas.map((l) => l.linha.nome)).toEqual(['Gol']);
  });
  it('erro de cálculo e indisponível têm estados distintos', () => {
    const f = new Fabrica();
    const x = f.itemM('X');
    f.modelo('M', [[x, 0]]);
    f.formula('Div', `1 / ${ref('m', x.id)}`);
    const a = f.agregado('Ag', [comp('m', x.id, 1, 'maior', 0, 10), comp('m', x.id, 1, 'menor', 0, 10)]);
    f.modelo('Vazio', []);
    const t = construirTabela(f.d, { ...base, modo: 'modelos' });
    const estados = t.linhas.flatMap((l) => [...l.celulas.entries()].filter(([k]) => k.startsWith('a:')).map(([, c]) => c.estado));
    expect(estados).toContain('erro');
    expect(estados).toContain('indisponivel');
    void a;
  });
  it('exportação inclui todas as linhas da consulta e valores crus', () => {
    const { f } = cenario();
    const t = construirTabela(f.d, base);
    const e = paraExportacao(t);
    expect(e.linhas).toHaveLength(t.linhas.length);
    expect(e.cabecalho[0]).toBe('Nome');
  });
  it('filtro ativo remove linhas e muda o ranking', () => {
    const { f, km } = cenario();
    f.d.filtros.push({ id: 'f1', escopo_id: 'e', nome: 'F', descricao: null, logica: 'AND', versao: 1 });
    const cond = { id: 'c1', filtro_id: 'f1', ordem: 1, operador: 'gt' as const, valor_num: 5, valor_txt: null, item_modelo_id: null, item_produto_id: km.id, item_analise_id: null };
    f.d.filtroCondicoes.push(cond);
    const t = construirTabela(f.d, { ...base, modo: 'produtos', filtrosAtivos: [{ filtro: f.d.filtros[0]!, condicoes: [cond] }] });
    expect(t.linhas.map((l) => l.linha.nome)).toEqual(['A']);
    expect(t.linhas[0]!.ranking).toBe(1);
  });
});
