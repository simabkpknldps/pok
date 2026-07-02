// ============================================================
// app.js — INTI APLIKASI
// - Router SPA (navigate)
// - Util yang dipakai lintas halaman (toast, format angka, dll)
//
// CARA NAMBAH HALAMAN BARU:
// 1. Bikin file baru di js/pages/, misalnya js/pages/laporan.js
//    isinya minimal:
//        export async function render(container) {
//            container.innerHTML = `<div>Konten halaman laporan</div>`;
//        }
// 2. Daftarkan satu baris di object `routes` di bawah ini:
//        laporan: () => import('./pages/laporan.js'),
// 3. Tambahkan tombol menu di v3_dashboard.html:
//        <button onclick="navigate('laporan')">...</button>
// Selesai — tidak perlu ubah file lain.
// ============================================================

const routes = {
    dashboard: () => import('./pages/dashboard.js'),
    pok:       () => import('./pages/pok.js'),
    kegiatan:  () => import('./pages/kegiatan.js'),
    perjadin:  () => import('./pages/perjadin.js'),
    kalender:  () => import('./pages/kalender.js'),
};

export async function navigate(page) {
    const container = document.getElementById('app');
    const title = document.getElementById('page-title');
    title.innerText = page.charAt(0).toUpperCase() + page.slice(1);

    // Tampilkan spinner segera
    container.innerHTML = `
        <div class="flex justify-center items-center h-64">
            <i class="fa-solid fa-spinner fa-spin text-4xl text-sky-500"></i>
        </div>
    `;

    const loadRoute = routes[page];
    if (!loadRoute) {
        container.innerHTML = `<div class="text-center text-red-500 mt-10">Halaman "${page}" belum tersedia.</div>`;
        return;
    }

    try {
        const pageModule = await loadRoute();
        await pageModule.render(container);
    } catch (err) {
        console.error(`Gagal memuat halaman "${page}":`, err);
        container.innerHTML = `<div class="text-center text-red-500 mt-10">Terjadi kesalahan saat memuat halaman. Cek console (F12) untuk detail.</div>`;
    }
}

export function logout() {
    sessionStorage.clear();
    window.location.href = 'v3_index.html';
}

export function showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = "bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center animate-in slide-in-from-right-10";
    toast.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

export function formatRibuan(angka) {
    const v = String(angka).replace(/\D/g, "");
    return v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function generateIdUsulan() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 10; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// onclick="..." di markup HTML mencari fungsi di scope global (window),
// sedangkan fungsi di dalam module ES tidak otomatis global.
// Maka fungsi yang dipanggil langsung dari HTML wajib ditempel ke window.
window.navigate = navigate;
window.logout = logout;
window.formatRibuan = formatRibuan;

// Halaman pertama saat aplikasi dibuka
document.addEventListener("DOMContentLoaded", () => navigate('dashboard'));
