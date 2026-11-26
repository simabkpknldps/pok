-- =====================================================================
-- Kop surat per kantor (untuk Laporan Pelaksanaan Tugas)
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- kop_teks   : baris kop dari atas ke bawah (satu baris per baris)
-- kop_alamat : alamat / telepon / laman di bawah kop
-- Kantor lain mengisinya lewat Referensi > Kantor > ikon "Kop surat".
-- =====================================================================

alter table public.kantor add column if not exists kop_teks text;
alter table public.kantor add column if not exists kop_alamat text;

update public.kantor
set kop_teks = E'KEMENTERIAN KEUANGAN REPUBLIK INDONESIA\nDIREKTORAT JENDERAL KEKAYAAN NEGARA\nKANTOR WILAYAH DIREKTORAT JENDERAL KEKAYAAN NEGARA\nBALI DAN NUSA TENGGARA\nKANTOR PELAYANAN KEKAYAAN NEGARA DAN LELANG DENPASAR',
    kop_alamat = 'GEDUNG KEUANGAN NEGARA I, JALAN DR. KUSUMAATMAJA, DENPASAR, BALI 80235; TELEPON (0361) 229151, 234623; FAKSIMILE (0361) 229150; LAMAN www.djkn.kemenkeu.go.id'
where id = '538065' and kop_teks is null;
