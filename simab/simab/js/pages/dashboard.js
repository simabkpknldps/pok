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

        if (k.tgl_mulai === todayStr) {
            kegiatanHariIni.push(k);
        }

        if (isPerjadinMak(k.mak)) {
            const nama = String(k.pelaksana || '').trim();
            if (nama) perjadinCount[nama] = (perjadinCount[nama] || 0) + 1;

            const d = new Date(k.tgl_mulai);
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

// ============================================================
// TABEL RPD BERJALAN (di atas grafik Realisasi Perjadin)
// Baris 1-7: TETAP, nilainya SELALU dihitung LIVE (tidak pernah disimpan).
// Baris 8+: manual, tersimpan di tabel 'rpd_berjalan' (kolom uraian+jumlah),
// bisa ditambah/diubah/dihapus lewat UI.
// ============================================================
function computeRpdBerjalanData(kegiatanRows, rpdRows, rpdBerjalanRows) {
    const currentMonth = new Date().getMonth() + 1; // 1-12

    const rpdRow = rpdRows.find(r => Number(r.id) === currentMonth);
    const rpdBerjalan = rpdRow ? Number(rpdRow.nilai) || 0 : 0;

    let sudahSp2d = 0, prosesRM = 0, prosesPNBP = 0, lpt = 0, terlaksana = 0;

    kegiatanRows.forEach(k => {
        const jumlah = Number(k.jumlah) || 0;
        const uraian = String(k.uraian || '');

        // Baris 2: sudah SP2D ATAU sudah ada nomor SPM, bulan berjalan
        // (cek tgl_sp2d, fallback tgl_bayar kalau tgl_sp2d kosong).
        if (k.tgl_sp2d || k.nomor_spm) {
            const tglCek = k.tgl_sp2d || k.tgl_bayar;
            if (tglCek) {
                const d = new Date(tglCek);
                if (!isNaN(d.getTime()) && d.getMonth() + 1 === currentMonth) sudahSp2d += jumlah;
            }
        }

        // Baris 4-7 (semua baris di bawah Deviasi RPD): TANPA filter tanggal/
        // bulan sama sekali — cuma baris 1 (RPD Berjalan) & 2 (Sudah SP2D) yg
        // pakai filter bulan berjalan.
        if (k.status === 'Terbayar' && uraian.includes('(RM)')) prosesRM += jumlah;
        if (k.status === 'Terbayar' && uraian.includes('(PNBP)')) prosesPNBP += jumlah;
        if (k.status === 'LPT') lpt += jumlah;
        if (k.status === 'Terlaksana') terlaksana += jumlah;
    });

    const deviasiRpd = rpdBerjalan - sudahSp2d;

    const fixedRows = [
        { id: '1', uraian: 'RPD Berjalan', jumlah: rpdBerjalan },
        { id: '2', uraian: 'Sudah SP2D', jumlah: sudahSp2d },
        { id: '3', uraian: 'Deviasi RPD', jumlah: deviasiRpd },
        { id: '4', uraian: 'Kegiatan Proses Sakti (RM)', jumlah: prosesRM },
        { id: '5', uraian: 'Kegiatan Proses Sakti (PNBP)', jumlah: prosesPNBP },
        { id: '6', uraian: 'Kegiatan LPT', jumlah: lpt },
        { id: '7', uraian: 'Kegiatan Terlaksana', jumlah: terlaksana }
    ];

    // Baris manual = semua baris di tabel rpd_berjalan yang id-nya BUKAN "1".."7".
    const customRows = rpdBerjalanRows
        .filter(r => !['1', '2', '3', '4', '5', '6', '7'].includes(String(r.id)))
        .map(r => ({ id: r.id, uraian: r.uraian || '', jumlah: Number(r.jumlah) || 0 }));

    // Total Akhir = Deviasi (baris 3) DIKURANGI SEMUA baris di bawahnya —
    // itu baris 4,5,6,7 (Proses Sakti RM/PNBP, LPT, Terlaksana) DAN semua
    // baris manual (8+), bukan cuma baris manual saja.
    const totalAkhir = deviasiRpd - prosesRM - prosesPNBP - lpt - terlaksana - customRows.reduce((a, r) => a + r.jumlah, 0);
    const persenTerhadapRpd = rpdBerjalan ? (totalAkhir / rpdBerjalan * 100) : 0;

    return { fixedRows, customRows, totalAkhir, persenTerhadapRpd, rpdBerjalan };
}

async function initDashboardPage() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    container.innerHTML = `<div class="flex justify-center mt-10"><i class="fa-solid fa-spinner fa-spin text-sky-600 text-2xl"></i></div>`;

    try {
        await waitSupabaseAuthReady();

        // 1x baca tabel kegiatan + pok + rpd + rpd_berjalan, dijalankan bareng.
        // sbFetchAll dipakai (bukan select('*') polos) supaya tidak kena limit
        // 1000 baris default Supabase/PostgREST.
        const [kegiatanRows, pokRows, rpdRows, rpdBerjalanRows] = await Promise.all([
            sbFetchAll('kegiatan'),
            sbFetchAll('pok'),
            sbFetchAll('rpd'),
            sbFetchAll('rpd_berjalan')
        ]);

        // Cache dipakai juga oleh pok.js (popup Detil/Rekam/Pelaksana) supaya
        // TIDAK perlu baca ulang tabel kegiatan lagi kalau user lanjut buka
        // halaman POK sesudah ini dalam sesi yang sama.
        window.kegiatanRowsCache = kegiatanRows;

        const data = computeDashboardData(kegiatanRows, pokRows);
        const rpdBerjalanData = computeRpdBerjalanData(kegiatanRows, rpdRows, rpdBerjalanRows);
        container.innerHTML = buildDashboardHtml(data, rpdBerjalanData);
        initCharts(data);
        bindGlobalSearchBar();
        bindRpdBerjalanEvents();
    } catch (e) {
        console.error('Dashboard error:', e);
        const errorMsg = e.message || 'Gagal memuat dashboard';
        container.innerHTML = `<div class="text-center text-red-500 mt-10">❌ ${errorMsg}</div>`;
    }
}

function buildDashboardHtml(data, rpdBerjalanData) {
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
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                ${renderRpdBerjalanTable(rpdBerjalanData)}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 class="font-semibold text-slate-700 mb-4">Grafik Realisasi Perjalanan Dinas (Rp)</h3><canvas id="chartRp"></canvas></div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 class="font-semibold text-slate-700 mb-4">Grafik Realisasi Perjalanan Dinas (Frek)</h3><canvas id="chartFrek"></canvas></div>
            </div>
        </div>
    `;
}

function renderRpdBerjalanTable(d) {
    const persen = d.persenTerhadapRpd;
    const warnaTotal = (persen >= -5 && persen <= 5) ? 'text-green-600' : 'text-red-600';

    const fixedRowsHtml = d.fixedRows.map(r => `
        <tr class="border-b border-slate-100">
            <td class="p-2.5">${escapeHtml(r.uraian)}</td>
            <td class="p-2.5 text-right">${formatAngka(r.jumlah)}</td>
            <td class="p-2.5 text-center text-slate-300">-</td>
        </tr>
    `).join('');

    const customRowsHtml = d.customRows.map(r => `
        <tr class="border-b border-slate-100" data-id="${r.id}">
            <td class="p-2.5 dash-rpdb-uraian">${escapeHtml(r.uraian)}</td>
            <td class="p-2.5 text-right dash-rpdb-jumlah">${formatAngka(r.jumlah)}</td>
            <td class="p-2.5 text-center">
                <button class="dash-rpdb-btnEdit text-sky-600 hover:text-sky-800 mr-2" title="Ubah"><i class="fa-solid fa-pen"></i></button>
                <button class="dash-rpdb-btnDelete text-red-500 hover:text-red-700" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    return `
        <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-slate-700">RPD Berjalan</h3>
            <button id="dash-rpdb-btnTambah" class="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-lg">
                <i class="fa-solid fa-plus"></i> Tambah Baris
            </button>
        </div>
        <div class="overflow-x-auto border border-slate-200 rounded-xl">
            <table class="w-full text-sm border-collapse">
                <thead class="bg-slate-50">
                    <tr class="text-left text-slate-500">
                        <th class="p-2.5 font-medium">Uraian</th>
                        <th class="p-2.5 font-medium text-right">Jumlah</th>
                        <th class="p-2.5 font-medium text-center w-24">Aksi</th>
                    </tr>
                </thead>
                <tbody id="dash-rpdb-tbody">
                    ${fixedRowsHtml}
                    ${customRowsHtml}
                    <tr class="bg-slate-50 font-semibold">
                        <td class="p-2.5">Total Akhir</td>
                        <td class="p-2.5 text-right ${warnaTotal}">${formatAngka(d.totalAkhir)} <span class="text-xs font-normal">(${persen.toFixed(2)}%)</span></td>
                        <td class="p-2.5"></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function bindRpdBerjalanEvents() {
    const btnTambah = document.getElementById('dash-rpdb-btnTambah');
    if (btnTambah) btnTambah.onclick = () => openRpdBerjalanRowForm();

    document.querySelectorAll('.dash-rpdb-btnEdit').forEach(btn => {
        btn.onclick = () => {
            const tr = btn.closest('tr');
            const id = tr.dataset.id;
            const uraian = tr.querySelector('.dash-rpdb-uraian').textContent;
            const jumlah = tr.querySelector('.dash-rpdb-jumlah').textContent.replace(/\./g, '');
            openRpdBerjalanRowForm({ id, uraian, jumlah });
        };
    });

    document.querySelectorAll('.dash-rpdb-btnDelete').forEach(btn => {
        btn.onclick = () => {
            const tr = btn.closest('tr');
            const id = tr.dataset.id;
            const uraian = tr.querySelector('.dash-rpdb-uraian').textContent;
            hapusRpdBerjalanRow(id, uraian);
        };
    });
}

function openRpdBerjalanRowForm(existing) {
    const isEdit = !!existing;
    const { overlay, popup } = commonOpenOverlay(`
        <h3 class="text-base font-semibold text-sky-700 mb-3">${isEdit ? 'Ubah' : 'Tambah'} Baris RPD Berjalan</h3>
        <div class="space-y-3">
            <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Uraian</label>
                <input id="rpdb-uraian" type="text" value="${isEdit ? escapeHtml(existing.uraian) : ''}" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500">
            </div>
            <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Jumlah</label>
                <input id="rpdb-jumlah" type="text" value="${isEdit ? Number(existing.jumlah).toLocaleString('id-ID') : ''}"
                    oninput="this.value = formatRibuan(this.value)"
                    class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 text-right">
            </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button id="rpdb-cancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="rpdb-save" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
            </button>
        </div>
    `, 'max-w-md');

    popup.querySelector('#rpdb-cancel').onclick = () => overlay.remove();
    popup.querySelector('#rpdb-save').onclick = async function () {
        const btn = this;
        const uraian = popup.querySelector('#rpdb-uraian').value.trim();
        const jumlah = Number(popup.querySelector('#rpdb-jumlah').value.replace(/\./g, '')) || 0;

        if (!uraian) { alert('Uraian tidak boleh kosong.'); return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';
        try {
            await waitSupabaseAuthReady();
            if (isEdit) {
                const { error } = await sb.from('rpd_berjalan').update({ uraian, jumlah }).eq('id', existing.id);
                if (error) throw new Error(error.message);
            } else {
                const { error } = await sb.from('rpd_berjalan').insert({ id: kgGenerateRandomId(10), uraian, jumlah });
                if (error) throw new Error(error.message);
            }
            overlay.remove();
            showToast('Baris berhasil disimpan');
            initDashboardPage();
        } catch (e) {
            alert('Gagal menyimpan: ' + (e.message || e));
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Simpan';
        }
    };
}

async function hapusRpdBerjalanRow(id, uraian) {
    if (!confirm(`Hapus baris "${uraian}"?`)) return;
    try {
        await waitSupabaseAuthReady();
        const { error } = await sb.from('rpd_berjalan').delete().eq('id', id);
        if (error) throw new Error(error.message);
        showToast('Baris berhasil dihapus');
        initDashboardPage();
    } catch (e) {
        alert('Gagal menghapus: ' + (e.message || e));
    }
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
