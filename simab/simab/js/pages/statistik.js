/**
 * HALAMAN STATISTIK
 * ------------------
 * Entry point : initStatistikPage()
 * Komunikasi backend lewat apiPost() (js/api.js)
 * Menampilkan grafik jumlah kegiatan perjalanan dinas per bulan (Jan - Des)
 * berdasarkan tanggal pelaksanaan / tgl mulai (kolom G sheet Data_Kegiatan_2026).
 */

let stChartInstance = null;

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

    await Promise.all([stLoadData(), stLoadPegawaiData()]);
}

async function stLoadData() {
    const loadingEl = document.getElementById('st-loading');
    const wrapperEl = document.getElementById('st-chartWrapper');

    if (!loadingEl || !wrapperEl) return; // halaman sudah berpindah

    loadingEl.classList.remove('hidden');
    loadingEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-3xl text-sky-500"></i>';
    wrapperEl.classList.add('hidden');

    try {
        const result = await apiPost({ action: 'getStatistikData' });

        if (result.status !== 'success') {
            loadingEl.innerHTML = `<span class="text-red-500">❌ ${result.message || 'Gagal memuat data statistik'}</span>`;
            return;
        }

        const { labels, jumlahPerBulan, totalKegiatan } = result;

        document.getElementById('st-totalKegiatan').textContent = Number(totalKegiatan || 0).toLocaleString('id-ID');

        const maxVal = Math.max(...jumlahPerBulan);
        const maxIdx = jumlahPerBulan.indexOf(maxVal);
        document.getElementById('st-bulanTertinggi').textContent = maxVal > 0 ? `${labels[maxIdx]} (${maxVal})` : '-';

        const rataRata = totalKegiatan > 0 ? (totalKegiatan / 12).toFixed(1) : '0';
        document.getElementById('st-rataRata').textContent = rataRata;

        stRenderChart(labels, jumlahPerBulan);

        loadingEl.classList.add('hidden');
        wrapperEl.classList.remove('hidden');
    } catch (e) {
        loadingEl.innerHTML = `<span class="text-red-500">❌ ${e.message || 'Gagal memuat data statistik'}</span>`;
    }
}

function stRenderChart(labels, data) {
    const canvas = document.getElementById('st-chartKegiatan');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (stChartInstance) {
        stChartInstance.destroy();
    }

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
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y} kegiatan`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

window.initStatistikPage = initStatistikPage;

// ============================================
// TABEL PROGRES PERJALANAN DINAS PER PEGAWAI
// ============================================

let stPegawaiRows = [];

async function stLoadPegawaiData() {
    const loadingEl = document.getElementById('st-pegawaiLoading');
    const wrapperEl = document.getElementById('st-pegawaiTableWrapper');

    if (!loadingEl || !wrapperEl) return; // halaman sudah berpindah

    loadingEl.classList.remove('hidden');
    loadingEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-3xl text-sky-500"></i>';
    wrapperEl.classList.add('hidden');

    try {
        const result = await apiPost({ action: 'getStatistikPegawaiData' });

        if (result.status !== 'success') {
            loadingEl.innerHTML = `<span class="text-red-500">❌ ${result.message || 'Gagal memuat data progres pegawai'}</span>`;
            return;
        }

        stPegawaiRows = (result.rows || []).map((r, i) => ({ ...r, _idx: i }));
        stApplyPegawaiFilter();

        loadingEl.classList.add('hidden');
        wrapperEl.classList.remove('hidden');
    } catch (e) {
        loadingEl.innerHTML = `<span class="text-red-500">❌ ${e.message || 'Gagal memuat data progres pegawai'}</span>`;
    }
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

const ST_BULAN_LABEL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

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
