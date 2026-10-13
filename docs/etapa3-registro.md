# Etapa 3 — Estrutura da aplicação (registro)

Data: 2026-10-11. Código em `app/` (React 19, TypeScript 6, Vite 8, React Router 7, Vitest 5, supabase-js 2).

## O que foi implementado
- **Projeto**: Vite com `base: '/auxdec/'` (GitHub Pages) e `HashRouter` (`/#/rota`), então acesso direto e F5 funcionam sem 404.
- **Configuração pública** (`src/lib/config.ts`): lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; recusa chave `service_role`/`sb_secret_`. `.env.local` está no `.gitignore`; `.env.example` documenta as variáveis.
- **localStorage** só com prefixo `sistemaDecisoesV2:` (inclusive a chave da sessão do Supabase: `sistemaDecisoesV2:auth`). Nunca lança erro.
- **Autenticação** (e-mail e senha): `AuthProvider`, `RequireAuth`, `LoginPage`, sair. Não há cadastro na interface (usuário único; não cria usuários).
- **Layout**: tema escuro único, menu lateral recolhível (gaveta em telas pequenas), seletor de escopo no cabeçalho com banner do escopo ativo, link "Ir para o conteúdo", foco visível, movimento reduzido.
- **Compartilhados**: avisos (`Toasts`), diálogo modal nativo, `FormField` (rótulo, dica e erro associados), `SaveButton` (idle/dirty/saving/saved/error, com texto), `Spinner`, guarda de alterações não salvas (Salvar/Descartar/Cancelar; cobre navegação, troca de escopo, sair e fechar a aba), `services/errors.ts` (traduz V2001–V2014 e códigos do Postgres/PostgREST).
- **Dados**: `services/escopos.ts` lista escopos via Supabase (RLS filtra por usuário).

## Não implementado nesta etapa (honestidade)
- As telas de domínio (Análise, Produtos, Modelos, Itens, Filtros) são **páginas de aviso** marcadas "ainda não implementada (Etapa 4)". O dashboard lista escopos, mas **criar escopo** chega na Etapa 4.
- Realtime e controle de versão no cliente: Etapa 5 (a base do banco já existe).

## Verificações executadas (local)
| Verificação | Resultado |
|---|---|
| `tsc --noEmit` (strict, noUncheckedIndexedAccess) | sem erros |
| `eslint .` (react-hooks, `no-explicit-any` como erro) | sem erros |
| `vitest run` | 6 arquivos, **33 testes aprovados** |
| `npm run build` | ok; `index.html` aponta para `/auxdec/assets/...`; o bundle não contém chave privada (só a publishable pública e o texto do detector) |

Testes cobrem: config e recusa de chave privilegiada; prefixo do localStorage; mapeamento de erros; SaveButton, FormField, Toasts; guarda de alterações (cancelar, descartar, salvar com sucesso e com falha); rotas protegidas, login com erro e sucesso, escopos vazio/lista/erro com nova tentativa, sair, menu recolhido.

## Limites desta validação
- Os testes de interface usam um cliente Supabase **simulado**. **Não houve login real** contra o projeto (sem credenciais e com a rede do ambiente bloqueada para o Supabase). O fluxo real deve ser validado pelo Luc ou em CI/ambiente de teste.
- Não foi verificado visualmente em navegador e dispositivos reais (responsividade/contraste apenas por CSS e testes de estrutura).
- Aviso do build: bundle de ~544 kB (159 kB gzip). Será tratado com divisão de código quando houver as telas de domínio.

## Como rodar
```
cd app
npm install
cp .env.example .env.local   # preencher com URL e chave publishable
npm run dev                  # http://localhost:5173/auxdec/
npm run typecheck && npm run lint && npm test && npm run build
```
