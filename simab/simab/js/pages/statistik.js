/**
 * HALAMAN STATISTIK — FULL Supabase
 * ------------------
 * Entry point : initStatistikPage()
 * 4 bagian, masing-masing dihitung LIVE di browser dari tabel Supabase:
 *   1. Realisasi Anggaran Bulanan (Belanja Barang 52 & Modal 53)
 *      - Pagu: SUM pok.pagu per akun (52/53)
 *      - Blokir: SUM blokir.nilai utk kode yg akunnya 52/53
 *      - Realisasi per bulan: SUM kegiatan.jumlah per akun, dikelompokkan
 *        per bulan dari kegiatan.tgl_sp2d (konsisten dgn RPD)
 *   2. Monitoring Maksimum Pencairan (MP) — dari tabel 'mp_pnbp' (uraian,
 *      tgl_mp, jumlah=Pagu MP tahap itu). Realisasi = AKUMULASI semua
 *      kegiatan PNBP ("(PNBP)" di uraian) sampai dengan tgl_mp baris itu
 *      (Bruto: pakai tgl_bayar; SP2D: pakai tgl_sp2d & harus sudah terisi).
 *   3. Progres Perjalanan Dinas per Pegawai — dari kegiatan (MAK 524111/
 *      524113), dikelompokkan per pelaksana & per bulan (tgl_mulai).
 *   4. Grafik jumlah kegiatan perjalanan dinas per bulan — sama sumbernya
 *      dgn #3, cuma dihitung total per bulan (bukan per pegawai).
 *
 * Semua tabel yg dibutuhkan (kegiatan, pok, blokir, mp_pnbp) dibaca SEKALI
 * di awal (initStatistikPage), dipakai bareng oleh ke-4 bagian di atas —
 * bukan 4x request terpisah.
 */

let stChartInstance = null;
let stKegiatanRows = [];
let stPokRows = [];
let stBlokirRows = [];
let stMpRows = [];

const ST_BULAN_LABEL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

async function initStatistikPage() {
    const searchInput = document.getElementById('st-searchNama');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = () => stApplyPegawaiFilter();
    }

    const tbody = document.getElementById('st-pegawaiTableBody');
    if (tbody && !tbody.dataset.dblclickBound) {
        tbody.addEventListener('dblclick', (e) => {
            const td = e.target.closest('td[data-bulan-idx]');
            if (!td) return;
            const tr = td.closest('tr');
            const pegawaiIdx = Number(tr.dataset.pegawaiIdx);
            const bulanIdx = Number(td.dataset.bulanIdx);
            stShowBulanListPopup(pegawaiIdx, bulanIdx);
        });
        tbody.dataset.dblclickBound = '1';
    }

    // Baca SEMUA tabel yg dibutuhkan sekali di awal, dipakai bareng ke-4 bagian.
    try {
        await waitSupabaseAuthReady();
        const [kegiatanRows, pokRows, blokirRows, mpRows] = await Promise.all([
            window.kegiatanRowsCache ? Promise.resolve(window.kegiatanRowsCache) : sbFetchAll('kegiatan'),
            sbFetchAll('pok'),
            sbFetchAll('blokir'),
            sbFetchAll('mp_pnbp')
        ]);
        window.kegiatanRowsCache = kegiatanRows;
        stKegiatanRows = kegiatanRows;
        stPokRows = pokRows;
        stBlokirRows = blokirRows;
        stMpRows = mpRows;
    } catch (e) {
        console.error('Gagal memuat data statistik:', e);
        ['st-loading', 'st-pegawaiLoading', 'st-budgetLoading', 'st-mpLoading'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<span class="text-red-500">❌ ${e.message || 'Gagal memuat data'}</span>`;
        });
        return;
    }

    stLoadData();
    stLoadPegawaiData();
    stLoadBudgetData();
    stLoadMPData();
}

window.initStatistikPage = initStatistikPage;

// ============================================
// GRAFIK JUMLAH KEGIATAN PERJALANAN DINAS PER BULAN
// ============================================

function stLoadData() {
    const loadingEl = document.getElementById('st-loading');
    const wrapperEl = document.getElementById('st-chartWrapper');
    if (!loadingEl || !wrapperEl) return;

    const jumlahPerBulan = new Array(12).fill(0);
    stKegiatanRows.forEach(k => {
        if (!isPerjadinMak(k.mak) || !k.tgl_mulai) return;
        const d = new Date(k.tgl_mulai);
        if (isNaN(d.getTime())) return;
        jumlahPerBulan[d.getMonth()]++;
    });

    const totalKegiatan = jumlahPerBulan.reduce((a, b) => a + b, 0);
    document.getElementById('st-totalKegiatan').textContent = totalKegiatan.toLocaleString('id-ID');

    const maxVal = Math.max(...jumlahPerBulan);
    const maxIdx = jumlahPerBulan.indexOf(maxVal);
    document.getElementById('st-bulanTertinggi').textContent = maxVal > 0 ? `${ST_BULAN_LABEL[maxIdx]} (${maxVal})` : '-';

    const rataRata = totalKegiatan > 0 ? (totalKegiatan / 12).toFixed(1) : '0';
    document.getElementById('st-rataRata').textContent = rataRata;

    stRenderChart(ST_BULAN_LABEL, jumlahPerBulan);

    loadingEl.classList.add('hidden');
    wrapperEl.classList.remove('hidden');
}

function stRenderChart(labels, data) {
    const canvas = document.getElementById('st-chartKegiatan');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (stChartInstance) stChartInstance.destroy();

    stChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jumlah Kegiatan',
                data: data,
                borderColor: '#0284c7',
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#0284c7',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} kegiatan` } }
            },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

// ============================================
// TABEL PROGRES PERJALANAN DINAS PER PEGAWAI
// ============================================

let stPegawaiRows = [];

function stLoadPegawaiData() {
    const loadingEl = document.getElementById('st-pegawaiLoading');
    const wrapperEl = document.getElementById('st-pegawaiTableWrapper');
    if (!loadingEl || !wrapperEl) return;

    const byPegawai = {};
    stKegiatanRows.forEach(k => {
        if (!isPerjadinMak(k.mak)) return;
        const nama = String(k.pelaksana || '').trim();
        if (!nama || !k.tgl_mulai) return;
        const d = new Date(k.tgl_mulai);
        if (isNaN(d.getTime())) return;
        const bulanIdx = d.getMonth();

        if (!byPegawai[nama]) {
            byPegawai[nama] = {
                nama,
                bulan: Array.from({ length: 12 }, () => ({ selesai: 0, total: 0, rows: [] })),
                total: 0
            };
        }
        const b = byPegawai[nama].bulan[bulanIdx];
        b.total++;
        if (k.status === 'Selesai') b.selesai++;
        b.rows.push({
            idKegiatan: k.id, mak: k.mak, uraian: k.uraian, pelaksana: k.pelaksana,
            tujuan: k.tujuan, tglSt: k.tgl_st, tglMulai: k.tgl_mulai, tglSelesai: k.tgl_selesai,
            tglLPT: k.tgl_lpt, tglBayar: k.tgl_bayar, jumlah: k.jumlah, userLogin: k.user,
            status: k.status, tglSP2D: k.tgl_sp2d, nomorSPM: k.nomor_spm
        });
        byPegawai[nama].total++;
    });

    stPegawaiRows = Object.values(byPegawai)
        .sort((a, b) => a.nama.localeCompare(b.nama))
        .map((r, i) => ({ ...r, _idx: i }));

    stApplyPegawaiFilter();

    loadingEl.classList.add('hidden');
    wrapperEl.classList.remove('hidden');
}

function stApplyPegawaiFilter() {
    const searchInput = document.getElementById('st-searchNama');
    const keyword = (searchInput?.value || '').trim().toLowerCase();

    const filtered = keyword
        ? stPegawaiRows.filter(r => String(r.nama || '').toLowerCase().includes(keyword))
        : stPegawaiRows;

    stRenderPegawaiTable(filtered);
}

function stBuildProgressCell(selesai, total) {
    if (!total) {
        return `<div class="flex justify-center text-slate-300 text-xs">-</div>`;
    }
    const persen = Math.round((selesai / total) * 100);
    const warna = selesai === total ? 'bg-green-500' : 'bg-amber-400';
    return `
        <div class="flex flex-col items-center gap-1 w-full mx-auto">
            <div class="w-full h-2.5 bg-slate-300 rounded-full overflow-hidden">
                <div class="h-full ${warna} rounded-full" style="width:${persen}%"></div>
            </div>
            <span class="text-[11px] text-slate-500">${selesai}/${total}</span>
        </div>`;
}

function stRenderPegawaiTable(rows) {
    const tbody = document.getElementById('st-pegawaiTableBody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="text-center text-slate-400 py-6">Tidak ada data</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => `
        <tr class="border-t border-slate-100 hover:bg-slate-50" data-pegawai-idx="${r._idx}">
            <td class="p-2.5 font-medium text-slate-700 sticky left-0 bg-white break-words align-top">${r.nama}</td>
            ${r.bulan.map((b, bIdx) => `<td class="p-2.5 ${b.total ? 'cursor-pointer' : ''}" data-bulan-idx="${bIdx}" title="${b.total ? 'Klik dua kali untuk detail' : ''}">${stBuildProgressCell(b.selesai, b.total)}</td>`).join('')}
            <td class="p-2.5 text-center font-semibold text-sky-700 align-top">${r.total}</td>
        </tr>
    `).join('');
}

// ============================================
// POPUP DAFTAR KEGIATAN PER BULAN (level 1)
// ============================================

function stFormatDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function stStatusBadge(status) {
    const map = {
        'Selesai': 'bg-green-100 text-green-700',
        'Terbayar': 'bg-sky-100 text-sky-700',
        'LPT': 'bg-amber-100 text-amber-700'
    };
    const cls = map[status] || 'bg-slate-100 text-slate-600';
    return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${cls}">${status || '-'}</span>`;
}

function stShowBulanListPopup(pegawaiIdx, bulanIdx) {
    const pegawai = stPegawaiRows[pegawaiIdx];
    if (!pegawai) return;

    const bulanData = pegawai.bulan[bulanIdx];
    if (!bulanData || !bulanData.rows || bulanData.rows.length === 0) return;

    const itemsHtml = bulanData.rows.map((r, idx) => `
        <tr class="border-t border-slate-100">
            <td class="p-2 text-slate-700">${r.uraian || '-'}</td>
            <td class="p-2 text-slate-700 whitespace-nowrap">${stFormatDate(r.tglMulai)}</td>
            <td class="p-2 text-slate-700 text-right whitespace-nowrap">Rp ${Number(r.jumlah || 0).toLocaleString('id-ID')}</td>
            <td class="p-2 text-center">${stStatusBadge(r.status)}</td>
            <td class="p-2 text-center">
                <button class="st-btn-aksi text-sky-600 hover:text-sky-800" data-pegawai-idx="${pegawaiIdx}" data-bulan-idx="${bulanIdx}" data-item-idx="${idx}" title="Detil">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
            </td>
        </tr>
    `).join('');

    const { overlay, popup } = window.commonOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base mb-1">Daftar Kegiatan</h3>
        <p class="text-center text-sm text-slate-500 mb-2">${pegawai.nama} — ${ST_BULAN_LABEL[bulanIdx]}</p>
        <div class="overflow-x-auto max-h-[55vh] overflow-y-auto border border-slate-200 rounded-xl">
            <table class="w-full border-collapse text-[13px]">
                <thead class="bg-slate-100 sticky top-0">
                    <tr>
                        <th class="p-2 text-left font-semibold">Nomor ST</th>
                        <th class="p-2 text-left font-semibold">Tgl Mulai</th>
                        <th class="p-2 text-right font-semibold">Jumlah</th>
                        <th class="p-2 text-center font-semibold">Status</th>
                        <th class="p-2 text-center font-semibold">Aksi</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>
        </div>
        <div class="flex justify-end mt-3">
            <button id="st-bulanListClose" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Tutup</button>
        </div>
    `, 'max-w-2xl');

    popup.querySelector('#st-bulanListClose').onclick = () => overlay.remove();

    popup.querySelectorAll('.st-btn-aksi').forEach(btn => {
        btn.onclick = () => {
            const pIdx = Number(btn.dataset.pegawaiIdx);
            const bIdx = Number(btn.dataset.bulanIdx);
            const iIdx = Number(btn.dataset.itemIdx);
            stShowDetilKegiatanPopup(pIdx, bIdx, iIdx);
        };
    });
}

// ============================================
// POPUP DETIL LENGKAP KEGIATAN (level 2)
// ============================================

function stShowDetilKegiatanPopup(pegawaiIdx, bulanIdx, itemIdx) {
    const pegawai = stPegawaiRows[pegawaiIdx];
    const data = pegawai?.bulan?.[bulanIdx]?.rows?.[itemIdx];
    if (!data) {
        alert('Data detil tidak ditemukan.');
        return;
    }

    const baris = (label, value) => `
        <div class="flex justify-between items-start gap-4 py-2 border-b border-slate-100 text-sm">
            <span class="text-slate-500 whitespace-nowrap">${label}</span>
            <span class="font-medium text-slate-800 text-right break-words">${(value === undefined || value === null || value === '') ? '-' : value}</span>
        </div>`;

    const { overlay, popup } = window.commonOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base mb-1">Detil Kegiatan #${data.idKegiatan ?? ''}</h3>
        <div class="flex flex-col">
            ${baris('ID Kegiatan', data.idKegiatan)}
            ${baris('MAK', data.mak)}
            ${baris('Uraian / No ST', data.uraian)}
            ${baris('Pelaksana Tugas', data.pelaksana)}
            ${baris('Tujuan', data.tujuan)}
            ${baris('Tgl ST', stFormatDate(data.tglSt))}
            ${baris('Tgl Mulai', stFormatDate(data.tglMulai))}
            ${baris('Tgl Selesai', stFormatDate(data.tglSelesai))}
            ${baris('Tgl LPT', stFormatDate(data.tglLPT))}
            ${baris('Tgl Bayar', stFormatDate(data.tglBayar))}
            ${baris('Jumlah', 'Rp ' + Number(data.jumlah || 0).toLocaleString('id-ID'))}
            ${baris('User', data.userLogin)}
            ${baris('Status', data.status)}
            ${baris('Tgl SP2D', stFormatDate(data.tglSP2D))}
            ${baris('Nomor SPM', data.nomorSPM)}
        </div>
        <div class="flex justify-end mt-2">
            <button id="st-detilClose" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Tutup</button>
        </div>
    `, 'max-w-md');

    popup.querySelector('#st-detilClose').onclick = () => overlay.remove();
}

// ============================================
// CARD REALISASI ANGGARAN BULANAN (Belanja Barang 52 & Modal 53)
// ============================================

function stRupiah(v) {
    return Number(v || 0).toLocaleString('id-ID');
}

function stMakeBulanCell(nilai, penyebut) {
    return { nilai, persen: penyebut ? (nilai / penyebut * 100) : 0 };
}

function stComputeBudgetRow(uraian, jenis, akunPrefix) {
    let pagu = 0;
    stPokRows.forEach(p => {
        const akun = getAkunFromMak(p.kode);
        if (akun.startsWith(akunPrefix)) pagu += Number(p.pagu) || 0;
    });

    const blokirByKode = {};
    stBlokirRows.forEach(b => { blokirByKode[b.id] = Number(b.nilai) || 0; });
    let blokir = 0;
    stPokRows.forEach(p => {
        const akun = getAkunFromMak(p.kode);
        if (akun.startsWith(akunPrefix)) blokir += blokirByKode[p.kode] || 0;
    });

    const penyebut = pagu - blokir; // "* Persentase dihitung terhadap Pagu setelah dikurangi Blokir."

    const nilaiPerBulan = new Array(12).fill(0);
    stKegiatanRows.forEach(k => {
        const akun = getAkunFromMak(k.mak);
        if (!akun.startsWith(akunPrefix) || !k.tgl_sp2d) return;
        const d = new Date(k.tgl_sp2d);
        if (isNaN(d.getTime())) return;
        nilaiPerBulan[d.getMonth()] += Number(k.jumlah) || 0;
    });

    const bulanObj = {};
    ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'].forEach((key, idx) => {
        bulanObj[key] = stMakeBulanCell(nilaiPerBulan[idx], penyebut);
    });

    const twNilai = [
        nilaiPerBulan[0] + nilaiPerBulan[1] + nilaiPerBulan[2],
        nilaiPerBulan[3] + nilaiPerBulan[4] + nilaiPerBulan[5],
        nilaiPerBulan[6] + nilaiPerBulan[7] + nilaiPerBulan[8],
        nilaiPerBulan[9] + nilaiPerBulan[10] + nilaiPerBulan[11]
    ];
    const tw = {
        twI: stMakeBulanCell(twNilai[0], penyebut), twII: stMakeBulanCell(twNilai[1], penyebut),
        twIII: stMakeBulanCell(twNilai[2], penyebut), twIV: stMakeBulanCell(twNilai[3], penyebut)
    };

    const totalNilai = nilaiPerBulan.reduce((a, b) => a + b, 0);

    return { uraian, jenis, pagu, blokir, bulan: bulanObj, tw, total: stMakeBulanCell(totalNilai, penyebut) };
}

function stLoadBudgetData() {
    const loadingEl = document.getElementById('st-budgetLoading');
    const wrapperEl = document.getElementById('st-budgetTableWrapper');
    const summaryEl = document.getElementById('st-budgetSummary');
    if (!loadingEl || !wrapperEl) return;

    const rowBarang = stComputeBudgetRow('Belanja Barang', '52', '52');
    const rowModal = stComputeBudgetRow('Belanja Modal', '53', '53');

    const pagu = rowBarang.pagu + rowModal.pagu;
    const blokir = rowBarang.blokir + rowModal.blokir;
    const penyebut = pagu - blokir;
    const bulanTotal = {};
    ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'].forEach(key => {
        const nilai = rowBarang.bulan[key].nilai + rowModal.bulan[key].nilai;
        bulanTotal[key] = stMakeBulanCell(nilai, penyebut);
    });
    const twTotal = {};
    ['twI', 'twII', 'twIII', 'twIV'].forEach(key => {
        const nilai = rowBarang.tw[key].nilai + rowModal.tw[key].nilai;
        twTotal[key] = stMakeBulanCell(nilai, penyebut);
    });
    const totalNilai = rowBarang.total.nilai + rowModal.total.nilai;

    const rows = [rowBarang, rowModal, {
        uraian: 'Total', jenis: '', pagu, blokir, bulan: bulanTotal, tw: twTotal,
        total: stMakeBulanCell(totalNilai, penyebut)
    }];

    stRenderBudgetSummary(rows);
    stRenderBudgetTable(rows);

    loadingEl.classList.add('hidden');
    wrapperEl.classList.remove('hidden');
    if (summaryEl) summaryEl.classList.remove('hidden');
}

function stRenderBudgetSummary(rows) {
    const totalRow = rows[rows.length - 1];

    document.getElementById('st-bTotalPagu').textContent = stRupiah(totalRow.pagu);
    document.getElementById('st-bTotalBlokir').textContent = stRupiah(totalRow.blokir);
    document.getElementById('st-bTotalRealisasi').textContent = stRupiah(totalRow.total.nilai);

    const persen = totalRow.total.persen || 0;
    document.getElementById('st-bPersenRealisasi').textContent = persen.toFixed(2) + '%';
    document.getElementById('st-bPersenBar').style.width = Math.min(persen, 100) + '%';
}

function stBudgetCell(cell, highlight) {
    const nilai = cell?.nilai || 0;
    const persen = cell?.persen || 0;
    return `
        <td class="p-2 text-right whitespace-nowrap ${highlight ? 'bg-sky-50' : ''}">
            <div class="font-medium text-slate-700">${stRupiah(nilai)}</div>
            <div class="text-[10.5px] text-slate-400">${persen.toFixed(2)}%</div>
        </td>`;
}

function stRenderBudgetRow(r) {
    const isTotal = String(r.uraian || '').toLowerCase() === 'total';
    const rowClass = isTotal
        ? 'bg-slate-50 font-semibold border-t-2 border-slate-300'
        : 'border-t border-slate-100 hover:bg-slate-50';
    const stickyBg = isTotal ? 'bg-slate-50' : 'bg-white';

    const label = r.jenis ? `${r.jenis} - ${r.uraian}` : r.uraian;

    return `
        <tr class="${rowClass}">
            <td class="p-2.5 sticky left-0 ${stickyBg} font-medium text-slate-700 whitespace-nowrap">${label}</td>
            <td class="p-2.5 text-right whitespace-nowrap">${stRupiah(r.pagu)}</td>
            <td class="p-2.5 text-right whitespace-nowrap">${stRupiah(r.blokir)}</td>
            ${stBudgetCell(r.bulan.jan)}
            ${stBudgetCell(r.bulan.feb)}
            ${stBudgetCell(r.bulan.mar)}
            ${stBudgetCell(r.tw.twI, true)}
            ${stBudgetCell(r.bulan.apr)}
            ${stBudgetCell(r.bulan.mei)}
            ${stBudgetCell(r.bulan.jun)}
            ${stBudgetCell(r.tw.twII, true)}
            ${stBudgetCell(r.bulan.jul)}
            ${stBudgetCell(r.bulan.agu)}
            ${stBudgetCell(r.bulan.sep)}
            ${stBudgetCell(r.tw.twIII, true)}
            ${stBudgetCell(r.bulan.okt)}
            ${stBudgetCell(r.bulan.nov)}
            ${stBudgetCell(r.bulan.des)}
            ${stBudgetCell(r.tw.twIV, true)}
            <td class="p-2.5 text-center whitespace-nowrap bg-sky-100">
                <div class="font-semibold text-sky-800">${stRupiah(r.total.nilai)}</div>
                <div class="text-[10.5px] text-sky-600">${(r.total.persen || 0).toFixed(2)}%</div>
            </td>
        </tr>`;
}

function stRenderBudgetTable(rows) {
    const tbody = document.getElementById('st-budgetTableBody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => stRenderBudgetRow(r)).join('');
}

// ============================================
// CARD MONITORING MAKSIMUM PENCAIRAN / MP (tabel mp_pnbp)
// ============================================

function stLoadMPData() {
    const loadingEl = document.getElementById('st-mpLoading');
    const wrapperEl = document.getElementById('st-mpTableWrapper');
    const summaryEl = document.getElementById('st-mpSummary');
    if (!loadingEl || !wrapperEl) return;

    if (!stMpRows || stMpRows.length === 0) {
        loadingEl.innerHTML = `<span class="text-red-500">❌ Belum ada data MP (tabel mp_pnbp kosong)</span>`;
        return;
    }

    // Urutkan berdasarkan tgl_mp ASC -> Realisasi = akumulasi kegiatan PNBP
    // SAMPAI DENGAN tanggal tgl_mp baris ini (lihat catatan di kepala file).
    const sorted = [...stMpRows].sort((a, b) => new Date(a.tgl_mp) - new Date(b.tgl_mp));

    const rows = sorted.map((mp, idx) => {
        const tglMp = mp.tgl_mp ? new Date(mp.tgl_mp) : null;
        const paguMP = Number(mp.jumlah) || 0;

        let realisasiBruto = 0, realisasiSP2D = 0;
        stKegiatanRows.forEach(k => {
            if (!String(k.uraian || '').includes('(PNBP)') || !tglMp) return;

            if (k.tgl_bayar) {
                const dBayar = new Date(k.tgl_bayar);
                if (!isNaN(dBayar.getTime()) && dBayar <= tglMp) realisasiBruto += Number(k.jumlah) || 0;
            }
            if (k.tgl_sp2d) {
                const dSp2d = new Date(k.tgl_sp2d);
                if (!isNaN(dSp2d.getTime()) && dSp2d <= tglMp) realisasiSP2D += Number(k.jumlah) || 0;
            }
        });

        return {
            no: idx + 1,
            uraian: mp.uraian || '-',
            periode: tglMp ? `s.d. ${stFormatDate(mp.tgl_mp)}` : '-',
            tanggalMP: mp.tgl_mp,
            paguMP,
            realisasiBruto,
            realisasiSP2D,
            sisaBruto: paguMP - realisasiBruto,
            sisaSP2D: paguMP - realisasiSP2D,
            persenBruto: paguMP ? (realisasiBruto / paguMP * 100) : 0,
            persenSP2D: paguMP ? (realisasiSP2D / paguMP * 100) : 0,
            isTotal: false
        };
    });

    const totalRow = {
        no: '', uraian: 'Total', periode: '', tanggalMP: null,
        paguMP: rows.reduce((a, r) => a + r.paguMP, 0),
        realisasiBruto: rows.reduce((a, r) => a + r.realisasiBruto, 0),
        realisasiSP2D: rows.reduce((a, r) => a + r.realisasiSP2D, 0),
        sisaBruto: rows.reduce((a, r) => a + r.sisaBruto, 0),
        sisaSP2D: rows.reduce((a, r) => a + r.sisaSP2D, 0),
        isTotal: true
    };
    totalRow.persenBruto = totalRow.paguMP ? (totalRow.realisasiBruto / totalRow.paguMP * 100) : 0;
    totalRow.persenSP2D = totalRow.paguMP ? (totalRow.realisasiSP2D / totalRow.paguMP * 100) : 0;

    const allRows = [...rows, totalRow];

    stRenderMPSummary(allRows);
    stRenderMPTable(allRows);

    loadingEl.classList.add('hidden');
    wrapperEl.classList.remove('hidden');
    if (summaryEl) summaryEl.classList.remove('hidden');
}

function stRenderMPSummary(rows) {
    const totalRow = rows.find(r => r.isTotal) || rows[rows.length - 1];

    document.getElementById('st-mpTotalPagu').textContent = stRupiah(totalRow.paguMP);
    document.getElementById('st-mpTotalSP2D').textContent = stRupiah(totalRow.realisasiSP2D);
    document.getElementById('st-mpTotalSisaSP2D').textContent = stRupiah(totalRow.sisaSP2D);

    const persen = totalRow.persenSP2D || 0;
    document.getElementById('st-mpPersenSP2D').textContent = persen.toFixed(2) + '%';
    document.getElementById('st-mpPersenBar').style.width = Math.min(persen, 100) + '%';
}

function stPercentBadge(persen) {
    const p = persen || 0;
    const warna = p >= 90 ? 'bg-green-500' : (p >= 70 ? 'bg-sky-500' : 'bg-amber-400');
    return `
        <div class="flex flex-col items-center gap-1 w-full">
            <div class="w-full h-2.5 bg-slate-300 rounded-full overflow-hidden">
                <div class="h-full ${warna} rounded-full" style="width:${Math.min(p, 100)}%"></div>
            </div>
            <span class="text-[11px] text-slate-500">${p.toFixed(2)}%</span>
        </div>`;
}

function stRenderMPRow(r) {
    const rowClass = r.isTotal
        ? 'bg-slate-50 font-semibold border-t-2 border-slate-300'
        : 'border-t border-slate-100 hover:bg-slate-50';

    return `
        <tr class="${rowClass}">
            <td class="p-2.5 text-center whitespace-nowrap">${r.no}</td>
            <td class="p-2.5 text-slate-700 whitespace-nowrap">${r.isTotal ? 'Total' : r.uraian}</td>
            <td class="p-2.5 text-slate-700 whitespace-nowrap">${r.periode || '-'}</td>
            <td class="p-2.5 text-center whitespace-nowrap">${r.tanggalMP ? stFormatDate(r.tanggalMP) : '-'}</td>
            <td class="p-2.5 text-right whitespace-nowrap">${stRupiah(r.paguMP)}</td>
            <td class="p-2.5 text-right whitespace-nowrap">${stRupiah(r.realisasiBruto)}</td>
            <td class="p-2.5 text-right whitespace-nowrap">${stRupiah(r.realisasiSP2D)}</td>
            <td class="p-2.5 text-right whitespace-nowrap">${stRupiah(r.sisaBruto)}</td>
            <td class="p-2.5 text-right whitespace-nowrap">${stRupiah(r.sisaSP2D)}</td>
            <td class="p-2.5">${stPercentBadge(r.persenBruto)}</td>
            <td class="p-2.5">${stPercentBadge(r.persenSP2D)}</td>
        </tr>`;
}

function stRenderMPTable(rows) {
    const tbody = document.getElementById('st-mpTableBody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => stRenderMPRow(r)).join('');
}
