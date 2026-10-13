import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Escopo } from '../domain/types';
import { listarEscopos } from '../services/escopos';
import { toAppError, type AppError } from '../services/errors';
import { prefs } from '../lib/storage';

interface ScopeState {
  escopos: Escopo[];
  ativo: Escopo | null;
  loading: boolean;
  error: AppError | null;
  selecionar: (id: string) => void;
  recarregar: () => Promise<void>;
}

const ScopeContext = createContext<ScopeState | null>(null);
const KEY = 'escopoAtivo';

/** Escopo ativo = preferência local (só conveniência); o servidor continua sendo a fonte da verdade. */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const [escopos, setEscopos] = useState<Escopo[]>([]);
  const [ativoId, setAtivoId] = useState<string | null>(() => prefs.get(KEY));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativa = true;
    listarEscopos().then(
      (lista) => {
        if (!ativa) return;
        setEscopos(lista);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (!ativa) return;
        setError(toAppError(e));
        setLoading(false);
      },
    );
    return () => {
      ativa = false;
    };
  }, [tentativa]);

  const recarregar = useCallback(async () => {
    setLoading(true);
    setTentativa((n) => n + 1);
  }, []);

  const ativo = useMemo(() => escopos.find((e) => e.id === ativoId) ?? escopos[0] ?? null, [escopos, ativoId]);

  const selecionar = useCallback((id: string) => {
    prefs.set(KEY, id);
    setAtivoId(id);
  }, []);

  const value = useMemo(
    () => ({ escopos, ativo, loading, error, selecionar, recarregar }),
    [escopos, ativo, loading, error, selecionar, recarregar],
  );
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeState {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope deve ser usado dentro de ScopeProvider');
  return ctx;
}
