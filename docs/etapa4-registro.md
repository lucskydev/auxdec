# Etapa 4 — Funcionalidades de domínio (registro)

Atualizado: 2026-10-13. Código em `app/src/`. Resultado atual: tsc, eslint e 172 testes do app passam; 270 asserções de banco passam (local, PGlite/PG18); `vite build` ok. **Nenhuma tela foi aberta em navegador real contra o Supabase real** (a rede do ambiente bloqueia `*.supabase.co`).

| Item | Estado | Onde |
|---|---|---|
| Motor de fórmulas (lexer, parser, avaliador, validação, ciclos, exibição `[m:Nome]`↔`[[m:uuid]]`) | **feito + testes** | `domain/formula/` |
| Normalização 0–10, média ponderada, ranking (empates 1º,1º,3º), filtros, ordenação, CSV | **feito + testes** | `domain/analysis/`, `domain/csv.ts` |
| Herança dinâmica e conflitos de nome | **feito + testes** | `domain/analysis/linhas.ts`, `domain/inheritance.ts` |
| Dependências (itens, modelos, ranking) | **feito + testes** | `domain/dependencias.ts`, `domain/catalogo.ts` |
| Tabela de análise (modos, colunas, ranking, busca, ordenação, exportação) | **feito + testes** | `domain/analysis/tabela.ts` |
| Backup: montar/validar (formato `auxdec-backup` v1) e `.zip` (fflate) | **feito + testes** | `domain/backup.ts`, `services/backupZip.ts` |
| Camada de dados (loader paginado, escrita, RPCs, imagens, exportação) | feito | `services/` |
| Escopos: criar, editar, excluir (backup verificado + digitar o nome) | **feito (UI sem teste de UI)** | `pages/DashboardPage.tsx` |
| Itens de modelo / produto | feito (UI sem teste de UI) | `pages/ItensPage.tsx` |
| Modelos e Produtos (valores, imagens, duplicar, impacto D6, conflitos) | feito (UI sem teste de UI) | `pages/ModelosPage.tsx`, `ProdutosPage.tsx`, `features/ValoresEditor.tsx` |
| Itens de análise (editor de fórmula e agregado 2–5) | feito (UI sem teste de UI) | `pages/ItensAnalisePage.tsx` |
| Filtros | feito (UI sem teste de UI) | `pages/FiltrosPage.tsx` |
| Tela de análise (virtualizada, CSV, PDF, miniaturas, config persistida) | feito (UI sem teste de UI) | `pages/AnalisePage.tsx` |
| Importação de backup: RPC `v2_importar_escopo` (migração 0006) + serviço + diálogo (novo/substituir, backup do escopo alvo antes de substituir) | **escrito, testado localmente (`supabase/tests/08_importacao.sql`) e APLICADO no Supabase (conferido 2026-10-14); importação testada manualmente pelo Luc** | `supabase/migrations/…0006…`, `services/importacao.ts`, `pages/ImportarBackup.tsx` |
| Limpeza de imagens órfãs (R7) | feito: após salvar modelo/produto, imagens que deixaram de ser usadas são excluídas (`limparImagensSoltas`; o banco recusa se ainda referenciadas). 3 testes | `features/ValoresEditor.tsx` |
| Testes de UI (fluxos), integração (RLS/storage/concorrência) | pendente | — |

## Interpretações adotadas (confirmar com o Luc se discordar)
- Modo "Somente itens de análise": linhas continuam sendo modelos+produtos; só as colunas de itens de análise (mais Nome/Tipo/Ranking) são exibidas.
- Ranking é calculado entre as linhas do modo atual **depois dos filtros** (não depois da busca).
- Filtros ativos são por sessão do navegador (localStorage `filtrosAtivos:<escopo>`); modo, lógica global, ranking, colunas e ordenação são persistidos em `v2_config_analise`.
- Exportação CSV: números crus (ponto decimal); indisponível = `INDISPONÍVEL`, erro = `ERRO`, imagem = `[imagem]`.
- Duplicar modelo/produto reutiliza as mesmas imagens (mesmo `valor_img_id`).
- Ao substituir/remover imagem de um valor, o arquivo antigo é excluído após o salvamento (R7). Falha na limpeza não impede o salvamento; o arquivo fica órfão. Itens de análise e exclusão de item não têm imagens.

## Nota sobre os testes de banco
As RPCs terminam com `set constraints all immediate`; por isso `t.popular` (06) chama `set constraints all deferred` antes de cada RPC, já que ali várias RPCs dividem uma transação. Em uso real cada RPC é uma transação própria.

## Correção pós-validação (2026-10-14)
O backup só era acessível pelo diálogo de exclusão. Adicionado botão "Exportar backup" em cada escopo do Dashboard (bloqueia se alguma imagem falhar). 2 testes.

## Adendo 2026-10-15
Ajustes de interface e ordem dos itens: ver `docs/ajustes-2026-10-15.md`.
