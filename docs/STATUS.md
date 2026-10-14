# Auxdec v2 — STATUS (leia isto primeiro ao retomar)

Atualizado: 2026-10-13 (Etapa 4 quase completa; falta importação de backup/migração 0006).

## Onde está cada coisa
| O quê | Onde |
|---|---|
| Especificação do Luc (prompt mestre, regras de segurança, modelo de dados aprovado D1–D10) | `docs/spec/` |
| Banco: migrações SQL (todas **já aplicadas** no projeto "sistemas") | `supabase/migrations/` |
| Testes de banco (228) e executor local | `supabase/tests/`, `tools/pg-local/` |
| Aplicação React/TS/Vite | `app/` |
| Registros por etapa | `docs/etapa2-registro.md`, `docs/etapa3-registro.md`, este arquivo |

## Estado das etapas (spec seção 24)
| Etapa | Estado |
|---|---|
| 1 Levantamento e arquitetura | Concluída; modelo de dados aprovado pelo Luc (D1–D10) |
| 2 Modelagem e segurança | Concluída. 5 migrações aplicadas e conferidas por catálogo. 228 testes locais passam (PG18 + stub). Pendências em `etapa2-registro.md` §10 |
| 3 Estrutura da aplicação | Concluída no código (tipos, lint, 33 testes, build ok). **Login real ainda não validado** |
| 4 Funcionalidades de domínio | **Em andamento** — telas e motor prontos (172 testes); migração 0006 (importação) escrita e testada localmente mas NÃO aplicada; faltam limpeza R7 e testes de UI. Ver `docs/etapa4-registro.md` |
| 5 Persistência e sincronização | Código pronto e enviado ao GitHub (commit eb62f6a). Realtime e conflitos não testados contra o serviço real. Ver `docs/etapa5-registro.md` |
| 6 Validação | **Parcial** (191 testes de app, 270 de banco, build, audit ok; faltam integração real, login real, UI dos demais fluxos). Ver `docs/etapa6-registro.md` |
| 7 Publicação e documentação | **Parcial** — workflows `ci.yml`/`deploy.yml`, README e `docs/operacao.md` escritos; **nunca executados no GitHub**; Pages e variáveis ainda precisam ser configurados pelo Luc |

## Decisões e combinados do Luc (não reabrir)
- Repo novo `lucskydev/auxdec` (nada foi enviado ainda). Repo antigo `lucskydev/decisoes` intocável.
- Supabase: projeto "sistemas" (`rbplmhxdqkhioprcrrcs`), objetos com prefixo `v2_`. Projeto "radios" nunca tocar.
- localStorage: prefixo `sistemaDecisoesV2:`. Só chave publishable no front.
- Única exceção autorizada fora do prefixo: `ALTER PUBLICATION supabase_realtime ADD TABLE` (já feita).
- **Regra permanente**: antes de qualquer migração ou SQL no Supabase, listar objetos afetados e esperar confirmação explícita. Nada de push ao GitHub sem listar e confirmar. Nada de criar/alterar usuários.
- A 0004 foi aplicada pelo Luc no SQL Editor (MCP cancelou 2x sem erro). Se uma chamada `apply_migration` for cancelada, não repetir em laço: entregar o arquivo ao Luc.
- Redirect URL `https://lucskydev.github.io/auxdec/` já adicionada no Supabase Auth pelo Luc.

## Atenção: durabilidade
O trabalho vive no contêiner da sessão (`/home/claude/auxdec`), que é temporário. Cópias dos documentos e das migrações foram salvas no Projeto "Sistema auxiliar de tomada de decisões" (claude.ai). Em 2026-10-13 o código foi enviado para `lucskydev/auxdec` (branch `main`, commit 47ab864). Etapa 5 enviada em eb62f6a. Alterações posteriores (R7, Etapa 6) só estarão seguras depois de novo push.

## Como retomar
1. Ler este arquivo e o registro da etapa em andamento.
2. App: `cd app && npm install && npm run typecheck && npm run lint && npm test` (precisa `.env.local` com URL e chave publishable; ver `.env.example`).
3. Banco local de testes: `cd tools/pg-local && npm install && ./run-all.sh > saida.txt 2>&1 < /dev/null`.
