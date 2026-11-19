-- =====================================================================
-- Pengaturan Fitur per kantor
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- Tiap baris = satu fitur untuk satu kantor. Fitur yang tidak punya baris
-- memakai nilai bawaan aplikasi (aktif), jadi perilaku lama tidak berubah.
-- Baca: semua user login. Tulis: superadmin, atau admin pada kantornya sendiri.
-- =====================================================================

create table if not exists public.fitur_kantor (
  kantor_id   text not null,
  fitur       text not null,
  aktif       boolean not null default true,
  diubah_oleh text,
  diubah_pada timestamptz default now(),
  primary key (kantor_id, fitur)
);

alter table public.fitur_kantor enable row level security;

drop policy if exists "fitur_kantor_select" on public.fitur_kantor;
drop policy if exists "fitur_kantor_insert" on public.fitur_kantor;
drop policy if exists "fitur_kantor_update" on public.fitur_kantor;
drop policy if exists "fitur_kantor_delete" on public.fitur_kantor;

create policy "fitur_kantor_select" on public.fitur_kantor
  for select to authenticated using (auth.uid() is not null);

create policy "fitur_kantor_insert" on public.fitur_kantor
  for insert to authenticated
  with check (
    public.fn_is_superadmin()
    or (public.fn_is_admin() and kantor_id = public.fn_pegawai_kantor_id())
  );

create policy "fitur_kantor_update" on public.fitur_kantor
  for update to authenticated
  using (
    public.fn_is_superadmin()
    or (public.fn_is_admin() and kantor_id = public.fn_pegawai_kantor_id())
  )
  with check (
    public.fn_is_superadmin()
    or (public.fn_is_admin() and kantor_id = public.fn_pegawai_kantor_id())
  );

create policy "fitur_kantor_delete" on public.fitur_kantor
  for delete to authenticated
  using (
    public.fn_is_superadmin()
    or (public.fn_is_admin() and kantor_id = public.fn_pegawai_kantor_id())
  );
