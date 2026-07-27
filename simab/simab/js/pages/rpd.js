/**
 * js/pages/rpd.js
 * -----------------------------------------------------------------------
 * Halaman "RPD" — menampilkan tabel dari sheet "dash_bulanan_2026",
 * range U2:X14.
 *
 * Struktur range (sisi backend, lihat action getRpdTabelData / updateRpdTabelRow
 * di Apps Script):
 *   Baris 2 (U2:X2)   -> header/judul kolom, TIDAK bisa diedit dari sini.
 *   Baris 3-14 (U:X)  -> data, bisa diedit PER BARIS lewat tombol Aksi.
 *
 * Alur edit per baris:
 *   1. Klik icon pencil  -> semua sel di baris itu berubah jadi <input>,
 *      icon berubah jadi disket (save).
 *   2. Klik icon disket  -> nilai input dikirim ke backend
 *      (action: updateRpdTabelRow) untuk baris tsb, sheet ikut ter-update,
 *      lalu baris kembali ke mode tampilan (read-only) dengan nilai baru.
 * -----------------------------------------------------------------------
 */

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
        theadRow.innerHTML = result.header
            .map(h => `<th class="px-3 py-2 font-semibold whitespace-nowrap">${rpdEscapeHtml(h)}</th>`)
            .join('') + `<th class="px-3 py-2 font-semibold text-center w-20">Aksi</th>`;

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

function rpdRenderRow(row) {
    const cells = row.values.map((v, idx) => `
        <td class="px-3 py-2 rpd-cell" data-col="${idx}" data-display="${rpdEscapeAttr(v)}">
            ${rpdFormatCell(v)}
        </td>
    `).join('');

    return `
        <tr data-row="${row.rowIndex}">
            ${cells}
            <td class="px-3 py-2 text-center">
                <button class="rpd-btn-ubah text-sky-600 hover:text-sky-800" title="Ubah baris ini">
                    <i class="fa-solid fa-pen"></i>
                </button>
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
            rpdEnterEditMode(tr, btn);
        };
    });
}

// Ubah semua sel di baris jadi <input>, ganti icon pencil -> disket
function rpdEnterEditMode(tr, btn) {
    const cells = tr.querySelectorAll('.rpd-cell');
    cells.forEach(td => {
        const currentValue = td.getAttribute('data-display') || '';
        td.innerHTML = `<input type="text"
            class="rpd-input w-full px-2 py-1 border border-sky-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            value="${rpdEscapeAttr(currentValue)}">`;
    });

    btn.classList.remove('rpd-btn-ubah', 'text-sky-600', 'hover:text-sky-800');
    btn.classList.add('rpd-btn-simpan', 'text-green-600', 'hover:text-green-800');
    btn.title = 'Simpan perubahan';
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
    btn.onclick = function () {
        rpdSaveRow(tr, btn);
    };

    const firstInput = tr.querySelector('.rpd-input');
    if (firstInput) firstInput.focus();
}

// Kirim nilai baris ke backend (action: updateRpdTabelRow), lalu kembalikan baris ke mode tampilan
async function rpdSaveRow(tr, btn) {
    const rowIndex = tr.getAttribute('data-row');
    const inputs = tr.querySelectorAll('.rpd-input');
    const values = Array.from(inputs).map(inp => inp.value.trim());

    const originalIcon = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const result = await apiPost({
            action: 'updateRpdTabelRow',
            rowIndex: Number(rowIndex),
            values: values
        });

        if (result.status === 'success') {
            showToast('Data RPD berhasil diperbarui');

            const cells = tr.querySelectorAll('.rpd-cell');
            cells.forEach((td, idx) => {
                const v = values[idx];
                td.setAttribute('data-display', v);
                td.innerHTML = rpdFormatCell(v);
            });

            btn.classList.remove('rpd-btn-simpan', 'text-green-600', 'hover:text-green-800');
            btn.classList.add('rpd-btn-ubah', 'text-sky-600', 'hover:text-sky-800');
            btn.title = 'Ubah baris ini';
            btn.innerHTML = '<i class="fa-solid fa-pen"></i>';
            btn.disabled = false;
            btn.onclick = function () {
                rpdEnterEditMode(tr, btn);
            };
        } else {
            alert('Gagal menyimpan: ' + (result.message || 'Terjadi kesalahan.'));
            btn.disabled = false;
            btn.innerHTML = originalIcon;
        }
    } catch (e) {
        alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        btn.disabled = false;
        btn.innerHTML = originalIcon;
    }
}

window.initRpdPage = initRpdPage;
window.rpdLoadData = rpdLoadData;
