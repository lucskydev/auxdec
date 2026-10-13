-- 05_storage.sql — comportamento (não só estrutura) das policies de storage.objects
-- Cada asserção roda com um papel diferente: dono, outro usuário, anônimo. Os objetos de teste
-- são removidos no fim. Banco descartável apenas.

reset role;
-- Algumas versões do Supabase bloqueiam DELETE direto em storage.objects; este parâmetro libera
-- o DELETE por SQL nesta sessão de teste (sem efeito onde o bloqueio não existe).
select set_config('storage.allow_delete_query', 'true', false);
-- bucket extra, só para provar que as policies v2_ não valem fora do bucket v2_imagens
insert into storage.buckets (id, name, public) values ('v2_teste_outro', 'v2_teste_outro', false);

-- ================================ usuário A ================================
select set_config('request.jwt.claim.sub', :'ua', false);
set role authenticated;

select t.ok(t.linhas(format('insert into storage.objects (bucket_id, name) values (%L, %L)',
  'v2_imagens', :'ua' || '/' || :'ea' || '/a1.webp')) = 1,
  'A envia arquivo para a própria pasta do bucket v2_imagens');
select t.erro(format('insert into storage.objects (bucket_id, name) values (%L, %L)',
  'v2_imagens', :'ub' || '/' || :'eb' || '/invasao.webp'), '42501',
  'A não envia arquivo para a pasta do B');
select t.erro(format('insert into storage.objects (bucket_id, name) values (%L, %L)',
  'v2_imagens', 'solto.webp'), '42501',
  'arquivo na raiz do bucket (sem pasta de usuário) é negado');
select t.erro(format('insert into storage.objects (bucket_id, name) values (%L, %L)',
  'v2_teste_outro', :'ua' || '/x.webp'), '42501',
  'as policies v2_ não valem para outro bucket, nem na pasta do próprio usuário');
select t.ok(t.n(format('select 1 from storage.objects where bucket_id = %L', 'v2_imagens')) = 1,
  'A enxerga o próprio arquivo');

-- ================================ usuário B ================================
select set_config('request.jwt.claim.sub', :'ub', false);

select t.ok(t.n(format('select 1 from storage.objects where bucket_id = %L', 'v2_imagens')) = 0,
  'B não enxerga arquivos do A');
select t.ok(t.linhas(format('delete from storage.objects where bucket_id = %L and name = %L',
  'v2_imagens', :'ua' || '/' || :'ea' || '/a1.webp')) = 0,
  'B não exclui arquivo do A');
select t.ok(t.linhas(format('update storage.objects set name = %L where bucket_id = %L and name = %L',
  :'ub' || '/roubado.webp', 'v2_imagens', :'ua' || '/' || :'ea' || '/a1.webp')) = 0,
  'B não move arquivo do A para a própria pasta');
select t.ok(t.linhas(format('insert into storage.objects (bucket_id, name) values (%L, %L)',
  'v2_imagens', :'ub' || '/' || :'eb' || '/b1.webp')) = 1,
  'B envia arquivo para a própria pasta');
select t.ok(t.n(format('select 1 from storage.objects where bucket_id = %L', 'v2_imagens')) = 1,
  'B enxerga só o próprio arquivo');

-- ================================ anônimo ================================
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;

select t.erro(format('insert into storage.objects (bucket_id, name) values (%L, %L)',
  'v2_imagens', :'ua' || '/' || :'ea' || '/anon.webp'), '42501',
  'anônimo não envia arquivo');
select t.ok(t.n(format('select 1 from storage.objects where bucket_id = %L', 'v2_imagens')) = 0,
  'anônimo não enxerga arquivos');
select t.ok(t.linhas(format('delete from storage.objects where bucket_id = %L', 'v2_imagens')) = 0,
  'anônimo não exclui arquivos');

-- ================================ volta ao A ================================
reset role;
select set_config('request.jwt.claim.sub', :'ua', false);
-- objeto de A em OUTRO bucket (inserido pelo dono do banco): as policies v2_ não o expõem
insert into storage.objects (bucket_id, name) values ('v2_teste_outro', :'ua' || '/escondido.webp');
set role authenticated;

select t.ok(t.n(format('select 1 from storage.objects where bucket_id = %L', 'v2_teste_outro')) = 0,
  'A não enxerga, em outro bucket, arquivo da própria pasta (policy v2_ filtra o bucket)');
select t.ok(t.linhas(format('update storage.objects set name = %L where bucket_id = %L and name = %L',
  :'ua' || '/' || :'ea' || '/renomeado.webp', 'v2_imagens', :'ua' || '/' || :'ea' || '/a1.webp')) = 0,
  'não há policy de UPDATE: nem o dono renomeia/move arquivo (trocar imagem = enviar outro arquivo)');
select t.ok(t.linhas(format('delete from storage.objects where bucket_id = %L and name = %L',
  'v2_imagens', :'ua' || '/' || :'ea' || '/a1.webp')) = 1,
  'A exclui o próprio arquivo');
select t.ok(t.n(format('select 1 from storage.objects where bucket_id = %L', 'v2_imagens')) = 0,
  'após a exclusão, A não enxerga mais o arquivo');

-- ================================ limpeza ================================
reset role;
delete from storage.objects where bucket_id in ('v2_imagens', 'v2_teste_outro');
delete from storage.buckets where id = 'v2_teste_outro';
select t.ok(not exists (select 1 from storage.buckets where id = 'v2_teste_outro'), 'bucket de teste removido');
