import { describe, expect, it } from 'vitest';
import { dimensoesAlvo } from './imagens';

describe('dimensoesAlvo', () => {
  it('não amplia imagens pequenas', () => expect(dimensoesAlvo(100, 50)).toEqual({ largura: 100, altura: 50 }));
  it('reduz pela largura', () => expect(dimensoesAlvo(1600, 600)).toEqual({ largura: 800, altura: 300 }));
  it('reduz pela altura', () => expect(dimensoesAlvo(800, 1200)).toEqual({ largura: 400, altura: 600 }));
  it('respeita os limites do banco', () => {
    const d = dimensoesAlvo(5000, 4000);
    expect(d.largura).toBeLessThanOrEqual(800);
    expect(d.altura).toBeLessThanOrEqual(600);
  });
  it('nunca devolve zero', () => expect(dimensoesAlvo(10000, 1).altura).toBe(1));
});
