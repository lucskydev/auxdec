import { describe, expect, it } from 'vitest';
import { catalogoDe, dependenciasDiretas, nomesDe } from './catalogo';
import { comp, Fabrica, ref } from './testkit';
import { validarFormula } from './formula/validate';
import { paraArmazenamento, paraExibicao } from './formula/display';

describe('catálogo', () => {
  it('dependências diretas vêm de fórmulas (refs) e de componentes de agregado', () => {
    const f = new Fabrica();
    const x = f.itemM('X');
    const base = f.formula('Base', ref('m', x.id));
    const ag = f.agregado('Ag', [comp('a', base.id, 1, 'maior', 0, 10), comp('m', x.id, 1, 'maior', 0, 10)]);
    f.d.analiseRefs.push({ id: 'r1', analise_id: base.id, item_modelo_id: x.id, item_produto_id: null, item_analise_id: null });
    expect(dependenciasDiretas(f.d, ag.id)).toEqual([base.id]);
    expect(dependenciasDiretas(f.d, base.id)).toEqual([]);
  });
  it('detecta ciclo ao editar usando as dependências novas', () => {
    const f = new Fabrica();
    const a = f.formula('A', '1');
    const b = f.formula('B', ref('a', a.id));
    f.d.analiseRefs.push({ id: 'r', analise_id: b.id, item_modelo_id: null, item_produto_id: null, item_analise_id: a.id });
    const v = validarFormula(ref('a', b.id), catalogoDe(f.d, a.id), a.id);
    expect(v.ok).toBe(false);
  });
  it('ida e volta nome <-> id', () => {
    const f = new Fabrica();
    const x = f.itemM('Preço');
    const n = nomesDe(f.d);
    const exibido = paraExibicao(`${ref('m', x.id)} * 2`, n);
    expect(exibido).toBe('[m:Preço] * 2');
    expect(paraArmazenamento(exibido, n).texto).toBe(`${ref('m', x.id)} * 2`);
    expect(paraArmazenamento('[m:Nada]', n).naoResolvidos).toEqual(['[m:Nada]']);
  });
});
