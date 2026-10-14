import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useGuardedAction } from '../ui/UnsavedChanges';
import { useToasts } from '../ui/Toasts';
import { prefs } from '../lib/storage';
import { NAV_ITEMS } from './nav';
import { useDados } from './DadosProvider';
import { useScope } from './ScopeProvider';

const TEXTO_SYNC = {
  ativo: '● Sincronizado',
  conectando: '○ Conectando…',
  reconectando: '◌ Reconectando… (os dados podem estar desatualizados)',
  erro: '✕ Sem sincronização ao vivo',
} as const;

function EstadoSincronizacao() {
  const { ativo } = useScope();
  const { sync, recarregar } = useDados();
  if (!ativo) return null;
  return (
    <span className={`sync sync-${sync}`} role="status" aria-live="polite">
      {TEXTO_SYNC[sync]}
      {sync !== 'ativo' && sync !== 'conectando' && (
        <button type="button" className="link-btn" onClick={recarregar}> Atualizar agora</button>
      )}
    </span>
  );
}

export function AppLayout() {
  const { session, signOut } = useAuth();
  const { escopos, ativo, selecionar } = useScope();
  const { notify } = useToasts();
  const guarded = useGuardedAction();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => prefs.get('menuRecolhido') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    prefs.set('menuRecolhido', next ? '1' : '0');
  };

  const onSignOut = () =>
    guarded(() => {
      void signOut().then((err) => {
        if (err) notify('error', err.message);
        else navigate('/login', { replace: true });
      });
    });

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <a href="#conteudo" className="skip-link">
        Ir para o conteúdo
      </a>
      <header className="topbar">
        <button
          type="button"
          className="icon-btn menu-btn"
          aria-label="Abrir ou fechar menu"
          aria-expanded={mobileOpen}
          aria-controls="menu-lateral"
          onClick={() => setMobileOpen((o) => !o)}
        >
          ☰
        </button>
        <strong className="brand">Auxdec</strong>
        <div className="scope-picker">
          <label htmlFor="escopo-ativo">Escopo ativo</label>
          <select
            id="escopo-ativo"
            value={ativo?.id ?? ''}
            disabled={escopos.length === 0}
            onChange={(e) => {
              const id = e.target.value;
              guarded(() => selecionar(id));
            }}
          >
            {escopos.length === 0 && <option value="">Nenhum escopo</option>}
            {escopos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <EstadoSincronizacao />
        <span className="user" title={session?.user.email ?? ''}>
          {session?.user.email}
        </span>
      </header>

      <nav id="menu-lateral" className="sidebar" aria-label="Principal">
        <ul>
          {NAV_ITEMS.map((item) => {
            const disabled = item.needsScope && !ativo;
            return (
              <li key={item.to}>
                {disabled ? (
                  <span className="nav-link is-disabled" aria-disabled="true" title="Crie um escopo primeiro">
                    {item.label} <span className="sr-only">(indisponível: crie um escopo primeiro)</span>
                  </span>
                ) : (
                  <NavLink to={item.to} end={item.to === '/'} className="nav-link" onClick={() => setMobileOpen(false)}>
                    {item.label}
                  </NavLink>
                )}
              </li>
            );
          })}
        </ul>
        <div className="sidebar-foot">
          <button type="button" className="btn" onClick={toggle} aria-pressed={collapsed}>
            {collapsed ? 'Expandir menu' : 'Recolher menu'}
          </button>
          <button type="button" className="btn btn-danger" onClick={onSignOut}>
            Sair
          </button>
        </div>
      </nav>

      <main id="conteudo" className="content" tabIndex={-1}>
        {ativo && (
          <p className="scope-banner">
            Você está no escopo <strong>{ativo.nome}</strong>
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
