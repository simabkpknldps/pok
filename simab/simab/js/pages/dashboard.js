/**
 * Halaman Dashboard
 */

let dashboardDataCache = null;
let rpdBerjalanCache = null;
let rpdEditModeUtama = false; // true saat baris "RPD Berjalan" sedang mode edit (Ubah -> Simpan)
let dashboardAutoRefreshInterval = null; // handle setInterval auto-refresh background

async function fetchDashboardData() {
    try {
        const data = await apiPost({ action: 'getDashboardData' });
        if (!data || typeof data !== 'object') {
            throw new Error('Format data tidak valid');
        }
        dashboardDataCache = data;
        return data;
    } catch (e) {
        console.error('Error loading dashboard:', e);
        const errorMsg = e.name === 'AbortError' 
            ? 'Timeout: Server tidak merespons (>30 detik)'
            : e.message || 'Gagal memuat data dashboard';
        throw new Error(errorMsg);
    }
}

// Ambil data Monitoring RPD Berjalan dari sheet dash_bulanan_2026 (kolom R:S).
// Backend mengembalikan: { rpdBerjalan, sp2d, kekurangan, rows: [...] }
// - rpdBerjalan/sp2d/kekurangan masing-masing: { rowIndex, uraian, jumlah }
// - rows: daftar baris tambahan (bisa tambah/edit/hapus), masing-masing { rowIndex, uraian, jumlah }
async function fetchRpdBerjalanData() {
    try {
        const data = await apiPost({ action: 'getRpdBerjalanData' });
        if (!data || typeof data !== 'object') {
            throw new Error('Format data RPD Berjalan tidak valid');
        }
        if (!Array.isArray(data.rows)) data.rows = [];
        rpdBerjalanCache = data;
        return data;
    } catch (e) {
        console.error('Error loading RPD Berjalan:', e);
        const errorMsg = e.name === 'AbortError'
            ? 'Timeout: Server tidak merespons (>30 detik)'
            : e.message || 'Gagal memuat data RPD Berjalan';
        throw new Error(errorMsg);
    }
}

// Ambil data Monitoring Dokumen Terupload dari sheet dash_bulanan_2026 (range T24:U25).
// Backend mengembalikan: { rows: [{uraian, jumlah}, {uraian, jumlah}] }
let dokumenMonitoringCache = null;
async function fetchDokumenMonitoringData() {
    try {
        const data = await apiPost({ action: 'getDokumenMonitoringData' });
        if (!data || typeof data !== 'object') {
            throw new Error('Format data monitoring dokumen tidak valid');
        }
        if (data.status !== 'success') {
            throw new Error(data.message || 'Backend belum mengenali action getDokumenMonitoringData (kemungkinan Apps Script belum di-deploy ulang).');
        }
        if (!Array.isArray(data.rows)) data.rows = [];
        dokumenMonitoringCache = data;
        return data;
    } catch (e) {
        console.error('Error loading monitoring dokumen:', e);
        const errorMsg = e.name === 'AbortError'
            ? 'Timeout: Server tidak merespons (>30 detik)'
            : e.message || 'Gagal memuat data monitoring dokumen';
        throw new Error(errorMsg);
    }
}

async function initDashboardPage() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    // Hentikan dulu auto-refresh yang mungkin masih berjalan dari sesi sebelumnya
    stopDashboardAutoRefresh();

    // Selalu refresh setiap masuk halaman ini (perilaku sama seperti versi lama)
    dashboardDataCache = null;
    rpdBerjalanCache = null;
    dokumenMonitoringCache = null;
    rpdEditModeUtama = false;
    container.innerHTML = `<div class="flex justify-center mt-10"><i class="fa-solid fa-spinner fa-spin text-sky-600 text-2xl"></i></div>`;

    // Ambil data dashboard utama, data RPD Berjalan, & data monitoring dokumen secara paralel.
    // Pakai allSettled supaya kalau salah satu gagal, yang lain tetap bisa tampil.
    const [dashResult, rpdResult, dokResult] = await Promise.allSettled([
        fetchDashboardData(),
        fetchRpdBerjalanData(),
        fetchDokumenMonitoringData()
    ]);

    if (dashResult.status !== 'fulfilled') {
        const msg = dashResult.reason && dashResult.reason.message ? dashResult.reason.message : 'Gagal memuat dashboard';
        container.innerHTML = `<div class="text-center text-red-500 mt-10">❌ ${msg}</div>`;
        return;
    }

    const data = dashResult.value;
    const rpdData = rpdResult.status === 'fulfilled' ? rpdResult.value : null;
    const rpdError = rpdResult.status !== 'fulfilled'
        ? (rpdResult.reason && rpdResult.reason.message ? rpdResult.reason.message : 'Gagal memuat data RPD Berjalan')
        : null;
    const dokData = dokResult.status === 'fulfilled' ? dokResult.value : null;
    const dokError = dokResult.status !== 'fulfilled'
        ? (dokResult.reason && dokResult.reason.message ? dokResult.reason.message : 'Gagal memuat data monitoring dokumen')
        : null;

    try {
        container.innerHTML = buildDashboardHtml(data, rpdData, rpdError, dokData, dokError);
        initCharts(data);
        bindGlobalSearchBar();
        // Mulai auto-refresh diam-diam (tanpa loading) setiap 1 menit
        startDashboardAutoRefresh();
    } catch (e) {
        console.error('Dashboard error:', e);
        const errorMsg = e.message || 'Gagal memuat dashboard';
        container.innerHTML = `<div class="text-center text-red-500 mt-10">❌ ${errorMsg}</div>`;
    }
}

// Bangun HTML utama dashboard. Dipakai baik saat load pertama (initDashboardPage)
// maupun saat auto-refresh diam-diam di background (refreshDashboardInBackground),
// supaya keduanya konsisten dan tidak duplikasi kode.
function buildDashboardHtml(data, rpdData, rpdError, dokData, dokError) {
    return `
        <div class="space-y-8">
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <div class="flex items-center gap-2">
                    <div class="relative flex-1">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                        <input id="dash-globalSearchBox" type="text"
                            placeholder="Cari kegiatan (uraian/No ST, pelaksana, tujuan, tanggal, status, atau nomor SPM)..."
                            class="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                    </div>
                    <button id="dash-btnGlobalSearch"
                        class="flex items-center gap-2 px-4 py-2.5 bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium rounded-lg transition whitespace-nowrap">
                        <i class="fa-solid fa-magnifying-glass"></i> Cari
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">${renderBelanjaCard('Belanja Barang', data.barang, 'blue')}</div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">${renderBelanjaCard('Belanja Modal', data.modal, 'blue')}</div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">${renderMPCard('Maksimum Pencairan PNBP', data.mp)}</div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                    <h3 class="font-semibold text-slate-700 mb-4">Kegiatan Hari Ini</h3>
                    <div class="space-y-4 overflow-y-auto max-h-48 pr-2 custom-scrollbar">
                        ${data.kegiatanHariIni.map(item => `<div class="border-b pb-2"><div class="text-sm font-semibold">${item.uraian}</div><div class="text-[10px] text-slate-500">${item.pelaksana} | ${item.tujuan}</div></div>`).join('')}
                    </div>
                </div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">${renderTopPerjadin(data.topPerjadin)}</div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200" id="card-dokumen-monitoring">
                ${dokError
                    ? `<h3 class="font-semibold text-slate-700 mb-4">Monitoring Dokumen Terupload</h3><div class="text-sm text-red-500">❌ ${dokError}</div>`
                    : renderMonitoringDokumen(dokData)}
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200" id="card-rpd-berjalan">
                ${rpdError
                    ? `<h3 class="font-semibold text-slate-700 mb-4">Monitoring RPD Berjalan</h3><div class="text-sm text-red-500">❌ ${rpdError}</div>`
                    : renderMonitoringRpdBerjalan(rpdData)}
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                ${renderAkunBelumRealisasi(data.akunBelumRealisasi)}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 class="font-semibold text-slate-700 mb-4">Grafik Realisasi Perjalanan Dinas (Rp)</h3><canvas id="chartRp"></canvas></div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 class="font-semibold text-slate-700 mb-4">Grafik Realisasi Perjalanan Dinas (Frek)</h3><canvas id="chartFrek"></canvas></div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 class="font-semibold text-slate-700 mb-6">Data Per Seksi</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    ${Object.entries(data.seksi).map(([nama, val]) => {
                        const p = (val * 100).toFixed(2);
                        return `<div><div class="flex justify-between text-xs font-semibold mb-1 text-slate-600"><span>${nama}</span><span>${p}%</span></div><div class="w-full bg-slate-100 rounded-full h-2"><div class="${p < 30 ? 'bg-red-500' : p < 70 ? 'bg-orange-500' : p < 90 ? 'bg-yellow-400' : 'bg-green-500'} h-2 rounded-full" style="width: ${p}%"></div></div></div>`;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

// Card: Monitoring Dokumen Terupload — 2 baris label:jumlah dari sheet
// dash_bulanan_2026 range T24:U25 (kolom T = uraian/label, kolom U = jumlah).
function renderMonitoringDokumen(data) {
    const rows = (data && data.rows) || [];
    const hasContent = rows.some(r => r.uraian || r.jumlah);

    return `
        <h3 class="font-semibold text-slate-700 mb-4">Monitoring Dokumen Terupload</h3>
        ${hasContent ? `
        <table class="w-full text-sm">
            <tbody>
                ${rows.map(r => `
                    <tr class="border-b border-slate-100 last:border-b-0">
                        <td class="py-1.5 pr-2 text-slate-700 font-medium">${escapeHtml(r.uraian)}</td>
                        <td class="py-1.5 pr-2 text-right text-slate-700 font-semibold">${formatAngka(r.jumlah)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ` : `<div class="text-sm text-slate-400 text-center py-2">Belum ada data (cek sheet dash_bulanan_2026 range T24:U25).</div>`}
    `;
}

// ============================================================
// Auto-refresh dashboard di background setiap 1 menit, tanpa loading spinner.
// - Tidak menimpa tampilan kalau baris "RPD Berjalan" sedang dalam mode edit
//   (supaya perubahan yang belum disimpan tidak hilang).
// - Kalau container halaman dashboard sudah tidak ada (user pindah halaman),
//   interval otomatis dihentikan sendiri.
// - Kalau gagal fetch, error hanya dicatat di console, tampilan lama tetap
//   dipertahankan (tidak ditimpa pesan error).
// ============================================================

function startDashboardAutoRefresh() {
    stopDashboardAutoRefresh();
    dashboardAutoRefreshInterval = setInterval(refreshDashboardInBackground, 60 * 1000);
}

function stopDashboardAutoRefresh() {
    if (dashboardAutoRefreshInterval) {
        clearInterval(dashboardAutoRefreshInterval);
        dashboardAutoRefreshInterval = null;
    }
}

async function refreshDashboardInBackground() {
    const container = document.getElementById('dashboard-content');
    if (!container) {
        // Sudah pindah dari halaman dashboard, hentikan auto-refresh
        stopDashboardAutoRefresh();
        return;
    }

    // Jangan refresh kalau baris utama RPD Berjalan sedang dalam mode edit,
    // supaya perubahan yang belum disimpan tidak tertimpa
    if (rpdEditModeUtama) return;

    try {
        const [dashResult, rpdResult, dokResult] = await Promise.allSettled([
            fetchDashboardData(),
            fetchRpdBerjalanData(),
            fetchDokumenMonitoringData()
        ]);

        if (dashResult.status !== 'fulfilled') {
            console.error('Auto-refresh dashboard gagal:', dashResult.reason);
            return; // biarkan tampilan lama, jangan ditimpa error
        }

        const data = dashResult.value;
        const rpdData = rpdResult.status === 'fulfilled' ? rpdResult.value : null;
        const rpdError = rpdResult.status !== 'fulfilled'
            ? (rpdResult.reason && rpdResult.reason.message ? rpdResult.reason.message : 'Gagal memuat data RPD Berjalan')
            : null;
        const dokData = dokResult.status === 'fulfilled' ? dokResult.value : null;
        const dokError = dokResult.status !== 'fulfilled'
            ? (dokResult.reason && dokResult.reason.message ? dokResult.reason.message : 'Gagal memuat data monitoring dokumen')
            : null;

        // Cek ulang, siapa tahu baris utama masuk mode edit persis saat fetch berlangsung
        if (rpdEditModeUtama) return;

        container.innerHTML = buildDashboardHtml(data, rpdData, rpdError, dokData, dokError);
        initCharts(data);
        bindGlobalSearchBar();
    } catch (e) {
        console.error('Gagal auto-refresh dashboard di background:', e);
    }
}

function initCharts(data) {
    const labels = data.grafikPerjadin.map(d => d.bulan);
    new Chart(document.getElementById('chartRp'), { type: 'line', data: { labels, datasets: [{ label: 'Rupiah', data: data.grafikPerjadin.map(d => d.rupiah), borderColor: '#0284c7', tension: 0.3 }] } });
    new Chart(document.getElementById('chartFrek'), { type: 'bar', data: { labels, datasets: [{ label: 'Frekuensi', data: data.grafikPerjadin.map(d => d.frekuensi), backgroundColor: '#0ea5e9' }] } });
}

function renderBelanjaCard(t, d, c) {
    const p = (d.persen * 100).toFixed(2);
    return `<div class="mb-2"><h3 class="font-semibold text-slate-700 mb-2">${t}</h3><div class="text-2xl font-bold text-${c}-600 mb-2">${p}%</div><div class="w-full bg-slate-200 rounded-full h-2 mb-4"><div class="bg-${c}-600 h-2 rounded-full" style="width: ${p}%"></div></div><div class="text-[11px] text-slate-500">Realisasi: ${d.realisasi.toLocaleString()}<br><span class="font-bold text-slate-700">Sisa: ${d.sisa.toLocaleString()}</span></div></div>`;
}

function renderMPCard(t, d) {
    const p = (d.persen * 100).toFixed(2);
    return `<div class="mb-2"><h3 class="font-semibold text-slate-700 mb-2">${t}</h3><div class="text-2xl font-bold text-emerald-600 mb-2">${p}%</div><div class="w-full bg-slate-200 rounded-full h-2 mb-4"><div class="bg-emerald-500 h-2 rounded-full" style="width: ${p}%"></div></div><div class="text-[11px] text-slate-500">Realisasi MP: ${d.realisasi.toLocaleString()}<br><span class="font-bold text-slate-700">Sisa MP: ${d.sisa.toLocaleString()}</span></div></div>`;
}

function renderTopPerjadin(l) {
    return `<h3 class="font-semibold text-slate-700 mb-4">Top 3 Perjadin</h3><div class="space-y-3">${l.slice(0, 3).map((i, idx) => `<div class="flex items-center justify-between"><div class="text-xs text-slate-600">${idx + 1}. ${i[0]}</div><div class="text-xs font-bold text-sky-600">${i[1]}x</div></div>`).join('')}</div>`;
}

// ============================================================
// Card: Monitoring RPD Berjalan
// Sheet dash_bulanan_2026 (kolom R = uraian, kolom S = jumlah):
//   Baris 2 -> RPD Berjalan   (satu-satunya baris tetap yang bisa diedit, via Ubah/Simpan)
//   Baris 3 -> SP2D           (formula otomatis di sheet, read-only)
//   Baris 4 -> Kekurangan     (formula otomatis di sheet, read-only)
//   Baris 5-8 -> baris tetap read-only tambahan (kolom S ada formula otomatis di sheet)
//   Baris 9-20 -> baris tambahan (bebas tambah/edit/hapus), ditandai warna kuning
// Range R2:S8 adalah range TETAP — tidak bisa diubah lewat fitur tambah/edit/hapus
// baris (itu cuma berlaku utk baris 9-20; sudah divalidasi juga di backend).
// "Sisa" = Kekurangan - (fixed5+fixed6+fixed7+fixed8) - total baris tambahan,
// dihitung di sisi frontend (tidak disimpan ke sheet).
// ============================================================

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatAngka(n) {
    return Math.round(Number(n) || 0).toLocaleString('id-ID');
}

// Cek status admin dari localStorage (diset saat login di index.html: localStorage.setItem('admin', data.admin))
function isAdminUser() {
    const val = (localStorage.getItem('admin') || '').toString().trim().toLowerCase();
    return val === 'true' || val === '1' || val === 'ya' || val === 'yes' || val === 'admin';
}

// Hitung "Sisa" (kekurangan - fixed5..fixed8 - total baris tambahan) sekaligus status warna:
// hijau kalau (SP2D + total semua baris tambahan) berada di antara 95%-105%
// dari nilai RPD Berjalan; merah kalau di luar rentang itu.
function hitungStatusSisaRpdBerjalan() {
    if (!rpdBerjalanCache) return { sisa: 0, isHijau: false };

    const kekurangan = Number(rpdBerjalanCache.kekurangan?.jumlah) || 0;
    const sp2d = Number(rpdBerjalanCache.sp2d?.jumlah) || 0;
    const rpdBerjalanJumlah = Number(rpdBerjalanCache.rpdBerjalan?.jumlah) || 0;
    const totalFixed = ['fixed5', 'fixed6', 'fixed7', 'fixed8']
        .reduce((sum, key) => sum + (Number(rpdBerjalanCache[key]?.jumlah) || 0), 0);
    const totalTambahan = (rpdBerjalanCache.rows || []).reduce((sum, r) => sum + (parseFloat(r.jumlah) || 0), 0);

    const sisa = kekurangan - totalFixed - totalTambahan;
    const totalSp2dTambahan = sp2d + totalFixed + totalTambahan;
    const isHijau = rpdBerjalanJumlah !== 0
        ? (totalSp2dTambahan >= rpdBerjalanJumlah * 0.95 && totalSp2dTambahan <= rpdBerjalanJumlah * 1.05)
        : totalSp2dTambahan === 0;

    return { sisa, isHijau };
}

function renderMonitoringRpdBerjalan(data) {
    const rpdBerjalan = data.rpdBerjalan || { rowIndex: null, uraian: 'RPD Berjalan', jumlah: 0 };
    const sp2d = data.sp2d || { rowIndex: null, uraian: 'SP2D', jumlah: 0 };
    const kekurangan = data.kekurangan || { rowIndex: null, uraian: 'Kekurangan', jumlah: 0 };
    const fixed5 = data.fixed5 || { rowIndex: null, uraian: '', jumlah: 0 };
    const fixed6 = data.fixed6 || { rowIndex: null, uraian: '', jumlah: 0 };
    const fixed7 = data.fixed7 || { rowIndex: null, uraian: '', jumlah: 0 };
    const fixed8 = data.fixed8 || { rowIndex: null, uraian: '', jumlah: 0 };
    const rows = data.rows || [];
    const totalFixed = (Number(fixed5.jumlah) || 0) + (Number(fixed6.jumlah) || 0) + (Number(fixed7.jumlah) || 0) + (Number(fixed8.jumlah) || 0);
    const totalTambahan = rows.reduce((sum, r) => sum + (parseFloat(r.jumlah) || 0), 0);
    const sisa = kekurangan.jumlah - totalFixed - totalTambahan;
    const totalSp2dTambahan = (Number(sp2d.jumlah) || 0) + totalFixed + totalTambahan;
    const rpdBerjalanJumlah = Number(rpdBerjalan.jumlah) || 0;
    const isHijau = rpdBerjalanJumlah !== 0
        ? (totalSp2dTambahan >= rpdBerjalanJumlah * 0.95 && totalSp2dTambahan <= rpdBerjalanJumlah * 1.05)
        : totalSp2dTambahan === 0;
    const admin = isAdminUser();

    return `
        <div class="flex items-center justify-between mb-2">
            <h3 class="font-semibold text-slate-700 text-base">Monitoring RPD Berjalan</h3>
        </div>
        <p class="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-4">
            <i class="fa-solid fa-circle-info mr-1"></i>Hanya admin yang dapat menambah, mengubah, dan menghapus data pada tabel ini.
        </p>
        <div class="overflow-x-auto">
            <table class="w-full text-sm" id="table-rpd-berjalan">
                <thead>
                    <tr class="text-left text-slate-400 border-b border-slate-100">
                        <th class="py-2 pr-2 font-medium">Uraian</th>
                        <th class="py-2 pr-2 font-medium text-right w-40">Nilai</th>
                        <th class="py-2 pl-2 font-medium text-center w-28">Aksi</th>
                    </tr>
                </thead>
                <tbody id="tbody-rpd-berjalan">
                    ${renderRpdRowUtama(rpdBerjalan, admin)}
                    ${renderRpdRowReadonly(sp2d)}
                    ${renderRpdRowReadonly(kekurangan)}
                    ${renderRpdRowReadonly(fixed5)}
                    ${renderRpdRowReadonly(fixed6)}
                    ${renderRpdRowReadonly(fixed7)}
                    ${renderRpdRowReadonly(fixed8)}
                    ${rows.map(r => renderRpdRowTambahan(r, admin)).join('')}
                    ${admin ? `
                    <tr id="row-rpd-tambah">
                        <td colspan="3" class="pt-2 pb-1 text-center">
                            <button onclick="tambahRowRpdBerjalan()" class="text-sky-600 hover:text-sky-700 text-sm font-semibold" title="Tambah baris">
                                <i class="fa-solid fa-plus"></i> Tambah Data
                            </button>
                        </td>
                    </tr>` : ''}
                </tbody>
            </table>
        </div>
        <div class="mt-4 pt-4 border-t border-slate-200" id="summary-rpd-berjalan">
            ${renderRpdSisa(sisa, isHijau)}
        </div>
    `;
}

// Baris "RPD Berjalan" (baris 2) - satu-satunya baris tetap yang bisa diedit lewat toggle Ubah/Simpan (khusus admin)
function renderRpdRowUtama(row, admin) {
    if (rpdEditModeUtama && admin) {
        return `
        <tr class="border-b border-slate-100 bg-sky-50/40" data-row="${row.rowIndex}" data-fixed="utama">
            <td class="py-1.5 pr-2">
                <input type="text" id="input-rpd-utama-uraian" value="${escapeHtml(row.uraian)}"
                    class="w-full border-none bg-white rounded px-1.5 py-1 text-slate-700 outline-none ring-1 ring-sky-200">
            </td>
            <td class="py-1.5 pr-2">
                <input type="text" inputmode="numeric" id="input-rpd-utama-jumlah" value="${formatAngka(row.jumlah)}"
                    class="w-full text-right border-none bg-white rounded px-1.5 py-1 text-slate-700 outline-none ring-1 ring-sky-200"
                    onfocus="this.value = (parseFloat(this.value.replace(/\\./g,'').replace(/,/g,'.')) || 0)"
                    onblur="this.value = formatAngka(this.value.replace(/\\./g,'').replace(/,/g,'.'))">
            </td>
            <td class="py-1.5 pl-2 text-center">
                <button onclick="simpanRpdBerjalanUtama()" class="text-emerald-600 hover:text-emerald-700 text-xs font-semibold hover:underline">Simpan</button>
            </td>
        </tr>`;
    }
    return `
    <tr class="border-b border-slate-100" data-row="${row.rowIndex}" data-fixed="utama">
        <td class="py-1.5 pr-2 text-slate-700 font-medium">${escapeHtml(row.uraian) || 'RPD Berjalan'}</td>
        <td class="py-1.5 pr-2 text-right text-slate-700">${formatAngka(row.jumlah)}</td>
        <td class="py-1.5 pl-2 text-center">
            <span class="text-slate-300">—</span>
        </td>
    </tr>`;
}

// Baris SP2D / Kekurangan (baris 3 & 4) - read-only, formula otomatis di sheet
function renderRpdRowReadonly(row) {
    return `
    <tr class="border-b border-slate-100" data-row="${row.rowIndex}" data-fixed="readonly">
        <td class="py-1.5 pr-2 text-slate-700 font-medium">${escapeHtml(row.uraian)}</td>
        <td class="py-1.5 pr-2 text-right text-slate-700">${formatAngka(row.jumlah)}</td>
        <td class="py-1.5 pl-2 text-center text-slate-300">—</td>
    </tr>`;
}

// Baris tambahan (baris 9-20) - bebas diedit inline & dihapus, khusus admin.
// Untuk non-admin ditampilkan read-only (tanpa input/tombol hapus).
// Semua baris tambahan (di bawah baris Kekurangan) diberi warna latar kuning
// agar mudah dibedakan dari baris tetap (RPD Berjalan / SP2D / Kekurangan) di atasnya.
// Nilai ditampilkan dengan format ribuan (mis. 26.650.000) selaras dengan baris RPD Berjalan/SP2D/Kekurangan
// di atasnya. Saat input difokus, format ribuan dilepas dulu supaya gampang diketik ulang; saat blur,
// nilai diparse ulang jadi angka lalu diformat lagi.
function renderRpdRowTambahan(row, admin) {
    if (!admin) {
        return `
        <tr class="border-b border-slate-100 bg-yellow-50" data-row="${row.rowIndex}" data-fixed="tambahan">
            <td class="py-1.5 pr-2 text-slate-700">${escapeHtml(row.uraian)}</td>
            <td class="py-1.5 pr-2 text-right text-slate-700">${formatAngka(row.jumlah)}</td>
            <td class="py-1.5 pl-2 text-center text-slate-300">—</td>
        </tr>`;
    }
    return `
    <tr class="border-b border-slate-100 bg-yellow-50" data-row="${row.rowIndex}" data-fixed="tambahan">
        <td class="py-1.5 pr-2">
            <input type="text" value="${escapeHtml(row.uraian)}" placeholder="Uraian..."
                class="w-full border-none bg-transparent focus:bg-yellow-100 rounded px-1.5 py-1 text-slate-700 outline-none focus:ring-1 focus:ring-sky-200"
                onchange="updateRpdBerjalanRow(${row.rowIndex}, 'uraian', this.value)">
        </td>
        <td class="py-1.5 pr-2">
            <input type="text" inputmode="numeric" value="${formatAngka(row.jumlah)}" placeholder="0"
                class="w-full text-right border-none bg-transparent focus:bg-yellow-100 rounded px-0 py-1 text-slate-700 outline-none focus:ring-1 focus:ring-sky-200"
                onfocus="this.value = (parseFloat(this.value.replace(/\\./g,'').replace(/,/g,'.')) || 0)"
                onblur="this.value = formatAngka(this.value.replace(/\\./g,'').replace(/,/g,'.'))"
                onchange="updateRpdBerjalanRow(${row.rowIndex}, 'jumlah', this.value.replace(/\\./g,'').replace(/,/g,'.'))">
        </td>
        <td class="py-1.5 pl-2 text-center">
            <button onclick="hapusRpdBerjalanRow(${row.rowIndex})" class="text-red-400 hover:text-red-600" title="Hapus baris">
                <i class="fa-solid fa-trash"></i>
            </button>
        </td>
    </tr>`;
}

function renderRpdSisa(sisa, isHijau) {
    return `
        <div class="flex justify-between items-center bg-slate-50 rounded-lg px-4 py-3">
            <span class="font-semibold text-slate-700">Sisa</span>
            <span class="font-bold text-lg ${isHijau ? 'text-emerald-600' : 'text-red-500'}">${formatAngka(sisa)}</span>
        </div>
    `;
}

function refreshRpdSummaryUI() {
    const summaryEl = document.getElementById('summary-rpd-berjalan');
    if (!summaryEl || !rpdBerjalanCache) return;
    const { sisa, isHijau } = hitungStatusSisaRpdBerjalan();
    summaryEl.innerHTML = renderRpdSisa(sisa, isHijau);
}

// --- Baris "RPD Berjalan" (utama): toggle mode edit Ubah/Simpan ---

function mulaiUbahRpdBerjalanUtama() {
    if (!isAdminUser()) return; // jaga-jaga: hanya admin yang boleh masuk mode edit
    rpdEditModeUtama = true;
    const tr = document.querySelector('#tbody-rpd-berjalan tr[data-fixed="utama"]');
    if (tr && rpdBerjalanCache) {
        tr.outerHTML = renderRpdRowUtama(rpdBerjalanCache.rpdBerjalan, true);
    }
}

async function simpanRpdBerjalanUtama() {
    if (!isAdminUser()) return;
    const uraianInput = document.getElementById('input-rpd-utama-uraian');
    const jumlahInput = document.getElementById('input-rpd-utama-jumlah');
    const uraian = uraianInput ? uraianInput.value : '';
    const jumlah = jumlahInput ? (parseFloat(String(jumlahInput.value).replace(/\./g, '').replace(/,/g, '.')) || 0) : 0;

    try {
        await apiPost({ action: 'updateRpdBerjalanUtama', uraian, jumlah });
        if (rpdBerjalanCache && rpdBerjalanCache.rpdBerjalan) {
            rpdBerjalanCache.rpdBerjalan.uraian = uraian;
            rpdBerjalanCache.rpdBerjalan.jumlah = jumlah;
        }
        rpdEditModeUtama = false;
        const tr = document.querySelector('#tbody-rpd-berjalan tr[data-fixed="utama"]');
        if (tr) tr.outerHTML = renderRpdRowUtama(rpdBerjalanCache.rpdBerjalan, true);
        refreshRpdSummaryUI();
    } catch (e) {
        console.error('Gagal menyimpan RPD Berjalan:', e);
        alert(e.message || 'Gagal menyimpan perubahan.');
    }
}

// --- Baris tambahan: tambah / edit / hapus ---

async function tambahRowRpdBerjalan() {
    if (!isAdminUser()) return;
    const tbody = document.getElementById('tbody-rpd-berjalan');
    const tombolTambahRow = document.getElementById('row-rpd-tambah');
    if (!tbody || !tombolTambahRow) return;

    try {
        const newRow = await apiPost({ action: 'addRpdBerjalanRow', uraian: '', jumlah: 0 });
        if (!newRow || typeof newRow.rowIndex === 'undefined') {
            throw new Error('Respons baris baru dari server tidak valid');
        }
        if (!rpdBerjalanCache) rpdBerjalanCache = { rows: [] };
        if (!Array.isArray(rpdBerjalanCache.rows)) rpdBerjalanCache.rows = [];
        rpdBerjalanCache.rows.push(newRow);

        tombolTambahRow.insertAdjacentHTML('beforebegin', renderRpdRowTambahan(newRow, true));
        refreshRpdSummaryUI();

        const newTr = tbody.querySelector(`tr[data-row="${newRow.rowIndex}"][data-fixed="tambahan"]`);
        if (newTr) {
            const firstInput = newTr.querySelector('input[type="text"]');
            if (firstInput) firstInput.focus();
        }
    } catch (e) {
        console.error('Gagal menambah baris RPD Berjalan:', e);
        alert(e.message || 'Gagal menambah baris baru.');
    }
}

async function updateRpdBerjalanRow(rowIndex, field, value) {
    if (!isAdminUser()) return;
    try {
        await apiPost({ action: 'updateRpdBerjalanRow', rowIndex, field, value });
        if (rpdBerjalanCache && Array.isArray(rpdBerjalanCache.rows)) {
            const row = rpdBerjalanCache.rows.find(r => r.rowIndex === rowIndex);
            if (row) row[field] = field === 'jumlah' ? (parseFloat(value) || 0) : value;
        }
        refreshRpdSummaryUI();
    } catch (e) {
        console.error('Gagal update baris RPD Berjalan:', e);
        alert(e.message || 'Gagal menyimpan perubahan.');
    }
}

async function hapusRpdBerjalanRow(rowIndex) {
    if (!isAdminUser()) return;
    if (!confirm('Hapus baris ini?')) return;
    try {
        await apiPost({ action: 'deleteRpdBerjalanRow', rowIndex });

        // Backend menggeser baris-baris di bawahnya ke atas supaya tidak ada celah,
        // jadi cara paling aman & konsisten di sisi frontend adalah reload ulang data card ini.
        const freshData = await fetchRpdBerjalanData();
        const card = document.getElementById('card-rpd-berjalan');
        if (card) card.innerHTML = renderMonitoringRpdBerjalan(freshData);
    } catch (e) {
        console.error('Gagal menghapus baris RPD Berjalan:', e);
        alert(e.message || 'Gagal menghapus baris.');
    }
}

// Card: Daftar Akun Yang Belum Tercapai Realisasi Sesuai Waktu
// Data dikirim backend (getAkunBelumRealisasiData) berbentuk:
// { bulanSekarang, faktorBulan, data: [ { seksi, items: [ {kode, uraian, pagu, blokir, realisasi, target, selisih} ] } ] }
function renderAkunBelumRealisasi(akunData) {
    const header = `
        <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-slate-700 text-base">Daftar Akun Yang Belum Tercapai Realisasi Sesuai Waktu</h3>
            ${akunData ? `<span class="text-xs text-slate-400">Target s.d Bulan ke-${akunData.faktorBulan}</span>` : ''}
        </div>
    `;

    if (!akunData || !akunData.data || akunData.data.length === 0) {
        return `${header}<div class="text-sm text-slate-400 text-center py-6">✅ Semua akun sudah sesuai target realisasi bulan berjalan.</div>`;
    }

    const body = `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 max-h-[28rem] overflow-y-auto pr-2 custom-scrollbar">
            ${akunData.data.map(grp => `
                <div>
                    <div class="text-sm font-bold text-slate-600 uppercase tracking-wide mb-2">
                        ${grp.seksi} <span class="text-slate-400 font-normal normal-case">(${grp.items.length} akun)</span>
                    </div>
                    <div class="space-y-2">
                        ${grp.items.map(it => `
                            <div class="border border-slate-100 rounded-lg p-3 bg-slate-50/60">
                                <div class="flex justify-between items-start gap-2">
                                    <div class="text-xs font-mono text-slate-500 break-all">
                                        ${it.kode}
                                        <button onclick="bukaDetilAkun('${it.kode}')" class="ml-1 text-xs font-semibold text-sky-600 hover:underline">Detil</button>
                                    </div>
                                    <div class="text-xs font-semibold text-red-500 whitespace-nowrap">-${Math.round(it.selisih).toLocaleString()}</div>
                                </div>
                                <div class="text-sm text-slate-700 mt-1">${it.uraian}</div>
                                <div class="flex justify-between text-xs text-slate-500 mt-2">
                                    <span>Realisasi: <b class="text-slate-700">${Math.round(it.realisasi).toLocaleString()}</b></span>
                                    <span>Target: <b class="text-slate-700">${Math.round(it.target).toLocaleString()}</b></span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    return header + body;
}


// Buka halaman POK lewat router (navigate() di router.js sudah nunggu initPokPage()+loadPokData()
// selesai sebelum resolve), lalu isi search box (#searchPok) dan manfaatkan searchPok() yang sudah
// ada di pok.js untuk expand baris + scroll otomatis ke akun yang dimaksud.
async function bukaDetilAkun(kode) {
    if (typeof window.navigate !== 'function') {
        console.error('Fungsi navigate() dari router.js tidak ditemukan.');
        return;
    }

    await window.navigate('pok');

    const searchBox = document.getElementById('searchPok');
    if (!searchBox) {
        console.error('Search box POK (#searchPok) tidak ditemukan setelah navigasi ke halaman POK.');
        return;
    }

    searchBox.value = kode;
    if (typeof window.searchPok === 'function') {
        window.searchPok(); // sudah handle expand kode + buka grup seksi + scrollIntoView
    }
}

window.initDashboardPage = initDashboardPage;

// ============================================================
// Global search (di atas kartu-kartu dashboard) — cari kegiatan di sheet
// Data_Kegiatan_2026, lalu tampilkan hasilnya di popup yang identik dengan
// halaman Kegiatan (lihat dashboard-search.js untuk isi popup-nya).
// ============================================================
function bindGlobalSearchBar() {
    const box = document.getElementById('dash-globalSearchBox');
    const btn = document.getElementById('dash-btnGlobalSearch');
    if (!box || !btn) return;

    const runGlobalSearch = () => {
        const term = box.value.trim();
        if (!term) {
            alert('Masukkan kata kunci pencarian terlebih dahulu.');
            return;
        }
        if (typeof window.bukaPencarianKegiatanGlobal === 'function') {
            window.bukaPencarianKegiatanGlobal(term);
        } else {
            console.error('bukaPencarianKegiatanGlobal() tidak ditemukan — pastikan dashboard-search.js dimuat.');
        }
    };

    btn.onclick = runGlobalSearch;
    box.onkeydown = (e) => { if (e.key === 'Enter') runGlobalSearch(); };
}
