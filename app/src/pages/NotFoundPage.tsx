import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section>
      <h1>Página não encontrada</h1>
      <p>O endereço não existe nesta aplicação.</p>
      <Link to="/" className="btn">
        Voltar ao dashboard
      </Link>
    </section>
  );
}
