/**
 * Halaman Perjadinku
 * Diadaptasi dari perjadinku.html (versi standalone lama) ke pola SPA:
 * - Entry point: initPerjadinPage()  (dipanggil oleh router.js lewat PAGE_INIT.perjadin)
 * - Komunikasi backend lewat apiPost() (js/api.js), sama seperti halaman Daftar Kegiatan
 * - Helper umum: showToast() dsb dari js/common.js (tidak wajib dipakai di halaman ini)
 *
 * PERBEDAAN DARI VERSI LAMA (GAS_Perjadin_lama.txt):
 * - GAS lama: doGet(kantor, nama) -> server sudah memfilter data per pegawai & per MAK.
 * - GAS sekarang: hanya ada action 'getKegiatanData' (dipakai bersama halaman Kegiatan)
 *   yang mengembalikan SEMUA baris kegiatan (semua pegawai, kolom A-R).
 *   Filtering per nama pegawai & per jenis MAK dilakukan di sini (client).
 *
 * Struktur baris data dari backend (huruf kolom sheet Data_Kegiatan_2026):
 * A id, B mak, C uraian, D pelaksana, E tujuan, F tglST, G tglMulai,
 * H tglSelesai, I tglLPT, J tglBayar, M jumlah, N user, P status
 */


let pjAllRows = [];       // baris milik user login yang sedang login, sudah difilter MAK 524111/524113
let pjChartInstance = null;
let pjFirstLoad = true;

async function initPerjadinPage() {
    const root = document.getElementById('pj-detailBody');
    if (!root) return; // fragment belum ter-render, batalkan

    pjAllRows = [];
    pjFirstLoad = true;

    pjBindEvents();
    await pjLoadData();
}

function pjBindEvents() {
    document.getElementById('pj-searchBox').addEventListener('input', pjApplyFilter);

    document.querySelectorAll('input[name="pj-statusFilter"]').forEach(rb => {
        rb.addEventListener('change', pjApplyFilter);
    });
}

// MAK dianggap "perjalanan dinas" jika mengandung kode 524111 (luar kota) / 524113 (dalam kota)
function pjIsPerjalananDinas(mak) {
    const s = String(mak || '');
    return s.includes('524111') || s.includes('524113');
}

function pjJenis(mak) {
    const s = String(mak || '');
    if (s.includes('524111')) return 'luar';
    if (s.includes('524113')) return 'dalam';
    return null;
}

async function pjLoadData() {
    const tbody = document.getElementById('pj-detailBody');
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-sky-600"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></td></tr>`;

    try {
        // statusFilter WAJIB 'Semua' -> backend getKegiatanData defaultnya cuma kirim
        // status "Dalam Proses" (Rekam Data + Terlaksana) kalau tidak diisi, padahal
        // halaman ini butuh SEMUA status (LPT/Terbayar/Selesai juga) karena filter
        // status yang sesungguhnya dilakukan di sini (client), bukan di server.
        const data = await apiPost({
            action: 'getKegiatanData',
            kantor: localStorage.getItem('kantor'),
            statusFilter: 'Semua',
            pageSize: 'all'
        });

        if (!data || data.status !== 'success') {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-red-500">Gagal memuat data perjadin.</td></tr>`;
            return;
        }

        const nama = (localStorage.getItem('nama') || '').trim().toLowerCase();

        pjAllRows = (data.rows || []).filter(r => {
            const pelaksana = String(r.D || '').trim().toLowerCase();
            return pelaksana === nama && pjIsPerjalananDinas(r.B);
        });

        pjRenderStatusSummary(pjAllRows);
        pjUpdateLokasiFavorit(pjAllRows);
        pjUpdateJenisPerjadin(pjAllRows);
        pjUpdateChart(pjAllRows);

        const defaultRadio = document.querySelector('input[name="pj-statusFilter"]:checked').value;
        pjRenderDetailTable(pjFilterByStatus(pjAllRows, defaultRadio));

        pjFirstLoad = false;

    } catch (e) {
        console.error('Error loadData perjadin:', e);
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-red-500">❌ ${e.message || 'Gagal memuat data perjadin.'}</td></tr>`;
    }
}

function pjFilterByStatus(rows, status) {
    if (status === 'Semua') return rows;
    return rows.filter(r => r.P === status);
}

// search + radio hanya mempengaruhi tabel detail (ringkasan status & kartu bawah tetap dari semua data user)
function pjApplyFilter() {
    const keyword = document.getElementById('pj-searchBox').value.toLowerCase();
    const status = document.querySelector('input[name="pj-statusFilter"]:checked').value;

    let filtered = pjFilterByStatus(pjAllRows, status);
    if (keyword) {
        filtered = filtered.filter(r =>
            String(r.B || '').toLowerCase().includes(keyword) ||
            String(r.C || '').toLowerCase().includes(keyword) ||
            String(r.E || '').toLowerCase().includes(keyword)
        );
    }
    pjRenderDetailTable(filtered);
}

function pjFormatDate(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pjStatusClasses(status) {
    switch (status) {
        case 'Rekam Data': return 'bg-red-300';
        case 'Terlaksana': return 'bg-slate-300';
        case 'LPT': return 'bg-yellow-300';
        case 'Terbayar': return 'bg-green-400';
        case 'Selesai': return 'bg-blue-400 text-white';
        default: return '';
    }
}

function pjRenderDetailTable(rows) {
    const tbody = document.getElementById('pj-detailBody');
    tbody.innerHTML = '';

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Tidak ada data</td></tr>`;
        return;
    }

    rows.forEach(r => {
        const jumlah = Number(r.M || 0);
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50';
        tr.innerHTML = `
            <td class="p-2 align-top">${r.B ?? ''}</td>
            <td class="p-2 align-top">${r.C ?? ''}</td>
            <td class="p-2 align-top">${r.E ?? ''}</td>
            <td class="p-2 align-top whitespace-nowrap">${pjFormatDate(r.G)}</td>
            <td class="p-2 align-top whitespace-nowrap">${pjFormatDate(r.H)}</td>
            <td class="p-2 align-top text-right whitespace-nowrap">${jumlah.toLocaleString('id-ID')}</td>
            <td class="p-2 align-top text-center font-semibold rounded ${pjStatusClasses(r.P)}">${r.P ?? ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

function pjRenderStatusSummary(rows) {
    const statusList = ['Rekam Data', 'Terlaksana', 'LPT', 'Terbayar', 'Selesai'];
    const summary = {};
    statusList.forEach(s => summary[s] = { frek: 0, jumlah: 0 });

    rows.forEach(r => {
        const s = r.P;
        if (summary[s]) {
            summary[s].frek += 1;
            summary[s].jumlah += Number(r.M || 0);
        }
    });

    const tbody = document.getElementById('pj-statusSummary');
    tbody.innerHTML = '';

    let totalFrek = 0, totalJumlah = 0;
    statusList.forEach(status => {
        const item = summary[status];
        totalFrek += item.frek;
        totalJumlah += item.jumlah;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-2 border-b border-slate-100">${status}</td>
            <td class="p-2 border-b border-slate-100 text-center">${item.frek}</td>
            <td class="p-2 border-b border-slate-100 text-right">${item.jumlah.toLocaleString('id-ID')}</td>
        `;
        tbody.appendChild(tr);
    });

    const trTotal = document.createElement('tr');
    trTotal.innerHTML = `
        <td class="p-2 font-semibold">Total</td>
        <td class="p-2 text-center font-semibold">${totalFrek}</td>
        <td class="p-2 text-right font-semibold">${totalJumlah.toLocaleString('id-ID')}</td>
    `;
    tbody.appendChild(trTotal);
}

function pjUpdateLokasiFavorit(rows) {
    const lokasiMap = {};
    rows.forEach(r => {
        const tujuan = String(r.E || '').trim();
        if (!tujuan) return;
        lokasiMap[tujuan] = (lokasiMap[tujuan] || 0) + 1;
    });

    const tbody = document.getElementById('pj-lokasiBody');
    tbody.innerHTML = '';

    const sorted = Object.entries(lokasiMap).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([lokasi, frek], idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-2 border-b border-slate-100">${idx + 1}</td>
            <td class="p-2 border-b border-slate-100">${lokasi}</td>
            <td class="p-2 border-b border-slate-100 text-right">${frek}</td>
        `;
        tbody.appendChild(tr);
    });
}

function pjUpdateJenisPerjadin(rows) {
    let luar = 0, dalam = 0;
    rows.forEach(r => {
        const j = pjJenis(r.B);
        if (j === 'luar') luar += 1;
        else if (j === 'dalam') dalam += 1;
    });

    const tbody = document.getElementById('pj-jenisBody');
    tbody.innerHTML = `
        <tr><td class="p-2 border-b border-slate-100">Luar Kota</td><td class="p-2 border-b border-slate-100 text-right">${luar}</td></tr>
        <tr><td class="p-2">Dalam Kota</td><td class="p-2 text-right">${dalam}</td></tr>
    `;
}

function pjUpdateChart(rows) {
    const monthCounts = new Array(12).fill(0);
    rows.forEach(r => {
        const d = new Date(r.G);
        if (!isNaN(d.getTime())) monthCounts[d.getMonth()] += 1;
    });

    const canvas = document.getElementById('pj-chartPerjadin');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (pjChartInstance) pjChartInstance.destroy();

    pjChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
            datasets: [{
                label: 'Frekuensi Perjadin',
                data: monthCounts,
                borderColor: '#0369a1',
                backgroundColor: 'rgba(3,105,161,0.2)',
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#0369a1',
                pointBorderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Jumlah' } },
                x: { title: { display: true, text: 'Bulan' } }
            }
        }
    });
}

window.initPerjadinPage = initPerjadinPage;
