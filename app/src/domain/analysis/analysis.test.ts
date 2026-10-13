import { describe, expect, it } from 'vitest';
import { calcularAnalise } from './compute';
import { montarLinhas } from './linhas';
import { LimitesInvalidos, mediaPonderada, normalizar } from './normalize';
import { classificar } from './rank';
import { avaliarCondicao, linhaPassa, type FiltroCompleto } from './filter';
import { compararCelulas, ordenar, type Celula } from './sort';
import { comp, Fabrica, ref } from '../testkit';
import { gerarCsv } from '../csv';
import { chaveNome, nomeDuplicado, validarNome } from '../names';
import { conflitosAoAcrescentarNoModelo, conflitosDeNomes } from '../inheritance';
import type { FiltroCondicao } from '../types';

describe('normalização', () => {
  it('maior é melhor: 0 no limite inferior, 10 no superior, linear no meio', () => {
    expect(normalizar(0, 0, 100, 'maior')).toBe(0);
    expect(normalizar(100, 0, 100, 'maior')).toBe(10);
    expect(normalizar(25, 0, 100, 'maior')).toBe(2.5);
  });
  it('menor é melhor inverte a escala', () => {
    expect(normalizar(0, 0, 100, 'menor')).toBe(10);
    expect(normalizar(100, 0, 100, 'menor')).toBe(0);
    expect(normalizar(25, 0, 100, 'menor')).toBe(7.5);
  });
  it('satura abaixo e acima dos limites', () => {
    expect(normalizar(-50, 0, 100, 'maior')).toBe(0);
    expect(normalizar(500, 0, 100, 'maior')).toBe(10);
    expect(normalizar(-50, 0, 100, 'menor')).toBe(10);
    expect(normalizar(500, 0, 100, 'menor')).toBe(0);
  });
  it('funciona com limites invertidos (Lmin > Lmax)', () => {
    expect(normalizar(50, 100, 0, 'maior')).toBe(5);
  });
  it('recusa limites iguais ou não finitos', () => {
    expect(() => normalizar(1, 5, 5, 'maior')).toThrow(LimitesInvalidos);
    expect(() => normalizar(1, 0, Infinity, 'maior')).toThrow(LimitesInvalidos);
  });
  it('média ponderada e vazio', () => {
    expect(mediaPonderada([{ peso: 1, pontuacao: 10 }, { peso: 3, pontuacao: 2 }])).toBe(4);
    expect(mediaPonderada([])).toBeNull();
  });
  it('mantém a precisão interna (sem arredondar intermediários)', () => {
    const v = normalizar(1, 0, 3, 'maior'); // 3.3333...
    expect(v).toBeCloseTo(10 / 3, 15);
    expect(v).not.toBe(3.33);
  });
});

describe('herança dinâmica nas linhas', () => {
  it('produto lê do modelo; alterar o modelo reflete sem cópia', () => {
    const f = new Fabrica();
    const quartos = f.itemM('Quartos');
    const preco = f.itemP('Preço');
    const m = f.modelo('Apto', [[quartos, 2]]);
    const p = f.produto('Apto 101', m, [[preco, 500]]);
    let l = montarLinhas(f.d).find((x) => x.id === p.id)!;
    expect(l.valores.get(`m:${quartos.id}`)?.valor_num).toBe(2);
    expect(l.valores.get(`p:${preco.id}`)?.valor_num).toBe(500);
    // altera o valor no modelo: a linha do produto muda, sem nada gravado no produto
    f.d.modeloValores[0]!.valor_num = 3;
    l = montarLinhas(f.d).find((x) => x.id === p.id)!;
    expect(l.valores.get(`m:${quartos.id}`)?.valor_num).toBe(3);
    expect(f.d.produtoValores).toHaveLength(1);
  });
  it('novo item no modelo aparece nos produtos associados; produto sem modelo só tem os próprios', () => {
    const f = new Fabrica();
    const a = f.itemM('A');
    const b = f.itemM('B');
    const m = f.modelo('M', [[a, 1]]);
    const p1 = f.produto('P1', m);
    const p2 = f.produto('P2', null);
    f.modelo('Outro');
    f.d.modeloValores.push({ modelo_id: m.id, item_modelo_id: b.id, tipo: 'numerico', valor_num: 9, valor_txt: null, valor_img_id: null });
    const ls = montarLinhas(f.d);
    expect([...ls.find((x) => x.id === p1.id)!.valores.keys()].sort()).toEqual([`m:${a.id}`, `m:${b.id}`].sort());
    expect(ls.find((x) => x.id === p2.id)!.valores.size).toBe(0);
    expect(ls.filter((x) => x.kind === 'modelo')).toHaveLength(2); // modelos são linhas independentes
  });
  it('linha de modelo não recebe itens de produto', () => {
    const f = new Fabrica();
    const preco = f.itemP('Preço');
    f.modelo('M');
    f.produto('P', null, [[preco, 1]]);
    const m = montarLinhas(f.d).find((x) => x.kind === 'modelo')!;
    expect(m.valores.size).toBe(0);
  });
});

describe('itens de análise por linha', () => {
  it('fórmula combina item de modelo e de produto no contexto do registro', () => {
    const f = new Fabrica();
    const area = f.itemM('Área');
    const preco = f.itemP('Preço');
    const m = f.modelo('M', [[area, 50]]);
    const p = f.produto('P', m, [[preco, 1000]]);
    const razao = f.formula('R$/m²', `${ref('p', preco.id)} / ${ref('m', area.id)}`);
    const r = calcularAnalise(f.d, montarLinhas(f.d));
    expect(r.get(`produto:${p.id}`)!.get(razao.id)).toEqual({ kind: 'valor', valor: 20 });
    // na linha do modelo o preço não existe: 0 / 50 = 0 (ausente = zero)
    expect(r.get(`modelo:${m.id}`)!.get(razao.id)).toEqual({ kind: 'valor', valor: 0 });
  });
  it('erro em uma linha não impede o cálculo das demais', () => {
    const f = new Fabrica();
    const q = f.itemP('Qtd');
    const p1 = f.produto('P1', null, [[q, 0]]);
    const p2 = f.produto('P2', null, [[q, 4]]);
    const inv = f.formula('Inv', `10 / ${ref('p', q.id)}`);
    const r = calcularAnalise(f.d, montarLinhas(f.d));
    expect(r.get(`produto:${p1.id}`)!.get(inv.id)!.kind).toBe('erro');
    expect(r.get(`produto:${p2.id}`)!.get(inv.id)).toEqual({ kind: 'valor', valor: 2.5 });
  });
  it('fórmula com sintaxe inválida gravada vira erro contextual', () => {
    const f = new Fabrica();
    f.produto('P', null);
    const x = f.formula('Ruim', '1 +');
    const r = calcularAnalise(f.d, montarLinhas(f.d));
    const res = [...r.values()][0]!.get(x.id)!;
    expect(res.kind).toBe('erro');
  });
  it('ciclo gravado por outro meio não trava: erro nos envolvidos', () => {
    const f = new Fabrica();
    f.produto('P', null);
    const a = f.formula('A', '1');
    const b = f.formula('B', ref('a', a.id));
    a.formula_texto = ref('a', b.id);
    const r = [...calcularAnalise(f.d, montarLinhas(f.d)).values()][0]!;
    expect(r.get(a.id)!.kind).toBe('erro');
    expect(r.get(b.id)!.kind).toBe('erro');
  });
});

describe('agregados', () => {
  const montar = () => {
    const f = new Fabrica();
    const preco = f.itemP('Preço');
    const km = f.itemP('Km');
    const ano = f.itemP('Ano');
    return { f, preco, km, ano };
  };
  const res = (f: Fabrica, id: string, linha: string) => calcularAnalise(f.d, montarLinhas(f.d)).get(linha)!.get(id)!;

  it('média ponderada de critérios normalizados', () => {
    const { f, preco, km } = montar();
    const p = f.produto('P', null, [[preco, 20000], [km, 50000]]);
    // preço: menor é melhor em [10000, 30000] → 5 ; km: menor é melhor em [0,100000] → 5 ; ambos 5
    const ag = f.agregado('Ag', [comp('p', preco.id, 1, 'menor', 10000, 30000), comp('p', km.id, 3, 'menor', 0, 100000)]);
    expect(res(f, ag.id, `produto:${p.id}`)).toEqual({ kind: 'valor', valor: 5, cobertura: { usados: 2, total: 2 } });
  });
  it('pesos são relativos (1:3)', () => {
    const { f, preco, km } = montar();
    const p = f.produto('P', null, [[preco, 30000], [km, 0]]);
    // preço: menor melhor [10000,30000] → 0 ; km menor melhor [0,100000] → 10 ; (1*0 + 3*10)/4 = 7.5
    const ag = f.agregado('Ag', [comp('p', preco.id, 1, 'menor', 10000, 30000), comp('p', km.id, 3, 'menor', 0, 100000)]);
    expect((res(f, ag.id, `produto:${p.id}`) as { valor: number }).valor).toBe(7.5);
  });
  it('critério sem dado é excluído e o peso sai do denominador; cobertura informada', () => {
    const { f, preco, km, ano } = montar();
    const p = f.produto('P', null, [[preco, 10000], [ano, 2020]]); // km ausente
    const ag = f.agregado('Ag', [
      comp('p', preco.id, 1, 'menor', 10000, 30000), // 10
      comp('p', km.id, 9, 'menor', 0, 100000), // ausente: excluído
      comp('p', ano.id, 1, 'maior', 2010, 2030), // 5
    ]);
    expect(res(f, ag.id, `produto:${p.id}`)).toEqual({ kind: 'valor', valor: 7.5, cobertura: { usados: 2, total: 3 } });
  });
  it('zero informado é dado válido (≠ ausente)', () => {
    const { f, km, preco } = montar();
    const p = f.produto('P', null, [[km, 0], [preco, 100]]);
    const ag = f.agregado('Ag', [comp('p', km.id, 1, 'menor', 0, 100), comp('p', preco.id, 1, 'maior', 0, 100)]);
    expect((res(f, ag.id, `produto:${p.id}`) as { valor: number }).valor).toBe(10);
  });
  it('sem nenhum critério válido: indisponível (não é zero)', () => {
    const { f, preco, km } = montar();
    const p = f.produto('P', null);
    const ag = f.agregado('Ag', [comp('p', preco.id, 1, 'maior', 0, 10), comp('p', km.id, 1, 'maior', 0, 10)]);
    expect(res(f, ag.id, `produto:${p.id}`).kind).toBe('indisponivel');
  });
  it('limites iguais gravados geram erro, não resultado', () => {
    const { f, preco, km } = montar();
    const p = f.produto('P', null, [[preco, 1], [km, 1]]);
    const ag = f.agregado('Ag', [comp('p', preco.id, 1, 'maior', 5, 5), comp('p', km.id, 1, 'maior', 0, 10)]);
    expect(res(f, ag.id, `produto:${p.id}`).kind).toBe('erro');
  });
  it('item textual gravado como componente é tratado como ausente (só numéricos contam)', () => {
    const { f, preco } = montar();
    const txt = f.itemP('Cor', 'textual');
    const p = f.produto('P', null, [[txt, 'azul'], [preco, 10]]);
    const ag = f.agregado('Ag', [comp('p', txt.id, 1, 'maior', 0, 10), comp('p', preco.id, 1, 'maior', 0, 10)]);
    expect(res(f, ag.id, `produto:${p.id}`)).toMatchObject({ kind: 'valor', cobertura: { usados: 1, total: 2 } });
  });
  it('agregados aninhados: cada inclusão tem peso, direção e limites próprios', () => {
    const { f, preco, km } = montar();
    const p = f.produto('P', null, [[preco, 20000], [km, 0]]);
    const filho = f.agregado('Filho', [comp('p', preco.id, 1, 'menor', 10000, 30000), comp('p', km.id, 1, 'menor', 0, 100000)]); // (5+10)/2 = 7.5
    const outro = f.agregado('Outro', [comp('p', km.id, 1, 'menor', 0, 10), comp('p', preco.id, 1, 'maior', 0, 40000)]); // (10 + 5)/2
    // pai usa o filho com "maior é melhor" em [0,10] → 7.5 ; e o outro com "menor é melhor" em [0,10] → 10-7.5 = 2.5
    const pai = f.agregado('Pai', [comp('a', filho.id, 2, 'maior', 0, 10), comp('a', outro.id, 2, 'menor', 0, 10)]);
    const r = res(f, pai.id, `produto:${p.id}`) as { valor: number };
    expect(r.valor).toBeCloseTo((2 * 7.5 + 2 * 2.5) / 4, 12);
  });
  it('agregado indisponível dentro de outro é excluído; com erro propaga o erro', () => {
    const { f, preco, km } = montar();
    const p = f.produto('P', null, [[preco, 10]]);
    const vazio = f.agregado('Vazio', [comp('p', km.id, 1, 'maior', 0, 10), comp('p', km.id, 1, 'menor', 0, 10)]);
    const pai = f.agregado('Pai', [comp('a', vazio.id, 1, 'maior', 0, 10), comp('p', preco.id, 1, 'maior', 0, 10)]);
    expect(res(f, pai.id, `produto:${p.id}`)).toMatchObject({ kind: 'valor', valor: 10, cobertura: { usados: 1, total: 2 } });
    // agora o filho passa a dar erro (limites iguais)
    f.d.agregadoComponentes.find((c) => c.agregado_id === vazio.id)!.lmax = 0;
    f.d.agregadoComponentes.find((c) => c.agregado_id === vazio.id)!.lmin = 0;
    f.d.agregadoComponentes.filter((c) => c.agregado_id === vazio.id)[0]!.item_produto_id = preco.id;
    expect(res(f, pai.id, `produto:${p.id}`).kind).toBe('erro');
  });
  it('fórmula com divisão por zero dentro de agregado propaga erro; fórmula válida entra como número', () => {
    const { f, preco, km } = montar();
    const p = f.produto('P', null, [[preco, 100], [km, 0]]);
    const bom = f.formula('Bom', `${ref('p', preco.id)} * 2`);
    const ruim = f.formula('Ruim', `1 / ${ref('p', km.id)}`);
    const ok = f.agregado('Ok', [comp('a', bom.id, 1, 'maior', 0, 200), comp('p', preco.id, 1, 'maior', 0, 100)]);
    const ko = f.agregado('Ko', [comp('a', ruim.id, 1, 'maior', 0, 200), comp('p', preco.id, 1, 'maior', 0, 100)]);
    expect((res(f, ok.id, `produto:${p.id}`) as { valor: number }).valor).toBe(10);
    expect(res(f, ko.id, `produto:${p.id}`).kind).toBe('erro');
  });
  it('quantidade de componentes fora de 2–5 gravada gera erro', () => {
    const { f, preco } = montar();
    const p = f.produto('P', null, [[preco, 1]]);
    const ag = f.agregado('Um só', [comp('p', preco.id, 1, 'maior', 0, 10)]);
    expect(res(f, ag.id, `produto:${p.id}`).kind).toBe('erro');
  });
});

describe('ranking', () => {
  it('classificação competitiva com empates (1º, 1º, 3º)', () => {
    const m = classificar([
      { key: 'a', pontuacao: 8 }, { key: 'b', pontuacao: 8 }, { key: 'c', pontuacao: 5 }, { key: 'd', pontuacao: 9 },
    ]);
    expect(m.get('d')).toBe(1);
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(2);
    expect(m.get('c')).toBe(4);
  });
  it('1º, 1º, 3º', () => {
    const m = classificar([{ key: 'a', pontuacao: 9 }, { key: 'b', pontuacao: 9 }, { key: 'c', pontuacao: 1 }]);
    expect([m.get('a'), m.get('b'), m.get('c')]).toEqual([1, 1, 3]);
  });
  it('sem pontuação não recebe posição e não desloca as demais', () => {
    const m = classificar([{ key: 'a', pontuacao: null }, { key: 'b', pontuacao: 3 }, { key: 'c', pontuacao: 0 }]);
    expect(m.has('a')).toBe(false);
    expect(m.get('b')).toBe(1);
    expect(m.get('c')).toBe(2); // zero é pontuação válida
  });
  it('empate usa a precisão interna, não o valor arredondado', () => {
    const m = classificar([{ key: 'a', pontuacao: 7.0000001 }, { key: 'b', pontuacao: 7.0000002 }]);
    expect(m.get('b')).toBe(1);
    expect(m.get('a')).toBe(2);
  });
});

describe('filtros', () => {
  const cond = (over: Partial<FiltroCondicao>): FiltroCondicao => ({
    id: 'c', filtro_id: 'f', ordem: 1, item_modelo_id: null, item_produto_id: null, item_analise_id: null,
    operador: 'eq', valor_num: null, valor_txt: null, ...over,
  });
  const setup = () => {
    const f = new Fabrica();
    const preco = f.itemP('Preço');
    const quartos = f.itemP('Quartos');
    const area = f.itemP('Área');
    const nome = f.itemP('Cidade', 'textual');
    const p1 = f.produto('P1', null, [[preco, 400000], [quartos, 3], [area, 90], [nome, 'Recife']]);
    const p2 = f.produto('P2', null, [[preco, 600000], [quartos, 4], [area, 120], [nome, 'Olinda']]);
    const p3 = f.produto('P3', null, [[preco, 300000], [quartos, 2], [area, 110]]);
    const linhas = montarLinhas(f.d);
    const L = (id: string) => linhas.find((l) => l.id === id)!;
    const filtro = (logica: 'AND' | 'OR', conds: FiltroCondicao[]): FiltroCompleto => ({
      filtro: { id: 'f' + Math.random(), escopo_id: 'e', nome: 'F', descricao: null, logica, versao: 1 }, condicoes: conds,
    });
    return { f, preco, quartos, area, nome, p1, p2, p3, L, filtro };
  };
  const ids = (s: ReturnType<typeof setup>, ativos: FiltroCompleto[], g: 'AND' | 'OR') =>
    [s.p1, s.p2, s.p3].filter((p) => linhaPassa(s.L(p.id), undefined, ativos, g)).map((p) => p.nome);

  it('operadores numéricos', () => {
    const s = setup();
    const t = (operador: FiltroCondicao['operador'], v: number) =>
      ids(s, [s.filtro('AND', [cond({ item_produto_id: s.preco.id, operador, valor_num: v })])], 'AND');
    expect(t('lt', 400000)).toEqual(['P3']);
    expect(t('le', 400000)).toEqual(['P1', 'P3']);
    expect(t('gt', 400000)).toEqual(['P2']);
    expect(t('ge', 400000)).toEqual(['P1', 'P2']);
    expect(t('eq', 400000)).toEqual(['P1']);
    expect(t('ne', 400000)).toEqual(['P2', 'P3']);
  });
  it('intervalo por condições combinadas (AND interno)', () => {
    const s = setup();
    const f = s.filtro('AND', [
      cond({ item_produto_id: s.preco.id, operador: 'ge', valor_num: 350000 }),
      cond({ item_produto_id: s.preco.id, operador: 'le', valor_num: 500000, ordem: 2 }),
    ]);
    expect(ids(s, [f], 'AND')).toEqual(['P1']);
  });
  it('exemplo da spec: A = Preço < 500000 AND Quartos >= 3; B = Área >= 100', () => {
    const s = setup();
    const A = s.filtro('AND', [
      cond({ item_produto_id: s.preco.id, operador: 'lt', valor_num: 500000 }),
      cond({ item_produto_id: s.quartos.id, operador: 'ge', valor_num: 3, ordem: 2 }),
    ]); // P1
    const B = s.filtro('AND', [cond({ item_produto_id: s.area.id, operador: 'ge', valor_num: 100 })]); // P2, P3
    expect(ids(s, [A, B], 'AND')).toEqual([]);
    expect(ids(s, [A, B], 'OR')).toEqual(['P1', 'P2', 'P3']);
  });
  it('OR interno', () => {
    const s = setup();
    const f = s.filtro('OR', [
      cond({ item_produto_id: s.preco.id, operador: 'gt', valor_num: 500000 }),
      cond({ item_produto_id: s.quartos.id, operador: 'lt', valor_num: 3, ordem: 2 }),
    ]);
    expect(ids(s, [f], 'AND')).toEqual(['P2', 'P3']);
  });
  it('sem filtros ativos (ou filtro vazio) não restringe', () => {
    const s = setup();
    expect(ids(s, [], 'AND')).toHaveLength(3);
    expect(ids(s, [s.filtro('AND', [])], 'OR')).toHaveLength(3);
  });
  it('texto: = e ≠ sem diferenciar maiúsculas; vazio só satisfaz ≠; operadores de ordem não valem para texto', () => {
    const s = setup();
    const t = (operador: FiltroCondicao['operador'], v: string) =>
      ids(s, [s.filtro('AND', [cond({ item_produto_id: s.nome.id, operador, valor_txt: v })])], 'AND');
    expect(t('eq', 'recife')).toEqual(['P1']);
    expect(t('ne', 'Recife')).toEqual(['P2', 'P3']); // P3 sem cidade (vazio) satisfaz ≠
    expect(t('lt', 'Recife')).toEqual([]);
  });
  it('vazio numérico não satisfaz comparações, exceto ≠', () => {
    const f = new Fabrica();
    const x = f.itemP('X');
    f.produto('Sem', null);
    const l = montarLinhas(f.d)[0]!;
    const c = (operador: FiltroCondicao['operador']) => avaliarCondicao(cond({ item_produto_id: x.id, operador, valor_num: 0 }), { kind: 'vazio' });
    expect([c('eq'), c('lt'), c('le'), c('ne')]).toEqual([false, false, false, true]);
    expect(l.valores.size).toBe(0);
  });
  it('item de análise: valor entra; indisponível/erro não satisfaz', () => {
    const f = new Fabrica();
    const q = f.itemP('Q');
    f.produto('P', null, [[q, 2]]);
    const dobro = f.formula('Dobro', `${ref('p', q.id)} * 2`);
    const linhas = montarLinhas(f.d);
    const r = calcularAnalise(f.d, linhas).get(linhas[0]!.key)!;
    const filtro: FiltroCompleto = {
      filtro: { id: 'f', escopo_id: 'e', nome: 'F', descricao: null, logica: 'AND', versao: 1 },
      condicoes: [cond({ item_analise_id: dobro.id, operador: 'eq', valor_num: 4 })],
    };
    expect(linhaPassa(linhas[0]!, r, [filtro], 'AND')).toBe(true);
    expect(linhaPassa(linhas[0]!, new Map([[dobro.id, { kind: 'erro', mensagem: 'x' }]]), [filtro], 'AND')).toBe(false);
  });
});

describe('ordenação', () => {
  type R = { n: string; c: Celula };
  const col = (r: R) => r.c;
  it('numérica, textual, com vazios sempre por último', () => {
    const rs: R[] = [
      { n: 'a', c: { kind: 'num', v: 10 } }, { n: 'b', c: { kind: 'vazio' } }, { n: 'c', c: { kind: 'num', v: 2 } },
    ];
    expect(ordenar(rs, [{ col: 'x', dir: 'asc' }], col).map((r) => r.n)).toEqual(['c', 'a', 'b']);
    expect(ordenar(rs, [{ col: 'x', dir: 'desc' }], col).map((r) => r.n)).toEqual(['a', 'c', 'b']);
    const ts: R[] = [{ n: '1', c: { kind: 'txt', v: 'Zebra' } }, { n: '2', c: { kind: 'txt', v: 'ábaco' } }, { n: '3', c: { kind: 'txt', v: 'abacate' } }];
    expect(ordenar(ts, [{ col: 'x', dir: 'asc' }], col).map((r) => r.n)).toEqual(['3', '2', '1']);
  });
  it('múltiplas colunas com prioridade e estabilidade', () => {
    const dados = [
      { n: 'a', g: 'x', v: 2 }, { n: 'b', g: 'y', v: 1 }, { n: 'c', g: 'x', v: 1 }, { n: 'd', g: 'x', v: 1 },
    ];
    const cel = (r: (typeof dados)[0], k: string): Celula => (k === 'g' ? { kind: 'txt', v: r.g } : { kind: 'num', v: r.v });
    const out = ordenar(dados, [{ col: 'g', dir: 'asc' }, { col: 'v', dir: 'desc' }], cel).map((r) => r.n);
    expect(out).toEqual(['a', 'c', 'd', 'b']); // c e d empatam e mantêm a ordem original
  });
  it('números antes de textos; comparação simétrica', () => {
    expect(compararCelulas({ kind: 'num', v: 1 }, { kind: 'txt', v: 'a' }, 'asc')).toBeLessThan(0);
    expect(compararCelulas({ kind: 'vazio' }, { kind: 'vazio' }, 'asc')).toBe(0);
  });
  it('ordenar não altera o vetor original nem o ranking', () => {
    const rs: R[] = [{ n: 'a', c: { kind: 'num', v: 2 } }, { n: 'b', c: { kind: 'num', v: 1 } }];
    const copia = [...rs];
    ordenar(rs, [{ col: 'x', dir: 'asc' }], col);
    expect(rs).toEqual(copia);
  });
});

describe('unicidade de nomes', () => {
  const ex = [{ id: '1', nome: 'Preço' }, { id: '2', nome: ' Km ' }];
  it('ignora maiúsculas, minúsculas e espaços nas pontas', () => {
    expect(chaveNome('  PREÇO ')).toBe('preço');
    expect(nomeDuplicado('preço', ex)).toBe(true);
    expect(nomeDuplicado('KM', ex)).toBe(true);
    expect(nomeDuplicado('Ano', ex)).toBe(false);
  });
  it('permite manter o próprio nome ao editar', () => {
    expect(nomeDuplicado('Preço', ex, '1')).toBe(false);
    expect(nomeDuplicado('Preço', ex, '2')).toBe(true);
  });
  it('mensagens de validação', () => {
    expect(validarNome('  ', ex)).toMatch(/obrigatório/);
    expect(validarNome('preço', ex)).toMatch(/Já existe/);
    expect(validarNome('x'.repeat(201), ex)).toMatch(/200/);
    expect(validarNome('Novo', ex)).toBeNull();
  });
});

describe('conflitos de nomes herdado × próprio', () => {
  it('bloqueia associação quando o produto já tem item próprio com o mesmo nome', () => {
    const f = new Fabrica();
    const km = f.itemM('Km');
    const kmP = f.itemP('km');
    const outro = f.itemP('Cor', 'textual');
    const m = f.modelo('M', [[km, 10]]);
    const c = conflitosDeNomes(f.d, m.id, [kmP.id, outro.id]);
    expect(c).toHaveLength(1);
    expect(c[0]!.itemProdutoId).toBe(kmP.id);
    expect(conflitosDeNomes(f.d, null, [kmP.id])).toEqual([]);
  });
  it('detecta conflito ao acrescentar item ao modelo que já tem produtos', () => {
    const f = new Fabrica();
    const km = f.itemM('Km');
    const preco = f.itemP('Preço');
    const m = f.modelo('M');
    f.produto('P', m, [[preco, 1]]);
    expect(conflitosAoAcrescentarNoModelo(f.d, m.id, [km.id])).toEqual([]);
    const precoM = f.itemM('PREÇO');
    expect(conflitosAoAcrescentarNoModelo(f.d, m.id, [precoM.id])).toHaveLength(1);
  });
});

describe('CSV', () => {
  it('delimitador vírgula, CRLF, BOM e acentos', () => {
    const csv = gerarCsv(['Nome', 'Preço'], [['Casa', 1000], ['Apto', null]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿Nome,Preço\r\nCasa,1000\r\nApto,\r\n');
  });
  it('trata aspas, vírgulas e quebras de linha', () => {
    const csv = gerarCsv(['a'], [['diz "oi", ok'], ['linha1\nlinha2']]);
    expect(csv).toContain('"diz ""oi"", ok"');
    expect(csv).toContain('"linha1\nlinha2"');
  });
  it('neutraliza injeção de fórmula em textos, sem alterar números negativos', () => {
    const csv = gerarCsv(['a'], [['=HYPERLINK("x")'], ['+1'], [-5], ['@cmd']]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1");
    expect(csv).toContain("\r\n-5\r\n");
    expect(csv).toContain("'@cmd");
  });
});
