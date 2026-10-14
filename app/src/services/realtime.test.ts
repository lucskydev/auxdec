import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarAgendador, estadoDoCanal } from './realtime';

describe('agendador', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('junta uma rajada de eventos em uma só chamada', () => {
    const f = vi.fn();
    const a = criarAgendador(f, 300);
    a.agendar(); a.agendar(); a.agendar();
    vi.advanceTimersByTime(299);
    expect(f).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('cancelar impede a chamada', () => {
    const f = vi.fn();
    const a = criarAgendador(f, 100);
    a.agendar(); a.cancelar();
    vi.advanceTimersByTime(500);
    expect(f).not.toHaveBeenCalled();
  });
  it('uma nova rajada depois da primeira dispara de novo', () => {
    const f = vi.fn();
    const a = criarAgendador(f, 100);
    a.agendar(); vi.advanceTimersByTime(100);
    a.agendar(); vi.advanceTimersByTime(100);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('estadoDoCanal', () => {
  it('SUBSCRIBED = ativo', () => expect(estadoDoCanal('SUBSCRIBED', false)).toBe('ativo'));
  it('erro na primeira conexão = erro; depois de conectar = reconectando', () => {
    expect(estadoDoCanal('CHANNEL_ERROR', false)).toBe('erro');
    expect(estadoDoCanal('TIMED_OUT', true)).toBe('reconectando');
    expect(estadoDoCanal('CLOSED', true)).toBe('reconectando');
  });
  it('status desconhecido = conectando', () => expect(estadoDoCanal('JOINING', false)).toBe('conectando'));
});
