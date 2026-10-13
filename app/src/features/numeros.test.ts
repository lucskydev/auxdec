import { describe, expect, it } from 'vitest';
import { formatarNumero, lerNumero, numeroParaTexto, urlSegura, validarLimites } from './numeros';

describe('lerNumero', () => {
  it('vazio é null (≠ 0) e zero é zero', () => {
    expect(lerNumero('')).toEqual({ ok: true, valor: null });
    expect(lerNumero('  ')).toEqual({ ok: true, valor: null });
    expect(lerNumero('0')).toEqual({ ok: true, valor: 0 });
  });
  it('aceita vírgula e ponto decimais e sinais', () => {
    expect(lerNumero('1234,56')).toEqual({ ok: true, valor: 1234.56 });
    expect(lerNumero('-3.5')).toEqual({ ok: true, valor: -3.5 });
    expect(lerNumero(',5')).toEqual({ ok: true, valor: 0.5 });
  });
  it('recusa lixo, notação científica, Infinity e NaN', () => {
    for (const t of ['abc', '1e5', 'Infinity', 'NaN', '1,2,3', '1.234,56', '--1']) {
      expect(lerNumero(t).ok).toBe(false);
    }
  });
});
describe('exibição e limites', () => {
  it('vazio aparece como traço; zero como 0', () => {
    expect(formatarNumero(null)).toBe('—');
    expect(formatarNumero(0)).toBe('0');
    expect(formatarNumero(1234.5, 2)).toBe('1.234,50');
    expect(numeroParaTexto(1.5)).toBe('1,5');
  });
  it('a precisão de exibição não altera o valor', () => {
    const v = 1 / 3;
    formatarNumero(v, 2);
    expect(v).toBe(1 / 3);
  });
  it('valida mínimo e máximo', () => {
    expect(validarLimites(5, 10, null)).toMatch(/maior ou igual a 10/);
    expect(validarLimites(50, null, 10)).toMatch(/menor ou igual a 10/);
    expect(validarLimites(10, 10, 10)).toBeNull();
    expect(validarLimites(null, 10, 20)).toBeNull();
  });
  it('só aceita links http/https', () => {
    expect(urlSegura('https://exemplo.com/a')).toBe(true);
    expect(urlSegura('javascript:alert(1)')).toBe(false);
    expect(urlSegura('exemplo.com')).toBe(false);
  });
});
