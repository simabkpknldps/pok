/**
 * Halaman Dashboard
 * -----------------------------------------------------------------------
 * DIROMBAK supaya hemat kuota baca Firestore: dashboard sekarang cuma
 * menyisakan 6 hal (sesuai permintaan) —
 *   1. Search global (popup pencarian kegiatan)
 *   2. Card Belanja Barang  (akun MAK diawali 52)
 *   3. Card Belanja Modal   (akun MAK diawali 53)
 *   4. Card Maksimum Pencairan PNBP (uraian mengandung "(PNBP)" & status "Selesai")
 *   5. Card Kegiatan Hari Ini (tglMulai = hari ini)
 *   6. Card Top 3 Perjadin + Grafik Rp/Frek (MAK mengandung 524111/524113)
 *
 * Semua card di atas DIHITUNG DI BROWSER dari 1x baca koleksi 'kegiatan'
 * + 1x baca koleksi 'pok' (dipakai utk Pagu Belanja Barang/Modal) — bukan
 * lagi banyak action GAS terpisah (getDashboardData/getRpdBerjalanData/
 * getDokumenMonitoringData dihapus total, begitu juga card RPD Berjalan,
 * Monitoring Dokumen, Akun Belum Realisasi, dan Data Per Seksi yang lama).
 *
 * CATATAN soal Card Belanja Barang/Modal: Pagu diambil dari koleksi 'pok'
 * (SUM pagu akun berawalan 52/53), Realisasi dari koleksi 'kegiatan' (SUM
 * jumlah kegiatan yang akun MAK-nya berawalan 52/53).
 * CATATAN soal Card Maksimum Pencairan PNBP: tidak ada angka "Pagu MP" di
 * data yang kita punya sekarang, jadi cuma ditampilkan angka Realisasi-nya
 * saja (bukan persen/sisa seperti 2 card di atas).
 * -----------------------------------------------------------------------
 */


// Ambil segmen 6-digit dari kode MAK (itu adalah kode Akun) — dipakai utk
// menentukan kategori 52 (Belanja Barang) / 53 (Belanja Modal).
function getAkunFromMak(mak) {
    const parts = String(mak || '').split('.');
    return parts.find(p => /^\d{6}$/.test(p)) || '';
}

function isPerjadinMak(mak) {
    const s = String(mak || '');
    return s.includes('524111') || s.includes('524113');
}

// Hitung semua card dari data mentah kegiatan+pok (1x baca masing-masing,
// bukan per-card) — inti dari penghematan baca Firestore di halaman ini.
function computeDashboardData(kegiatanRows, pokRows) {
    let paguBarang = 0, paguModal = 0;
    pokRows.forEach(p => {
        const akun = getAkunFromMak(p.kode);
        if (akun.startsWith('52')) paguBarang += Number(p.pagu) || 0;
        else if (akun.startsWith('53')) paguModal += Number(p.pagu) || 0;
    });

    let realisasiBarang = 0, realisasiModal = 0, realisasiMP = 0;
    const perjadinCount = {};
    const bulanLabel = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const grafikPerBulan = bulanLabel.map(bulan => ({ bulan, rupiah: 0, frekuensi: 0 }));
    const todayStr = new Date().toISOString().split('T')[0];
    const kegiatanHariIni = [];

    kegiatanRows.forEach(k => {
        const jumlah = Number(k.jumlah) || 0;
        const akun = getAkunFromMak(k.mak);
        if (akun.startsWith('52')) realisasiBarang += jumlah;
        else if (akun.startsWith('53')) realisasiModal += jumlah;

        const uraian = String(k.uraian || '');
        if (uraian.includes('(PNBP)') && k.status === 'Selesai') {
            realisasiMP += jumlah;
        }

        if (k.tglMulai === todayStr) {
            kegiatanHariIni.push(k);
        }

        if (isPerjadinMak(k.mak)) {
            const nama = String(k.pelaksana || '').trim();
            if (nama) perjadinCount[nama] = (perjadinCount[nama] || 0) + 1;

            const d = new Date(k.tglMulai);
            if (!isNaN(d.getTime())) {
                grafikPerBulan[d.getMonth()].rupiah += jumlah;
                grafikPerBulan[d.getMonth()].frekuensi += 1;
            }
        }
    });

    const topPerjadin = Object.entries(perjadinCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
        barang: { pagu: paguBarang, realisasi: realisasiBarang, sisa: paguBarang - realisasiBarang, persen: paguBarang ? realisasiBarang / paguBarang : 0 },
        modal: { pagu: paguModal, realisasi: realisasiModal, sisa: paguModal - realisasiModal, persen: paguModal ? realisasiModal / paguModal : 0 },
        mp: { realisasi: realisasiMP },
        kegiatanHariIni,
        topPerjadin,
        grafikPerjadin: grafikPerBulan
    };
}

async function initDashboardPage() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    container.innerHTML = `<div class="flex justify-center mt-10"><i class="fa-solid fa-spinner fa-spin text-sky-600 text-2xl"></i></div>`;

    try {
        await waitFirebaseAuthReady();

        // 1x baca koleksi kegiatan + 1x baca koleksi pok, dijalankan bareng.
        const [kegiatanSnap, pokSnap] = await Promise.all([
            db.collection('kegiatan').get(),
            db.collection('pok').get()
        ]);

        const kegiatanRows = kegiatanSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const pokRows = pokSnap.docs.map(doc => ({ kode: doc.id, ...doc.data() }));

        // Cache dipakai juga oleh pok.js (popup Detil/Rekam/Pelaksana) supaya
        // TIDAK perlu baca ulang koleksi kegiatan lagi kalau user lanjut buka
        // halaman POK sesudah ini dalam sesi yang sama.
        window.kegiatanRowsCache = kegiatanRows;

        const data = computeDashboardData(kegiatanRows, pokRows);
        container.innerHTML = buildDashboardHtml(data);
        initCharts(data);
        bindGlobalSearchBar();
    } catch (e) {
        console.error('Dashboard error:', e);
        const errorMsg = e.message || 'Gagal memuat dashboard';
        container.innerHTML = `<div class="text-center text-red-500 mt-10">❌ ${errorMsg}</div>`;
    }
}

function buildDashboardHtml(data) {
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
                        ${data.kegiatanHariIni.length
                            ? data.kegiatanHariIni.map(item => `<div class="border-b pb-2"><div class="text-sm font-semibold">${escapeHtml(item.uraian)}</div><div class="text-[10px] text-slate-500">${escapeHtml(item.pelaksana)} | ${escapeHtml(item.tujuan)}</div></div>`).join('')
                            : `<div class="text-xs text-slate-400 text-center py-4">Tidak ada kegiatan hari ini.</div>`}
                    </div>
                </div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">${renderTopPerjadin(data.topPerjadin)}</div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 class="font-semibold text-slate-700 mb-4">Grafik Realisasi Perjalanan Dinas (Rp)</h3><canvas id="chartRp"></canvas></div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 class="font-semibold text-slate-700 mb-4">Grafik Realisasi Perjalanan Dinas (Frek)</h3><canvas id="chartFrek"></canvas></div>
            </div>
        </div>
    `;
}

function initCharts(data) {
    const labels = data.grafikPerjadin.map(d => d.bulan);
    new Chart(document.getElementById('chartRp'), { type: 'line', data: { labels, datasets: [{ label: 'Rupiah', data: data.grafikPerjadin.map(d => d.rupiah), borderColor: '#0284c7', tension: 0.3 }] } });
    new Chart(document.getElementById('chartFrek'), { type: 'bar', data: { labels, datasets: [{ label: 'Frekuensi', data: data.grafikPerjadin.map(d => d.frekuensi), backgroundColor: '#0ea5e9' }] } });
}

function renderBelanjaCard(t, d, c) {
    const p = (d.persen * 100).toFixed(2);
    const pBar = Math.min(Number(p), 100);
    return `<div class="mb-2"><h3 class="font-semibold text-slate-700 mb-2">${t}</h3><div class="text-2xl font-bold text-${c}-600 mb-2">${p}%</div><div class="w-full bg-slate-200 rounded-full h-2 mb-4"><div class="bg-${c}-600 h-2 rounded-full" style="width: ${pBar}%"></div></div><div class="text-[11px] text-slate-500">Realisasi: ${formatAngka(d.realisasi)}<br><span class="font-bold text-slate-700">Sisa: ${formatAngka(d.sisa)}</span></div></div>`;
}

function renderMPCard(t, d) {
    return `<div class="mb-2"><h3 class="font-semibold text-slate-700 mb-2">${t}</h3><div class="text-2xl font-bold text-emerald-600 mb-2">${formatAngka(d.realisasi)}</div><div class="text-[11px] text-slate-500">Total realisasi pencairan PNBP berstatus Selesai</div></div>`;
}

function renderTopPerjadin(l) {
    if (!l.length) {
        return `<h3 class="font-semibold text-slate-700 mb-4">Top 3 Perjadin</h3><div class="text-xs text-slate-400 text-center py-4">Belum ada data.</div>`;
    }
    return `<h3 class="font-semibold text-slate-700 mb-4">Top 3 Perjadin</h3><div class="space-y-3">${l.slice(0, 3).map((i, idx) => `<div class="flex items-center justify-between"><div class="text-xs text-slate-600">${idx + 1}. ${escapeHtml(i[0])}</div><div class="text-xs font-bold text-sky-600">${i[1]}x</div></div>`).join('')}</div>`;
}

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

window.initDashboardPage = initDashboardPage;

// ============================================================
// Global search (di atas kartu-kartu dashboard) — cari kegiatan langsung
// dari koleksi Firestore 'kegiatan' (lihat dashboard-search.js untuk isi
// popup-nya, yang meng-reuse logic kegiatan.js apa adanya).
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
