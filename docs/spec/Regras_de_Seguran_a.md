REGRAS DE SEGURANÇA E ISOLAMENTO (valem para todo o trabalho que vem a seguir)

Contexto: já existe uma versão em produção deste sistema, com dados reais. Você vai criar uma NOVA versão, totalmente independente. A versão atual não pode ser alterada, quebrada nem lida por engano.

Recursos da versão ATUAL (PROIBIDO alterar, renomear, apagar ou reutilizar):
- Repositório GitHub: lucskydev/decisoes (e o endereço lucskydev.github.io/decisoes/)
- Projeto Supabase "sistemas": tabela public.decisoes_estado, bucket decisoes-imagens
- Regras (policies): decisoes_select_proprio, decisoes_insert_proprio, decisoes_update_proprio, decisoes_delete_proprio (na tabela) e decisoes_img_insert_proprio, decisoes_img_delete_proprio (no storage.objects)
- Chaves do localStorage: sistemaDecisoes:v2 e simuladorDecisaoVeicular:theme

Recursos da versão NOVA (use SOMENTE estes nomes):
- Repositório GitHub: <lucskydev/NOME-NOVO> (criar novo; não commitar no repositório atual)
- Projeto Supabase: <projeto NOVO | projeto "sistemas" com prefixo v2_>
- Prefixo de tabelas, bucket e regras: <v2_>
- Prefixo do localStorage: <sistemaDecisoesV2:>

Regras obrigatórias:
1. Nunca execute DROP, DELETE, TRUNCATE, ALTER ou renomeação em objeto que não tenha o prefixo da versão nova. Antes de qualquer SQL, liste os objetos que ele afeta. Se algum não tiver o prefixo novo, pare e pergunte.
2. Nunca use "drop policy if exists" com nome que não comece pelo prefixo novo. Regras do Storage valem para o projeto inteiro: dê nomes novos e únicos a elas.
3. Toda tabela nova deve ter RLS ativado e regras que limitem cada usuário às próprias linhas (auth.uid() = user_id). Não crie tabela sem RLS. Não crie regra com "using (true)" para escrita.
4. No front-end, use apenas a chave anon/publishable. Nunca coloque a chave service_role em arquivo, commit, chat ou código. Se precisar dela, pare e me avise.
5. Não crie, apague nem altere usuários em auth.users. Não desative confirmações de e-mail nem políticas de login.
6. Bucket de fotos novo, com envio e exclusão permitidos só na pasta do próprio usuário (auth.uid()). Não use o bucket decisoes-imagens.
7. Não faça push, force-push, rename ou delete em repositório que não seja o novo. Não ative Pages em outro repositório.
8. Antes de qualquer ação destrutiva ou irreversível (apagar tabela, bucket, branch, arquivos, dados), mostre o que será afetado e espere minha confirmação explícita. Ação destrutiva = qualquer coisa que não possa ser desfeita com um comando simples.
9. Não leia, copie nem migre dados da versão atual sem eu pedir. Quando eu pedir, faça só cópia (leitura), nunca mova nem apague a origem.
10. Não coloque senhas, tokens ou chaves privadas em commits, README ou logs. Arquivos de configuração com segredos entram no .gitignore.
11. Se uma instrução minha parecer conflitar com estas regras, aponte o conflito antes de executar.
12. Ao terminar, entregue um resumo com: o que foi criado (repositório, tabelas, bucket, regras) e a confirmação de que nenhum recurso da versão atual foi alterado.