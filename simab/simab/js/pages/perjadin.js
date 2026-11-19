/**
 * Halaman Perjadinku
 * - Entry point: initPerjadinPage()  (dipanggil oleh router.js lewat PAGE_INIT.perjadin)
 * - Baca LANGSUNG dari Supabase (tabel 'kegiatan'), pakai cache
 *   window.kegiatanRowsCache kalau sudah ada dari halaman lain (Dashboard/
 *   POK/Kegiatan) — hemat baca, tidak query ulang kalau tidak perlu.
 * - Filtering per nama pegawai (harus sama persis dgn localStorage.nama) &
 *   per jenis MAK (524111/524113) dilakukan di client.
 *
 * Struktur baris pjAllRows (dipetakan dari kolom Supabase ke huruf-kolom,
 * meniru pola lama, supaya kode render/filter di bawah tidak perlu diubah):
 * B mak, C uraian, E tujuan, G tgl_mulai, H tgl_selesai, M jumlah, P status
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
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-sky-600"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></td></tr>`;

    try {
        await waitSupabaseAuthReady();

        // Pakai cache dari halaman lain (Dashboard/POK/Kegiatan) kalau sudah ada,
        // hindari baca ulang tabel kegiatan dari nol.
        let rows = window.kegiatanRowsCache;
        if (!rows) {
            rows = await sbFetchAll('kegiatan');
            window.kegiatanRowsCache = rows;
        }

        const nama = (localStorage.getItem('nama') || '').trim().toLowerCase();
        // Hanya kegiatan pada Tahun Anggaran yang sedang aktif (cache berisi semua tahun).
        const tahunAktif = Number(await getTahunAktif());

        // Dipetakan ke bentuk huruf-kolom (B,C,E,G,H,M,P) yang sudah dipakai di
        // seluruh file ini, supaya fungsi render/filter di bawah tidak perlu diubah.
        pjAllRows = rows
            .filter(r => {
                const pelaksana = String(r.pelaksana || '').trim().toLowerCase();
                return pelaksana === nama && pjIsPerjalananDinas(r.mak) && Number(r.tahun) === tahunAktif;
            })
            .map(r => ({
                B: r.mak || '', C: r.uraian || '', E: r.tujuan || '',
                G: r.tgl_mulai || '', H: r.tgl_selesai || '',
                M: Number(r.jumlah) || 0, P: r.status || ''
            }));

        const sub = document.getElementById('pj-subjudul');
        if (sub) sub.textContent = `Perjalanan dinas atas nama ${localStorage.getItem('nama') || ''} · Tahun Anggaran ${tahunAktif}`;

        pjRenderStatusSummary(pjAllRows);
        pjUpdateLokasiFavorit(pjAllRows);
        pjUpdateJenisPerjadin(pjAllRows);
        pjUpdateChart(pjAllRows);

        const defaultRadio = document.querySelector('input[name="pj-statusFilter"]:checked').value;
        pjRenderDetailTable(pjFilterByStatus(pjAllRows, defaultRadio));

        pjFirstLoad = false;

    } catch (e) {
        console.error('Error loadData perjadin:', e);
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-red-500">❌ ${e.message || 'Gagal memuat data perjadin.'}</td></tr>`;
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

const PJ_STATUS = {
    'Rekam Data': { bg: '#fce7f3', fg: '#9d174d', warna: '#f472b6' },
    'Terlaksana': { bg: '#e5e7eb', fg: '#374151', warna: '#9ca3af' },
    'LPT':        { bg: '#fef3c7', fg: '#92400e', warna: '#f59e0b' },
    'Terbayar':   { bg: '#dcfce7', fg: '#166534', warna: '#22c55e' },
    'Selesai':    { bg: '#dbeafe', fg: '#1e40af', warna: '#3b82f6' }
};
const PJ_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function pjEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pjRupiahRingkas(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (n >= 1e6) return 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' jt';
    return 'Rp' + n.toLocaleString('id-ID');
}

// Rentang tanggal ringkas: "03–05 Feb 2026", "02 Mar 2026", "28 Okt – 02 Nov 2026"
function pjRentang(g, h) {
    const a = new Date(g), b = new Date(h || g);
    if (isNaN(a.getTime())) return '';
    const dd = d => String(d.getDate()).padStart(2, '0');
    if (isNaN(b.getTime()) || a.toDateString() === b.toDateString()) return `${dd(a)} ${PJ_BULAN[a.getMonth()]} ${a.getFullYear()}`;
    if (a.getFullYear() !== b.getFullYear()) return `${dd(a)} ${PJ_BULAN[a.getMonth()]} ${a.getFullYear()} – ${dd(b)} ${PJ_BULAN[b.getMonth()]} ${b.getFullYear()}`;
    if (a.getMonth() === b.getMonth()) return `${dd(a)}–${dd(b)} ${PJ_BULAN[a.getMonth()]} ${a.getFullYear()}`;
    return `${dd(a)} ${PJ_BULAN[a.getMonth()]} – ${dd(b)} ${PJ_BULAN[b.getMonth()]} ${b.getFullYear()}`;
}

function pjPill(status) {
    const st = PJ_STATUS[status];
    if (!st) return pjEsc(status);
    return `<span class="pj-pill" style="background:${st.bg};color:${st.fg};">${pjEsc(status)}</span>`;
}

function pjSdLabel(uraian) {
    const sd = (typeof kgSumberDana === 'function') ? kgSumberDana({ uraian }) : '';
    if (sd === 'PNBP') return '<span style="color:#b45309;">PNBP</span> · ';
    if (sd === 'RM') return '<span style="color:#0071e3;">RM</span> · ';
    return '';
}

function pjRenderDetailTable(rows) {
    const tbody = document.getElementById('pj-detailBody');
    tbody.innerHTML = '';
    const ket = document.getElementById('pj-count');
    if (ket) ket.textContent = `Menampilkan ${rows.length} dari ${pjAllRows.length} perjalanan`;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Tidak ada data</td></tr>`;
        return;
    }

    rows.forEach(r => {
        const jumlah = Number(r.M || 0);
        const tr = document.createElement('tr');
        tr.style.borderTop = '1px solid #eef0f3';
        tr.className = 'hover:bg-slate-50';
        tr.innerHTML = `
            <td class="py-3 px-3.5 align-top">
                <div class="font-semibold">${pjSdLabel(r.C)}${pjEsc(String(r.C || '').replace(/^\s*\((RM|PNBP)\)\s*/i, ''))}</div>
                <div class="mt-0.5" style="font-size:11.5px;color:#6e6e73;font-family:ui-monospace,Menlo,monospace;word-break:break-all;">${pjEsc(r.B)}</div>
            </td>
            <td class="py-3 px-2 align-top">${pjEsc(r.E)}</td>
            <td class="py-3 px-2 align-top whitespace-nowrap">${pjRentang(r.G, r.H)}</td>
            <td class="py-3 px-2 align-top text-right whitespace-nowrap font-semibold">${jumlah.toLocaleString('id-ID')}</td>
            <td class="py-3 px-3.5 align-top text-center">${pjPill(r.P)}</td>
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
        tr.style.borderTop = '1px solid #f0f0f3';
        tr.innerHTML = `
            <td class="py-2.5"><span class="inline-flex items-center gap-2"><span style="width:10px;height:10px;border-radius:3px;background:${PJ_STATUS[status].warna};"></span>${status}</span></td>
            <td class="py-2.5 text-center">${item.frek}</td>
            <td class="py-2.5 text-right">${item.jumlah.toLocaleString('id-ID')}</td>
        `;
        tbody.appendChild(tr);
        const cnt = document.getElementById('pj-cnt-' + status);
        if (cnt) cnt.textContent = item.frek;
    });
    const cntSemua = document.getElementById('pj-cnt-Semua');
    if (cntSemua) cntSemua.textContent = rows.length;

    const trTotal = document.createElement('tr');
    trTotal.style.borderTop = '2px solid #e5e5ea';
    trTotal.innerHTML = `
        <td class="py-3 font-bold">Total</td>
        <td class="py-3 text-center font-bold">${totalFrek}</td>
        <td class="py-3 text-right font-bold">${totalJumlah.toLocaleString('id-ID')}</td>
    `;
    tbody.appendChild(trTotal);

    // Bar bertingkat proporsi frekuensi per status
    const bar = document.getElementById('pj-statusBar');
    if (bar) {
        bar.innerHTML = totalFrek
            ? statusList.filter(s => summary[s].frek).map(s => `<div style="width:${summary[s].frek / totalFrek * 100}%;background:${PJ_STATUS[s].warna};"></div>`).join('')
            : '';
    }

    // Kartu ringkasan atas
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('pj-kpiFrek', totalFrek);
    set('pj-kpiTotal', pjRupiahRingkas(totalJumlah));
}

function pjUpdateLokasiFavorit(rows) {
    const lokasiMap = {};
    rows.forEach(r => {
        const tujuan = String(r.E || '').trim();
        if (!tujuan) return;
        lokasiMap[tujuan] = (lokasiMap[tujuan] || 0) + 1;
    });

    const wadah = document.getElementById('pj-lokasiBody');
    const sorted = Object.entries(lokasiMap).sort((a, b) => b[1] - a[1]);
    const maks = sorted.length ? sorted[0][1] : 1;
    wadah.innerHTML = sorted.length ? sorted.map(([lokasi, frek], idx) => `
        <div>
            <div class="flex justify-between gap-3"><span>${idx + 1}. ${pjEsc(lokasi)}</span><b>${frek}</b></div>
            <div style="height:8px;border-radius:99px;background:#eef0f3;margin-top:6px;overflow:hidden;"><div style="width:${frek / maks * 100}%;height:100%;background:#0071e3;"></div></div>
        </div>`).join('') : '<div style="color:#9ca3af;">Belum ada data</div>';

    const kpi = document.getElementById('pj-kpiLokasi');
    if (kpi) kpi.textContent = sorted.length ? `${sorted[0][0]} · ${sorted[0][1]}×` : '-';
}

function pjUpdateJenisPerjadin(rows) {
    let luar = 0, dalam = 0;
    rows.forEach(r => {
        const j = pjJenis(r.B);
        if (j === 'luar') luar += 1;
        else if (j === 'dalam') dalam += 1;
    });
    const total = luar + dalam;
    const K = 289.03; // keliling lingkaran r=46
    const garisLuar = total ? (luar / total) * K : 0;

    document.getElementById('pj-jenisBody').innerHTML = `
        <svg width="150" height="150" viewBox="0 0 120 120" role="img" aria-label="Donat: luar kota ${luar} perjalanan, dalam kota ${dalam} perjalanan">
            <circle cx="60" cy="60" r="46" fill="none" stroke="${total ? '#f59e0b' : '#eef0f3'}" stroke-width="16"/>
            <circle cx="60" cy="60" r="46" fill="none" stroke="#0071e3" stroke-width="16" stroke-dasharray="${garisLuar} ${K}" transform="rotate(-90 60 60)"/>
            <text x="60" y="58" text-anchor="middle" font-size="22" font-weight="700" fill="#1d1d1f">${total}</text>
            <text x="60" y="74" text-anchor="middle" font-size="9" fill="#6e6e73">perjalanan</text>
        </svg>
        <div class="flex flex-col gap-3.5 text-[13px]">
            <div class="flex items-center gap-2.5"><span style="width:12px;height:12px;border-radius:4px;background:#0071e3;"></span><span>Luar Kota</span><b class="ml-auto pl-4">${luar}</b></div>
            <div class="flex items-center gap-2.5"><span style="width:12px;height:12px;border-radius:4px;background:#f59e0b;"></span><span>Dalam Kota</span><b class="ml-auto pl-4">${dalam}</b></div>
        </div>`;

    const kpi = document.getElementById('pj-kpiJenis');
    if (kpi) kpi.textContent = `${luar} · ${dalam}`;
}

function pjUpdateChart(rows) {
    const monthCounts = new Array(12).fill(0);
    rows.forEach(r => {
        const d = new Date(r.G);
        if (!isNaN(d.getTime())) monthCounts[d.getMonth()] += 1;
    });

    const maks = Math.max(...monthCounts);
    const ket = document.getElementById('pj-chartKet');
    if (ket) ket.textContent = maks > 0 ? `Bulan tersibuk: ${PJ_BULAN[monthCounts.indexOf(maks)]} (${maks} perjalanan).` : 'Belum ada perjalanan.';

    const canvas = document.getElementById('pj-chartPerjadin');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (pjChartInstance) pjChartInstance.destroy();

    pjChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: PJ_BULAN,
            datasets: [{
                label: 'Frekuensi Perjadin',
                data: monthCounts,
                backgroundColor: monthCounts.map(v => (v === maks && maks > 0) ? '#f59e0b' : '#0071E3'),
                borderRadius: 6,
                maxBarThickness: 22
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef0f3' } },
                x: { grid: { display: false } }
            }
        }
    });
}

window.initPerjadinPage = initPerjadinPage;
