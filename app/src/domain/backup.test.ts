import { describe, expect, it } from 'vitest';
import { montarBackup, validarBackup, type Backup } from './backup';
import { comp, Fabrica, ref } from './testkit';
import { dependenciasItemAnalise, dependenciasItemModelo, dependenciasItemProduto, impactoRemoverItemDoModelo, produtosDoModelo } from './dependencias';

function cenario() {
  const f = new Fabrica();
  const preco = f.itemM('Preço');
  const cor = f.itemP('Cor', 'textual');
  const km = f.itemP('Km');
  const m = f.modelo('Gol', [[preco, 50]]);
  const p = f.produto('Gol 2020', m, [[cor, 'azul'], [km, 10]]);
  const fx = f.formula('Dobro', `${ref('m', preco.id)} * 2`);
  const ag = f.agregado('Nota', [
    comp('m', preco.id, 1, 'menor', 0, 100),
    comp('p', km.id, 2, 'menor', 0, 100),
  ]);
  return { f, preco, cor, km, m, p, fx, ag };
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('backup: exportar e validar', () => {
  it('um backup montado dos dados é válido e não contém user_id', () => {
    const { f } = cenario();
    const b = montarBackup(f.d, new Date('2026-01-01T00:00:00Z'));
    const r = validarBackup(clone(b));
    expect(r.erros).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.resumo).toMatchObject({ itensModelo: 1, itensProduto: 2, modelos: 1, produtos: 1, itensAnalise: 2 });
    expect(JSON.stringify(b)).not.toContain('user_id');
  });

  it.each([
    ['não é objeto', 'x'],
    ['formato errado', { formato: 'outro' }],
    ['versão futura', { formato: 'auxdec-backup', versao_formato: 99 }],
  ])('rejeita %s', (_n, raw) => {
    expect(validarBackup(raw).ok).toBe(false);
  });

  function quebra(mut: (b: Backup) => void) {
    const { f } = cenario();
    const b = clone(montarBackup(f.d));
    mut(b);
    return validarBackup(b);
  }

  it('rejeita referência inexistente em valor', () => {
    expect(quebra((b) => { b.modelos[0]!.valores[0]!.item_id = '00000000-0000-4000-8000-999999999999'; }).ok).toBe(false);
  });
  it('rejeita nome duplicado de itens do mesmo tipo (sem diferenciar maiúsculas)', () => {
    expect(quebra((b) => { b.itens_produto[1]!.nome = 'COR'; }).ok).toBe(false);
  });
  it('rejeita conflito de nome entre item herdado do modelo e item próprio do produto', () => {
    expect(quebra((b) => { b.itens_produto[0]!.nome = 'preço'; }).ok).toBe(false);
  });
  it('rejeita fórmula com sintaxe inválida', () => {
    expect(quebra((b) => { b.itens_analise[0]!.formula_texto = '1 +'; }).ok).toBe(false);
  });
  it('rejeita fórmula com ciclo', () => {
    expect(quebra((b) => {
      const id = b.itens_analise[0]!.id;
      b.itens_analise[0]!.formula_texto = `[[a:${id}]] + 1`;
    }).ok).toBe(false);
  });
  it('rejeita agregado com menos de 2 componentes', () => {
    expect(quebra((b) => { b.itens_analise[1]!.componentes = b.itens_analise[1]!.componentes.slice(0, 1); }).ok).toBe(false);
  });
  it('rejeita agregado com mais de 5 componentes', () => {
    expect(quebra((b) => {
      const c = b.itens_analise[1]!.componentes;
      b.itens_analise[1]!.componentes = [...c, ...c, ...c];
    }).ok).toBe(false);
  });
  it('rejeita limites iguais no agregado (lmin = lmax)', () => {
    expect(quebra((b) => { b.itens_analise[1]!.componentes[0]!.lmin = 5; b.itens_analise[1]!.componentes[0]!.lmax = 5; }).ok).toBe(false);
  });
  it('rejeita id que não é UUID', () => {
    expect(quebra((b) => { b.modelos[0]!.id = 'abc'; }).ok).toBe(false);
  });
  it('rejeita id repetido', () => {
    expect(quebra((b) => { b.itens_produto[1]!.id = b.itens_produto[0]!.id; }).ok).toBe(false);
  });
  it('rejeita ranking apontando para item que não é agregado', () => {
    expect(quebra((b) => { b.config.agregado_ranking_id = b.itens_analise[0]!.id; }).ok).toBe(false);
  });
  it('rejeita tipo de valor incompatível (texto em item numérico)', () => {
    expect(quebra((b) => { b.modelos[0]!.valores[0]!.valor_num = null; b.modelos[0]!.valores[0]!.valor_txt = 'x'; }).ok).toBe(false);
  });
  it('rejeita lista ausente', () => {
    const { f } = cenario();
    const b = clone(montarBackup(f.d)) as unknown as Record<string, unknown>;
    delete b.modelos;
    expect(validarBackup(b).ok).toBe(false);
  });
  it('limita a quantidade de mensagens de erro', () => {
    const r = quebra((b) => { for (const m of b.modelos) m.id = 'x'; b.itens_produto.forEach((i) => { i.id = 'y'; }); });
    expect(r.erros.length).toBeLessThanOrEqual(50);
  });
});

describe('dependências', () => {
  it('item de modelo: bloqueado por modelo que o usa e por análise', () => {
    const { f, preco } = cenario();
    const dep = dependenciasItemModelo(f.d, preco.id);
    expect(dep.map((x) => x.tipo).sort()).toContain('modelo');
    expect(dep.map((x) => x.tipo)).toContain('agregado');
  });
  it('item de produto sem uso fica livre', () => {
    const f = new Fabrica();
    const i = f.itemP('Solto');
    expect(dependenciasItemProduto(f.d, i.id)).toEqual([]);
  });
  it('item de produto usado por produto', () => {
    const { f, cor } = cenario();
    expect(dependenciasItemProduto(f.d, cor.id).map((x) => x.tipo)).toEqual(['produto']);
  });
  it('item de análise: ranking conta, componentes próprios não', () => {
    const { f, ag } = cenario();
    expect(dependenciasItemAnalise(f.d, ag.id)).toEqual([]);
    f.d.config.agregado_ranking_id = ag.id;
    expect(dependenciasItemAnalise(f.d, ag.id).map((x) => x.tipo)).toEqual(['ranking']);
  });
  it('produtos do modelo e impacto de remover item (D6)', () => {
    const { f, m, p, preco } = cenario();
    expect(produtosDoModelo(f.d, m.id).map((x) => x.id)).toEqual([p.id]);
    const imp = impactoRemoverItemDoModelo(f.d, m.id, preco.id);
    expect(imp.produtos).toHaveLength(1);
    expect(imp.analises.length).toBeGreaterThan(0);
  });
});
