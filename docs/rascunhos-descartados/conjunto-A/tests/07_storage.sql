\set ON_ERROR_STOP on
\ir support/helpers.sql
begin;
select pg_temp.guarda();
insert into auth.users (id, email) values (pg_temp.ua(), 'a@test.local'), (pg_temp.ub(), 'b@test.local');
-- bucket "da versao atual" simulado, so para provar que as policies v2_ nao o alcancam
insert into storage.buckets (id, name, public) values ('decisoes-imagens', 'decisoes-imagens', true) on conflict do nothing;

do $$
declare esc uuid := gen_random_uuid(); n int; p_a text := pg_temp.ua() || '/' || esc || '/x.webp';
begin
  perform pg_temp.como(pg_temp.ua());
  insert into storage.objects (bucket_id, name) values ('v2_imagens', p_a);                    -- propria pasta: ok
  perform pg_temp.falha(format($q$insert into storage.objects (bucket_id, name) values ('v2_imagens', %L)$q$, pg_temp.ub() || '/' || esc || '/y.webp'), '42501');
  perform pg_temp.falha($q$insert into storage.objects (bucket_id, name) values ('v2_imagens', 'sem-pasta.webp')$q$, '42501');
  -- o bucket da versao atual NAO e alcancado pelas policies v2_ (mesmo na propria pasta)
  perform pg_temp.falha(format($q$insert into storage.objects (bucket_id, name) values ('decisoes-imagens', %L)$q$, p_a), '42501');
  select count(*) into n from storage.objects where bucket_id = 'v2_imagens'; assert n = 1, 'A deveria ler o proprio objeto';

  -- B nao ve, nao apaga, nao troca
  perform pg_temp.como(pg_temp.ub());
  select count(*) into n from storage.objects; assert n = 0, 'B enxerga objeto de A';
  delete from storage.objects where bucket_id = 'v2_imagens'; get diagnostics n = row_count; assert n = 0, 'B apagou objeto de A';
  update storage.objects set name = pg_temp.ub() || '/roubado.webp' where bucket_id = 'v2_imagens'; get diagnostics n = row_count;
  assert n = 0, 'B alterou objeto de A';

  -- ninguem (nem o dono) consegue UPDATE: nao ha policy de update
  perform pg_temp.como(pg_temp.ua());
  update storage.objects set name = pg_temp.ua() || '/' || esc || '/z.webp' where bucket_id = 'v2_imagens'; get diagnostics n = row_count;
  assert n = 0, 'update de objeto nao deveria ser permitido';

  -- anon nada
  perform pg_temp.anonimo();
  select count(*) into n from storage.objects where bucket_id = 'v2_imagens'; assert n = 0, 'anon enxerga objeto';
  perform pg_temp.falha(format($q$insert into storage.objects (bucket_id, name) values ('v2_imagens', %L)$q$, pg_temp.ua() || '/' || esc || '/anon.webp'), '42501');

  -- o dono apaga o proprio
  perform pg_temp.como(pg_temp.ua());
  delete from storage.objects where bucket_id = 'v2_imagens'; get diagnostics n = row_count; assert n = 1, 'A deveria apagar o proprio objeto';

  perform pg_temp.admin();
  raise notice 'OK 07_storage';
end $$;
rollback;
