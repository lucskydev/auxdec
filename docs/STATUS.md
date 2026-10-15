# Auxdec v2 — STATUS (leia isto primeiro ao retomar)

Atualizado: 2026-10-15 (app publicado e validado manualmente pelo Luc; Etapas 4–5 completas no código; Etapa 6 parcial; Etapa 7 parcial). Ajustes pedidos em 2026-10-15 feitos no código: ver `docs/ajustes-2026-10-15.md`. **Migração 0007 (ordem dos itens) escrita e testada localmente, AINDA NÃO aplicada no Supabase; o app que a usa só deve ser enviado/publicado depois que o Luc aplicar.**

## Onde está cada coisa
| O quê | Onde |
|---|---|
| Especificação do Luc (prompt mestre, regras de segurança, modelo de dados aprovado D1–D10) | `docs/spec/` |
| Banco: migrações SQL (0001–0006 **aplicadas** no projeto "sistemas"; 0007 pendente) | `supabase/migrations/` |
| Testes de banco (288) e executor local | `supabase/tests/`, `tools/pg-local/` |
| Aplicação React/TS/Vite | `app/` |
| Registros por etapa | `docs/etapa2-registro.md`, `docs/etapa3-registro.md`, `docs/ajustes-2026-10-15.md`, este arquivo |

## Estado das etapas (spec seção 24)
| Etapa | Estado |
|---|---|
| 1 Levantamento e arquitetura | Concluída; modelo de dados aprovado pelo Luc (D1–D10) |
| 2 Modelagem e segurança | Concluída. 5 migrações aplicadas e conferidas por catálogo. 228 testes locais passam (PG18 + stub). Pendências em `etapa2-registro.md` §10 |
| 3 Estrutura da aplicação | Concluída no código (tipos, lint, 33 testes, build ok). Login real validado em 2026-10-14 |
| 4 Funcionalidades de domínio | Completa no código e validada manualmente pelo Luc (telas, motor, exportação CSV/PDF, backup avulso, importação com 0006 aplicada, limpeza de imagens R7). Faltam testes automatizados de UI de alguns fluxos. Ver `docs/etapa4-registro.md` |
| 5 Persistência e sincronização | Código pronto e enviado ao GitHub (commit eb62f6a). Realtime e conflitos não testados contra o serviço real. Ver `docs/etapa5-registro.md` |
| 6 Validação | **Parcial** — 204 testes de app, 270 de banco, build e audit ok; login, fluxos principais, importação/backup e duas abas validados manualmente pelo Luc; 17 testes de integração contra o Supabase real ESCRITOS mas NÃO executados (faltam credenciais dos usuários de teste, só o Luc as tem); faltam testes de UI de produtos/análise e checagem em celular. Ver `docs/etapa6-registro.md` |
| 7 Publicação e documentação | **Parcial** — commit 65427e2 enviado; CI (app + banco) e Deploy executaram com sucesso no GitHub em 2026-10-14; página publicada responde em https://lucskydev.github.io/auxdec/ (título correto). Login real e criação de escopo/modelo/item validados pelo Luc na versão publicada (2026-10-14); itens, modelos, produtos e filtros também testados por ele (OK); análise, exportação, backup e importação também validados por ele; duas abas (conflito/tempo real) também validadas por ele; testes de integração automatizados escritos mas NÃO executados |

## Decisões e combinados do Luc (não reabrir)
- Repo novo `lucskydev/auxdec` (nada foi enviado ainda). Repo antigo `lucskydev/decisoes` intocável.
- Supabase: projeto "sistemas" (`rbplmhxdqkhioprcrrcs`), objetos com prefixo `v2_`. Projeto "radios" nunca tocar.
- localStorage: prefixo `sistemaDecisoesV2:`. Só chave publishable no front.
- Única exceção autorizada fora do prefixo: `ALTER PUBLICATION supabase_realtime ADD TABLE` (já feita).
- **Regra permanente**: antes de qualquer migração ou SQL no Supabase, listar objetos afetados e esperar confirmação explícita. Nada de push ao GitHub sem listar e confirmar. Nada de criar/alterar usuários.
- A 0004 foi aplicada pelo Luc no SQL Editor (MCP cancelou 2x sem erro). Se uma chamada `apply_migration` for cancelada, não repetir em laço: entregar o arquivo ao Luc.
- Redirect URL `https://lucskydev.github.io/auxdec/` já adicionada no Supabase Auth pelo Luc.

## Atenção: durabilidade
O trabalho vive no contêiner da sessão (`/home/claude/auxdec`), que é temporário. Cópias dos documentos e das migrações foram salvas no Projeto "Sistema auxiliar de tomada de decisões" (claude.ai). Em 2026-10-13 o código foi enviado para `lucskydev/auxdec` (branch `main`, commit 47ab864). Etapas 5–7 (parcial) enviadas até 65427e2. Alterações posteriores (R7, Etapa 6) só estarão seguras depois de novo push.

## Como retomar
1. Ler este arquivo e o registro da etapa em andamento.
2. App: `cd app && npm install && npm run typecheck && npm run lint && npm test` (precisa `.env.local` com URL e chave publishable; ver `.env.example`).
3. Banco local de testes: `cd tools/pg-local && npm install && ./run-all.sh > saida.txt 2>&1 < /dev/null`.
