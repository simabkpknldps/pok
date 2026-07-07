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
    if (btnRefresh) btnRefresh.onclick = stLoadData;

    await stLoadData();
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
