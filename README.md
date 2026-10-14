# Auxdec v2 — Sistema auxiliar de tomada de decisões

Aplicação React + TypeScript + Vite, com Supabase (banco, autenticação, storage, realtime) e publicação no GitHub Pages.
Todos os objetos do banco usam o prefixo `v2_`.

- `app/` — front-end (veja `app/README.md`)
- `supabase/migrations/` — migrações SQL (0001–0006); `supabase/tests/` — testes SQL
- `tools/pg-local/` — Postgres descartável (PGlite) para rodar migrações e testes SQL sem tocar no Supabase
- `docs/` — `STATUS.md` (comece por aqui), registros por etapa, `operacao.md` (publicação, recuperação, limitações)
- `.github/workflows/` — `ci.yml` (testes) e `deploy.yml` (GitHub Pages)

Desenvolvimento rápido: `cd app && cp .env.example .env.local` (preencha URL e chave publishable) `&& npm install && npm run dev`, depois abra `http://localhost:5173/auxdec/`.
