-- =====================================================================
-- Log Aktivitas SiMAB (login + semua rekam/ubah/hapus)
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- Hanya SUPERADMIN yang bisa MEMBACA; semua user login boleh MENAMBAH
-- baris (dicatat otomatis oleh aplikasi). Tidak ada update/hapus lewat
-- aplikasi (log bersifat tambah-saja).
-- =====================================================================

create table if not exists public.log_aktivitas (
  id         bigint generated always as identity primary key,
  waktu      timestamptz not null default now(),
  user_id    uuid default auth.uid(),
  nip        text,
  nama       text,
  jabatan    text,
  kantor_id  text,
  aksi       text not null,      -- login | logout | rekam | ubah | hapus | simpan | dokumen
  tabel      text,               -- mis. kegiatan, pok, pegawai
  ringkas    text,               -- kalimat singkat yang tampil di tabel
  detail     jsonb,              -- isi perubahan (sudah disamarkan utk data sensitif)
  perangkat  text,               -- mis. "Ponsel · Android · Chrome (PWA)"
  ip         text,
  lokasi     text,               -- perkiraan kota/negara dari alamat IP
  halaman    text
);

create index if not exists log_aktivitas_waktu_idx on public.log_aktivitas (waktu desc);
create index if not exists log_aktivitas_nip_idx   on public.log_aktivitas (nip);
create index if not exists log_aktivitas_aksi_idx  on public.log_aktivitas (aksi);

-- Penentu superadmin di sisi database: NIP diambil dari email login
-- (<NIP>@simab.local) lalu dicocokkan ke pegawai.superadmin.
create or replace function public.fn_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pegawai p
    where p.id::text = split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
      and coalesce(p.superadmin::text, '') in ('1', 'true', 'TRUE', 'ya', 'Ya', 'YA')
  );
$$;
grant execute on function public.fn_is_superadmin() to authenticated;

alter table public.log_aktivitas enable row level security;

drop policy if exists "log_aktivitas_insert_auth"  on public.log_aktivitas;
drop policy if exists "log_aktivitas_select_super" on public.log_aktivitas;

create policy "log_aktivitas_insert_auth" on public.log_aktivitas
  for insert to authenticated
  with check (auth.uid() is not null);

create policy "log_aktivitas_select_super" on public.log_aktivitas
  for select to authenticated
  using (public.fn_is_superadmin());
