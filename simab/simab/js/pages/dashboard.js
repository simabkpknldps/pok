/**
 * Halaman Dashboard
 */

let dashboardDataCache = null;

async function fetchDashboardData() {
    try {
        const data = await apiPost({ action: 'getDashboardData' });
        dashboardDataCache = data;
        return data;
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function initDashboardPage() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    // Selalu refresh setiap masuk halaman ini (perilaku sama seperti versi lama)
    dashboardDataCache = null;
    container.innerHTML = `<div class="flex justify-center mt-10"><i class="fa-solid fa-spinner fa-spin text-sky-600 text-2xl"></i></div>`;

    const data = await fetchDashboardData();
    if (!data) {
        container.innerHTML = `<div class="text-center text-red-500 mt-10">Gagal memuat data dashboard.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
    `;

    initCharts(data);
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

window.initDashboardPage = initDashboardPage;
