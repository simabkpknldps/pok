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

// Menu yang boleh diakses user dengan akses terbatas (ref_pegawai kolom H = 0).
// Selain ini akan ditolak & diarahkan ke halaman Perjadinku.
const RESTRICTED_ALLOWED_PAGES = ['perjadin', 'referensi', 'perbantuan'];

async function navigate(page) {
    // Guard akses menu terbatas (kolom H ref_pegawai = 0)
    if (window.isAksesTerbatas && window.isAksesTerbatas() && !RESTRICTED_ALLOWED_PAGES.includes(page)) {
        alert('Anda tidak memiliki akses ke menu ini.');
        if (page !== 'perjadin') {
            navigate('perjadin');
        }
        return;
    }

    const container = document.getElementById('app');
    const title = document.getElementById('page-title');
    title.innerText = page.charAt(0).toUpperCase() + page.slice(1);

    // Highlight tombol nav aktif
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('bg-sky-50', btn.getAttribute('onclick') === `navigate('${page}')`);
        btn.classList.toggle('text-sky-700', btn.getAttribute('onclick') === `navigate('${page}')`);
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
    const startPage = (window.isAksesTerbatas && window.isAksesTerbatas()) ? 'perjadin' : 'dashboard';
    navigate(startPage);
});
