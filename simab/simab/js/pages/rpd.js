/**
 * js/pages/rpd.js
 * -----------------------------------------------------------------------
 * Halaman "RPD" — menampilkan tabel dari sheet "dash_bulanan_2026",
 * range U2:X14.
 *
 * Struktur kolom (U, V, W, X):
 *   U -> Bulan      (read-only)
 *   V -> RPD        (SATU-SATUNYA kolom yang bisa diedit dari halaman ini)
 *   W -> Realisasi  (read-only)
 *   X -> Deviasi = RPD - Realisasi, FORMULA di sheet (=V-W). Read-only,
 *        nilainya otomatis ikut berubah begitu kolom RPD (V) diupdate.
 *
 * Alur edit per baris:
 *   1. Klik icon pencil  -> HANYA sel kolom RPD (V) di baris itu berubah jadi
 *      <input>. Tombol Aksi berubah jadi 2 tombol: disket (simpan) & x (batal).
 *   2. Klik disket -> HANYA nilai kolom RPD yang dikirim ke backend
 *      (action: updateRpdTabelRow), yang menulis 1 sel saja ke sheet
 *      (kolom V). Kolom Bulan/Realisasi/Deviasi tidak pernah ditulis ulang,
 *      supaya formula Deviasi (=V-W) di kolom X tetap aman.
 *   3. Klik x (batal) -> edit dibatalkan, nilai kembali seperti semula,
 *      tidak ada yang dikirim ke backend.
 * -----------------------------------------------------------------------
 */

const RPD_COL_RPD_INDEX = 1; // index ke-1 dalam kolom U:X = kolom V (RPD), satu-satunya yang editable

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

        // Header (baris 2, kolom U:X) + kolom Aksi tambahan
        // Kolom 1 (U) rata tengah, kolom 2-4 (V, W, X) rata kanan
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
    // Kolom 1 (index 0) rata tengah, kolom 2-4 (index 1-3) rata kanan
    return idx === 0 ? 'text-center' : 'text-right';
}

function rpdRenderRow(row) {
    const cells = row.values.map((v, idx) => `
        <td class="px-3 py-1.5 rpd-cell ${rpdColAlign(idx)}" data-col="${idx}" data-display="${rpdEscapeAttr(v)}">
            ${rpdFormatCell(v)}
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

function rpdFormatCell(v) {
    if (v === '' || v === null || typeof v === 'undefined') return '-';
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
        td.innerHTML = rpdFormatCell(currentValue);
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
// 1 sel (kolom V), sehingga formula Deviasi (=V-W) di kolom X tidak pernah tersentuh.
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

            // Backend mengembalikan seluruh baris (U:X) SETELAH SpreadsheetApp.flush(),
            // jadi Deviasi (kolom X) di sini sudah nilai terbaru hasil formula =V-W,
            // langsung dipakai tanpa perlu reload/request terpisah.
            const updatedValues = result.values;
            if (Array.isArray(updatedValues)) {
                const cells = tr.querySelectorAll('.rpd-cell');
                cells.forEach(cellTd => {
                    const colIdx = Number(cellTd.getAttribute('data-col'));
                    const v = updatedValues[colIdx];
                    cellTd.setAttribute('data-display', v);
                    cellTd.innerHTML = rpdFormatCell(v);
                });
            } else {
                td.setAttribute('data-display', newValue);
                td.innerHTML = rpdFormatCell(newValue);
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
