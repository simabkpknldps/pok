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
let pbLokasiList = [];

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
        <tr><td colspan="9" class="text-center text-slate-400 py-10">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat data...
        </td></tr>`;

    try {
        const result = await apiPost({ action: 'getPerbantuanData' });
        if (result.status !== 'success') {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-red-500 py-10">
                Gagal memuat data: ${result.message || 'Terjadi kesalahan.'}</td></tr>`;
            return;
        }

        pbAllRows = pbSortByTglMulai(result.rows || []);
        pbPegawaiList = result.pegawai || [];
        pbLokasiList = result.lokasi || [];

        pbRenderTable(pbAllRows);
        pbBindSearch();
        pbBindTambahUsulan();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-red-500 py-10">
            Error koneksi: ${e.message || 'Tidak diketahui'}</td></tr>`;
    }
}

function pbSortByTglMulai(rows) {
    return [...rows].sort((a, b) => {
        const ta = a.G ? new Date(a.G).getTime() : 0;
        const tb = b.G ? new Date(b.G).getTime() : 0;
        return tb - ta; // tanggal paling terakhir (terbaru) di atas
    });
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

function pbFormatTglStNd(val) {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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
            <td class="p-3 max-w-xs">${pbEsc(r.C)}</td>
            <td class="p-3 max-w-[10rem] truncate" title="${pbEsc(r.D)}">${pbEsc(r.D)}</td>
            <td class="p-3 max-w-xs">${pbEsc(r.E)}</td>
            <td class="p-3 whitespace-nowrap">${pbFormatTglStNd(r.F)}</td>
            <td class="p-3 whitespace-nowrap">${pbFormatTanggal(r.G)}</td>
            <td class="p-3 whitespace-nowrap">${pbFormatTanggal(r.H)}</td>
            <td class="p-3 text-right whitespace-nowrap">${r.M ? formatRibuan(r.M) : '-'}</td>
            <td class="p-3 whitespace-nowrap">${pbStatusBadge(r.P)}</td>
            <td class="p-3">
                <div class="flex items-center justify-center gap-3 text-slate-500">
                    <button class="pb-btn-edit hover:text-sky-600" title="Ubah"><i class="fa-solid fa-pencil"></i></button>
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

        tr.querySelector('.pb-btn-edit').onclick = () => {
            if (!pbCanEditOrDelete(row)) {
                alert('Data tidak dapat diubah karena status bukan "Rekam Data".');
                return;
            }
            pbOpenEditModal(row);
        };
        tr.querySelector('.pb-btn-detil').onclick = () => pbOpenDetilModal(row);
        tr.querySelector('.pb-btn-hapus').onclick = () => {
            if (!pbCanEditOrDelete(row)) {
                alert('Data tidak dapat dihapus karena status bukan "Rekam Data".');
                return;
            }
            pbHapusRow(row);
        };
    });
}

// Admin: bisa ubah/hapus data apapun statusnya.
// Non-admin: hanya bisa ubah/hapus data yang statusnya masih "Rekam Data".
function pbIsAdmin() {
    const admin = localStorage.getItem('admin');
    return admin === '1' || admin === 'true';
}

function pbCanEditOrDelete(row) {
    return pbIsAdmin() || row.P === 'Rekam Data';
}

// ==========================================
// Tambah Usulan
// ==========================================
function pbBindTambahUsulan() {
    const btn = document.getElementById('pb-btnTambahUsulan');
    if (btn) btn.onclick = pbOpenTambahUsulanModal;
}

function pbTuAddPegawaiRow(tbody, nama, nip, status) {
    const emptyRow = tbody.querySelector('.pb-pegawai-empty-row');
    if (emptyRow) emptyRow.remove();

    // Normalisasi status: 1/"1" -> PNS, 0/"0" -> PPNPN, selain itu -> belum dipilih
    let statusVal = '';
    if (status === 1 || status === '1') statusVal = '1';
    else if (status === 0 || status === '0') statusVal = '0';

    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100';
    tr.dataset.nama = nama;
    tr.innerHTML = `
        <td class="p-2 whitespace-nowrap truncate">${pbEsc(nama)}</td>
        <td class="p-2"><input type="text" class="pb-tu-nip w-full px-2 py-1 border border-slate-300 rounded-lg text-xs" placeholder="NIP" value="${pbEsc(nip || '')}"></td>
        <td class="p-2">
            <select class="pb-tu-status w-full px-2 py-1 border border-slate-300 rounded-lg text-xs">
                <option value="">-- Pilih --</option>
                <option value="1" ${statusVal === '1' ? 'selected' : ''}>PNS</option>
                <option value="0" ${statusVal === '0' ? 'selected' : ''}>PPNPN</option>
            </select>
        </td>
        <td class="p-2"><input type="text" inputmode="numeric" class="pb-tu-jumlah w-full px-2 py-1 border border-slate-300 rounded-lg text-xs" placeholder="0"></td>
        <td class="p-2 text-center">
            <button type="button" class="pb-tu-btnHapusPegawai text-red-400 hover:text-red-600" title="Hapus">
                <i class="fa-solid fa-trash"></i>
            </button>
        </td>
    `;
    tr.querySelector('.pb-tu-jumlah').oninput = function () { this.value = formatRibuan(this.value); };
    tr.querySelector('.pb-tu-btnHapusPegawai').onclick = () => {
        tr.remove();
        if (!tbody.querySelector('tr')) {
            tbody.innerHTML = `<tr class="pb-pegawai-empty-row">
                <td colspan="5" class="p-3 text-center text-slate-400">Belum ada pegawai ditambahkan.</td>
            </tr>`;
        }
    };
    tbody.appendChild(tr);
}

function pbOpenTambahUsulanModal() {
    const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';
    const labelClass = 'text-sm font-medium text-slate-600';

    const tujuanOptions = pbLokasiList.map(t => `<option value="${pbEsc(t)}"></option>`).join('');
    const pegawaiOptions = pbPegawaiList.map(p => `<option value="${pbEsc(p.nama || p.Nama || '')}"></option>`).join('');

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-plus mr-2"></i>Tambah Usulan Perbantuan</h3>
            <button id="pb-tu-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <label class="${labelClass}">ID Kegiatan</label>
        <input id="pb-tu-idkegiatan" type="text" placeholder="ID Kegiatan" class="${inputClass}">

        <label class="${labelClass}">No ST / Uraian Kegiatan</label>
        <input id="pb-tu-nost" type="text" placeholder="Contoh: ST-0123/KNL.1404/2026" class="${inputClass}">

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
                <label class="${labelClass}">Tgl ST / Tgl Kegiatan</label>
                <input id="pb-tu-tglst" type="date" class="${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">Tgl Mulai</label>
                <input id="pb-tu-tglmulai" type="date" class="${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">Tgl Selesai</label>
                <input id="pb-tu-tglselesai" type="date" class="${inputClass}">
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
                <label class="${labelClass}">Tujuan</label>
                <input id="pb-tu-tujuan" type="text" placeholder="Ketik tujuan..." list="pb-tu-tujuan-list" autocomplete="off" class="${inputClass}">
                <datalist id="pb-tu-tujuan-list">${tujuanOptions}</datalist>
            </div>
            <div>
                <label class="${labelClass}">Cari / Tambah Pegawai</label>
                <div class="flex gap-2">
                    <input id="pb-tu-pegawai-search" type="text" placeholder="Ketik nama pegawai..." list="pb-tu-pegawai-list" autocomplete="off" class="${inputClass} flex-1">
                    <button id="pb-tu-btnSubmitPegawai" type="button" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium shrink-0">Submit</button>
                </div>
                <datalist id="pb-tu-pegawai-list">${pegawaiOptions}</datalist>
            </div>
        </div>

        <div class="overflow-x-auto border border-slate-200 rounded-xl mt-1">
            <table class="w-full text-xs border-collapse table-fixed">
                <thead>
                    <tr class="bg-slate-50 text-slate-600 uppercase">
                        <th class="p-2 text-left">Nama</th>
                        <th class="p-2 text-left">NIP</th>
                        <th class="p-2 text-left">Status</th>
                        <th class="p-2 text-left">Jumlah RAB</th>
                        <th class="p-2 text-center w-14">Aksi</th>
                    </tr>
                </thead>
                <tbody id="pb-tu-pegawai-tbody">
                    <tr class="pb-pegawai-empty-row">
                        <td colspan="5" class="p-3 text-center text-slate-400">Belum ada pegawai ditambahkan.</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="flex justify-end gap-2 mt-2">
            <button id="pb-tu-btnTutup" type="button" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium">
                <i class="fa-solid fa-xmark mr-1"></i> Tutup
            </button>
            <button id="pb-tu-btnSimpan" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
            </button>
        </div>
    `, 'max-w-2xl');

    // Tutup popup (otomatis menghapus semua isian karena elemen dihapus dari DOM)
    popup.querySelector('#pb-tu-closeBtn').onclick = () => overlay.remove();
    popup.querySelector('#pb-tu-btnTutup').onclick = () => overlay.remove();

    const tbody = popup.querySelector('#pb-tu-pegawai-tbody');
    const searchInput = popup.querySelector('#pb-tu-pegawai-search');

    popup.querySelector('#pb-tu-btnSubmitPegawai').onclick = () => {
        const val = searchInput.value.trim();
        if (!val) return;

        const match = pbPegawaiList.find(p =>
            String(p.nama || p.Nama || '').toLowerCase() === val.toLowerCase()
        );
        const nama = match ? (match.nama || match.Nama) : val;
        const nip = match ? (match.nip || match.NIP || '') : '';
        const status = match ? (match.status !== undefined ? match.status : match.Status) : '';

        pbTuAddPegawaiRow(tbody, nama, nip, status);
        searchInput.value = '';
        searchInput.focus();
    };

    // Enter di kolom search sama seperti klik Submit
    searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            popup.querySelector('#pb-tu-btnSubmitPegawai').click();
        }
    };

    popup.querySelector('#pb-tu-btnSimpan').onclick = async function () {
        const btn = this;
        const idKegiatan = popup.querySelector('#pb-tu-idkegiatan').value.trim();
        const noSt = popup.querySelector('#pb-tu-nost').value.trim();
        const tglSt = popup.querySelector('#pb-tu-tglst').value;
        const tglMulai = popup.querySelector('#pb-tu-tglmulai').value;
        const tglSelesai = popup.querySelector('#pb-tu-tglselesai').value;
        const tujuan = popup.querySelector('#pb-tu-tujuan').value.trim();

        if (!idKegiatan || !noSt || !tglSt || !tglMulai || !tglSelesai || !tujuan) {
            alert('ID Kegiatan, No ST/Uraian Kegiatan, Tgl ST, Tgl Mulai, Tgl Selesai, dan Tujuan harus diisi!');
            return;
        }

        const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => !tr.classList.contains('pb-pegawai-empty-row'));
        if (rows.length === 0) {
            alert('Tambahkan minimal satu pegawai!');
            return;
        }

        const belumLengkap = rows.some(tr =>
            !tr.querySelector('.pb-tu-nip').value.trim() || !tr.querySelector('.pb-tu-status').value
        );
        if (belumLengkap) {
            alert('NIP dan Status setiap pegawai di tabel harus diisi!');
            return;
        }

        const pelaksanaData = rows.map(tr => ({
            nama: tr.dataset.nama,
            nip: tr.querySelector('.pb-tu-nip').value.trim(),
            status: tr.querySelector('.pb-tu-status').value,
            jumlah: tr.querySelector('.pb-tu-jumlah').value.replace(/\./g, '')
        }));

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const namaUser = localStorage.getItem('nama') || '';

            const result = await apiPost({
                action: 'simpanPerbantuan',
                idKegiatan, noSt, tglSt, tglMulai, tglSelesai, tujuan,
                userLogin: namaUser,
                pelaksanaData
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
// Ubah (pencil) — struktur sama persis dengan popup Tambah Usulan,
// hanya saja textbox ID Kegiatan tidak ada (ID lama dipertahankan).
// ==========================================
function pbOpenEditModal(row) {
    const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';
    const labelClass = 'text-sm font-medium text-slate-600';

    // No ST / Uraian Kegiatan ditampilkan & diedit APA ADANYA (row.C sudah
    // merupakan teks gabungan final) — tidak ada lagi ekstraksi/penambahan
    // "(ID: ...)" di popup Ubah ini.
    const noStAwal = row.C || '';
    const makAwal = row.B || '';

    const tujuanOptions = pbLokasiList.map(t => `<option value="${pbEsc(t)}"></option>`).join('');
    const pegawaiOptions = pbPegawaiList.map(p => `<option value="${pbEsc(p.nama || p.Nama || '')}"></option>`).join('');

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-pencil mr-2"></i>Ubah Usulan Perbantuan</h3>
            <button id="pb-ed-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
                <label class="${labelClass}">No ST / Uraian Kegiatan</label>
                <input id="pb-ed-nost" type="text" value="${pbEsc(noStAwal)}" class="${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">MAK</label>
                <input id="pb-ed-mak" type="text" value="${pbEsc(makAwal)}" disabled
                    class="w-full px-3 py-2 border border-slate-200 bg-slate-100 text-slate-500 rounded-lg text-sm cursor-not-allowed">
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
                <label class="${labelClass}">Tgl ST / Tgl Kegiatan</label>
                <input id="pb-ed-tglst" type="date" value="${pbEsc(row.F)}" class="${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">Tgl Mulai</label>
                <input id="pb-ed-tglmulai" type="date" value="${pbEsc(row.G)}" class="${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">Tgl Selesai</label>
                <input id="pb-ed-tglselesai" type="date" value="${pbEsc(row.H)}" class="${inputClass}">
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
                <label class="${labelClass}">Tujuan</label>
                <input id="pb-ed-tujuan" type="text" value="${pbEsc(row.E)}" list="pb-ed-tujuan-list" autocomplete="off" class="${inputClass}">
                <datalist id="pb-ed-tujuan-list">${tujuanOptions}</datalist>
            </div>
            <div>
                <label class="${labelClass}">Cari / Tambah Pegawai</label>
                <div class="flex gap-2">
                    <input id="pb-ed-pegawai-search" type="text" placeholder="Ketik nama pegawai..." list="pb-ed-pegawai-list" autocomplete="off" class="${inputClass} flex-1">
                    <button id="pb-ed-btnSubmitPegawai" type="button" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium shrink-0">Submit</button>
                </div>
                <datalist id="pb-ed-pegawai-list">${pegawaiOptions}</datalist>
            </div>
        </div>

        <div class="overflow-x-auto border border-slate-200 rounded-xl mt-1">
            <table class="w-full text-xs border-collapse table-fixed">
                <thead>
                    <tr class="bg-slate-50 text-slate-600 uppercase">
                        <th class="p-2 text-left">Nama</th>
                        <th class="p-2 text-left">NIP</th>
                        <th class="p-2 text-left">Status</th>
                        <th class="p-2 text-left">Jumlah RAB</th>
                        <th class="p-2 text-center w-14">Aksi</th>
                    </tr>
                </thead>
                <tbody id="pb-ed-pegawai-tbody">
                    <tr class="pb-pegawai-empty-row">
                        <td colspan="5" class="p-3 text-center text-slate-400">Belum ada pegawai ditambahkan.</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="flex justify-end gap-2 mt-2">
            <button id="pb-ed-btnTutup" type="button" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium">
                <i class="fa-solid fa-xmark mr-1"></i> Tutup
            </button>
            <button id="pb-ed-btnSimpan" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
            </button>
        </div>
    `, 'max-w-2xl');

    popup.querySelector('#pb-ed-closeBtn').onclick = () => overlay.remove();
    popup.querySelector('#pb-ed-btnTutup').onclick = () => overlay.remove();

    const tbody = popup.querySelector('#pb-ed-pegawai-tbody');
    const searchInput = popup.querySelector('#pb-ed-pegawai-search');

    // Prefill baris pegawai dari SEMUA data yang satu grup (kolom C sama persis
    // dengan baris yang diklik) — bukan cuma baris yang diklik saja. Jadi kalau
    // ada 2 baris sheet untuk 1 usulan yang sama, tabel di popup Ubah akan
    // menampilkan 2 baris pegawai juga. NIP & Status dicari dari daftar pegawai
    // (kalau ketemu berdasarkan nama), kalau tidak dikosongkan supaya bisa
    // diisi manual.
    const groupRows = pbAllRows.filter(r => String(r.C) === String(row.C));
    (groupRows.length ? groupRows : [row]).forEach(r => {
        const existingMatch = pbPegawaiList.find(p =>
            String(p.nama || p.Nama || '').toLowerCase() === String(r.D || '').toLowerCase()
        );
        pbTuAddPegawaiRow(
            tbody,
            r.D,
            existingMatch ? (existingMatch.nip || existingMatch.NIP || '') : '',
            existingMatch ? (existingMatch.status !== undefined ? existingMatch.status : existingMatch.Status) : ''
        );
        const lastRowEl = tbody.querySelector('tr:last-child');
        const jumlahInput = lastRowEl ? lastRowEl.querySelector('.pb-tu-jumlah') : null;
        if (jumlahInput && r.M) jumlahInput.value = formatRibuan(r.M);
    });

    popup.querySelector('#pb-ed-btnSubmitPegawai').onclick = () => {
        const val = searchInput.value.trim();
        if (!val) return;

        const match = pbPegawaiList.find(p =>
            String(p.nama || p.Nama || '').toLowerCase() === val.toLowerCase()
        );
        const nama = match ? (match.nama || match.Nama) : val;
        const nip = match ? (match.nip || match.NIP || '') : '';
        const status = match ? (match.status !== undefined ? match.status : match.Status) : '';

        pbTuAddPegawaiRow(tbody, nama, nip, status);
        searchInput.value = '';
        searchInput.focus();
    };

    searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            popup.querySelector('#pb-ed-btnSubmitPegawai').click();
        }
    };

    popup.querySelector('#pb-ed-btnSimpan').onclick = async function () {
        const btn = this;
        const noSt = popup.querySelector('#pb-ed-nost').value.trim();
        const tglSt = popup.querySelector('#pb-ed-tglst').value;
        const tglMulai = popup.querySelector('#pb-ed-tglmulai').value;
        const tglSelesai = popup.querySelector('#pb-ed-tglselesai').value;
        const tujuan = popup.querySelector('#pb-ed-tujuan').value.trim();

        if (!noSt || !tglSt || !tglMulai || !tglSelesai || !tujuan) {
            alert('No ST/Uraian Kegiatan, Tgl ST, Tgl Mulai, Tgl Selesai, dan Tujuan harus diisi!');
            return;
        }

        const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => !tr.classList.contains('pb-pegawai-empty-row'));
        if (rows.length === 0) {
            alert('Tambahkan minimal satu pegawai!');
            return;
        }

        const belumLengkap = rows.some(tr =>
            !tr.querySelector('.pb-tu-nip').value.trim() || !tr.querySelector('.pb-tu-status').value
        );
        if (belumLengkap) {
            alert('NIP dan Status setiap pegawai di tabel harus diisi!');
            return;
        }

        const pelaksanaData = rows.map(tr => ({
            nama: tr.dataset.nama,
            nip: tr.querySelector('.pb-tu-nip').value.trim(),
            status: tr.querySelector('.pb-tu-status').value,
            jumlah: tr.querySelector('.pb-tu-jumlah').value.replace(/\./g, '')
        }));

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const namaUser = localStorage.getItem('nama') || '';

            const result = await apiPost({
                action: 'updatePerbantuan',
                mak: makAwal,
                oldUraianGabungan: row.C,
                noSt, tglSt, tglMulai, tglSelesai, tujuan,
                userLogin: namaUser,
                pelaksanaData
            });

            if (result.status === 'success') {
                showToast('Data perbantuan berhasil diubah');
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
// Detil — menampilkan semua kolom sheet Data_Kegiatan_2026 untuk baris ini,
// kecuali kolom K, L, O, dan S (formula bantu & flag internal).
// Data sudah tersedia di client (row didapat dari getPerbantuanData), jadi
// tidak perlu panggil API lagi.
// ==========================================
function pbOpenDetilModal(row) {
    const fields = [
        { label: 'ID Kegiatan', value: row.A },
        { label: 'MAK', value: row.B },
        { label: 'Uraian', value: row.C },
        { label: 'Pelaksana', value: row.D },
        { label: 'Tujuan', value: row.E },
        { label: 'Tgl ST/ND', value: pbFormatTanggal(row.F) },
        { label: 'Tgl Mulai', value: pbFormatTanggal(row.G) },
        { label: 'Tgl Selesai', value: pbFormatTanggal(row.H) },
        { label: 'Tgl LPT', value: pbFormatTanggal(row.I) },
        { label: 'Tgl Bayar', value: pbFormatTanggal(row.J) },
        { label: 'Jumlah RAB', value: row.M ? formatRibuan(row.M) : '-' },
        { label: 'User', value: row.N },
        { label: 'Status', value: null, html: pbStatusBadge(row.P) },
        { label: 'Tgl SP2D', value: pbFormatTanggal(row.Q) },
        { label: 'Nomor SPM', value: row.R }
    ];

    const rowsHtml = fields.map(f => `
        <div class="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100">
            <div class="text-slate-500 font-medium">${pbEsc(f.label)}</div>
            <div class="col-span-2">${f.html ? f.html : (pbEsc(f.value) || '-')}</div>
        </div>
    `).join('');

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-eye mr-2"></i>Detil Kegiatan</h3>
            <button id="pb-dt-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="text-sm">
            ${rowsHtml}
        </div>
    `, 'max-w-2xl');

    popup.querySelector('#pb-dt-closeBtn').onclick = () => overlay.remove();
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
