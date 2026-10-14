# Etapa 6 — Validação (registro parcial)

Executado em 2026-10-13 (sandbox; Supabase real inacessível daqui).

| Verificação | Resultado |
|---|---|
| Testes de app (vitest) | 191 passam (18 arquivos); tsc e eslint limpos |
| Testes de banco (PGlite PG18 + stub, 8 arquivos) | 270 asserções `ok`; migrações 0001–0006 aplicam; objetos sem prefixo v2_ inalterados |
| Build de produção | ok; bundle principal 697 kB (205 kB gzip), aviso de chunk >500 kB — code-splitting por rota é melhoria futura |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| Segredos | nenhuma chave privilegiada no código; `config.ts` recusa service_role/sb_secret em runtime; `.env.local` não está versionado |
| Limpeza de imagens órfãs (R7) | implementada e testada |

## Ainda NÃO feito (obrigatório antes de concluir a etapa)
- Testes de integração contra Supabase real (RLS entre usuários, Storage, concorrência/V2001, Realtime). Exigem 2 usuários de teste e acesso à rede; não criar usuários sem autorização do Luc.
- Validação do login real e dos fluxos completos com dados reais de teste (Luc).
- Aplicar a migração 0006 (Luc) e testar importação/backup de ponta a ponta.
- Testes de interface dos demais fluxos (itens, modelos, produtos, filtros, análise).
- Verificação em navegador real/dispositivos (responsividade).
- Banco local é PG18; produção é PG17 (diferença não exercitada).

Etapa 6 **não** está concluída.
