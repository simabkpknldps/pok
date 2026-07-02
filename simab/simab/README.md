# Struktur SiMAB (versi split)

```
index.html          <- halaman login
dashboard.html       <- shell app (sidebar, header, router)
css/app.css
js/
  router.js          <- navigate(page): fetch pages/<page>.html lalu panggil init<Nama>Page()
  api.js              <- apiPost()/apiGet() ke backend GAS
  common.js           <- logout(), showToast(), formatRibuan(), generateIdUsulan()
  pages/
    dashboard.js
    pok.js
    kegiatan.js        <- kerangka kosong
    perjadin.js         <- kerangka kosong
    kalender.js          <- kerangka kosong
pages/
  dashboard.html
  pok.html
  kegiatan.html
  perjadin.html
  kalender.html
```

## Cara nambah halaman baru
1. Buat `pages/namahalaman.html` — isi HTML fragment saja (tanpa tag html/head/body).
2. Buat `js/pages/namahalaman.js` dengan fungsi `initNamahalamanPage()` yang di-attach ke `window`.
3. Tambahkan `<script src="js/pages/namahalaman.js"></script>` di `dashboard.html`.
4. Daftarkan di `PAGE_INIT` dalam `js/router.js`.
5. Tambahkan tombol nav baru di `dashboard.html`: `<button onclick="navigate('namahalaman')">`.

Selesai — tidak perlu sentuh file lain.

## Catatan penting (perlu kamu cek)
- **Halaman POK**: markup tabelnya (search box, filter bidang, tabel) tidak ada di file `v3_dashboard.html` yang lama — kemungkinan hilang saat development. Aku rekonstruksi ulang di `pages/pok.html` berdasarkan fungsi JS yang ada. Silakan cek apakah tampilannya sudah sesuai keinginanmu.
- Dropdown `#filterBidang` di `pages/pok.html` saat ini kosong (cuma opsi "Semua"). Kalau kamu punya daftar bidang, perlu ditambahkan manual atau di-populate dari data (bisa aku bantu kalau mau).
- Fungsi `openPelaksanaModal()` dan `hapusKegiatan()` dipanggil di `pok.js` (tombol aksi di modal Detil) tapi **belum pernah didefinisikan** di kode aslimu — ini bukan bug dari proses split, sudah begitu dari file lama. Perlu ditambahkan kalau fitur itu dipakai.
- Backend (Google Apps Script) tidak diubah sama sekali — semua action (`getPOKData`, `getDashboardData`, `simpanKegiatan`, dll) tetap sama.
