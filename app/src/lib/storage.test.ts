import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefs } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('prefs', () => {
  it('grava somente com o prefixo da v2', () => {
    prefs.set('tema', 'x');
    expect(window.localStorage.getItem('sistemaDecisoesV2:tema')).toBe('x');
    expect(window.localStorage.getItem('tema')).toBeNull();
    expect(prefs.get('tema')).toBe('x');
    prefs.remove('tema');
    expect(prefs.get('tema')).toBeNull();
  });
  it('não lança quando o storage está indisponível', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota');
    });
    expect(prefs.get('a')).toBeNull();
    expect(() => prefs.set('a', '1')).not.toThrow();
  });
});
