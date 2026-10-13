import type { ReactNode } from 'react';
import type { DadosEscopo } from '../domain/types';
import { useDados } from '../layout/DadosProvider';
import { useScope } from '../layout/ScopeProvider';
import { Spinner } from './Spinner';

/** Cuida dos estados comuns (sem escopo, carregando, erro) e entrega os dados já carregados. */
export function Carga({ titulo, children }: { titulo: string; children: (d: DadosEscopo, recarregar: () => void) => ReactNode }) {
  const { ativo } = useScope();
  const { dados, loading, error, recarregar } = useDados();
  if (!ativo) {
    return (
      <section>
        <h1>{titulo}</h1>
        <p className="notice notice-warning" role="status">Crie ou selecione um escopo no Dashboard para continuar.</p>
      </section>
    );
  }
  if (loading) return <Spinner label="Carregando dados…" />;
  if (error || !dados) {
    return (
      <section>
        <h1>{titulo}</h1>
        <p className="notice notice-error" role="alert">Erro: {error?.message ?? 'não foi possível carregar os dados.'}</p>
        <button type="button" className="btn" onClick={recarregar}>Tentar novamente</button>
      </section>
    );
  }
  return <>{children(dados, recarregar)}</>;
}
