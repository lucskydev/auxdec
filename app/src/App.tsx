import { useState } from 'react';
import { createHashRouter, Outlet, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { DadosProvider } from './layout/DadosProvider';
import { ScopeProvider } from './layout/ScopeProvider';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ToastProvider } from './ui/Toasts';
import { UnsavedChangesProvider } from './ui/UnsavedChanges';

function Providers() {
  return (
    <ToastProvider>
      <AuthProvider>
        <UnsavedChangesProvider>
          <Outlet />
        </UnsavedChangesProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

function ScopedShell() {
  return (
    <ScopeProvider>
      <DadosProvider>
        <AppLayout />
      </DadosProvider>
    </ScopeProvider>
  );
}

/** HashRouter: rotas do tipo /#/produtos funcionam no GitHub Pages mesmo com acesso direto ou F5. */
export const routes = [
  {
    element: <Providers />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <ScopedShell />,
            children: [
              { path: '/', element: <DashboardPage /> },
              // Páginas pesadas são carregadas sob demanda (code-splitting por rota).
              { path: '/analise', lazy: async () => ({ Component: (await import('./pages/AnalisePage')).AnalisePage }) },
              { path: '/produtos', lazy: async () => ({ Component: (await import('./pages/ProdutosPage')).ProdutosPage }) },
              { path: '/modelos', lazy: async () => ({ Component: (await import('./pages/ModelosPage')).ModelosPage }) },
              { path: '/itens-modelo', lazy: async () => { const { ItensPage } = await import('./pages/ItensPage'); return { Component: () => <ItensPage tabela="v2_itens_modelo" /> }; } },
              { path: '/itens-produto', lazy: async () => { const { ItensPage } = await import('./pages/ItensPage'); return { Component: () => <ItensPage tabela="v2_itens_produto" /> }; } },
              { path: '/itens-analise', lazy: async () => ({ Component: (await import('./pages/ItensAnalisePage')).ItensAnalisePage }) },
              { path: '/filtros', lazy: async () => ({ Component: (await import('./pages/FiltrosPage')).FiltrosPage }) },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export function App() {
  const [router] = useState(() => createHashRouter(routes));
  return <RouterProvider router={router} />;
}
