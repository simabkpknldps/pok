/**
 * js/pages/rpd.js
 * -----------------------------------------------------------------------
 * Halaman "RPD" — FULL Supabase.
 *
 * Sumber data:
 *   - Tabel 'rpd': 12 baris tetap (id 1-12 = bulan Jan-Des), kolom 'nilai'
 *     = angka RPD (Rencana Penarikan Dana) bulan itu. SATU-SATUNYA nilai
 *     yang disimpan di database — sisanya dihitung live di browser.
 *   - Tabel 'kegiatan': dipakai hitung Realisasi per bulan (SUM jumlah utk
 *     kegiatan yang tgl_sp2d-nya jatuh di bulan tsb), pakai cache
 *     window.kegiatanRowsCache kalau sudah ada dari halaman lain.
 *
 * Kolom yang ditampilkan (per bulan): Bulan | RPD | Realisasi | Deviasi
 * (= RPD - Realisasi) | % Deviasi (= Deviasi / RPD) | Aksi.
 *
 * Alur edit per baris: cuma kolom RPD yang bisa diubah (klik pensil -> input
 * -> simpan -> update tabel 'rpd'). Realisasi/Deviasi/%Deviasi otomatis
 * ikut kehitung ulang begitu RPD diubah, karena semuanya dihitung di
 * browser, bukan tersimpan.
 * -----------------------------------------------------------------------
 */

const RPD_BULAN_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

let rpdComputedRows = []; // { bulanKe(1-12), bulan, rpd, realisasi, deviasi, persenDeviasi }

async function initRpdPage() {
    await rpdLoadData();
}

async function rpdLoadData() {
    const loadingEl = document.getElementById('rpd-loading');
    const wrapperEl = document.getElementById('rpd-wrapper');
    const errorEl = document.getElementById('rpd-error');
    const theadRow = document.getElementById('rpd-thead-row');
    const tbody = document.getElementById('rpd-tbody');

    if (!loadingEl || !wrapperEl || !errorEl || !theadRow || !tbody) return; // halaman sudah berpindah

    loadingEl.classList.remove('hidden');
    wrapperEl.classList.add('hidden');
    errorEl.classList.add('hidden');

    try {
        await waitSupabaseAuthReady();

        const [rpdRows, kegiatanRows] = await Promise.all([
            sbFetchAll('rpd'),
            (async () => {
                let rows = window.kegiatanRowsCache;
                if (!rows) {
                    rows = await sbFetchAll('kegiatan');
                    window.kegiatanRowsCache = rows;
                }
                return rows;
            })()
        ]);

        // Realisasi per bulan = SUM jumlah kegiatan yang tgl_sp2d-nya jatuh di bulan itu.
        const realisasiPerBulan = new Array(13).fill(0); // index 1-12 dipakai, index 0 dibuang
        kegiatanRows.forEach(k => {
            if (!k.tgl_sp2d) return;
            const d = new Date(k.tgl_sp2d);
            if (isNaN(d.getTime())) return;
            realisasiPerBulan[d.getMonth() + 1] += Number(k.jumlah) || 0;
        });

        const rpdByBulan = {};
        rpdRows.forEach(r => { rpdByBulan[Number(r.id)] = Number(r.nilai) || 0; });

        rpdComputedRows = [];
        for (let bulanKe = 1; bulanKe <= 12; bulanKe++) {
            const rpdVal = rpdByBulan[bulanKe] || 0;
            const realisasi = realisasiPerBulan[bulanKe] || 0;
            const deviasi = rpdVal - realisasi;
            const persenDeviasi = rpdVal !== 0 ? deviasi / rpdVal : 0;
            rpdComputedRows.push({
                bulanKe, bulan: RPD_BULAN_LABEL[bulanKe - 1],
                rpd: rpdVal, realisasi, deviasi, persenDeviasi
            });
        }

        theadRow.innerHTML = [
            { label: 'Bulan', align: 'text-center' },
            { label: 'RPD', align: 'text-right' },
            { label: 'Realisasi', align: 'text-right' },
            { label: 'Deviasi', align: 'text-right' },
            { label: '% Deviasi', align: 'text-right' }
        ].map(h => `<th class="px-3 py-1.5 font-semibold whitespace-nowrap ${h.align}">${h.label}</th>`).join('')
            + `<th class="px-3 py-1.5 font-semibold text-center">Aksi</th>`;

        tbody.innerHTML = rpdComputedRows.map(row => rpdRenderRow(row)).join('');

        loadingEl.classList.add('hidden');
        wrapperEl.classList.remove('hidden');

        rpdBindRowButtons();
    } catch (e) {
        loadingEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
        errorEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i>${e.message || 'Terjadi kesalahan'}`;
    }
}

function rpdFormatPersen(v) {
    const persenText = (v * 100).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    // Merah jika >= 5% atau <= -5%, hijau jika di antara -5% s/d 5% (termasuk 0%)
    const colorClass = (v >= 0.05 || v <= -0.05) ? 'text-red-600' : 'text-green-600';
    return `<span class="${colorClass} font-medium">${persenText}</span>`;
}

function rpdRenderRow(row) {
    return `
        <tr data-bulan-ke="${row.bulanKe}">
            <td class="px-3 py-1.5 text-center">${row.bulan}</td>
            <td class="px-3 py-1.5 rpd-cell-rpd text-right" data-value="${row.rpd}">${formatRibuan(row.rpd)}</td>
            <td class="px-3 py-1.5 text-right">${formatRibuan(row.realisasi)}</td>
            <td class="px-3 py-1.5 text-right">${formatRibuan(row.deviasi)}</td>
            <td class="px-3 py-1.5 text-right">${rpdFormatPersen(row.persenDeviasi)}</td>
            <td class="px-3 py-1.5 text-center">
                <div class="rpd-actions inline-flex items-center gap-3">
                    <button class="rpd-btn-ubah text-sky-600 hover:text-sky-800" title="Ubah RPD bulan ini">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function rpdEscapeAttr(v) {
    return String(v ?? '').replace(/"/g, '&quot;');
}

function rpdBindRowButtons() {
    document.querySelectorAll('#rpd-tbody .rpd-btn-ubah').forEach(btn => {
        btn.onclick = function () {
            const tr = btn.closest('tr');
            const actionsDiv = btn.closest('.rpd-actions');
            rpdEnterEditMode(tr, actionsDiv);
        };
    });
}

// Masuk mode edit: HANYA sel RPD yang jadi <input>, kolom lain tetap read-only.
function rpdEnterEditMode(tr, actionsDiv) {
    const td = tr.querySelector('.rpd-cell-rpd');
    if (!td) return;

    const currentValue = td.getAttribute('data-value') || '0';
    td.innerHTML = `<input type="text"
        class="rpd-input w-full px-2 py-1 border border-sky-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
        value="${rpdEscapeAttr(formatRibuan(Number(currentValue)))}"
        oninput="this.value = formatRibuan(this.value)">`;

    actionsDiv.innerHTML = `
        <button class="rpd-btn-simpan text-green-600 hover:text-green-800" title="Simpan">
            <i class="fa-solid fa-floppy-disk"></i>
        </button>
        <button class="rpd-btn-batal text-slate-400 hover:text-red-600" title="Batal">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    actionsDiv.querySelector('.rpd-btn-simpan').onclick = function () {
        rpdSaveRow(tr, actionsDiv);
    };
    actionsDiv.querySelector('.rpd-btn-batal').onclick = function () {
        rpdCancelEdit(tr, actionsDiv);
    };

    const input = td.querySelector('.rpd-input');
    if (input) input.focus();
}

// Batalkan edit: kembalikan sel RPD ke tampilan semula (tanpa kirim apapun ke backend)
function rpdCancelEdit(tr, actionsDiv) {
    const td = tr.querySelector('.rpd-cell-rpd');
    if (td) {
        const currentValue = Number(td.getAttribute('data-value')) || 0;
        td.innerHTML = formatRibuan(currentValue);
    }
    rpdResetActionsToPencil(tr, actionsDiv);
}

function rpdResetActionsToPencil(tr, actionsDiv) {
    actionsDiv.innerHTML = `
        <button class="rpd-btn-ubah text-sky-600 hover:text-sky-800" title="Ubah RPD bulan ini">
            <i class="fa-solid fa-pen"></i>
        </button>
    `;
    actionsDiv.querySelector('.rpd-btn-ubah').onclick = function () {
        rpdEnterEditMode(tr, actionsDiv);
    };
}

// Simpan nilai RPD baru ke tabel 'rpd' (kolom nilai), lalu hitung ulang
// Realisasi/Deviasi/%Deviasi baris ini di browser (tanpa perlu reload semua data).
async function rpdSaveRow(tr, actionsDiv) {
    const bulanKe = Number(tr.getAttribute('data-bulan-ke'));
    const td = tr.querySelector('.rpd-cell-rpd');
    const input = td ? td.querySelector('.rpd-input') : null;
    const newValue = Number((input ? input.value : '0').replace(/\./g, '')) || 0;

    const btnSimpan = actionsDiv.querySelector('.rpd-btn-simpan');
    const originalIcon = btnSimpan ? btnSimpan.innerHTML : '';
    if (btnSimpan) {
        btnSimpan.disabled = true;
        btnSimpan.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
        await waitSupabaseAuthReady();
        const { error } = await sb.from('rpd').update({ nilai: newValue }).eq('id', bulanKe);
        if (error) throw new Error(error.message);

        const row = rpdComputedRows.find(r => r.bulanKe === bulanKe);
        if (row) {
            row.rpd = newValue;
            row.deviasi = row.rpd - row.realisasi;
            row.persenDeviasi = row.rpd !== 0 ? row.deviasi / row.rpd : 0;

            td.setAttribute('data-value', newValue);
            td.innerHTML = formatRibuan(newValue);
            tr.children[3].innerHTML = formatRibuan(row.deviasi);
            tr.children[4].innerHTML = rpdFormatPersen(row.persenDeviasi);
        }

        showToast('Data RPD berhasil diperbarui');
        rpdResetActionsToPencil(tr, actionsDiv);
    } catch (e) {
        alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        if (btnSimpan) {
            btnSimpan.disabled = false;
            btnSimpan.innerHTML = originalIcon;
        }
    }
}

window.initRpdPage = initRpdPage;
window.rpdLoadData = rpdLoadData;
