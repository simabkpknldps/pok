/**
 * js/pages/rpd.js
 * -----------------------------------------------------------------------
 * Halaman "RPD" — menampilkan tabel dari sheet "dash_bulanan_2026",
 * range T2:X14.
 *
 * Struktur kolom (T, U, V, W, X):
 *   T -> % Deviasi  (formula di sheet, read-only, ditampilkan sbg persen, rata kanan)
 *   U -> Bulan      (read-only, rata tengah)
 *   V -> RPD        (SATU-SATUNYA kolom yang bisa diedit dari halaman ini, rata kanan)
 *   W -> Realisasi  (read-only, rata kanan)
 *   X -> Deviasi = RPD - Realisasi, FORMULA di sheet (=V-W). Read-only, rata kanan.
 *        Kolom T (% Deviasi) & X (Deviasi) otomatis ikut berubah begitu
 *        kolom RPD (V) diupdate.
 *
 * Alur edit per baris:
 *   1. Klik icon pencil  -> HANYA sel kolom RPD (V) di baris itu berubah jadi
 *      <input>. Tombol Aksi berubah jadi 2 tombol: disket (simpan) & x (batal).
 *   2. Klik disket -> HANYA nilai kolom RPD yang dikirim ke backend
 *      (action: updateRpdTabelRow), yang menulis 1 sel saja ke sheet
 *      (kolom V). Kolom lain (T, U, W, X) tidak pernah ditulis ulang,
 *      supaya formula % Deviasi & Deviasi tetap aman.
 *   3. Klik x (batal) -> edit dibatalkan, nilai kembali seperti semula,
 *      tidak ada yang dikirim ke backend.
 * -----------------------------------------------------------------------
 */

const RPD_COL_PERSEN_DEVIASI_INDEX = 0; // index ke-0 dalam range T:X = kolom T (% Deviasi)
const RPD_COL_BULAN_INDEX = 1;          // index ke-1 = kolom U (Bulan), satu-satunya yang rata tengah
const RPD_COL_RPD_INDEX = 2;            // index ke-2 = kolom V (RPD), satu-satunya yang editable

async function initRpdPage() {
    // Fragment pages/rpd.html sudah otomatis dimuat router ke #app sebelum
    // fungsi ini dipanggil, jadi di sini cukup ambil datanya.
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
        const result = await apiPost({ action: 'getRpdTabelData' });
        if (result.status !== 'success') {
            throw new Error(result.message || 'Gagal memuat data RPD');
        }

        // Header (baris 2, kolom T:X) + kolom Aksi tambahan
        theadRow.innerHTML = result.header
            .map((h, idx) => `<th class="px-3 py-1.5 font-semibold whitespace-nowrap ${rpdColAlign(idx)}">${rpdEscapeHtml(h)}</th>`)
            .join('') + `<th class="px-3 py-1.5 font-semibold text-center">Aksi</th>`;

        // Baris data (baris 3-14)
        tbody.innerHTML = result.rows.map(row => rpdRenderRow(row)).join('');

        loadingEl.classList.add('hidden');
        wrapperEl.classList.remove('hidden');

        rpdBindRowButtons();
    } catch (e) {
        loadingEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
        errorEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i>${e.message || 'Terjadi kesalahan'}`;
    }
}

function rpdColAlign(idx) {
    // Hanya kolom Bulan (U) yang rata tengah, semua kolom lain (termasuk % Deviasi) rata kanan
    return idx === RPD_COL_BULAN_INDEX ? 'text-center' : 'text-right';
}

function rpdRenderRow(row) {
    const cells = row.values.map((v, idx) => `
        <td class="px-3 py-1.5 rpd-cell ${rpdColAlign(idx)}" data-col="${idx}" data-display="${rpdEscapeAttr(v)}">
            ${rpdFormatCell(v, idx)}
        </td>
    `).join('');

    return `
        <tr data-row="${row.rowIndex}">
            ${cells}
            <td class="px-3 py-1.5 text-center">
                <div class="rpd-actions inline-flex items-center gap-3">
                    <button class="rpd-btn-ubah text-sky-600 hover:text-sky-800" title="Ubah RPD baris ini">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function rpdFormatCell(v, idx) {
    if (v === '' || v === null || typeof v === 'undefined') return '-';

    // Kolom % Deviasi (T): tampilkan sebagai persen.
    // Asumsi: nilai di sheet tersimpan sbg pecahan (0.05 = 5%), sesuai format
    // "Percent" default Google Sheets. Kalau ternyata nilainya sudah dalam
    // bentuk angka persen utuh (5 = 5%), hapus perkalian *100 di bawah ini.
    if (idx === RPD_COL_PERSEN_DEVIASI_INDEX && typeof v === 'number') {
        return (v * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    }

    if (typeof v === 'number') return formatRibuan(v);
    const stripped = String(v).trim().replace(/\./g, '').replace(/,/g, '.');
    if (stripped !== '' && !isNaN(stripped)) return formatRibuan(v);
    return rpdEscapeHtml(v);
}

function rpdEscapeHtml(v) {
    const div = document.createElement('div');
    div.textContent = v ?? '';
    return div.innerHTML;
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

// Masuk mode edit: HANYA sel kolom RPD (V) yang jadi <input>, kolom lain tetap read-only.
// Tombol Aksi berubah jadi [simpan] [batal].
function rpdEnterEditMode(tr, actionsDiv) {
    const td = tr.querySelector(`.rpd-cell[data-col="${RPD_COL_RPD_INDEX}"]`);
    if (!td) return;

    const currentValue = td.getAttribute('data-display') || '';
    td.innerHTML = `<input type="text"
        class="rpd-input w-full px-2 py-1 border border-sky-300 rounded-lg text-sm ${rpdColAlign(RPD_COL_RPD_INDEX)} focus:outline-none focus:ring-2 focus:ring-sky-500"
        value="${rpdEscapeAttr(currentValue)}">`;

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

// Batalkan edit: kembalikan sel kolom RPD ke tampilan semula (tanpa kirim apapun ke backend)
function rpdCancelEdit(tr, actionsDiv) {
    const td = tr.querySelector(`.rpd-cell[data-col="${RPD_COL_RPD_INDEX}"]`);
    if (td) {
        const currentValue = td.getAttribute('data-display') || '';
        td.innerHTML = rpdFormatCell(currentValue, RPD_COL_RPD_INDEX);
    }
    rpdResetActionsToPencil(tr, actionsDiv);
}

function rpdResetActionsToPencil(tr, actionsDiv) {
    actionsDiv.innerHTML = `
        <button class="rpd-btn-ubah text-sky-600 hover:text-sky-800" title="Ubah RPD baris ini">
            <i class="fa-solid fa-pen"></i>
        </button>
    `;
    actionsDiv.querySelector('.rpd-btn-ubah').onclick = function () {
        rpdEnterEditMode(tr, actionsDiv);
    };
}

// Kirim HANYA nilai RPD (kolom V) yang baru ke backend. Backend hanya menulis
// 1 sel (kolom V), sehingga formula % Deviasi (T) & Deviasi (X) tidak pernah tersentuh.
async function rpdSaveRow(tr, actionsDiv) {
    const rowIndex = tr.getAttribute('data-row');
    const td = tr.querySelector(`.rpd-cell[data-col="${RPD_COL_RPD_INDEX}"]`);
    const input = td ? td.querySelector('.rpd-input') : null;
    const newValue = input ? input.value.trim() : '';

    const btnSimpan = actionsDiv.querySelector('.rpd-btn-simpan');
    const originalIcon = btnSimpan ? btnSimpan.innerHTML : '';
    if (btnSimpan) {
        btnSimpan.disabled = true;
        btnSimpan.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
        const result = await apiPost({
            action: 'updateRpdTabelRow',
            rowIndex: Number(rowIndex),
            value: newValue
        });

        if (result.status === 'success') {
            showToast('Data RPD berhasil diperbarui');

            // Backend mengembalikan seluruh baris (T:X) SETELAH SpreadsheetApp.flush(),
            // jadi % Deviasi (T) & Deviasi (X) di sini sudah nilai terbaru hasil formula,
            // langsung dipakai tanpa perlu reload/request terpisah.
            const updatedValues = result.values;
            if (Array.isArray(updatedValues)) {
                const cells = tr.querySelectorAll('.rpd-cell');
                cells.forEach(cellTd => {
                    const colIdx = Number(cellTd.getAttribute('data-col'));
                    const v = updatedValues[colIdx];
                    cellTd.setAttribute('data-display', v);
                    cellTd.innerHTML = rpdFormatCell(v, colIdx);
                });
            } else {
                td.setAttribute('data-display', newValue);
                td.innerHTML = rpdFormatCell(newValue, RPD_COL_RPD_INDEX);
            }

            rpdResetActionsToPencil(tr, actionsDiv);
        } else {
            alert('Gagal menyimpan: ' + (result.message || 'Terjadi kesalahan.'));
            if (btnSimpan) {
                btnSimpan.disabled = false;
                btnSimpan.innerHTML = originalIcon;
            }
        }
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
