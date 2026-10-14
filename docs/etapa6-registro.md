# Etapa 6 — Validação (registro parcial)

Executado em 2026-10-13 (sandbox; Supabase real inacessível daqui).

| Verificação | Resultado |
|---|---|
| Testes de app (vitest) | 204 passam (20 arquivos); tsc e eslint limpos. Inclui testes de interface com Supabase simulado para: conflito de versão (preserva edição, compara, reaplica sobre a versão nova), registro excluído por outra sessão, falha de rede, cancelar com alterações, impacto ao remover item de modelo, limites de valor, filtros e backup avulso |
| Testes de banco (PGlite PG18 + stub, 8 arquivos) | 270 asserções `ok`; migrações 0001–0006 aplicam; objetos sem prefixo v2_ inalterados |
| Build de produção | ok; bundle principal 602 kB (179 kB gzip) após code-splitting por rota (era 697 kB); o restante é React + Supabase + router, o aviso de chunk >500 kB permanece |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| Segredos | nenhuma chave privilegiada no código; `config.ts` recusa service_role/sb_secret em runtime; `.env.local` não está versionado |
| Limpeza de imagens órfãs (R7) | implementada e testada |

## Validação manual na versão publicada (Luc, 2026-10-14)
Em https://lucskydev.github.io/auxdec/ : login real funcionou; criou escopo "Veículos", modelo "Mod_Teste" e item de modelo "Item_Teste"; indicador de sincronização mostrou "Sincronizado" (canal Realtime conectado). Isto valida login, RLS do próprio usuário, gravação e leitura reais. Depois (12:38): Luc também criou itens, modelos, produtos e filtro, e relatou funcionamento correto (relato dele, sem detalhes por fluxo). Falta ainda: itens de análise (fórmula/agregado), tela de análise/ranking, exportação, backup/importação (depende da 0006), conflito entre duas sessões, atualização em tempo real entre duas abas.

## Validação manual adicional (Luc, 2026-10-14 noite)
- Migração 0006 já estava aplicada no Supabase: conferida por catálogo (SECURITY DEFINER, execute só para authenticated/service_role/postgres; md5 do corpo igual ao arquivo local, diferindo apenas por quebras de linha CRLF).
- Luc relatou que "tudo certo nos testes" da análise, exportações, backup (botão avulso adicionado após ele não encontrá-lo) e importação (relato dele, sem detalhe por cenário).

## Ainda NÃO feito (obrigatório antes de concluir a etapa)
- Testes de integração contra Supabase real (RLS entre usuários, Storage, concorrência/V2001, Realtime). Exigem 2 usuários de teste e acesso à rede; não criar usuários sem autorização do Luc.
- Fluxos completos restantes com dados reais de teste (Luc; login já validado).
- Testes de interface ainda sem cobertura dedicada: produtos, itens de análise (fórmula/agregado), tela de análise (filtros/ordenação/colunas), importação.
- Verificação em navegador real/dispositivos (responsividade).
- Banco local é PG18; produção é PG17 (diferença não exercitada).

Etapa 6 **não** está concluída.
