-- =====================================================================
-- Info Perbendaharaan (menu sidebar). Jalankan SEKALI di Supabase > SQL Editor.
-- Data bersifat umum (berlaku semua kantor). Aman dijalankan ulang.
-- Baca: semua user login. Tulis: admin / superadmin.
-- asal = 'awal' (data bawaan PER-9/PB/2026), 'manual', atau 'jarwo' (hasil pencarian otomatis).
-- =====================================================================

create table if not exists public.info_perbendaharaan (
  id bigint generated always as identity primary key,
  jenis text not null default 'kabar',      -- jadwal | checklist | kabar
  kelompok text not null default '',
  urutan int not null default 0,
  label text not null default '',           -- tanggal/rentang (jadwal) atau tanggal terbit (kabar)
  judul text not null default '',
  isi text not null default '',
  sumber text not null default '',
  sumber_url text not null default '',
  asal text not null default 'manual',
  dibuat_oleh text,
  dibuat_pada timestamptz not null default now()
);

create table if not exists public.info_perbendaharaan_cek (
  id int primary key default 1 check (id = 1),
  terakhir_cek timestamptz,
  oleh text
);
insert into public.info_perbendaharaan_cek (id) values (1) on conflict do nothing;

alter table public.info_perbendaharaan enable row level security;
alter table public.info_perbendaharaan_cek enable row level security;

drop policy if exists "info_select" on public.info_perbendaharaan;
drop policy if exists "info_insert" on public.info_perbendaharaan;
drop policy if exists "info_update" on public.info_perbendaharaan;
drop policy if exists "info_delete" on public.info_perbendaharaan;
create policy "info_select" on public.info_perbendaharaan for select to authenticated using (true);
create policy "info_insert" on public.info_perbendaharaan for insert to authenticated with check (public.fn_is_admin() or public.fn_is_superadmin());
create policy "info_update" on public.info_perbendaharaan for update to authenticated using (public.fn_is_admin() or public.fn_is_superadmin()) with check (public.fn_is_admin() or public.fn_is_superadmin());
create policy "info_delete" on public.info_perbendaharaan for delete to authenticated using (public.fn_is_admin() or public.fn_is_superadmin());

drop policy if exists "info_cek_select" on public.info_perbendaharaan_cek;
drop policy if exists "info_cek_update" on public.info_perbendaharaan_cek;
create policy "info_cek_select" on public.info_perbendaharaan_cek for select to authenticated using (true);
create policy "info_cek_update" on public.info_perbendaharaan_cek for update to authenticated using (public.fn_is_admin() or public.fn_is_superadmin()) with check (public.fn_is_admin() or public.fn_is_superadmin());

-- Data awal dari infografis PER-9/PB/2026 (hanya jika belum pernah dimasukkan)
insert into public.info_perbendaharaan (jenis, kelompok, urutan, label, isi, sumber, asal)
select v.jenis, v.kelompok, v.urutan, v.label, v.isi, 'PER-9/PB/2026', 'awal'
from (values
  ('jadwal','Tonggak Waktu Penting',1,'11 Nov','Batas ajuan persetujuan TUP Tunai'),
  ('jadwal','Tonggak Waktu Penting',2,'7 Des','SPM-UP Tunai, TUP KKP & GUP'),
  ('jadwal','Tonggak Waktu Penting',3,'17-23 Des','SPM akhir tahun via RPATA'),
  ('jadwal','Tonggak Waktu Penting',4,'25 Jan 27','Rekonsiliasi & tutup data 2026'),
  ('jadwal','Bendahara Pengeluaran: UP dan KKP',5,'3 Des','Ajuan persetujuan UP/TUP KKP ke KPPN'),
  ('jadwal','Bendahara Pengeluaran: UP dan KKP',6,'7 Des','SPM-UP Tunai, TUP KKP & GUP diterima KPPN'),
  ('jadwal','Bendahara Pengeluaran: UP dan KKP',7,'16 Des','Hari terakhir transaksi KKP / KKP Domestik'),
  ('jadwal','Bendahara Pengeluaran: UP dan KKP',8,'18 Des','SPM-GUP/PTUP KKP diterima KPPN, SP2D 22 Des'),
  ('jadwal','Bendahara Pengeluaran: UP dan KKP',9,'31 Des','Setor seluruh sisa UP/TUP, maks 22.00; cocokkan data KPPN 15.00'),
  ('jadwal','Bendahara Pengeluaran: UP dan KKP',10,'11 Jan 27','SPM-GUP Nihil UP Tunai bertanggal 31 Des 2026'),
  ('jadwal','Batas Ajuan SPM-LS Non Kontraktual',11,'1-8 Des','Gaji induk Januari 2027, PPNPN & PPPK'),
  ('jadwal','Batas Ajuan SPM-LS Non Kontraktual',12,'1-21 Des','Tunjangan kinerja dibayar 1 Januari 2027'),
  ('jadwal','Batas Ajuan SPM-LS Non Kontraktual',13,'11 Des','Uang makan & lembur November 2026'),
  ('jadwal','Batas Ajuan SPM-LS Non Kontraktual',14,'14 Des','Honorarium, tunjangan, vakasi & PPNPN Desember'),
  ('jadwal','Batas Ajuan SPM-LS Non Kontraktual',15,'22 Des','SPM-LS non kontraktual lainnya, SP2D maks 29 Des'),
  ('jadwal','Batas Ajuan SPM-LS Non Kontraktual',16,'23 Des','Uang makan & lembur Desember 2026'),
  ('jadwal','Tanggal Pengiriman SPM Kontraktual',17,'9 Okt 2026','Batas pengiriman untuk kontrak s.d. 30 September 2026.'),
  ('jadwal','Tanggal Pengiriman SPM Kontraktual',18,'6 Nov 2026','Batas pengiriman untuk kontrak periode 1 – 31 Oktober 2026.'),
  ('jadwal','Tanggal Pengiriman SPM Kontraktual',19,'7 Des 2026','Batas pengiriman untuk kontrak periode 1 – 30 November 2026 serta kontrak periode 1 – 5 Desember 2026.'),
  ('jadwal','Tanggal Pengiriman SPM Kontraktual',20,'14 Des 2026','Batas pengiriman untuk kontrak periode 6 – 12 Desember 2026.'),
  ('jadwal','Tanggal Pengiriman SPM Kontraktual',21,'21 Des 2026','Batas pengiriman untuk kontrak periode 13 – 17 Desember 2026.'),
  ('jadwal','Tanggal Pengiriman SPM Kontraktual',22,'23 Des 2026','Batas pengiriman untuk kontrak periode 18 – 22 Desember 2026 (penerbitan NRK paling lambat 23 Desember 2026).'),
  ('checklist','Checklist: Syarat UP 2027',23,'','DIPA 2027 sudah disahkan'),
  ('checklist','Checklist: Syarat UP 2027',24,'','Sisa UP/TUP Tunai 2026 telah disetor'),
  ('checklist','Checklist: Syarat UP 2027',25,'','LPJ Bendahara Des & rekon kas selesai (atau SPTJM KPA, lalu 5 Hari Kerja)'),
  ('checklist','Checklist: Layanan KPPN Desember',26,'','Jam kerja 08.00-17.00'),
  ('checklist','Checklist: Layanan KPPN Desember',27,'','Layanan libur/akhir pekan dengan dispensasi Kepala Kanwil'),
  ('checklist','Checklist: Layanan KPPN Desember',28,'','Ajuan lewat batas waktu butuh persetujuan'),
  ('checklist','Checklist: Sanksi dan Kontrol',29,'','Telat rekon, LK, LPJ: sanksi sesuai ketentuan'),
  ('checklist','Checklist: Sanksi dan Kontrol',30,'','Pengendalian belanja: NRK/SPM ditolak, SP2D dibatalkan'),
  ('checklist','Checklist: Sanksi dan Kontrol',31,'','Pembayaran lewat mekanisme tunggakan')
) as v(jenis, kelompok, urutan, label, isi)
where not exists (select 1 from public.info_perbendaharaan where asal = 'awal');
