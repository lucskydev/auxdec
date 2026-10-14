import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DadosEscopo } from '../domain/types';

let comportamento: 'ok' | 'falha' = 'ok';
const chamadas: unknown[] = [];
const excluir = (img: unknown) => { chamadas.push(img); return comportamento === 'ok' ? Promise.resolve([]) : Promise.reject(new Error('fk')); };
vi.mock('../services/imagens', () => ({ excluirImagem: (img: unknown) => excluir(img), enviarImagem: vi.fn(), prepararImagem: vi.fn() }));
import { limparImagensSoltas } from './ValoresEditor';

const d = { imagens: [{ id: 'a', storage_path: 'pa' }, { id: 'b', storage_path: 'pb' }, { id: 'c', storage_path: 'pc' }] } as unknown as DadosEscopo;

describe('limparImagensSoltas (R7)', () => {
  beforeEach(() => { chamadas.length = 0; comportamento = 'ok'; });
  it('remove só as imagens que deixaram de ser usadas', async () => {
    const r = await limparImagensSoltas(d, ['a', 'b', null, 'a'], [{ item_id: 'x', valor_img_id: 'b' }, { item_id: 'y', valor_img_id: 'novo' }]);
    expect(chamadas).toEqual([d.imagens[0]]);
    expect(r).toBe(0);
  });
  it('imagem ainda referenciada em outro lugar (recusa do banco) não quebra o salvamento', async () => {
    comportamento = 'falha';
    const r = await limparImagensSoltas(d, ['a', 'c'], []);
    expect(r).toBe(2);
  });
  it('sem imagens antigas não faz nada', async () => {
    expect(await limparImagensSoltas(d, [], [])).toBe(0);
    expect(chamadas).toHaveLength(0);
  });
});
