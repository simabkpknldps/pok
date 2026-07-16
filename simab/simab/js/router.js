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
};

async function navigate(page) {
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

document.addEventListener('DOMContentLoaded', () => navigate('dashboard'));
