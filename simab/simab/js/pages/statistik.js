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
    const btnRefresh = document.getElementById('st-btnRefresh');
    if (btnRefresh) btnRefresh.onclick = () => {
        stLoadData();
        stLoadPegawaiData();
    };

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

        stRenderPegawaiTable(result.rows || []);

        loadingEl.classList.add('hidden');
        wrapperEl.classList.remove('hidden');
    } catch (e) {
        loadingEl.innerHTML = `<span class="text-red-500">❌ ${e.message || 'Gagal memuat data progres pegawai'}</span>`;
    }
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
        <tr class="border-t border-slate-100 hover:bg-slate-50">
            <td class="p-2.5 font-medium text-slate-700 sticky left-0 bg-white break-words align-top">${r.nama}</td>
            ${r.bulan.map(b => `<td class="p-2.5">${stBuildProgressCell(b.selesai, b.total)}</td>`).join('')}
            <td class="p-2.5 text-center font-semibold text-sky-700 align-top">${r.total}</td>
        </tr>
    `).join('');
}
