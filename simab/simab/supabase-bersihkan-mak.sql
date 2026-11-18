-- Membersihkan MAK kegiatan yang terlanjur berakhiran " RM" / " PNBP"
-- (akibat Edit/Simpan saat badge sumber dana masih berupa teks).

-- 1) LIHAT DULU yang terdampak
select id, mak, tahun, kantor_id
from kegiatan
where mak ~ '\s+(RM|PNBP)\s*$'
order by tahun, mak;

-- 2) PERBAIKI (jalankan setelah langkah 1 terlihat benar)
update kegiatan
set mak = regexp_replace(mak, '\s+(RM|PNBP)\s*$', '')
where mak ~ '\s+(RM|PNBP)\s*$';
