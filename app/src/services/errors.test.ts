import { describe, expect, it } from 'vitest';
import { toAppError } from './errors';

describe('toAppError', () => {
  it('traduz o conflito de versão (V2001)', () => {
    const e = toAppError({ code: 'V2001', message: 'conflito_versao', details: 'versao_persistida=3' });
    expect(e.kind).toBe('version');
    expect(e.message).toMatch(/outra sessão/);
    expect(e.detail).toBe('versao_persistida=3');
    expect(e.retryable).toBe(false);
  });
  it.each([
    ['V2002', 'validation'],
    ['V2004', 'validation'],
    ['V2011', 'notfound'],
    ['23505', 'validation'],
    ['23503', 'dependency'],
    ['23514', 'validation'],
    ['42501', 'auth'],
    ['PGRST301', 'auth'],
  ])('mapeia %s para %s', (code, kind) => {
    expect(toAppError({ code, message: 'x' }).kind).toBe(kind);
  });
  it('trata falha de rede como repetível', () => {
    const e = toAppError(new TypeError('Failed to fetch'));
    expect(e.kind).toBe('network');
    expect(e.retryable).toBe(true);
  });
  it('trata 401/403 como autenticação', () => {
    expect(toAppError({ status: 401, message: 'jwt expired' }).kind).toBe('auth');
  });
  it('não quebra com valores inesperados', () => {
    expect(toAppError('boom').kind).toBe('unknown');
    expect(toAppError(null).kind).toBe('unknown');
  });
});
