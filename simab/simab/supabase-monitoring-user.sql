-- =====================================================================
-- Monitoring User SiMAB (siapa sedang online + login terakhir)
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- Tiap pegawai hanya mengisi barisnya sendiri; yang boleh MELIHAT:
-- superadmin (semua) dan admin kantor (pegawai kantornya sendiri).
-- =====================================================================

create table if not exists public.sesi_user (
  nip             text primary key,
  nama            text,
  jabatan         text,
  kantor_id       text,
  login_terakhir  timestamptz not null default now(),
  aktif_terakhir  timestamptz not null default now(),
  keluar_pada     timestamptz,
  halaman         text,
  perangkat       text
);

create index if not exists sesi_user_kantor_idx on public.sesi_user (kantor_id);

alter table public.sesi_user enable row level security;

drop policy if exists sesi_select on public.sesi_user;
create policy sesi_select on public.sesi_user for select to authenticated
using (
  public.fn_is_superadmin()
  or (public.fn_is_admin() and kantor_id = public.fn_pegawai_kantor_id())
);

drop policy if exists sesi_insert on public.sesi_user;
create policy sesi_insert on public.sesi_user for insert to authenticated
with check (nip = split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1));

drop policy if exists sesi_update on public.sesi_user;
create policy sesi_update on public.sesi_user for update to authenticated
using (nip = split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1))
with check (nip = split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1));
