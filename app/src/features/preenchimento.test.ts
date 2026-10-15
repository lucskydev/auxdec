import { describe, expect, it } from 'vitest';
import { itemFalso } from '../test/dadosFalsos';
import { camposDaLinha, interpretarLinha } from './preenchimento';

const itens = [
  itemFalso({ id: 'a', nome: 'Potência', valor_min: 0, valor_max: 1000 }),
  itemFalso({ id: 'b', nome: 'Cor', tipo: 'textual' }),
  itemFalso({ id: 'c', nome: 'Foto', tipo: 'imagem' }),
  itemFalso({ id: 'd', nome: 'Peso' }),
];

describe('interpretarLinha', () => {
  it('lista os campos na ordem do formulário', () => {
    expect(camposDaLinha(itens)).toEqual(['Nome', 'Descrição', 'Potência', 'Cor', 'Foto', 'Peso']);
  });
  it('preenche nome, descrição e valores na ordem', () => {
    const r = interpretarLinha('Sedan; Carro de passeio; 150,5; Prata;; 1200', itens);
    expect(r).toEqual({ ok: true, nome: 'Sedan', descricao: 'Carro de passeio', valores: { a: { texto: '150,5' }, b: { texto: 'Prata' }, c: { texto: '' }, d: { texto: '1200' } } });
  });
  it('";;" deixa o campo em branco', () => {
    const r = interpretarLinha('Sedan;;;Prata', itens);
    expect(r).toMatchObject({ ok: true, nome: 'Sedan', descricao: '' });
    if (r.ok) { expect(r.valores.a?.texto).toBe(''); expect(r.valores.b?.texto).toBe('Prata'); }
  });
  it('campos que faltam no fim ficam em branco e ";" final é aceito', () => {
    const r = interpretarLinha('Sedan;desc;100;', itens);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.valores.b?.texto).toBe(''); expect(r.valores.d?.texto).toBe(''); }
  });
  it('ignora espaços ao redor e quebras de linha', () => {
    const r = interpretarLinha('  Sedan ;  ; 10 \n', itens);
    expect(r).toMatchObject({ ok: true, nome: 'Sedan' });
  });
  it('número inválido, fora dos limites, texto em imagem e campos demais impedem tudo', () => {
    expect(interpretarLinha('S;;abc', itens)).toMatchObject({ ok: false });
    expect(interpretarLinha('S;;5000', itens)).toMatchObject({ ok: false });
    const img = interpretarLinha('S;;1;x;arquivo.png', itens);
    expect(img.ok).toBe(false);
    if (!img.ok) expect(img.erros[0]).toMatch(/Foto.*imagem/);
    const demais = interpretarLinha('S;;1;x;;2;extra', itens);
    expect(demais.ok).toBe(false);
    if (!demais.ok) expect(demais.erros[0]).toMatch(/7 campos/);
  });
  it('vários erros são listados juntos', () => {
    const r = interpretarLinha('S;;abc;;x;zzz', itens);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.length).toBeGreaterThanOrEqual(3);
  });
});
