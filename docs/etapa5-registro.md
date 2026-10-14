# Etapa 5 — Persistência e sincronização (registro)

Estado: **código pronto e testado com Supabase simulado**; nada validado contra o serviço real.

## O que foi feito
- **Salvar explícito**: todo formulário de edição (itens, modelos, produtos, itens de análise, filtros, escopos) usa `ui/EditDialog`. Nada é gravado sem clicar em Salvar.
- **Alterações pendentes**: cada formulário compara um instantâneo inicial com o atual (`dirty`). Cancelar/fechar com alterações abre Salvar / Descartar / Continuar editando; `useUnsavedGuard` avisa ao sair da página/aba.
- **Controle de versão**: o cliente envia `versao+1`; o trigger levanta V2001 se outra sessão gravou antes.
- **Conflito (V2001 / registro excluído)**: o formulário continua aberto com o que o usuário digitou. O painel oferece "Atualizar dados e comparar" (recarrega), tabela de diferenças (seu valor × valor atual) e "Reaplicar minhas alterações sobre a versão atual" (troca a versão-base sem perder a digitação). Registro excluído por outra sessão é indicado.
- **Realtime** (`services/realtime.ts`): um canal por escopo (`postgres_changes` das tabelas do escopo) + canal da lista de escopos. Rajadas são agrupadas (debounce 400 ms/500 ms). Estados `conectando/ativo/reconectando/erro` aparecem na barra superior. Ao reconectar, os dados são recarregados. Falha em recarga em segundo plano mantém os dados já exibidos.
- **Sem sobrescrita silenciosa**: atualização remota nunca altera um formulário aberto; aparece um aviso no `EditDialog` ("dados mudaram em outra sessão").
- **Configuração da análise** (`AnalisePage.aplicar`): gravações serializadas; em V2001 avisa, recarrega a configuração e descarta a alteração local otimista; outros erros notificam e revertem.
- **Falha de rede ao salvar**: erro exibido no formulário, dados digitados preservados, botão Salvar continua disponível.

## Testes
- App: 188 testes passam (`ui/EditDialog.test.tsx` 8, `pages/DashboardConflito.test.tsx` 2 — conflito com reaplicação e falha de rede —, `services/realtime.test.ts`, demais). tsc e eslint limpos.
- Banco local: 270 asserções (inalterado nesta etapa).

## Limites conhecidos (honestos)
- Realtime nunca foi exercitado contra o Supabase real (o sandbox não alcança `*.supabase.co`).
- Testes de UI usam Supabase simulado; sem verificação visual em navegador real.
- Fluxo de conflito testado de ponta a ponta só para escopos; itens/modelos/produtos/análises/filtros seguem o mesmo padrão mas sem teste dedicado.
- Login real ainda não validado (Luc).
- Migração 0006 ainda NÃO aplicada no Supabase (Luc aplicará).
- Alterações da Etapa 5 ainda NÃO foram enviadas ao GitHub (aguardam confirmação).

## Pendências herdadas da Etapa 4
Limpeza de imagens órfãs (R7), testes de fluxo de UI restantes, testes de integração RLS/storage/concorrência no CI.
