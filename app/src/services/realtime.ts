import { getSupabase } from '../lib/supabase';

export type EstadoSync = 'conectando' | 'ativo' | 'reconectando' | 'erro';

export const TABELAS_ESCOPO = [
  'v2_itens_modelo', 'v2_itens_produto', 'v2_modelos', 'v2_produtos', 'v2_imagens', 'v2_modelo_valores', 'v2_produto_valores',
  'v2_itens_analise', 'v2_analise_refs', 'v2_agregado_componentes', 'v2_filtros', 'v2_filtro_condicoes', 'v2_config_analise',
] as const;

/** Junta rajadas de eventos (uma gravação gera vários, em várias tabelas) em uma única chamada. */
export function criarAgendador(acao: () => void, esperaMs: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return {
    agendar() {
      if (t !== null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        acao();
      }, esperaMs);
    },
    cancelar() {
      if (t !== null) clearTimeout(t);
      t = null;
    },
  };
}

/** Traduz o status do canal Realtime; `jaConectou` distingue a primeira conexão de uma reconexão. */
export function estadoDoCanal(status: string, jaConectou: boolean): EstadoSync {
  if (status === 'SUBSCRIBED') return 'ativo';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') return jaConectou ? 'reconectando' : 'erro';
  if (status === 'CLOSED') return jaConectou ? 'reconectando' : 'conectando';
  return 'conectando';
}

export interface Assinatura {
  /** chamado a cada mudança em qualquer tabela do escopo */
  onMudanca: () => void;
  onEstado: (e: EstadoSync) => void;
  /** chamado quando a conexão volta depois de uma queda: eventos podem ter sido perdidos */
  onReconectou: () => void;
}

/** Um canal por escopo. O Realtime respeita a RLS: só chegam eventos das linhas do próprio usuário. */
export function assinarEscopo(escopoId: string, h: Assinatura): () => void {
  try {
    return assinarEscopoInterno(escopoId, h);
  } catch {
    h.onEstado('erro'); // sem Realtime a aplicação continua funcionando com atualização manual
    return () => undefined;
  }
}

function assinarEscopoInterno(escopoId: string, h: Assinatura): () => void {
  const sb = getSupabase();
  let jaConectou = false;
  let caiu = false;
  let canal = sb.channel(`v2-escopo-${escopoId}`);
  const filtro = `escopo_id=eq.${escopoId}`;
  for (const tabela of TABELAS_ESCOPO) {
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela, filter: filtro }, () => h.onMudanca());
  }
  canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'v2_escopos', filter: `id=eq.${escopoId}` }, () => h.onMudanca());
  canal.subscribe((status) => {
    const e = estadoDoCanal(status, jaConectou);
    if (e === 'ativo') {
      if (caiu) h.onReconectou();
      jaConectou = true;
      caiu = false;
    } else if (e === 'reconectando') {
      caiu = true;
    }
    h.onEstado(e);
  });
  return () => {
    void sb.removeChannel(canal);
  };
}

/** Lista de escopos do usuário (criação/edição/exclusão em outra aba ou dispositivo). */
export function assinarListaDeEscopos(onMudanca: () => void): () => void {
  try {
    const sb = getSupabase();
    const canal = sb
      .channel('v2-lista-escopos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_escopos' }, () => onMudanca())
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  } catch {
    return () => undefined;
  }
}
