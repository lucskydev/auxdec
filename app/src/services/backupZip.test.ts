import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { montarBackup } from '../domain/backup';
import { Fabrica } from '../domain/testkit';
import { lerZip } from './backupZip';

function zipDe(f: Fabrica, extra: Record<string, Uint8Array> = {}) {
  return zipSync({ 'backup.json': strToU8(JSON.stringify(montarBackup(f.d))), ...extra });
}

describe('lerZip', () => {
  it('lê um backup válido', () => {
    const f = new Fabrica();
    f.itemM('A');
    const r = lerZip(zipDe(f));
    expect(r.validacao.ok).toBe(true);
    expect(r.backup?.itens_modelo).toHaveLength(1);
  });
  it('rejeita lixo', () => expect(lerZip(new Uint8Array([1, 2, 3])).validacao.ok).toBe(false));
  it('rejeita zip sem backup.json', () => expect(lerZip(zipSync({ 'x.txt': strToU8('x') })).validacao.ok).toBe(false));
  it('rejeita json inválido', () => expect(lerZip(zipSync({ 'backup.json': strToU8('{') })).validacao.ok).toBe(false));
  it('rejeita imagem declarada e ausente', () => {
    const f = new Fabrica();
    f.d.imagens.push({ id: '00000000-0000-4000-8000-0000000000aa', escopo_id: 'e', storage_path: 'u/e/x.webp', largura: 1, altura: 1, bytes: 3, mime: 'image/webp' });
    const r = lerZip(zipDe(f));
    expect(r.validacao.ok).toBe(false);
    expect(r.validacao.erros.join()).toMatch(/ausente/);
  });
  it('aceita imagem presente com o tamanho certo e rejeita tamanho errado', () => {
    const f = new Fabrica();
    f.d.imagens.push({ id: '00000000-0000-4000-8000-0000000000aa', escopo_id: 'e', storage_path: 'u/e/x.webp', largura: 1, altura: 1, bytes: 3, mime: 'image/webp' });
    const nome = 'imagens/00000000-0000-4000-8000-0000000000aa.webp';
    expect(lerZip(zipDe(f, { [nome]: new Uint8Array([1, 2, 3]) })).validacao.ok).toBe(true);
    expect(lerZip(zipDe(f, { [nome]: new Uint8Array([1, 2]) })).validacao.ok).toBe(false);
  });
});
