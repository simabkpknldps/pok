-- =====================================================================
-- Pejabat (PPK & Bendahara) per kantor
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- Sebelumnya tabel pejabat hanya punya satu baris (id 'main') yang dipakai
-- semua kantor. Sekarang tiap kantor punya barisnya sendiri (kolom kantor_id).
-- Baris lama ('main') diberikan ke KPKNL Denpasar (538065).
-- =====================================================================

alter table public.pejabat add column if not exists kantor_id text;

update public.pejabat set kantor_id = '538065' where id = 'main' and kantor_id is null;

create unique index if not exists pejabat_kantor_id_uq on public.pejabat (kantor_id);

-- Izinkan admin kantor / superadmin mengubah & membuat baris untuk kantornya.
drop policy if exists "pejabat_insert_kantor" on public.pejabat;
drop policy if exists "pejabat_update_kantor" on public.pejabat;

create policy "pejabat_insert_kantor" on public.pejabat
  for insert to authenticated
  with check (
    public.fn_is_superadmin()
    or (public.fn_is_admin() and kantor_id = public.fn_pegawai_kantor_id())
  );

create policy "pejabat_update_kantor" on public.pejabat
  for update to authenticated
  using (
    public.fn_is_superadmin()
    or (public.fn_is_admin() and kantor_id = public.fn_pegawai_kantor_id())
  )
  with check (
    public.fn_is_superadmin()
    or (public.fn_is_admin() and kantor_id = public.fn_pegawai_kantor_id())
  );
