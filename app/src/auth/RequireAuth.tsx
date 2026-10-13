import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Spinner } from '../ui/Spinner';

/** Barra a navegação sem sessão. A segurança real está no RLS; isto é só experiência de uso. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <Spinner label="Verificando sessão…" />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
