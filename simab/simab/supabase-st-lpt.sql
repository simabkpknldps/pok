-- =====================================================================
-- Surat Tugas (PDF di Google Drive) + Konsep LPT (Laporan Pelaksanaan Tugas)
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- =====================================================================

-- 1) Tautan PDF Surat Tugas pada kegiatan perjadin (MAK 524xxx)
alter table public.kegiatan add column if not exists st_link text;

-- 2) Konsep LPT per Surat Tugas (bisa diedit ulang & diunduh .docx)
create table if not exists public.lpt_konsep (
  kantor_id   text not null,
  tahun       integer not null,
  nomor_st    text not null,
  konten      jsonb not null default '{}'::jsonb,
  diubah_oleh text,
  diubah_pada timestamptz default now(),
  primary key (kantor_id, tahun, nomor_st)
);

alter table public.lpt_konsep enable row level security;

drop policy if exists "lpt_konsep_select" on public.lpt_konsep;
drop policy if exists "lpt_konsep_insert" on public.lpt_konsep;
drop policy if exists "lpt_konsep_update" on public.lpt_konsep;
drop policy if exists "lpt_konsep_delete" on public.lpt_konsep;

create policy "lpt_konsep_select" on public.lpt_konsep
  for select to authenticated using (auth.uid() is not null);
create policy "lpt_konsep_insert" on public.lpt_konsep
  for insert to authenticated with check (auth.uid() is not null);
create policy "lpt_konsep_update" on public.lpt_konsep
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "lpt_konsep_delete" on public.lpt_konsep
  for delete to authenticated using (auth.uid() is not null);
