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
import { AnalisePage } from './pages/AnalisePage';
import { FiltrosPage } from './pages/FiltrosPage';
import { ItensAnalisePage } from './pages/ItensAnalisePage';
import { ItensPage } from './pages/ItensPage';
import { ModelosPage } from './pages/ModelosPage';
import { ProdutosPage } from './pages/ProdutosPage';
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
              { path: '/analise', element: <AnalisePage /> },
              { path: '/produtos', element: <ProdutosPage /> },
              { path: '/modelos', element: <ModelosPage /> },
              { path: '/itens-modelo', element: <ItensPage tabela="v2_itens_modelo" /> },
              { path: '/itens-produto', element: <ItensPage tabela="v2_itens_produto" /> },
              { path: '/itens-analise', element: <ItensAnalisePage /> },
              { path: '/filtros', element: <FiltrosPage /> },
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
