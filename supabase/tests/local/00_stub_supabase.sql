-- 00_stub_supabase.sql
-- SOMENTE PARA TESTES LOCAIS em um Postgres descartável (sem Supabase).
-- Simula o mínimo do Supabase que as migrações v2_ usam: papéis, auth.users, auth.uid(),
-- storage.buckets/objects/foldername, publication supabase_realtime e os privilégios padrão
-- (amplos) que o Supabase concede em tabelas/funções novas.
-- NUNCA execute este arquivo no projeto Supabase "sistemas". No CI, com `supabase start`,
-- este arquivo não é usado: o próprio Supabase local fornece tudo isso.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text, owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

create publication supabase_realtime;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;

-- privilégios padrão amplos do Supabase em objetos novos do schema public
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- "versão atual em produção" simulada: serve para provar que as migrações v2_ não a alteram
create table public.decisoes_estado (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb
);
alter table public.decisoes_estado enable row level security;
create policy decisoes_select_proprio on public.decisoes_estado for select to authenticated using (auth.uid() = user_id);
create policy decisoes_insert_proprio on public.decisoes_estado for insert to authenticated with check (auth.uid() = user_id);
create policy decisoes_update_proprio on public.decisoes_estado for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy decisoes_delete_proprio on public.decisoes_estado for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('decisoes-imagens', 'decisoes-imagens', true);
create policy decisoes_img_insert_proprio on storage.objects for insert to authenticated
  with check (bucket_id = 'decisoes-imagens' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy decisoes_img_delete_proprio on storage.objects for delete to authenticated
  using (bucket_id = 'decisoes-imagens' and (storage.foldername(name))[1] = (auth.uid())::text);
