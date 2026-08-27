/**
 * ROUTER
 * -------
 * Cara nambah halaman baru:
 * 1. Buat file pages/namahalaman.html  (isi HTML-nya saja, tanpa <html>/<head>/<body>)
 * 2. Buat file js/pages/namahalaman.js dengan fungsi init<NamaHalaman>Page(container)
 * 3. Daftarkan di object PAGE_INIT di bawah ini
 * 4. Tambah tombol <button onclick="navigate('namahalaman')"> di dashboard.html
 * Selesai. Tidak perlu sentuh file lain.
 */


const PAGE_INIT = {
    dashboard: () => window.initDashboardPage && window.initDashboardPage(),
    pok: () => window.initPokPage && window.initPokPage(),
    kegiatan: () => window.initKegiatanPage && window.initKegiatanPage(),
    perjadin: () => window.initPerjadinPage && window.initPerjadinPage(),
    kalender: () => window.initKalenderPage && window.initKalenderPage(),
    statistik: () => window.initStatistikPage && window.initStatistikPage(),
    rpd: () => window.initRpdPage && window.initRpdPage(),
    referensi: () => window.initReferensiPage && window.initReferensiPage(),
    perbantuan: () => window.initPerbantuanPage && window.initPerbantuanPage(),
};

// Tingkat akses (diisi ke localStorage saat login, kolom 'admin' & 'aksesMenu'
// tabel pegawai) — 3 tingkat:
//   'admin'     : localStorage.admin === '1'      -> akses semua halaman +
//                 tab Data Rekening & kolom Admin di Referensi
//   'aksesMenu' : localStorage.aksesMenu === '1'   -> akses semua halaman,
//                 tapi di Referensi cuma tab SBM+Pegawai (tanpa Rekening,
//                 tanpa kolom Admin)
//   'biasa'     : (keduanya kosong)                -> cuma boleh buka
//                 Perjadinku, Perbantuan, Referensi (Referensi cuma tab SBM)
function getAksesLevel() {
    if (localStorage.getItem('admin') === '1') return 'admin';
    if (localStorage.getItem('aksesMenu') === '1') return 'aksesMenu';
    return 'biasa';
}
window.getAksesLevel = getAksesLevel;

// Kantor yang sedang aktif untuk sesi ini — diisi saat login (index.html),
// dipakai SEMUA halaman utk filter query (.eq('kantor_id', getKantorAktif())).
// Kalau kosong (harusnya tidak pernah terjadi setelah login normal), fallback
// ke string kosong supaya query tetap terkontrol (tidak match apapun) alih-alih
// error/undefined.
function getKantorAktif() {
    return localStorage.getItem('kantor') || '';
}
window.getKantorAktif = getKantorAktif;

// Menu yang boleh diakses user tingkat 'biasa'. Selain ini akan ditolak &
// diarahkan ke halaman Perbantuan.
const RESTRICTED_ALLOWED_PAGES = ['perjadin', 'referensi', 'perbantuan'];
const RESTRICTED_DEFAULT_PAGE = 'perbantuan';

async function navigate(page) {
    // Guard akses menu tingkat 'biasa'
    if (getAksesLevel() === 'biasa' && !RESTRICTED_ALLOWED_PAGES.includes(page)) {
        alert('Anda tidak memiliki akses ke menu ini.');
        if (page !== RESTRICTED_DEFAULT_PAGE) {
            navigate(RESTRICTED_DEFAULT_PAGE);
        }
        return;
    }

    const container = document.getElementById('app');
    const title = document.getElementById('page-title');
    title.innerText = page.charAt(0).toUpperCase() + page.slice(1);

    // Highlight tombol nav aktif
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.getAttribute('onclick') === `navigate('${page}')`);
    });

    // Spinner sementara loading fragment
    container.innerHTML = `
        <div class="flex justify-center items-center h-64">
            <i class="fa-solid fa-spinner fa-spin text-4xl text-sky-500"></i>
        </div>
    `;

    
    try {
        const res = await fetch(`pages/${page}.html`);
        if (!res.ok) throw new Error('Halaman tidak ditemukan: ' + page);
        container.innerHTML = await res.text();
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="text-center text-red-500 mt-10">Gagal memuat halaman "${page}".</div>`;
        return;
    }

    // Panggil fungsi init khusus halaman ini (kalau ada)
    const init = PAGE_INIT[page];
    if (typeof init === 'function') {
        await init();
    }
}
window.navigate = navigate;

document.addEventListener('DOMContentLoaded', () => {
    const startPage = (getAksesLevel() === 'biasa') ? RESTRICTED_DEFAULT_PAGE : 'dashboard';
    navigate(startPage);
});
