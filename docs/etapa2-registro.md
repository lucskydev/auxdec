# Auxdec v2 — Etapa 2: registro de trabalho

> Documento vivo. Serve para retomar a Etapa 2 sem refazer nada. Atualizado em 2026-10-11.

## 1. Estado em uma frase

**Etapa 2 concluída.** As 5 migrações foram aplicadas no projeto "sistemas" com confirmação do Luc (detalhes na seção final) e conferidas por consultas de catálogo. Os 228 testes de comportamento rodaram só no banco local descartável; no projeto real não foram criados usuários nem dados de teste. Nada foi enviado ao GitHub.

## 2. Estado do Supabase ANTES das migrações (somente leitura, 2026-10-11)

Consultas somente de catálogo no projeto "sistemas" (`rbplmhxdqkhioprcrrcs`). Nenhuma linha de dados foi lida.

| Verificado | Resultado |
|---|---|
| Tabelas em `public` | só `decisoes_estado` (RLS ativo). Nenhuma colisão com `v2_*`. |
| Policies de `public` e `storage` | só as 4 de `decisoes_estado` e as 2 de `storage.objects` (`decisoes_img_*`). Ambas de storage filtram por `bucket_id = 'decisoes-imagens'`, então não abrem acesso ao bucket novo. |
| Buckets | só `decisoes-imagens` (público). |
| Publication `supabase_realtime` | vazia. |
| Funções em `public` | nenhuma. |
| Migrações já aplicadas | só `20261003173113_decisoes_estado_e_bucket_imagens`. |
| Versão do Postgres do projeto | 17.11 |

O projeto "radios" existe na mesma conta e **não foi tocado**.

## 3. Arquivos do projeto (`/home/claude/auxdec`)

```
supabase/migrations/
  20261011000001_v2_0001_tabelas.sql             14 tabelas, chaves compostas, checks, índices
  20261011000002_v2_0002_regras_integridade.sql  triggers: versão, tipo imutável, limites, conflito de nomes, ciclos, agregado 2–5
  20261011000003_v2_0003_rls_storage.sql         RLS, privilégios, bucket v2_imagens, 3 policies de storage
  20261011000004_v2_0004_funcoes_rpc.sql         6 RPCs + limpeza ordenada de escopo
  20261011000005_v2_0005_realtime.sql            REPLICA IDENTITY FULL + publication (exceção autorizada)
supabase/tests/
  00_helpers.sql … 04_integridade.sql            testes (uma sessão psql, nessa ordem)
  local/00_stub_supabase.sql                     simula auth/storage/papéis SÓ em banco descartável
tools/pg-local/                                  executor local (ver seção 8)
docs/rascunhos-descartados/conjunto-A/           rascunho alternativo, guardado, não usar
```

## 4. Dois rascunhos encontrados e qual foi adotado

Ao retomar, a pasta já tinha **dois conjuntos de rascunhos**, de origem que não consegui identificar (não foram escritos nesta conversa). Rodei os dois num Postgres local.

| | Conjunto A | Conjunto B (adotado) |
|---|---|---|
| Migrações | 6 arquivos | 5 arquivos |
| Colunas geradas | usa (`ref_modelo_tipo`, `ref_produto_tipo`, `ranking_tipo`) | não usa |
| Com `REPLICA IDENTITY FULL` | **falha** ao excluir de `v2_analise_refs`: `Replica identity must not contain unpublished generated columns` | passa |
| Testes | 6 arquivos | 5 arquivos |

Motivo da escolha: o Realtime exige `REPLICA IDENTITY FULL`, e o A depende de colunas geradas. A falha apareceu no Postgres 18 do ambiente de teste. No 17 do seu projeto eu **acredito** que não ocorra, mas não consegui confirmar. Mesmo assim o A ficaria frágil numa atualização futura. O A foi movido, não apagado.

## 5. Correções feitas nos testes (o banco estava certo em todas)

| Teste | Problema | Correção |
|---|---|---|
| `01_estrutura` | `array_agg(name)` comparado com `text[]` | cast `::text` |
| `04_integridade` (tipo de item de análise) | rodava como `authenticated`, que não tem UPDATE nessa tabela (escrita só por RPC) | passou a rodar como dono da tabela |
| `04_integridade` (renomear item de produto) | cenário sem conflito real: o único produto que usa o item não herda item de mesmo nome | cenário real (`Km` → `Ano`, esperado `V2002`) e um caso sem conflito (esperado aceitar) |
| `04_integridade` (FK de tipo e FK de usuário) | inseriam chave primária já existente, que dispara `23505` antes da FK | usam combinação ainda inexistente |

## 6. Resultado dos testes até agora

228 asserções `ok` (183 anteriores + 45 novas dos testes 05, 06, 07), nenhuma falha, `psql` com `ON_ERROR_STOP`, banco novo a cada rodada.
Os objetos sem prefixo `v2_` (tabela, RLS, policies, bucket, funções, privilégios, publication) ficaram **idênticos** antes e depois das migrações (10 itens comparados).

**Limites desta validação (importante):**
- Rodou em **PostgreSQL 18.3 (PGlite)**, não no 17.11 do projeto.
- `auth`, `storage` e os papéis `anon`/`authenticated` são **simulados** por um stub.
- É uma única conexão: **concorrência real não foi testada**.
- Nada disso substitui rodar a mesma bateria no Supabase local do CI (`supabase start`).

## 7. Achados da revisão das migrações

| # | Achado | Status |
|---|---|---|
| R1 | Campos numéricos aceitam `NaN` e `±Infinity` (inclusive via RPC com `"NaN"` como texto). Envenenaria normalização e ranking. | **Feito** (CHECKs de finitude em v2_0001) e testado em `07_realtime_numerico.sql` |
| R2 | Gatilhos de conflito de nomes e de ciclo não serializam transações concorrentes no mesmo escopo; duas transações, cada uma criando metade do conflito, passariam. | **Feito** (`pg_advisory_xact_lock` por escopo em v2_0002). **Comportamento sob concorrência NÃO verificado** (conexão única local); verificar no CI |
| R3 | Bucket criado com `on conflict do nothing`: se já existisse, ficaria silenciosamente com outra configuração. | **Feito** (insert simples em v2_0003) |
| R4 | Falta teste de comportamento do Storage (hoje só estrutural). | **Feito e passando** (`05_storage.sql`) |
| R5 | Falta teste de `v2_excluir_escopo` funcionando (cascata, confirmação, caminhos de imagem). | **Feito e passando** (`06_exclusao_escopo.sql`, inclui exclusão do usuário em auth.users) |
| R6 | Falta teste positivo do Realtime (14 tabelas na publication, identity full). | **Feito e passando** (`07_realtime_numerico.sql`) |
| R7 | Não há RPC para limpar imagens órfãs (previsto no modelo de dados, seção 7). | **Adiado** para a Etapa 4 (junto com backup/importação) |
| R8 | `v2_importar_escopo` não existe. | **Adiado** para a Etapa 4 (já estava previsto) |

Decisão adicional herdada do rascunho B, a confirmar: a RPC `v2_excluir_escopo(p_id, p_versao, p_confirmacao)` exige versão e o nome exato do escopo. **O banco não consegue verificar que o backup foi feito**; isso fica por conta da interface.

## 8. Como reproduzir os testes

Requer Node 22 e `psql`. Em `tools/pg-local`:

```
npm install
./fresh.sh                       # reinicia o banco descartável (vazio)
./runset.sh <stub> "<migrações>" "<testes>"
# ou, tudo de uma vez:
./run-all.sh
```

`ONERR=0` roda sem parar na primeira falha e lista todas. Os testes **precisam rodar na mesma sessão `psql`** (usam `\gset`).

## 9. Códigos de erro próprios (SQLSTATE)

| Código | Significado |
|---|---|
| V2001 | conflito de versão |
| V2002 | conflito de nome herdado × próprio |
| V2003 | valor fora dos limites |
| V2004 | dependência circular |
| V2005 | campo imutável (`user_id`, `escopo_id`) |
| V2006 | tipo imutável |
| V2007 | referência ou pai inválido (item não numérico etc.) |
| V2008 | condição de filtro inválida |
| V2009 | ranking inválido |
| V2010 | agregado fora de 2–5 componentes |
| V2011 | registro ou escopo não encontrado |
| V2012 | referência inexistente |
| V2013 | payload inválido |
| V2014 | confirmação inválida |
| 28000 | não autenticado |

## 10. Pendências que seguem em aberto (herdadas desta etapa)

1. Rodar a bateria `supabase/tests` no Supabase local do CI (`supabase start`), em PG17, com concorrência real (advisory locks de nomes e ciclos).
2. Verificar no Supabase real o `protect_delete` do Storage e a inserção em `storage.objects` pelo papel `postgres` (o teste 05 usa `storage.allow_delete_query`).
3. R7 (RPC de imagens órfãs) e R8 (`v2_importar_escopo`): Etapa 4, junto com backup/importação.
4. Registrar a 0004 no histórico de migrações (`supabase migration repair`) se o CI usar o CLI.

## Aplicação no projeto Supabase "sistemas" (2026-10-11)

Aplicadas com confirmação explícita do Luc, uma por vez, listando os objetos antes:

| Migração | Como | Conferência pós-aplicação |
|---|---|---|
| 0001 tabelas | MCP (`apply_migration`) | 14 tabelas, 66 índices, 107 restrições; `decisoes_estado` intacta |
| 0002 regras de integridade | MCP | 12 funções `v2_trg_*`, 43 gatilhos, view `v2_vw_produto_efetivo` |
| 0003 RLS e Storage | MCP | RLS em 14 tabelas, 29 policies de tabela, 3 de storage, bucket `v2_imagens` privado (2 MiB), 0 grants para `anon` |
| 0004 RPCs | **Painel (SQL Editor), pelo Luc**: a chamada MCP foi cancelada duas vezes pela plataforma, sem erro. | 6 RPCs SECURITY DEFINER com `search_path` vazio, execução só para `authenticated`; gatilho `v2_escopos_limpeza` |
| 0005 Realtime | MCP (exceção autorizada) | publicação estava vazia; agora só as 14 tabelas `v2_`; REPLICA IDENTITY FULL nas 14 |

Observações:
- A 0004 não consta em `list_migrations` (aplicada pelo painel). O efeito no banco foi conferido. Se o CI usar o CLI, haverá lacuna no histórico; registrar com `supabase migration repair` quando necessário.
- Os testes de comportamento (228) rodaram só no banco local descartável. No projeto real foram feitas apenas conferências de catálogo (somente leitura).
- Nenhum objeto sem prefixo `v2_` foi alterado, exceto a publicação `supabase_realtime` (autorizada).
