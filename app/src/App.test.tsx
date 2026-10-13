import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cliente Supabase simulado: nenhum acesso à rede nem ao projeto real.
const auth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
};
const order = vi.fn();
const from = vi.fn(() => ({ select: () => ({ order }) }));
vi.mock('./lib/supabase', () => ({ getSupabase: () => ({ auth, from }) }));

import { routes } from './App';

const sessao = { user: { email: 'luc@example.com' } };
const escopo = { id: 'e1', nome: 'Veículos', descricao: null, ultimo_acesso: '2026-10-11T10:00:00Z', versao: 1 };

function abrir(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.getSession.mockResolvedValue({ data: { session: null } });
  order.mockResolvedValue({ data: [], error: null });
});

describe('autenticação e rotas', () => {
  it('sem sessão, rota protegida redireciona para o login', async () => {
    const router = abrir('/produtos');
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(from).not.toHaveBeenCalled(); // nenhum dado é buscado sem sessão
  });

  it('login com senha errada mostra erro em texto e não entra', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { status: 400, code: 'invalid_credentials', message: 'x' } });
    abrir('/login');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'luc@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/E-mail ou senha incorretos/)).toBeInTheDocument();
  });

  it('login válido leva ao dashboard', async () => {
    auth.signInWithPassword.mockImplementation(async () => {
      auth.getSession.mockResolvedValue({ data: { session: sessao } });
      const cb = auth.onAuthStateChange.mock.calls[0]?.[0] as ((e: string, s: unknown) => void) | undefined;
      cb?.('SIGNED_IN', sessao);
      return { error: null };
    });
    const router = abrir('/login');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'luc@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'luc@example.com', password: 'segredo' });
  });
});

describe('área autenticada', () => {
  beforeEach(() => auth.getSession.mockResolvedValue({ data: { session: sessao } }));

  it('sem escopos: oferece estado vazio e desabilita telas que exigem escopo', async () => {
    abrir('/');
    expect(await screen.findByText('Nenhum escopo ainda')).toBeInTheDocument();
    expect(screen.getByLabelText('Escopo ativo')).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Produtos' })).not.toBeInTheDocument();
    // as 7 telas que exigem escopo ficam indisponíveis, com indicação em texto
    expect(screen.getAllByText(/indisponível: crie um escopo primeiro/i)).toHaveLength(7);
  });

  it('com escopos: mostra o escopo ativo, lista e permite navegar', async () => {
    order.mockResolvedValue({ data: [escopo], error: null });
    abrir('/');
    expect(await screen.findByText('Escopos recentes')).toBeInTheDocument();
    expect(screen.getByLabelText('Escopo ativo')).toHaveValue('e1');
    expect(screen.getByText(/Você está no escopo/)).toHaveTextContent('Veículos');
    await userEvent.click(screen.getByRole('link', { name: 'Produtos' }));
    expect(await screen.findByRole('heading', { name: 'Produtos' })).toBeInTheDocument();
  });

  it('erro ao carregar escopos é informado e permite tentar de novo', async () => {
    order.mockResolvedValueOnce({ data: null, error: new TypeError('Failed to fetch') });
    abrir('/');
    expect(await screen.findByText(/Falha de conexão/)).toBeInTheDocument();
    order.mockResolvedValue({ data: [escopo], error: null });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Escopos recentes')).toBeInTheDocument();
  });

  it('Sair encerra a sessão e volta ao login', async () => {
    auth.signOut.mockImplementation(async () => {
      const cb = auth.onAuthStateChange.mock.calls[0]?.[0] as ((e: string, s: unknown) => void) | undefined;
      cb?.('SIGNED_OUT', null);
      return { error: null };
    });
    const router = abrir('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('lembra a escolha do menu recolhido com o prefixo da v2', async () => {
    abrir('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Recolher menu' }));
    expect(window.localStorage.getItem('sistemaDecisoesV2:menuRecolhido')).toBe('1');
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toHaveAttribute('aria-pressed', 'true');
  });
});
