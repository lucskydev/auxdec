import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedChangesProvider, useUnsavedGuard } from './UnsavedChanges';

function Editor({ save }: { save?: () => Promise<boolean> }) {
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty, save);
  return (
    <div>
      <h1>Editor</h1>
      <button onClick={() => setDirty(true)}>editar</button>
      <Link to="/outra">ir</Link>
    </div>
  );
}
function montar(save?: () => Promise<boolean>) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <UnsavedChangesProvider>
            <Outlet />
          </UnsavedChangesProvider>
        ),
        children: [
          { path: '/', element: <Editor save={save} /> },
          { path: '/outra', element: <h1>Outra</h1> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('guarda de alterações não salvas', () => {
  it('navega livremente quando não há alterações', async () => {
    montar();
    await userEvent.click(screen.getByText('ir'));
    expect(await screen.findByText('Outra')).toBeInTheDocument();
  });

  it('com alterações: pergunta e Cancelar mantém a tela', async () => {
    montar();
    await userEvent.click(screen.getByText('editar'));
    await userEvent.click(screen.getByText('ir'));
    expect(await screen.findByText('Alterações não salvas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.queryByText('Outra')).not.toBeInTheDocument();
  });

  it('Descartar só ocorre por decisão explícita e então navega', async () => {
    montar();
    await userEvent.click(screen.getByText('editar'));
    await userEvent.click(screen.getByText('ir'));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(await screen.findByText('Outra')).toBeInTheDocument();
  });

  it('Salvar bem-sucedido navega; falha mantém a tela', async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    montar(save);
    await userEvent.click(screen.getByText('editar'));
    await userEvent.click(screen.getByText('ir'));
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Editor')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Outra')).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
