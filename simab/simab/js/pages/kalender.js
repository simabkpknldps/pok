/**
 * Halaman Kalender
 * Diadaptasi dari kalender.html (versi standalone lama) ke pola SPA.
 * Entry point: initKalenderPage() (dipanggil router.js lewat PAGE_INIT.kalender)
 *
 * PERBEDAAN DARI VERSI LAMA:
 * - GAS lama: endpoint terpisah dengan action 'getCalendar' yang mengembalikan
 *   object siap pakai {tanggal: [ {c,d,e,p}, ... ]}. Action ini TIDAK ADA di
 *   GAS_saat_ini.txt, jadi diganti dengan 'getKegiatanData' (dipakai bareng
 *   halaman Kegiatan & Perjadinku), dikelompokkan per tanggal MULAI (kolom G)
 *   di sisi client. Semua kegiatan kantor ditampilkan (tidak difilter MAK
 *   ataupun nama pegawai), sama seperti perilaku versi lama.
 * - MODIFIKASI SESUAI PERMINTAAN: detail kegiatan tanggal yang diklik TIDAK
 *   lagi tampil di popup, melainkan di tabel pada card sebelah kanan kalender.
 *
 * Struktur baris data dari backend (huruf kolom sheet Data_Kegiatan_2026):
 * A id, B mak, C uraian, D pelaksana, E tujuan, G tglMulai, P status
 */


let klCalendarData = {};      // { "yyyy-MM-dd": [ {c,d,e,p}, ... ] }
let klCurrentDate = new Date();
let klSelectedKey = null;     // key tanggal yang sedang dipilih (untuk search filter)
let klAutoRefreshTimer = null;

async function initKalenderPage() {
    const body = document.getElementById('kl-calendarBody');
    if (!body) return; // fragment belum ter-render

    klCurrentDate = new Date();
    klSelectedKey = null;

    klInitMonthYearDropdowns();
    klBindEvents();

    klShowLoading(true);
    await klLoadCalendarData();
    klRenderCalendar();
    klShowLoading(false);

    // hentikan auto-refresh sebelumnya (kalau user pindah-pindah halaman) sebelum bikin baru
    if (klAutoRefreshTimer) clearInterval(klAutoRefreshTimer);
    klAutoRefreshTimer = setInterval(async () => {
        // kalau fragment kalender sudah tidak ada di DOM (user pindah halaman), hentikan timer
        if (!document.getElementById('kl-calendarBody')) {
            clearInterval(klAutoRefreshTimer);
            klAutoRefreshTimer = null;
            return;
        }
        await klLoadCalendarData();
        klRenderCalendar();
        if (klSelectedKey) klRenderDetailForKey(klSelectedKey);
    }, 60000);
}

function klShowLoading(show) {
    const overlay = document.getElementById('kl-loadingOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !show);
}

function klBindEvents() {
    document.getElementById('kl-btnPrevMonth').addEventListener('click', () => {
        klCurrentDate.setMonth(klCurrentDate.getMonth() - 1);
        klSyncDropdowns();
        klRenderCalendar();
    });

    document.getElementById('kl-btnNextMonth').addEventListener('click', () => {
        klCurrentDate.setMonth(klCurrentDate.getMonth() + 1);
        klSyncDropdowns();
        klRenderCalendar();
    });

    document.getElementById('kl-monthSelect').addEventListener('change', klChangeMonthYear);
    document.getElementById('kl-yearSelect').addEventListener('change', klChangeMonthYear);

    document.getElementById('kl-searchDetail').addEventListener('input', () => {
        if (klSelectedKey) klRenderDetailForKey(klSelectedKey);
    });
}

function klInitMonthYearDropdowns() {
    const monthSelect = document.getElementById('kl-monthSelect');
    const yearSelect = document.getElementById('kl-yearSelect');
    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    monthSelect.innerHTML = '';
    monthNames.forEach((name, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = name;
        monthSelect.appendChild(opt);
    });

    yearSelect.innerHTML = '';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 5; y <= currentYear + 5; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }

    klSyncDropdowns();
}

function klSyncDropdowns() {
    document.getElementById('kl-monthSelect').value = klCurrentDate.getMonth();
    document.getElementById('kl-yearSelect').value = klCurrentDate.getFullYear();
}

function klChangeMonthYear() {
    const monthSelect = document.getElementById('kl-monthSelect');
    const yearSelect = document.getElementById('kl-yearSelect');
    klCurrentDate.setMonth(parseInt(monthSelect.value));
    klCurrentDate.setFullYear(parseInt(yearSelect.value));
    klRenderCalendar();
}

async function klLoadCalendarData() {
    try {
        const data = await apiPost({ action: 'getKegiatanData', kantor: sessionStorage.getItem('kantor') });

        if (!data || data.status !== 'success') {
            console.error('Gagal memuat data kalender:', data && data.message);
            klCalendarData = {};
            return;
        }

        const grouped = {};
        (data.rows || []).forEach(r => {
            const key = klNormalizeDateKey(r.G);
            if (!key) return;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push({
                c: r.C || '',
                d: r.D || '',
                e: r.E || '',
                p: r.P || ''
            });
        });

        klCalendarData = grouped;

    } catch (e) {
        console.error('Error loadCalendarData:', e);
        klCalendarData = {};
    }
}

// pastikan key selalu format yyyy-MM-dd, baik dari Date object atau string yang sudah diformat server
function klNormalizeDateKey(v) {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function klGetEventsForDay(day, month, year) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return klCalendarData[key] || [];
}

function klRenderCalendar() {
    const year = klCurrentDate.getFullYear();
    const month = klCurrentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay(); // 0 = minggu
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    const tbody = document.getElementById('kl-calendarBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const today = new Date();
    let day = 1;
    const maxShow = 2;

    for (let week = 0; week < 6; week++) {
        const tr = document.createElement('tr');

        for (let d = 0; d < 7; d++) {
            const td = document.createElement('td');
            td.className = 'border border-slate-200 align-top p-1 h-24 relative';

            let dayNum, isOtherMonth = false;

            if (week === 0 && d < firstDay) {
                dayNum = prevLastDate - firstDay + d + 1;
                isOtherMonth = true;
            } else if (day > lastDate) {
                dayNum = day - lastDate;
                isOtherMonth = true;
                day++;
            } else {
                dayNum = day;
                day++;
            }

            if (isOtherMonth) {
                td.classList.add('text-slate-300', 'bg-slate-50');
                td.innerHTML = `<span class="text-xs font-semibold">${dayNum}</span>`;
            } else {
                const isToday = dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = dateKey === klSelectedKey;

                td.classList.add('cursor-pointer', 'hover:bg-sky-50');
                if (isToday) td.classList.add('bg-sky-500', 'text-white');
                if (isSelected && !isToday) td.classList.add('bg-sky-100');

                const events = klGetEventsForDay(dayNum, month + 1, year);
                let eventsHtml = '';
                events.slice(0, maxShow).forEach(item => {
                    let title = item.c || '(tanpa uraian)';
                    if (title.length > 22) title = title.substring(0, 22) + '...';
                    const pillColor = isToday ? 'bg-white text-sky-700' : 'bg-emerald-500 text-white';
                    eventsHtml += `<span class="block mt-1 px-1 rounded text-[10px] truncate ${pillColor}">${title}</span>`;
                });
                if (events.length > maxShow) {
                    const moreColor = isToday ? 'bg-white text-red-600' : 'bg-red-500 text-white';
                    eventsHtml += `<span class="block mt-1 px-1 rounded text-[10px] font-semibold ${moreColor}">+${events.length - maxShow}</span>`;
                }

                td.innerHTML = `<span class="text-xs font-semibold">${dayNum}</span>${eventsHtml}`;
                td.addEventListener('click', () => klSelectDate(dayNum, month + 1, year));
            }

            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
}

function klSelectDate(day, month, year) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    klSelectedKey = key;
    document.getElementById('kl-searchDetail').value = '';

    const title = document.getElementById('kl-detailTitle');
    if (title) title.textContent = `Detail Kegiatan Tanggal ${day}-${month}-${year}`;

    klRenderDetailForKey(key);
    klRenderCalendar(); // re-render supaya highlight tanggal terpilih update
}

function klStatusBadgeClass(status) {
    switch (status) {
        case 'Rekam Data': return 'bg-pink-200 text-pink-800';
        case 'Terlaksana': return 'bg-slate-200 text-slate-700';
        case 'LPT': return 'bg-yellow-200 text-yellow-800';
        case 'Terbayar': return 'bg-green-200 text-green-800';
        case 'Selesai': return 'bg-blue-200 text-blue-800';
        default: return 'bg-slate-100 text-slate-600';
    }
}

function klRenderDetailForKey(key) {
    const tbody = document.getElementById('kl-detailBody');
    if (!tbody) return;

    const keyword = (document.getElementById('kl-searchDetail').value || '').toLowerCase();
    let items = klCalendarData[key] || [];

    if (keyword) {
        items = items.filter(item =>
            String(item.c).toLowerCase().includes(keyword) ||
            String(item.d).toLowerCase().includes(keyword) ||
            String(item.e).toLowerCase().includes(keyword) ||
            String(item.p).toLowerCase().includes(keyword)
        );
    }

    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">Tidak ada data</td></tr>`;
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50';
        tr.innerHTML = `
            <td class="p-2 align-top">${item.c || ''}</td>
            <td class="p-2 align-top">${item.d || ''}</td>
            <td class="p-2 align-top">${item.e || ''}</td>
            <td class="p-2 align-top">
                <span class="px-2 py-0.5 rounded text-xs font-semibold inline-block ${klStatusBadgeClass(item.p)}">${item.p || '-'}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.initKalenderPage = initKalenderPage;
