-- Jarwo: log pemakaian (opsional, ringan). Tidak menyimpan isi dokumen.
create table if not exists public.jarwo_log (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  user_email text default (auth.jwt() ->> 'email'),
  kantor_id text,
  aksi text,            -- chat | extract | simpan
  keterangan text
);
alter table public.jarwo_log enable row level security;
create policy "jarwo_log_insert_auth" on public.jarwo_log for insert with check (auth.uid() is not null);
create policy "jarwo_log_select_admin" on public.jarwo_log for select using (fn_is_admin());
