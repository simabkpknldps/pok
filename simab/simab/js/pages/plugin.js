/**
 * Halaman Plugin
 * -----------------------------------------------------------------------
 * Menampilkan daftar plugin dari sheet ref_plugin (kolom A = nama, B = link,
 * C = deskripsi — lihat backend GAS: getPluginData). Klik nama plugin
 * membuka popup berisi halaman plugin tsb (iframe), dengan opsi "Buka di
 * Tab Baru" di atasnya untuk kalau halamannya tidak bisa/tidak mau
 * ditampilkan di dalam iframe (banyak situs memblokir ini lewat header
 * X-Frame-Options — di luar kendali kita, makanya opsi tab baru disediakan
 * sebagai jalan keluar).
 * -----------------------------------------------------------------------
 */

let plgData = [];

async function initPluginPage() {
    const tbody = document.getElementById('plg-tbody');
    if (!tbody) return; // fragment belum ter-render

    plgData = [];
    tbody.innerHTML = `
        <tr><td colspan="2" class="text-center text-slate-400 py-10">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat data...
        </td></tr>
    `;

    try {
        const result = await apiPost({ action: 'getPluginData' });
        if (!result || result.status !== 'success') {
            throw new Error(result && result.message ? result.message : 'Gagal memuat data plugin');
        }
        plgData = result.rows || [];
        plgRenderTable();
    } catch (e) {
        tbody.innerHTML = `
            <tr><td colspan="2" class="text-center text-red-500 py-10">
                ❌ ${e.message || 'Gagal memuat data plugin'}
            </td></tr>
        `;
    }
}

function plgEsc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function plgRenderTable() {
    const tbody = document.getElementById('plg-tbody');
    if (!tbody) return;

    if (!plgData.length) {
        tbody.innerHTML = `
            <tr><td colspan="2" class="text-center text-slate-400 py-10">
                <i class="fa-regular fa-folder-open text-2xl mb-2 block"></i>
                Belum ada data plugin.
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = plgData.map((r, idx) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-3 align-top">
                <button type="button" class="plg-btn-open flex items-center gap-2 text-sky-700 hover:text-sky-900 font-medium text-left" data-idx="${idx}">
                    <i class="fa-solid fa-puzzle-piece text-sky-500"></i>
                    <span class="underline decoration-dotted underline-offset-2">${plgEsc(r.nama)}</span>
                </button>
            </td>
            <td class="p-3 align-top text-slate-600">${plgEsc(r.deskripsi)}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.plg-btn-open').forEach(btn => {
        btn.onclick = () => plgOpenPopup(plgData[Number(btn.dataset.idx)]);
    });
}

function plgOpenPopup(item) {
    if (!item || !item.link) {
        alert('Link plugin ini belum diisi di sheet ref_plugin.');
        return;
    }

    const linkEsc = plgEsc(item.link);
    const namaEsc = plgEsc(item.nama);

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1 gap-3">
            <h3 class="text-base font-semibold text-sky-700 truncate"><i class="fa-solid fa-puzzle-piece mr-2"></i>${namaEsc}</h3>
            <div class="flex items-center gap-3 shrink-0">
                <a href="${linkEsc}" target="_blank" rel="noopener" class="text-slate-500 hover:text-sky-600 text-sm whitespace-nowrap">
                    <i class="fa-solid fa-up-right-from-square mr-1"></i>Buka di Tab Baru
                </a>
                <button id="plg-popupClose" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="h-[75vh] rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
            <iframe src="${linkEsc}" class="w-full h-full" title="${namaEsc}"></iframe>
        </div>
        <p class="text-xs text-slate-400 text-center">Kalau halaman tidak tampil (diblokir oleh situsnya), gunakan tombol "Buka di Tab Baru" di atas.</p>
    `, 'max-w-5xl');

    popup.querySelector('#plg-popupClose').onclick = () => overlay.remove();
}

window.initPluginPage = initPluginPage;
