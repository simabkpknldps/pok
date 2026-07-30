/**
 * js/pages/perbantuan.js
 * -----------------------------------------------------------------------
 * Halaman "Perbantuan".
 *
 * Sumber data: sheet Data_Kegiatan_2026, hanya baris yang kolom S = 1
 * (difilter di backend GAS lewat action 'getPerbantuanData').
 *
 * Kolom yang ditampilkan: B(MAK) C(Uraian) D(Pelaksana) E(Tujuan)
 * F(Tgl ST/ND) G(Tgl Mulai) H(Tgl Selesai) I(Tgl LPT) J(Tgl Bayar)
 * M(Jumlah - rata kanan) P(Status - berwarna).
 *
 * Aksi per baris: pencil (ubah), pegawai (assign pelaksana), detil, hapus.
 * Di atas tabel: search bar + tombol "Tambah Usulan".
 *
 * Backend GAS yang dipakai (lihat file tambahan gas_perbantuan_additions.txt):
 *   - getPerbantuanData   -> load data (filter kolom S = 1)
 *   - simpanPerbantuan    -> tambah usulan baru (set kolom S = 1)
 *   - updateKegiatanDetail-> dipakai tombol pencil (sudah ada di backend)
 *   - updatePelaksanaKegiatan (+ flag isPerbantuan) -> dipakai tombol pegawai
 *   - deleteKegiatan      -> dipakai tombol hapus (sudah ada di backend)
 *   - getDetil (doGet)    -> dipakai tombol detil, menampilkan semua baris
 *                            dengan MAK yang sama (sudah ada di backend)
 * -----------------------------------------------------------------------
 */

let pbAllRows = [];
let pbPegawaiList = [];

const PB_STATUS_STYLE = {
    'Rekam Data': 'bg-pink-100 text-pink-700',
    'Terlaksana': 'bg-slate-200 text-slate-700',
    'LPT': 'bg-yellow-100 text-yellow-700',
    'Terbayar': 'bg-green-100 text-green-700',
    'Selesai': 'bg-blue-100 text-blue-700'
};

async function initPerbantuanPage() {
    const tbody = document.getElementById('pb-tbody');
    tbody.innerHTML = `
        <tr><td colspan="12" class="text-center text-slate-400 py-10">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat data...
        </td></tr>`;

    try {
        const result = await apiPost({ action: 'getPerbantuanData' });
        if (result.status !== 'success') {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center text-red-500 py-10">
                Gagal memuat data: ${result.message || 'Terjadi kesalahan.'}</td></tr>`;
            return;
        }

        pbAllRows = result.rows || [];
        pbPegawaiList = result.pegawai || [];

        pbRenderTable(pbAllRows);
        pbBindSearch();
        pbBindTambahUsulan();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center text-red-500 py-10">
            Error koneksi: ${e.message || 'Tidak diketahui'}</td></tr>`;
    }
}

function pbBindSearch() {
    const input = document.getElementById('pb-search');
    if (!input) return;
    input.oninput = () => {
        const q = input.value.trim().toLowerCase();
        if (!q) {
            pbRenderTable(pbAllRows);
            return;
        }
        const filtered = pbAllRows.filter(r =>
            String(r.B || '').toLowerCase().includes(q) ||
            String(r.C || '').toLowerCase().includes(q) ||
            String(r.D || '').toLowerCase().includes(q) ||
            String(r.E || '').toLowerCase().includes(q)
        );
        pbRenderTable(filtered);
    };
}

function pbStatusBadge(status) {
    const cls = PB_STATUS_STYLE[status] || 'bg-slate-100 text-slate-500';
    return `<span class="px-2.5 py-1 rounded-full text-xs font-medium ${cls}">${status || '-'}</span>`;
}

function pbFormatTanggal(val) {
    if (!val) return '-';
    // Backend sudah mengirim format yyyy-MM-dd untuk kolom tanggal.
    return val;
}

function pbEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function pbRenderTable(rows) {
    const tbody = document.getElementById('pb-tbody');
    const emptyState = document.getElementById('pb-emptyState');

    if (!rows || rows.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    tbody.innerHTML = rows.map(r => `
        <tr class="border-b border-slate-100 hover:bg-slate-50" data-id="${pbEsc(r.A)}">
            <td class="p-3 whitespace-nowrap">${pbEsc(r.B)}</td>
            <td class="p-3 max-w-xs">${pbEsc(r.C)}</td>
            <td class="p-3 whitespace-nowrap">${pbEsc(r.D)}</td>
            <td class="p-3 max-w-xs">${pbEsc(r.E)}</td>
            <td class="p-3 whitespace-nowrap">${pbFormatTanggal(r.F)}</td>
            <td class="p-3 whitespace-nowrap">${pbFormatTanggal(r.G)}</td>
            <td class="p-3 whitespace-nowrap">${pbFormatTanggal(r.H)}</td>
            <td class="p-3 whitespace-nowrap">${pbFormatTanggal(r.I)}</td>
            <td class="p-3 whitespace-nowrap">${pbFormatTanggal(r.J)}</td>
            <td class="p-3 text-right whitespace-nowrap">${r.M ? 'Rp ' + formatRibuan(r.M) : '-'}</td>
            <td class="p-3 whitespace-nowrap">${pbStatusBadge(r.P)}</td>
            <td class="p-3">
                <div class="flex items-center justify-center gap-3 text-slate-500">
                    <button class="pb-btn-edit hover:text-sky-600" title="Ubah"><i class="fa-solid fa-pencil"></i></button>
                    <button class="pb-btn-pegawai hover:text-emerald-600" title="Pegawai"><i class="fa-solid fa-user-plus"></i></button>
                    <button class="pb-btn-detil hover:text-slate-800" title="Detil"><i class="fa-solid fa-eye"></i></button>
                    <button class="pb-btn-hapus hover:text-red-600" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
        const id = tr.getAttribute('data-id');
        const row = pbAllRows.find(r => String(r.A) === String(id));
        if (!row) return;

        tr.querySelector('.pb-btn-edit').onclick = () => pbOpenEditModal(row);
        tr.querySelector('.pb-btn-pegawai').onclick = () => pbOpenPegawaiModal(row);
        tr.querySelector('.pb-btn-detil').onclick = () => pbOpenDetilModal(row);
        tr.querySelector('.pb-btn-hapus').onclick = () => pbHapusRow(row);
    });
}

// ==========================================
// Tambah Usulan
// ==========================================
function pbBindTambahUsulan() {
    const btn = document.getElementById('pb-btnTambahUsulan');
    if (btn) btn.onclick = pbOpenTambahUsulanModal;
}

function pbOpenTambahUsulanModal() {
    const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';
    const labelClass = 'text-sm font-medium text-slate-600';

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-plus mr-2"></i>Tambah Usulan Perbantuan</h3>
            <button id="pb-tu-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <label class="${labelClass}">MAK</label>
        <input id="pb-tu-mak" type="text" placeholder="Kode MAK" class="${inputClass}">
        <label class="${labelClass}">Uraian</label>
        <input id="pb-tu-uraian" type="text" placeholder="Uraian kegiatan" class="${inputClass}">
        <label class="${labelClass}">Tujuan</label>
        <input id="pb-tu-tujuan" type="text" placeholder="Tujuan" class="${inputClass}">
        <label class="${labelClass}">Tanggal ST/ND</label>
        <input id="pb-tu-tglst" type="date" class="${inputClass}">
        <label class="${labelClass}">Estimasi Jumlah (Rp)</label>
        <input id="pb-tu-jumlah" type="text" inputmode="numeric" placeholder="0" class="${inputClass}">
        <div class="flex justify-end gap-2 mt-2">
            <button id="pb-tu-btnSimpan" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
            </button>
        </div>
    `, 'max-w-md');

    popup.querySelector('#pb-tu-closeBtn').onclick = () => overlay.remove();

    // Auto-format ribuan saat mengetik jumlah
    const jumlahInput = popup.querySelector('#pb-tu-jumlah');
    jumlahInput.oninput = () => { jumlahInput.value = formatRibuan(jumlahInput.value); };

    popup.querySelector('#pb-tu-btnSimpan').onclick = async function () {
        const btn = this;
        const mak = popup.querySelector('#pb-tu-mak').value.trim();
        const uraian = popup.querySelector('#pb-tu-uraian').value.trim();
        const tujuan = popup.querySelector('#pb-tu-tujuan').value.trim();
        const tglSt = popup.querySelector('#pb-tu-tglst').value;
        const estimasi = popup.querySelector('#pb-tu-jumlah').value.replace(/\./g, '');

        if (!mak || !uraian || !tujuan || !tglSt) {
            alert('MAK, Uraian, Tujuan, dan Tanggal ST/ND harus diisi!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const nip = localStorage.getItem('nip') || '';
            const today = new Date();
            const tglRekam = today.getFullYear() + '-' +
                String(today.getMonth() + 1).padStart(2, '0') + '-' +
                String(today.getDate()).padStart(2, '0');

            const result = await apiPost({
                action: 'simpanPerbantuan',
                idKegiatan: generateIdUsulan(),
                mak, uraian, tujuan, tglSt,
                estimasi,
                userLogin: nip,
                tglRekam
            });

            if (result.status === 'success') {
                showToast('Usulan perbantuan berhasil ditambahkan');
                overlay.remove();
                initPerbantuanPage();
            } else {
                alert('Gagal: ' + (result.message || 'Terjadi kesalahan.'));
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

// ==========================================
// Ubah (pencil)
// ==========================================
function pbOpenEditModal(row) {
    const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';
    const labelClass = 'text-sm font-medium text-slate-600';

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-pencil mr-2"></i>Ubah Kegiatan</h3>
            <button id="pb-ed-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <label class="${labelClass}">Uraian</label>
        <input id="pb-ed-uraian" type="text" value="${pbEsc(row.C)}" class="${inputClass}">
        <label class="${labelClass}">Pelaksana</label>
        <input id="pb-ed-pelaksana" type="text" value="${pbEsc(row.D)}" class="${inputClass}">
        <label class="${labelClass}">Tujuan</label>
        <input id="pb-ed-tujuan" type="text" value="${pbEsc(row.E)}" class="${inputClass}">
        <label class="${labelClass}">Tanggal ST/ND</label>
        <input id="pb-ed-tglst" type="date" value="${pbEsc(row.F)}" class="${inputClass}">
        <label class="${labelClass}">Jumlah (Rp)</label>
        <input id="pb-ed-jumlah" type="text" inputmode="numeric" value="${row.M ? formatRibuan(row.M) : ''}" class="${inputClass}">
        <div class="flex justify-end gap-2 mt-2">
            <button id="pb-ed-btnSimpan" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
            </button>
        </div>
    `, 'max-w-md');

    popup.querySelector('#pb-ed-closeBtn').onclick = () => overlay.remove();

    const jumlahInput = popup.querySelector('#pb-ed-jumlah');
    jumlahInput.oninput = () => { jumlahInput.value = formatRibuan(jumlahInput.value); };

    popup.querySelector('#pb-ed-btnSimpan').onclick = async function () {
        const btn = this;
        const uraian = popup.querySelector('#pb-ed-uraian').value.trim();
        const pelaksana = popup.querySelector('#pb-ed-pelaksana').value.trim();
        const tujuan = popup.querySelector('#pb-ed-tujuan').value.trim();
        const tglST = popup.querySelector('#pb-ed-tglst').value;
        const jumlah = popup.querySelector('#pb-ed-jumlah').value.replace(/\./g, '');

        if (!uraian || !tujuan || !tglST) {
            alert('Uraian, Tujuan, dan Tanggal ST/ND harus diisi!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const result = await apiPost({
                action: 'updateKegiatanDetail',
                id: row.A, uraian, pelaksana, tujuan, tglST, jumlah
            });
            if (result.status === 'success') {
                showToast('Data kegiatan berhasil diubah');
                overlay.remove();
                initPerbantuanPage();
            } else {
                alert('Gagal: ' + (result.message || 'Terjadi kesalahan.'));
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

// ==========================================
// Pegawai (assign pelaksana)
// ==========================================
function pbOpenPegawaiModal(row) {
    const namaOptions = pbPegawaiList.map(p => {
        const nama = p.nama || p.Nama || p;
        return `<option value="${pbEsc(nama)}">${pbEsc(nama)}</option>`;
    }).join('');

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-user-plus mr-2"></i>Pegawai Pelaksana</h3>
            <button id="pb-pg-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <p class="text-xs text-slate-500 -mt-1">MAK ${pbEsc(row.B)} — ${pbEsc(row.C)}</p>
        <div id="pb-pg-list" class="flex flex-col gap-3"></div>
        <button id="pb-pg-btnTambahBaris" class="text-sky-600 hover:text-sky-800 text-sm font-medium text-left">
            <i class="fa-solid fa-circle-plus mr-1"></i> Tambah pelaksana
        </button>
        <div class="flex justify-end gap-2 mt-2">
            <button id="pb-pg-btnSimpan" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
            </button>
        </div>
    `, 'max-w-lg');

    popup.querySelector('#pb-pg-closeBtn').onclick = () => overlay.remove();

    const listEl = popup.querySelector('#pb-pg-list');
    const inputClass = 'w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500';

    function pbAddBarisPelaksana() {
        const idx = listEl.children.length;
        const div = document.createElement('div');
        div.className = 'pb-pg-baris grid grid-cols-1 sm:grid-cols-4 gap-2 border border-slate-200 rounded-xl p-3';
        div.innerHTML = `
            <div class="sm:col-span-4 flex justify-between items-center mb-1">
                <span class="text-xs font-semibold text-slate-500">Pelaksana ${idx + 1}</span>
                <button type="button" class="pb-pg-btnHapusBaris text-red-400 hover:text-red-600 text-xs"><i class="fa-solid fa-trash"></i></button>
            </div>
            <select class="pb-pg-nama ${inputClass} sm:col-span-1">
                <option value="">-- Nama --</option>
                ${namaOptions}
            </select>
            <input type="date" class="pb-pg-mulai ${inputClass} sm:col-span-1" placeholder="Tgl Mulai">
            <input type="date" class="pb-pg-selesai ${inputClass} sm:col-span-1" placeholder="Tgl Selesai">
            <input type="text" inputmode="numeric" class="pb-pg-jumlah ${inputClass} sm:col-span-1" placeholder="Jumlah (Rp)">
        `;
        div.querySelector('.pb-pg-btnHapusBaris').onclick = () => div.remove();
        div.querySelector('.pb-pg-jumlah').oninput = function () { this.value = formatRibuan(this.value); };
        listEl.appendChild(div);
    }

    // Baris awal: prefill dari data pelaksana yang sudah ada (kalau ada)
    pbAddBarisPelaksana();
    if (row.D) listEl.querySelector('.pb-pg-nama').value = row.D;
    if (row.G) listEl.querySelector('.pb-pg-mulai').value = row.G;
    if (row.H) listEl.querySelector('.pb-pg-selesai').value = row.H;
    if (row.M) listEl.querySelector('.pb-pg-jumlah').value = formatRibuan(row.M);

    popup.querySelector('#pb-pg-btnTambahBaris').onclick = pbAddBarisPelaksana;

    popup.querySelector('#pb-pg-btnSimpan').onclick = async function () {
        const btn = this;
        const baris = Array.from(listEl.querySelectorAll('.pb-pg-baris'));
        const pelaksanaData = baris.map(b => ({
            nama: b.querySelector('.pb-pg-nama').value,
            tglMulai: b.querySelector('.pb-pg-mulai').value,
            tglSelesai: b.querySelector('.pb-pg-selesai').value,
            jumlah: b.querySelector('.pb-pg-jumlah').value.replace(/\./g, '')
        })).filter(p => p.nama);

        if (pelaksanaData.length === 0) {
            alert('Pilih minimal satu nama pelaksana!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const nip = localStorage.getItem('nip') || '';
            const result = await apiPost({
                action: 'updatePelaksanaKegiatan',
                idKegiatanLama: row.A,
                mak: row.B,
                uraian: row.C,
                tujuan: row.E,
                tglSt: row.F,
                userLogin: nip,
                pelaksanaData,
                isPerbantuan: true // penting: supaya baris baru tetap kolom S = 1 (tetap tampil di halaman Perbantuan)
            });
            if (result.status === 'success') {
                showToast('Data pelaksana berhasil disimpan');
                overlay.remove();
                initPerbantuanPage();
            } else {
                alert('Gagal: ' + (result.message || 'Terjadi kesalahan.'));
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

// ==========================================
// Detil
// ==========================================
async function pbOpenDetilModal(row) {
    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-eye mr-2"></i>Detil Kegiatan — MAK ${pbEsc(row.B)}</h3>
            <button id="pb-dt-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="pb-dt-content" class="text-center text-slate-400 py-6">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat detil...
        </div>
    `, 'max-w-2xl');

    popup.querySelector('#pb-dt-closeBtn').onclick = () => overlay.remove();

    try {
        const list = await apiGet('getDetil', { mak: row.B });
        const contentEl = popup.querySelector('#pb-dt-content');

        if (!Array.isArray(list) || list.length === 0) {
            contentEl.innerHTML = '<p class="text-slate-400 text-sm">Tidak ada detil ditemukan.</p>';
            return;
        }

        contentEl.className = 'overflow-x-auto';
        contentEl.innerHTML = `
            <table class="w-full text-xs border-collapse">
                <thead>
                    <tr class="bg-slate-50 text-slate-600 uppercase">
                        <th class="p-2 text-left">Pelaksana</th>
                        <th class="p-2 text-left">Tujuan</th>
                        <th class="p-2 text-left">Tgl ST/ND</th>
                        <th class="p-2 text-right">Estimasi</th>
                        <th class="p-2 text-left">Status</th>
                        <th class="p-2 text-left">No. SPM</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map(d => `
                        <tr class="border-b border-slate-100">
                            <td class="p-2">${pbEsc(d.pelaksana_kegiatan)}</td>
                            <td class="p-2">${pbEsc(d.tujuan)}</td>
                            <td class="p-2">${pbEsc(d.tglSt)}</td>
                            <td class="p-2 text-right">${d.estimasi ? 'Rp ' + formatRibuan(d.estimasi) : '-'}</td>
                            <td class="p-2">${pbStatusBadge(d.status)}</td>
                            <td class="p-2">${pbEsc(d.nomorSPM)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        popup.querySelector('#pb-dt-content').innerHTML =
            `<span class="text-red-500 text-sm">Error koneksi: ${e.message || 'Tidak diketahui'}</span>`;
    }
}

// ==========================================
// Hapus
// ==========================================
async function pbHapusRow(row) {
    if (!confirm(`Hapus kegiatan "${row.C}" (MAK ${row.B})? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
        const result = await apiPost({ action: 'deleteKegiatan', id: row.A });
        if (result.status === 'success') {
            showToast('Data berhasil dihapus');
            initPerbantuanPage();
        } else {
            alert('Gagal menghapus: ' + (result.message || 'Terjadi kesalahan.'));
        }
    } catch (e) {
        alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
    }
}

window.initPerbantuanPage = initPerbantuanPage;
