import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Escopo } from '../domain/types';

const lerZip = vi.fn();
const importar = vi.fn();
const exportar = vi.fn();
const baixar = vi.fn();

vi.mock('../services/backupZip', () => ({ lerZip: (...a: unknown[]) => lerZip(...a), exportarEscopo: (...a: unknown[]) => exportar(...a), baixarBlob: (...a: unknown[]) => baixar(...a) }));
vi.mock('../services/loader', () => ({ carregarEscopo: vi.fn().mockResolvedValue({}) }));
vi.mock('../services/importacao', () => ({ importarBackup: (...a: unknown[]) => importar(...a) }));

import { ImportarBackup } from './ImportarBackup';

const escopo = (id: string, nome: string, versao = 1): Escopo => ({ id, nome, descricao: null, ultimo_acesso: '2026-01-01T00:00:00Z', versao });
const resumo = { modelos: 2, produtos: 3, itensModelo: 4, itensProduto: 1, itensAnalise: 2, filtros: 1, imagens: 0 };
const zipValido = (nome = 'Imóveis') => ({ validacao: { ok: true, erros: [], resumo }, backup: { escopo: { nome, descricao: 'desc' } }, imagens: new Map() });
const zipInvalido = () => ({ validacao: { ok: false, erros: ['campo itens_modelo ausente'], resumo: null }, backup: null, imagens: new Map() });

async function escolherArquivo() {
  const f = new File(['x'], 'backup.zip', { type: 'application/zip' });
  if (!f.arrayBuffer) Object.defineProperty(File.prototype, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(1)) });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, f);
}
const montar = (escopos: Escopo[] = [escopo('e1', 'Veículos', 4)]) => {
  const props = { escopos, onClose: vi.fn(), onDone: vi.fn() };
  render(<ImportarBackup {...props} />);
  return props;
};
const botaoImportar = (rotulo: RegExp) => screen.getByRole('button', { name: rotulo }) as HTMLButtonElement;

beforeEach(() => { [lerZip, importar, exportar, baixar].forEach((m) => m.mockReset()); });

describe('ImportarBackup', () => {
  it('arquivo inválido mostra os erros, não permite importar e não chama o servidor', async () => {
    lerZip.mockReturnValue(zipInvalido());
    montar();
    await escolherArquivo();
    expect(await screen.findByText(/não pôde ser importado/)).toBeTruthy();
    expect(screen.getByText('campo itens_modelo ausente')).toBeTruthy();
    expect(botaoImportar(/Importar como novo escopo/).disabled).toBe(true);
    expect(importar).not.toHaveBeenCalled();
  });

  it('backup válido mostra o resumo e importa como novo escopo', async () => {
    lerZip.mockReturnValue(zipValido());
    importar.mockResolvedValue({ escopoId: 'novo1', orfaos: [] });
    const p = montar();
    await escolherArquivo();
    expect((await screen.findByRole('status')).textContent).toMatch(/2 modelo\(s\), 3 produto\(s\)/);
    expect((screen.getByLabelText('Nome do escopo') as HTMLInputElement).value).toBe('Imóveis');
    await userEvent.click(botaoImportar(/Importar como novo escopo/));
    await vi.waitFor(() => expect(p.onDone).toHaveBeenCalledWith('novo1', []));
    expect(importar.mock.calls[0]?.[1]).toBe('Imóveis');
    expect(importar.mock.calls[0]?.[3]).toEqual({ tipo: 'novo' });
  });

  it('nome já existente recebe sufixo "(importado)" e nome repetido bloqueia', async () => {
    lerZip.mockReturnValue(zipValido('veículos'));
    montar();
    await escolherArquivo();
    expect((await screen.findByLabelText('Nome do escopo') as HTMLInputElement).value).toBe('veículos (importado)');
    expect(botaoImportar(/Importar como novo escopo/).disabled).toBe(false);
    await userEvent.clear(screen.getByLabelText('Nome do escopo'));
    await userEvent.type(screen.getByLabelText('Nome do escopo'), 'VEÍCULOS');
    expect(botaoImportar(/Importar como novo escopo/).disabled).toBe(true);
  });

  it('substituir exige escolher o escopo, baixar o backup do atual e digitar o nome', async () => {
    lerZip.mockReturnValue(zipValido());
    exportar.mockResolvedValue({ blob: new Blob(['b']), nomeArquivo: 'atual.zip', falhas: [] });
    importar.mockResolvedValue({ escopoId: 'e1', orfaos: ['x.png'] });
    const p = montar();
    await escolherArquivo();
    await userEvent.click(await screen.findByRole('radio', { name: /Substituir/ }));
    expect(botaoImportar(/Substituir escopo/).disabled).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText('Escopo a substituir'), 'Veículos');
    const confirmar = screen.getByLabelText(/Para confirmar, digite: Veículos/) as HTMLInputElement;
    expect(confirmar.disabled).toBe(true); // só libera depois do backup
    await userEvent.click(screen.getByRole('button', { name: /Baixar backup do escopo atual/ }));
    await vi.waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    expect(confirmar.disabled).toBe(false);
    expect(botaoImportar(/Substituir escopo/).disabled).toBe(true); // falta digitar
    await userEvent.type(confirmar, 'veiculos');
    expect(botaoImportar(/Substituir escopo/).disabled).toBe(true); // nome errado
    await userEvent.clear(confirmar);
    await userEvent.type(confirmar, 'Veículos');
    await userEvent.click(botaoImportar(/Substituir escopo/));
    await vi.waitFor(() => expect(p.onDone).toHaveBeenCalledWith('e1', ['x.png']));
    expect(importar.mock.calls[0]?.[3]).toMatchObject({ tipo: 'substituir', confirmacao: 'Veículos', alvo: { id: 'e1', versao: 4 } });
  });

  it('backup do escopo atual incompleto bloqueia a substituição', async () => {
    lerZip.mockReturnValue(zipValido());
    exportar.mockResolvedValue({ blob: new Blob(['b']), nomeArquivo: 'atual.zip', falhas: ['img1'] });
    montar();
    await escolherArquivo();
    await userEvent.click(await screen.findByRole('radio', { name: /Substituir/ }));
    await userEvent.selectOptions(screen.getByLabelText('Escopo a substituir'), 'Veículos');
    await userEvent.click(screen.getByRole('button', { name: /Baixar backup do escopo atual/ }));
    expect(await screen.findByText(/Backup incompleto/)).toBeTruthy();
    expect(baixar).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Para confirmar, digite/) as HTMLInputElement).disabled).toBe(true);
  });

  it('falha do servidor mostra o erro, mantém o diálogo e permite tentar de novo', async () => {
    lerZip.mockReturnValue(zipValido());
    importar.mockRejectedValue({ code: 'V2013', message: 'x' });
    const p = montar();
    await escolherArquivo();
    await userEvent.click(await screen.findByRole('button', { name: /Importar como novo escopo/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(p.onDone).not.toHaveBeenCalled();
    expect(botaoImportar(/Importar como novo escopo/).disabled).toBe(false);
  });
});
