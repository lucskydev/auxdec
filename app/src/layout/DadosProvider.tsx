import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DadosEscopo } from '../domain/types';
import { carregarEscopo } from '../services/loader';
import { toAppError, type AppError } from '../services/errors';
import { useScope } from './ScopeProvider';
import { registrarAcesso } from '../services/escrita';

interface Estado {
  escopoId: string;
  dados: DadosEscopo | null;
  error: AppError | null;
}
interface DadosState {
  /** null enquanto carrega ou se não há escopo */
  dados: DadosEscopo | null;
  loading: boolean;
  error: AppError | null;
  recarregar: () => void;
}

const Ctx = createContext<DadosState | null>(null);

/** Dados completos do escopo ativo. Qualquer gravação confirmada chama recarregar(); Realtime (Etapa 5) usará o mesmo ponto. */
export function DadosProvider({ children }: { children: ReactNode }) {
  const { ativo } = useScope();
  const ativoId = ativo?.id ?? null;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!ativoId) return;
    let viva = true;
    carregarEscopo(ativoId).then(
      (dados) => viva && setEstado({ escopoId: ativoId, dados, error: null }),
      (e: unknown) => viva && setEstado({ escopoId: ativoId, dados: null, error: toAppError(e) }),
    );
    return () => {
      viva = false;
    };
  }, [ativoId, tentativa]);

  useEffect(() => {
    if (ativoId) void registrarAcesso(ativoId);
  }, [ativoId]);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);
  const doEscopo = estado && estado.escopoId === ativoId ? estado : null;
  const value = useMemo<DadosState>(
    () => ({ dados: doEscopo?.dados ?? null, loading: ativoId !== null && doEscopo === null, error: doEscopo?.error ?? null, recarregar }),
    [doEscopo, ativoId, recarregar],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDados(): DadosState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDados deve ser usado dentro de DadosProvider');
  return c;
}
