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
function computeDashboardData(kegiatanRows, pokRows, mpPnbpRows) {
    let paguBarang = 0, paguModal = 0;
    pokRows.forEach(p => {
        const akun = getAkunFromMak(p.kode);
        if (akun.startsWith('52')) paguBarang += Number(p.pagu) || 0;
        else if (akun.startsWith('53')) paguModal += Number(p.pagu) || 0;
    });

    // Pagu MP = SUM jumlah semua tahap di tabel mp_pnbp.
    const paguMP = (mpPnbpRows || []).reduce((a, r) => a + (Number(r.jumlah) || 0), 0);

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
        mp: { pagu: paguMP, realisasi: realisasiMP, sisa: paguMP - realisasiMP, persen: paguMP ? realisasiMP / paguMP : 0 },
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

// ============================================================
// TABEL REKAPITULASI SPM (di samping RPD Berjalan)
// Dikelompokkan per Nomor SPM (1 SPM bisa berlaku utk beberapa baris
// kegiatan/pelaksana -> Jumlah dijumlahkan jadi 1 baris rekap per SPM).
// ============================================================
function computeRekapSpmData(kegiatanRows) {
    const grouped = {};
    kegiatanRows.forEach(k => {
        const nomorSpm = String(k.nomor_spm || '').trim();
        if (!nomorSpm) return;
        if (!grouped[nomorSpm]) {
            grouped[nomorSpm] = { nomorSpm, jumlah: 0, tglSp2d: k.tgl_sp2d || '', uraian: k.uraian || '' };
        }
        grouped[nomorSpm].jumlah += Number(k.jumlah) || 0;
        if (!grouped[nomorSpm].tglSp2d && k.tgl_sp2d) grouped[nomorSpm].tglSp2d = k.tgl_sp2d;
    });

    const rows = Object.values(grouped).map(r => {
        const u = r.uraian;
        let jenis = '-';
        if (u.includes('SPBy')) jenis = 'GUP/TUP';
        else if (u.includes('KKP')) jenis = 'GUP KKP';
        else if (u.includes('SPM')) jenis = 'SPM-LS';
        // Buang angka 0 di depan (mis. "0102" -> "102"); tetap "0" kalau
        // isinya cuma nol semua.
        const nomorSpmBersih = r.nomorSpm.replace(/^0+(?=\d)/, '');
        return { nomorSpm: nomorSpmBersih, jenis, jumlah: r.jumlah, tglSp2d: r.tglSp2d };
    });

    // Terbaru (tgl_sp2d) di paling atas.
    rows.sort((a, b) => new Date(b.tglSp2d || 0) - new Date(a.tglSp2d || 0));
    return rows;
}

function renderRekapSpmTable(rows) {
    return `
        <div class="flex items-center justify-between mb-3">
            <h3 class="text-[13px] font-semibold" style="color: var(--label);">Rekapitulasi SPM</h3>
            <span id="dash-spm-count" class="text-[11px]" style="color: var(--label-secondary);">${rows.length} SPM</span>
        </div>
        <input id="dash-spm-search" type="text" placeholder="Cari Nomor SPM..." class="ios-field mb-3" style="font-size: 13px; padding: 0.5rem 0.75rem;">
        <div class="overflow-x-auto rounded-xl flex-1 flex flex-col min-h-0" style="border: 1px solid var(--divider);">
            <div class="overflow-y-auto flex-1 min-h-0">
                <table class="w-full text-[13px] border-collapse">
                    <thead style="background: var(--sidebar-bg);">
                        <tr class="text-left sticky top-0" style="color: var(--label-secondary); background: var(--sidebar-bg);">
                            <th class="p-2.5 font-medium text-[11px] uppercase tracking-wide">Nomor SPM</th>
                            <th class="p-2.5 font-medium text-[11px] uppercase tracking-wide">Jenis</th>
                            <th class="p-2.5 font-medium text-[11px] uppercase tracking-wide text-right">Jumlah</th>
                            <th class="p-2.5 font-medium text-[11px] uppercase tracking-wide text-center whitespace-nowrap">Tgl SP2D</th>
                            <th class="p-2.5 font-medium text-[11px] uppercase tracking-wide text-center w-14">Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="dash-spm-tbody">${renderRekapSpmRows(rows)}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderRekapSpmRows(rows) {
    if (rows.length === 0) {
        return `<tr><td colspan="5" class="p-4 text-center text-[13px]" style="color: var(--label-secondary);">Tidak ada data.</td></tr>`;
    }
    return rows.map(r => `
        <tr style="border-top: 1px solid var(--divider);">
            <td class="p-2.5 font-mono text-[12px]" style="color: var(--label);">${escapeHtml(r.nomorSpm)}</td>
            <td class="p-2.5" style="color: var(--label);">${escapeHtml(r.jenis)}</td>
            <td class="p-2.5 text-right whitespace-nowrap" style="color: var(--label);">${formatAngka(r.jumlah)}</td>
            <td class="p-2.5 text-center whitespace-nowrap" style="color: var(--label-secondary);">${r.tglSp2d || '-'}</td>
            <td class="p-2.5 text-center">
                <button class="dash-spm-btnDetil transition" data-spm="${escapeHtml(r.nomorSpm)}" style="color: var(--ios-blue);" title="Lihat Detil">
                    <i class="fa-solid fa-magnifying-glass text-xs"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function bindRekapSpmEvents(rekapSpmData) {
    document.querySelectorAll('.dash-spm-btnDetil').forEach(btn => {
        btn.onclick = () => bukaPencarianKegiatanGlobal(btn.dataset.spm, true);
    });

    const searchInput = document.getElementById('dash-spm-search');
    if (searchInput) {
        searchInput.oninput = () => {
            const q = searchInput.value.trim().toLowerCase();
            const filtered = q ? rekapSpmData.filter(r => r.nomorSpm.toLowerCase().includes(q)) : rekapSpmData;
            document.getElementById('dash-spm-tbody').innerHTML = renderRekapSpmRows(filtered);
            document.getElementById('dash-spm-count').textContent = `${filtered.length} SPM`;
            document.querySelectorAll('.dash-spm-btnDetil').forEach(btn => {
                btn.onclick = () => bukaPencarianKegiatanGlobal(btn.dataset.spm, true);
            });
        };
    }
}

// Card SPM (kanan) mengikuti tinggi ALAMI card RPD Berjalan (kiri) — SATU
// ARAH, bukan grid stretch biasa (yg 2 arah, siapa lebih tinggi jadi
// patokan keduanya). RPD dibiarkan setinggi kontennya sendiri; SPM dipaksa
// PAS segitu (kontennya sendiri scroll ke dalam kalau datanya lebih banyak
// dari itu). Dipanggil ulang tiap kali Dashboard di-render ulang (mis.
// setelah Tambah/Ubah/Hapus baris RPD), jadi otomatis "ngikutin" kalau
// tinggi RPD berubah.
function syncSpmCardHeight() {
    const rpdCard = document.getElementById('dash-rpd-card');
    const spmCard = document.getElementById('dash-spm-card');
    if (!rpdCard || !spmCard) return;

    spmCard.style.height = 'auto'; // reset dulu biar ukur ulang bersih
    requestAnimationFrame(() => {
        const tinggiRpd = rpdCard.offsetHeight;
        spmCard.style.height = tinggiRpd + 'px';
    });
}

async function initDashboardPage() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    container.innerHTML = `<div class="flex justify-center mt-10"><i class="fa-solid fa-spinner fa-spin text-2xl" style="color: var(--ios-blue);"></i></div>`;

    try {
        await waitSupabaseAuthReady();

        // 1x baca tabel kegiatan + pok + rpd + rpd_berjalan + mp_pnbp, dijalankan bareng.
        // sbFetchAll dipakai (bukan select('*') polos) supaya tidak kena limit
        // 1000 baris default Supabase/PostgREST.
        const [kegiatanRows, pokRows, rpdRows, rpdBerjalanRows, mpPnbpRows] = await Promise.all([
            sbFetchAll('kegiatan'),
            sbFetchAll('pok'),
            sbFetchAll('rpd'),
            sbFetchAll('rpd_berjalan'),
            sbFetchAll('mp_pnbp')
        ]);

        // Cache dipakai juga oleh pok.js (popup Detil/Rekam/Pelaksana) supaya
        // TIDAK perlu baca ulang tabel kegiatan lagi kalau user lanjut buka
        // halaman POK sesudah ini dalam sesi yang sama.
        window.kegiatanRowsCache = kegiatanRows;

        const data = computeDashboardData(kegiatanRows, pokRows, mpPnbpRows);
        const rpdBerjalanData = computeRpdBerjalanData(kegiatanRows, rpdRows, rpdBerjalanRows);
        const rekapSpmData = computeRekapSpmData(kegiatanRows);
        container.innerHTML = buildDashboardHtml(data, rpdBerjalanData, rekapSpmData);
        initCharts(data);
        bindGlobalSearchBar();
        bindRpdBerjalanEvents();
        bindRekapSpmEvents(rekapSpmData);
        syncSpmCardHeight();
    } catch (e) {
        console.error('Dashboard error:', e);
        const errorMsg = e.message || 'Gagal memuat dashboard';
        container.innerHTML = `<div class="text-center mt-10" style="color: var(--ios-red);">❌ ${errorMsg}</div>`;
    }
}

function buildDashboardHtml(data, rpdBerjalanData, rekapSpmData) {
    return `
        <div class="space-y-6">
            <div class="ios-panel p-3.5">
                <div class="flex items-center gap-2">
                    <div class="relative flex-1">
                        <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px]" style="color: var(--label-secondary);"></i>
                        <input id="dash-globalSearchBox" type="text"
                            placeholder="Cari kegiatan (uraian/No ST, pelaksana, tujuan, tanggal, status, atau nomor SPM)..."
                            class="ios-field" style="padding-left: 2.4rem;">
                    </div>
                    <button id="dash-btnGlobalSearch" class="btn-ios flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap">
                        <i class="fa-solid fa-magnifying-glass text-xs"></i> Cari
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div class="ios-panel p-5">${renderBelanjaCard('Belanja Barang', data.barang)}</div>
                <div class="ios-panel p-5">${renderBelanjaCard('Belanja Modal', data.modal)}</div>
                <div class="ios-panel p-5">${renderBelanjaCard('Maksimum Pencairan PNBP', data.mp)}</div>
                <div class="ios-panel p-5 flex flex-col">
                    <h3 class="text-[13px] font-semibold mb-3.5" style="color: var(--label);">Kegiatan Hari Ini</h3>
                    <div class="space-y-3 overflow-y-auto max-h-48 pr-1">
                        ${data.kegiatanHariIni.length
                            ? data.kegiatanHariIni.map(item => `<div class="pb-2.5" style="border-bottom: 1px solid var(--divider);"><div class="text-[13px] font-medium" style="color: var(--label);">${escapeHtml(item.uraian)}</div><div class="text-[10.5px] mt-0.5" style="color: var(--label-secondary);">${escapeHtml(item.pelaksana)} &middot; ${escapeHtml(item.tujuan)}</div></div>`).join('')
                            : `<div class="text-[12.5px] text-center py-4" style="color: var(--label-secondary);">Tidak ada kegiatan hari ini.</div>`}
                    </div>
                </div>
                <div class="ios-panel p-5">${renderTopPerjadin(data.topPerjadin)}</div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div id="dash-rpd-card" class="ios-panel p-5">
                    ${renderRpdBerjalanTable(rpdBerjalanData)}
                </div>
                <div id="dash-spm-card" class="ios-panel p-5 flex flex-col">
                    ${renderRekapSpmTable(rekapSpmData)}
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="ios-panel p-5"><h3 class="text-[13px] font-semibold mb-3.5" style="color: var(--label);">Grafik Realisasi Perjalanan Dinas (Rp)</h3><canvas id="chartRp"></canvas></div>
                <div class="ios-panel p-5"><h3 class="text-[13px] font-semibold mb-3.5" style="color: var(--label);">Grafik Realisasi Perjalanan Dinas (Frek)</h3><canvas id="chartFrek"></canvas></div>
            </div>
        </div>
    `;
}

function renderRpdBerjalanTable(d) {
    const persen = d.persenTerhadapRpd;
    const warnaTotal = (persen >= -5 && persen <= 5) ? 'var(--ios-green)' : 'var(--ios-red)';

    const fixedRowsHtml = d.fixedRows.map(r => `
        <tr style="border-top: 1px solid var(--divider);">
            <td class="p-2.5" style="color: var(--label);">${escapeHtml(r.uraian)}</td>
            <td class="p-2.5 text-right" style="color: var(--label);">${formatAngka(r.jumlah)}</td>
            <td class="p-2.5 text-center" style="color: var(--label-secondary);">-</td>
        </tr>
    `).join('');

    const customRowsHtml = d.customRows.map(r => `
        <tr style="border-top: 1px solid var(--divider);" data-id="${r.id}">
            <td class="p-2.5 dash-rpdb-uraian" style="color: var(--label);">${escapeHtml(r.uraian)}</td>
            <td class="p-2.5 text-right dash-rpdb-jumlah" style="color: var(--label);">${formatAngka(r.jumlah)}</td>
            <td class="p-2.5 text-center whitespace-nowrap">
                <button class="dash-rpdb-btnEdit mr-2 transition" style="color: var(--ios-blue);" title="Ubah"><i class="fa-solid fa-pen text-xs"></i></button>
                <button class="dash-rpdb-btnDelete transition" style="color: var(--ios-red);" title="Hapus"><i class="fa-solid fa-trash text-xs"></i></button>
            </td>
        </tr>
    `).join('');

    return `
        <div class="flex items-center justify-between mb-3.5">
            <h3 class="text-[13px] font-semibold" style="color: var(--label);">RPD Berjalan</h3>
            <button id="dash-rpdb-btnTambah" class="btn-ios flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <i class="fa-solid fa-plus text-[10px]"></i> Tambah Baris
            </button>
        </div>
        <div class="overflow-x-auto rounded-xl" style="border: 1px solid var(--divider);">
            <table class="w-full text-[13px] border-collapse">
                <thead style="background: var(--sidebar-bg);">
                    <tr class="text-left" style="color: var(--label-secondary);">
                        <th class="p-2.5 font-medium text-[11px] uppercase tracking-wide">Uraian</th>
                        <th class="p-2.5 font-medium text-[11px] uppercase tracking-wide text-right">Jumlah</th>
                        <th class="p-2.5 font-medium text-[11px] uppercase tracking-wide text-center w-24">Aksi</th>
                    </tr>
                </thead>
                <tbody id="dash-rpdb-tbody">
                    ${fixedRowsHtml}
                    ${customRowsHtml}
                    <tr style="border-top: 1.5px solid var(--divider); background: var(--sidebar-bg);">
                        <td class="p-2.5 font-semibold" style="color: var(--label);">Total Akhir</td>
                        <td class="p-2.5 text-right font-semibold" style="color: ${warnaTotal};">${formatAngka(d.totalAkhir)} <span class="text-[11px] font-normal">(${persen.toFixed(2)}%)</span></td>
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
        <h3 class="text-[16px] font-semibold mb-3" style="color: var(--label);">${isEdit ? 'Ubah' : 'Tambah'} Baris RPD Berjalan</h3>
        <div class="space-y-3.5">
            <div>
                <label class="ios-label block mb-1.5">Uraian</label>
                <input id="rpdb-uraian" type="text" value="${isEdit ? escapeHtml(existing.uraian) : ''}" class="ios-field">
            </div>
            <div>
                <label class="ios-label block mb-1.5">Jumlah</label>
                <input id="rpdb-jumlah" type="text" value="${isEdit ? Number(existing.jumlah).toLocaleString('id-ID') : ''}"
                    oninput="this.value = formatRibuan(this.value)" class="ios-field text-right">
            </div>
        </div>
        <div class="flex justify-end gap-2 mt-5">
            <button id="rpdb-cancel" class="btn-ios-secondary px-4 py-2 text-sm">Batal</button>
            <button id="rpdb-save" class="btn-ios px-4 py-2 text-sm">
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
    new Chart(document.getElementById('chartRp'), { type: 'line', data: { labels, datasets: [{ label: 'Rupiah', data: data.grafikPerjadin.map(d => d.rupiah), borderColor: '#0071E3', backgroundColor: 'rgba(0,113,227,0.08)', fill: true, tension: 0.3 }] } });
    new Chart(document.getElementById('chartFrek'), { type: 'bar', data: { labels, datasets: [{ label: 'Frekuensi', data: data.grafikPerjadin.map(d => d.frekuensi), backgroundColor: '#0071E3', borderRadius: 4 }] } });
}

function renderBelanjaCard(t, d) {
    const p = (d.persen * 100).toFixed(2);
    const pBar = Math.min(Number(p), 100);
    const warna = pBar >= 90 ? 'var(--ios-amber)' : 'var(--ios-blue)';
    return `<div>
        <h3 class="text-[13px] font-semibold mb-2.5" style="color: var(--label);">${t}</h3>
        <div class="text-[26px] font-semibold leading-none mb-3" style="color: ${warna};">${p}%</div>
        <div class="w-full rounded-full h-1.5 mb-3.5" style="background: var(--field-bg);">
            <div class="h-1.5 rounded-full" style="width: ${pBar}%; background: ${warna};"></div>
        </div>
        <div class="text-[11px] leading-relaxed" style="color: var(--label-secondary);">Realisasi: ${formatAngka(d.realisasi)}<br><span class="font-semibold" style="color: var(--label);">Sisa: ${formatAngka(d.sisa)}</span></div>
    </div>`;
}

function renderTopPerjadin(l) {
    if (!l.length) {
        return `<h3 class="text-[13px] font-semibold mb-3.5" style="color: var(--label);">Top 3 Perjadin</h3><div class="text-[12.5px] text-center py-4" style="color: var(--label-secondary);">Belum ada data.</div>`;
    }
    return `<h3 class="text-[13px] font-semibold mb-3.5" style="color: var(--label);">Top 3 Perjadin</h3><div class="space-y-2.5">${l.slice(0, 3).map((i, idx) => `<div class="flex items-center justify-between"><div class="text-[12.5px]" style="color: var(--label);">${idx + 1}. ${escapeHtml(i[0])}</div><div class="text-[12.5px] font-semibold" style="color: var(--ios-blue);">${i[1]}x</div></div>`).join('')}</div>`;
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
