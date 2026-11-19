-- =====================================================================
-- Keamanan akun: nomor WA terverifikasi, kode OTP, antrean pesan WA
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- Semua penulisan dilakukan Edge Function "akun" (service role); pengguna
-- hanya boleh MEMBACA baris miliknya sendiri.
-- =====================================================================

-- Nomor WA pegawai (satu baris per NIP)
create table if not exists public.pegawai_kontak (
  nip text primary key,
  no_wa text not null,                  -- format 62812xxxx (tanpa + atau 0 di depan)
  terverifikasi_pada timestamptz,
  diubah_pada timestamptz default now()
);
alter table public.pegawai_kontak enable row level security;
drop policy if exists "kontak_baca_sendiri" on public.pegawai_kontak;
drop policy if exists "kontak_baca_admin" on public.pegawai_kontak;
create policy "kontak_baca_sendiri" on public.pegawai_kontak for select to authenticated
  using (nip = split_part(auth.jwt() ->> 'email', '@', 1));
create policy "kontak_baca_admin" on public.pegawai_kontak for select to authenticated
  using (public.fn_is_admin() or public.fn_is_superadmin());

-- Kode OTP (disimpan sebagai hash, tidak bisa dibaca dari browser)
create table if not exists public.akun_otp (
  id bigint generated always as identity primary key,
  nip text not null,
  tujuan text not null,                 -- verifikasi_wa | reset_password
  no_wa text not null,
  kode_hash text not null,
  kadaluarsa timestamptz not null,
  percobaan int not null default 0,
  dipakai boolean not null default false,
  ip_hash text,
  dibuat_pada timestamptz not null default now()
);
create index if not exists akun_otp_nip_idx on public.akun_otp (nip, dibuat_pada desc);
alter table public.akun_otp enable row level security;   -- tanpa policy = hanya service role

-- Antrean pesan WA; bot Ayyubi mengambil dan mengirimnya
create table if not exists public.wa_outbox (
  id bigint generated always as identity primary key,
  no_wa text not null,
  pesan text not null,
  status text not null default 'menunggu',   -- menunggu | proses | terkirim | gagal
  percobaan int not null default 0,
  error text,
  dibuat_pada timestamptz not null default now(),
  dikirim_pada timestamptz
);
create index if not exists wa_outbox_status_idx on public.wa_outbox (status, id);
alter table public.wa_outbox enable row level security;  -- tanpa policy = hanya service role

-- Mencari id user Auth dari email (hanya service role)
create or replace function public.fn_auth_uid(p_email text)
returns uuid language sql security definer set search_path = public, auth as
$$ select id from auth.users where lower(email) = lower(p_email) limit 1 $$;
revoke all on function public.fn_auth_uid(text) from public, anon, authenticated;
grant execute on function public.fn_auth_uid(text) to service_role;
