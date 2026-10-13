import { describe, expect, it } from 'vitest';
import { avaliar, arredondar, type EvalContext, type Resultado } from './evaluator';
import { parseFormula } from './parser';
import { FormulaSyntaxError } from './lexer';
import { alcanca, validarFormula, type Catalogo } from './validate';
import { paraArmazenamento, paraExibicao } from './display';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const M = (id: string) => `[[m:${id}]]`;
const P = (id: string) => `[[p:${id}]]`;
const AN = (id: string) => `[[a:${id}]]`;

function calc(src: string, nums: Record<string, number | null> = {}, an: Record<string, Resultado> = {}): Resultado {
  const ctx: EvalContext = {
    getNumero: (k, id) => (`${k}:${id}` in nums ? (nums[`${k}:${id}`] as number | null) : null),
    getAnalise: (id) => an[id] ?? { kind: 'erro', mensagem: 'inexistente' },
  };
  return avaliar(parseFormula(src), ctx);
}
const valor = (r: Resultado) => (r.kind === 'valor' ? r.valor : NaN);

describe('precedência e operadores', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 - 4 - 3', 3],
    ['2 * 3 + 4 * 5', 26],
    ['-2 + 5', 3],
    ['- -3', 3],
    ['8 / 2 / 2', 2],
    ['2 * -3', -6],
    ['1.5 + .5', 2],
  ])('%s = %s', (src, esperado) => {
    expect(valor(calc(src))).toBe(esperado);
  });

  it('comparações e lógica dentro de IF', () => {
    expect(valor(calc('IF(1 < 2 AND 3 >= 3, 10, 20)'))).toBe(10);
    expect(valor(calc('IF(1 > 2 OR NOT 2 = 3, 10, 20)'))).toBe(10);
    expect(valor(calc('IF(NOT (1 = 1), 10, 20)'))).toBe(20);
    expect(valor(calc('IF(1 ≠ 1, 10, 20)'))).toBe(20);
    expect(valor(calc('IF(1 != 2, 10, 20)'))).toBe(10);
    expect(valor(calc('IF(2 <= 2, 1, 0)'))).toBe(1);
  });
  it('AND tem precedência sobre OR; NOT sobre AND', () => {
    // 1=2 AND 1=1 OR 1=1  →  (F AND V) OR V = V
    expect(valor(calc('IF(1 = 2 AND 1 = 1 OR 1 = 1, 1, 0)'))).toBe(1);
    // NOT 1=1 AND 1=1 → (NOT V) AND V = F
    expect(valor(calc('IF(NOT 1 = 1 AND 1 = 1, 1, 0)'))).toBe(0);
  });
  it('igualdade tolera erro de ponto flutuante (0,1 + 0,2 = 0,3)', () => {
    expect(valor(calc('IF(0.1 + 0.2 = 0.3, 1, 0)'))).toBe(1);
  });
});

describe('funções', () => {
  it('SUM, MIN, MAX, AVG, ABS', () => {
    expect(valor(calc('SUM(1, 2, 3)'))).toBe(6);
    expect(valor(calc('MIN(4, 2, 9)'))).toBe(2);
    expect(valor(calc('MAX(4, 2, 9)'))).toBe(9);
    expect(valor(calc('AVG(2, 4, 9)'))).toBe(5);
    expect(valor(calc('ABS(-7.5)'))).toBe(7.5);
  });
  it('nomes de função não diferenciam maiúsculas', () => {
    expect(valor(calc('sum(1, 2)'))).toBe(3);
  });
  it('ROUND arredonda meio afastando de zero, sem erro de binário', () => {
    expect(valor(calc('ROUND(2.5, 0)'))).toBe(3);
    expect(valor(calc('ROUND(-2.5, 0)'))).toBe(-3);
    expect(valor(calc('ROUND(1.005, 2)'))).toBe(1.01);
    expect(valor(calc('ROUND(3.14159, 2)'))).toBe(3.14);
    expect(arredondar(1e20, 2)).toBe(1e20);
  });
  it('ROUND exige casas inteiras entre 0 e 15', () => {
    expect(calc('ROUND(1, 1.5)').kind).toBe('erro');
    expect(calc('ROUND(1, -1)').kind).toBe('erro');
    expect(calc('ROUND(1, 16)').kind).toBe('erro');
  });
  it('COUNT conta informados (inclusive zero) e ignora ausentes', () => {
    const nums = { [`m:${A}`]: 0, [`m:${B}`]: null, [`p:${C}`]: 5 };
    expect(valor(calc(`COUNT(${M(A)}, ${M(B)}, ${P(C)})`, nums))).toBe(2);
    expect(valor(calc(`COUNT(1, 2)`))).toBe(2);
  });
  it('IF é preguiçoso: o ramo não escolhido não gera erro', () => {
    expect(valor(calc('IF(1 = 1, 5, 1 / 0)'))).toBe(5);
    expect(calc('IF(1 = 2, 5, 1 / 0)').kind).toBe('erro');
  });
  it('AND/OR fazem curto-circuito', () => {
    expect(valor(calc('IF(1 = 2 AND 1 / 0 > 1, 1, 0)'))).toBe(0);
    expect(valor(calc('IF(1 = 1 OR 1 / 0 > 1, 1, 0)'))).toBe(1);
  });
});

describe('valores ausentes e referências', () => {
  it('ausente vale zero nas operações aritméticas', () => {
    expect(valor(calc(`${M(A)} + 5`, { [`m:${A}`]: null }))).toBe(5);
    expect(valor(calc(`${M(A)} + ${P(B)} + 1`))).toBe(1); // inexistentes no registro
    expect(valor(calc(`SUM(${M(A)}, 2)`))).toBe(2);
    expect(valor(calc(`AVG(${M(A)}, 4)`))).toBe(2); // ausente conta como zero na média
  });
  it('fórmula só com referência vazia resulta em zero', () => {
    expect(valor(calc(M(A)))).toBe(0);
  });
  it('usa os valores informados', () => {
    expect(valor(calc(`${M(A)} * ${P(B)}`, { [`m:${A}`]: 3, [`p:${B}`]: 4 }))).toBe(12);
  });
});

describe('erros de cálculo', () => {
  it('divisão por zero gera erro, não zero', () => {
    const r = calc('1 / 0');
    expect(r).toEqual({ kind: 'erro', mensagem: 'Divisão por zero.' });
    expect(calc(`1 / ${M(A)}`).kind).toBe('erro'); // ausente = 0
  });
  it('resultado lógico não é aceito como número', () => {
    expect(calc('1 < 2').kind).toBe('erro');
  });
  it('operador lógico exige booleanos e aritmética exige números', () => {
    expect(calc('IF(1, 1, 2)').kind).toBe('erro');
    expect(calc('IF(1 < 2, 1, 2) + (1 < 2)').kind).toBe('erro');
    expect(calc('IF(1 AND 2, 1, 2)').kind).toBe('erro');
  });
  it('estouro numérico vira erro', () => {
    expect(calc('1e308 * 10').kind).toBe('erro');
  });
});

describe('dependência de item de análise', () => {
  it('usa o valor do item referenciado', () => {
    expect(valor(calc(`${AN(A)} * 2`, {}, { [A]: { kind: 'valor', valor: 4 } }))).toBe(8);
  });
  it('propaga indisponível e erro', () => {
    expect(calc(AN(A), {}, { [A]: { kind: 'indisponivel', motivo: 'sem dados' } }).kind).toBe('indisponivel');
    expect(calc(AN(A), {}, { [A]: { kind: 'erro', mensagem: 'x' } }).kind).toBe('erro');
  });
});

describe('sintaxe', () => {
  const falha = (src: string) => {
    try {
      parseFormula(src);
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaSyntaxError);
      return (e as FormulaSyntaxError).message;
    }
    throw new Error('deveria falhar: ' + src);
  };
  it('rejeita expressões inválidas com mensagem compreensível', () => {
    expect(falha('')).toMatch(/vazia/);
    expect(falha('1 +')).toMatch(/terminou/);
    expect(falha('(1 + 2')).toMatch(/parêntese/);
    expect(falha('1 + 2)')).toMatch(/sem abertura/);
    expect(falha('FOO(1)')).toMatch(/Função desconhecida/);
    expect(falha('SUM 1')).toMatch(/parênteses/);
    expect(falha('IF(1 < 2, 3)')).toMatch(/exatamente 3/);
    expect(falha('SUM()')).toMatch(/ao menos 1/);
    expect(falha('1 < 2 < 3')).toMatch(/encadeadas/);
    expect(falha('1 $ 2')).toMatch(/não permitido/);
    expect(falha('[[m:xyz]]')).toMatch(/malformada/);
    expect(falha('alert(1)')).toMatch(/Função desconhecida/);
    expect(falha('1 2')).toMatch(/inesperado/);
    expect(falha('x + 1')).toMatch(/Função desconhecida/);
  });
  it('não executa código: identificadores e acesso a propriedades são recusados', () => {
    expect(() => parseFormula('constructor.constructor("return 1")()')).toThrow(FormulaSyntaxError);
    expect(() => parseFormula('globalThis')).toThrow(FormulaSyntaxError);
    expect(() => parseFormula("'a'")).toThrow(FormulaSyntaxError);
    expect(() => parseFormula('1; DROP TABLE x')).toThrow(FormulaSyntaxError);
  });
  it('limita tamanho e profundidade', () => {
    expect(() => parseFormula('1+'.repeat(1500) + '1')).toThrow(/excede/);
    expect(() => parseFormula('('.repeat(150) + '1' + ')'.repeat(150))).toThrow(/aninhada/);
  });
});

describe('validação de referências e ciclos', () => {
  const cat = (over: Partial<Catalogo> = {}): Catalogo => ({
    tipoItem: (_k, id) => (id === A ? 'numerico' : id === B ? 'textual' : undefined),
    existeAnalise: (id) => [A, B, C].includes(id),
    dependenciasAnalise: () => [],
    ...over,
  });
  it('aceita referências válidas e lista os itens usados', () => {
    const v = validarFormula(`${M(A)} + ${AN(C)} + ${M(A)}`, cat(), null);
    expect(v.ok).toBe(true);
    expect(v.refs).toHaveLength(2);
  });
  it('recusa referência inexistente, item não numérico e erro de sintaxe', () => {
    expect(validarFormula(M(C), cat(), null).erros[0]?.mensagem).toMatch(/não existe/);
    expect(validarFormula(M(B), cat(), null).erros[0]?.mensagem).toMatch(/numéricos/);
    expect(validarFormula(AN('44444444-4444-4444-8444-444444444444'), cat(), null).ok).toBe(false);
    const s = validarFormula('1 +', cat(), null);
    expect(s.ok).toBe(false);
    expect(s.erros[0]?.pos).toBeDefined();
  });
  it('detecta ciclo direto e indireto', () => {
    // A depende de B, B depende de C; editando C para depender de A fecha o ciclo
    const deps: Record<string, string[]> = { [A]: [B], [B]: [C], [C]: [] };
    const c = cat({ dependenciasAnalise: (id) => deps[id] ?? [] });
    expect(validarFormula(AN(C), c, C).erros[0]?.mensagem).toMatch(/circular/); // direto
    expect(validarFormula(AN(A), c, C).erros[0]?.mensagem).toMatch(/circular/); // indireto
    expect(validarFormula(AN(C), c, A).ok).toBe(true); // A -> C é permitido (sem volta)
    expect(alcanca(A, C, (id) => deps[id] ?? [])).toBe(true);
    expect(alcanca(C, A, (id) => deps[id] ?? [])).toBe(false);
    // ciclo pré-existente não trava a busca
    expect(alcanca(A, 'zzz', (id) => (id === A ? [B] : id === B ? [A] : []))).toBe(false);
  });
});

describe('exibição por nomes', () => {
  const nomes: Record<string, string> = { [`m:${A}`]: 'Preço', [`p:${B}`]: 'Km' };
  const cat = {
    nome: (k: 'm' | 'p' | 'a', id: string) => nomes[`${k}:${id}`],
    idPorNome: (k: 'm' | 'p' | 'a', n: string) => Object.entries(nomes).find(([key, v]) => key.startsWith(k + ':') && v.toLowerCase() === n.toLowerCase())?.[0].slice(2),
  };
  it('converte nos dois sentidos pelo id (renomear item não quebra a fórmula)', () => {
    const arm = `${M(A)} / ${P(B)}`;
    const exib = paraExibicao(arm, cat);
    expect(exib).toBe('[m:Preço] / [p:Km]');
    expect(paraArmazenamento(exib.replace('Preço', 'preço'), cat).texto).toBe(arm);
  });
  it('item removido fica visível e nomes desconhecidos são reportados', () => {
    expect(paraExibicao(M(C), cat)).toContain('?');
    expect(paraArmazenamento('[m:Inexistente] + 1', cat).naoResolvidos).toEqual(['[m:Inexistente]']);
    const ida = paraExibicao(M(C), cat);
    expect(paraArmazenamento(ida, cat).texto).toBe(M(C));
  });
});
