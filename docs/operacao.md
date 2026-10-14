# Operação: publicação, recuperação e limitações

## Integração contínua (`.github/workflows/ci.yml`)
Em todo push na `main` e em pull requests:
- **app**: `npm ci`, typecheck, eslint, vitest, `npm audit --omit=dev --audit-level=high`, build (com valores fictícios).
- **banco**: sobe PGlite, aplica as migrações 0001–0006 e roda os testes SQL (exige psql 0 de saída, nenhum `FAIL` e ≥270 asserções `ok`).

## Publicação (`.github/workflows/deploy.yml`)
Push na `main` (ou execução manual) roda typecheck, lint e testes, compila e publica `app/dist` no GitHub Pages em `https://lucskydev.github.io/auxdec/`.

### Configuração única (feita pelo Luc, no GitHub)
1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (valores públicos; nunca a chave service_role — o app recusa chaves privilegiadas).
3. Supabase Auth → URL Configuration: `https://lucskydev.github.io/auxdec/` em Redirect URLs (já feito).

### Validar a aplicação publicada
Abrir a URL, entrar com o login real, criar um escopo de teste, editar, exportar backup, excluir. Rodar o checklist de fluxos de `docs/etapa6-registro.md`.

## Recuperação
- **Publicação ruim**: Actions → Deploy → "Re-run" num commit anterior bom, ou `git revert` e push.
- **Dados**: antes de excluir um escopo o app obriga baixar o backup `.zip` (`backup.json` + `imagens/`); restaurar via Dashboard → Importar backup (novo escopo, ou substituir com confirmação por nome). Requer a migração 0006 aplicada.
- **Conflito de edição**: o formulário mantém o que foi digitado; use "Atualizar dados e comparar" e "Reaplicar".
- **Imagens órfãs**: podem sobrar no bucket se uma limpeza falhar; não afetam os dados.
- **Banco**: migrações são aditivas e só criam objetos `v2_`; aplicar em ordem. O projeto "radios" nunca deve ser tocado.

## Limitações conhecidas
- Realtime, RLS entre usuários, Storage e concorrência não foram testados contra o Supabase real (apenas Postgres local PG18 e Supabase simulado; produção é PG17).
- Login real, deploy publicado e fluxos completos ainda não validados (dependem do Luc).
- Migração 0006 (importação) pode ainda não estar aplicada: sem ela "Importar backup" falha.
- Sem verificação visual em navegador real/dispositivos móveis.
- Bundle principal ~700 kB (sem code-splitting por rota).
- Workflows executados com sucesso em 2026-10-14; a página publicada carrega, mas o login real e os fluxos nela ainda não foram validados.
