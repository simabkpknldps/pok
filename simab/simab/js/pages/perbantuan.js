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
let pbStatusFilter = 'Dalam Proses'; // default: semua status kecuali "Selesai"

// Daftar Kanpus, Kanwil, dan KPKNL DJKN se-Indonesia — dipakai untuk dropdown
// "Kantor" (di samping ID Kegiatan) pada popup Tambah Usulan Perbantuan.
const PB_DAFTAR_KANTOR = [
    'Kantor Pusat DJKN',
    'Kanwil DJKN Aceh', 'KPKNL Banda Aceh', 'KPKNL Lhokseumawe',
    'Kanwil DJKN Sumatera Utara', 'KPKNL Medan', 'KPKNL Pematangsiantar', 'KPKNL Kisaran', 'KPKNL Padangsidimpuan',
    'Kanwil DJKN Riau, Sumatera Barat, dan Kepulauan Riau', 'KPKNL Pekanbaru', 'KPKNL Dumai', 'KPKNL Padang', 'KPKNL Bukittinggi', 'KPKNL Batam',
    'Kanwil DJKN Sumatera Selatan, Jambi, dan Bangka Belitung', 'KPKNL Palembang', 'KPKNL Lahat', 'KPKNL Jambi', 'KPKNL Pangkal Pinang',
    'Kanwil DJKN Lampung dan Bengkulu', 'KPKNL Bandar Lampung', 'KPKNL Metro', 'KPKNL Bengkulu',
    'Kanwil DJKN Banten', 'KPKNL Serang', 'KPKNL Tangerang I', 'KPKNL Tangerang II',
    'Kanwil DJKN DKI Jakarta', 'KPKNL Jakarta I', 'KPKNL Jakarta II', 'KPKNL Jakarta III', 'KPKNL Jakarta IV', 'KPKNL Jakarta V',
    'Kanwil DJKN Jawa Barat', 'KPKNL Bandung', 'KPKNL Bekasi', 'KPKNL Bogor', 'KPKNL Purwakarta', 'KPKNL Tasikmalaya', 'KPKNL Cirebon',
    'Kanwil DJKN Jawa Tengah dan D.I. Yogyakarta', 'KPKNL Semarang', 'KPKNL Surakarta', 'KPKNL Pekalongan', 'KPKNL Tegal', 'KPKNL Purwokerto', 'KPKNL Yogyakarta',
    'Kanwil DJKN Jawa Timur', 'KPKNL Surabaya', 'KPKNL Sidoarjo', 'KPKNL Malang', 'KPKNL Jember', 'KPKNL Pamekasan', 'KPKNL Madiun',
    'Kanwil DJKN Kalimantan Barat', 'KPKNL Pontianak', 'KPKNL Singkawang',
    'Kanwil DJKN Kalimantan Selatan dan Tengah', 'KPKNL Banjarmasin', 'KPKNL Palangkaraya', 'KPKNL Pangkalan Bun',
    'Kanwil DJKN Kalimantan Timur dan Utara', 'KPKNL Balikpapan', 'KPKNL Samarinda', 'KPKNL Bontang', 'KPKNL Tarakan',
    'Kanwil DJKN Bali dan Nusa Tenggara', 'KPKNL Denpasar', 'KPKNL Singaraja', 'KPKNL Mataram', 'KPKNL Bima', 'KPKNL Kupang',
    'Kanwil DJKN Sulawesi Selatan, Tenggara, dan Barat', 'KPKNL Makassar', 'KPKNL Pare Pare', 'KPKNL Palopo', 'KPKNL Kendari', 'KPKNL Mamuju',
    'Kanwil DJKN Sulawesi Utara, Tengah, Gorontalo, dan Maluku Utara', 'KPKNL Manado', 'KPKNL Palu', 'KPKNL Gorontalo', 'KPKNL Ternate',
    'Kanwil DJKN Papua, Papua Barat, dan Maluku', 'KPKNL Jayapura', 'KPKNL Biak', 'KPKNL Sorong', 'KPKNL Ambon'
];

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

        pbApplyFilters();
        pbBindSearch();
        pbBindStatusFilter();
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

function pbFilterByStatus(rows, status) {
    // "Selesai" = hanya baris berstatus Selesai.
    // "Dalam Proses" = semua status SELAIN Selesai (Rekam Data, Terlaksana, LPT, Terbayar).
    if (status === 'Selesai') return rows.filter(r => r.P === 'Selesai');
    return rows.filter(r => r.P !== 'Selesai');
}

function pbApplyFilters() {
    const input = document.getElementById('pb-search');
    const q = input ? input.value.trim().toLowerCase() : '';

    let filtered = pbFilterByStatus(pbAllRows, pbStatusFilter);
    if (q) {
        filtered = filtered.filter(r =>
            String(r.B || '').toLowerCase().includes(q) ||
            String(r.C || '').toLowerCase().includes(q) ||
            String(r.D || '').toLowerCase().includes(q) ||
            String(r.E || '').toLowerCase().includes(q)
        );
    }
    pbRenderTable(filtered);
}

function pbBindSearch() {
    const input = document.getElementById('pb-search');
    if (!input) return;
    input.oninput = () => pbApplyFilters();
}

function pbBindStatusFilter() {
    document.querySelectorAll('input[name="pb-statusFilter"]').forEach(rb => {
        rb.addEventListener('change', function () {
            pbStatusFilter = this.value;
            pbApplyFilters();
        });
    });
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

    tbody.innerHTML = rows.map(r => {
        // Tombol Ubah & Hapus HANYA muncul untuk baris berstatus "Rekam Data" —
        // berlaku untuk semua user termasuk admin. Selain itu cuma tombol Detil.
        const showFullActions = r.P === 'Rekam Data';
        const dokBtnHtml = `<button class="pb-btn-dokumen ${(r.T || r.U) ? 'text-emerald-600' : 'text-slate-400'} hover:text-emerald-700" title="${(r.T || r.U) ? 'Dokumen PDF (sudah ada)' : 'Dokumen PDF (belum ada)'}"><i class="fa-solid fa-file-pdf"></i></button>`;
        const actionsHtml = showFullActions ? `
                    <button class="pb-btn-edit hover:text-sky-600" title="Ubah"><i class="fa-solid fa-pencil"></i></button>
                    <button class="pb-btn-detil hover:text-slate-800" title="Detil"><i class="fa-solid fa-eye"></i></button>
                    ${dokBtnHtml}
                    <button class="pb-btn-hapus hover:text-red-600" title="Hapus"><i class="fa-solid fa-trash"></i></button>
        ` : `
                    <button class="pb-btn-detil hover:text-slate-800" title="Detil"><i class="fa-solid fa-eye"></i></button>
                    ${dokBtnHtml}
        `;

        return `
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
                    ${actionsHtml}
                </div>
            </td>
        </tr>
    `;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
        const id = tr.getAttribute('data-id');
        const row = pbAllRows.find(r => String(r.A) === String(id));
        if (!row) return;

        const btnEdit = tr.querySelector('.pb-btn-edit');
        const btnDetil = tr.querySelector('.pb-btn-detil');
        const btnDokumen = tr.querySelector('.pb-btn-dokumen');
        const btnHapus = tr.querySelector('.pb-btn-hapus');

        if (btnEdit) btnEdit.onclick = () => pbOpenEditModal(row);
        if (btnDetil) btnDetil.onclick = () => pbOpenDetilModal(row);
        if (btnDokumen) btnDokumen.onclick = () => pbOpenDokumenModal(row, tr);
        if (btnHapus) btnHapus.onclick = () => pbHapusRow(row);
    });
}

// ==========================================
// Tambah Usulan
// ==========================================
function pbBindTambahUsulan() {
    const btn = document.getElementById('pb-btnTambahUsulan');
    if (btn) btn.onclick = pbOpenTambahUsulanModal;
}

function pbTuAddPegawaiRow(tbody, nama, nip, status, namaBank, norek) {
    const emptyRow = tbody.querySelector('.pb-pegawai-empty-row');
    if (emptyRow) emptyRow.remove();

    // Normalisasi status: 1/"1" -> PNS, 0/"0" -> PPNPN, selain itu -> belum dipilih
    let statusVal = '';
    if (status === 1 || status === '1') statusVal = '1';
    else if (status === 0 || status === '0') statusVal = '0';

    // Dropdown Nama Bank — pakai daftar bank yang sama dengan menu Settings (CS_DAFTAR_BANK).
    const bankList = (typeof CS_DAFTAR_BANK !== 'undefined') ? CS_DAFTAR_BANK : [];
    const bankOptionsHtml = `<option value="">-- Pilih Bank --</option>` + bankList.map(b =>
        `<option value="${pbEsc(b)}" ${b === namaBank ? 'selected' : ''}>${pbEsc(b)}</option>`
    ).join('') + ((namaBank && !bankList.includes(namaBank)) ? `<option value="${pbEsc(namaBank)}" selected>${pbEsc(namaBank)}</option>` : '');

    // Nama Bank & No Rekening read-only kalau datanya sudah ada di database
    // (hasil pencarian pegawai yang cocok). Kalau masih kosong (belum ada di
    // database), boleh diisi/diubah manual.
    const bankSudahAda = !!namaBank;
    const norekSudahAda = !!norek;
    const bankDisabledAttr = bankSudahAda ? 'disabled' : '';
    const bankClass = bankSudahAda ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white';
    const norekReadonlyAttr = norekSudahAda ? 'readonly' : '';
    const norekClass = norekSudahAda ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white';

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
        <td class="p-2">
            <select class="pb-tu-namabank w-full px-2 py-1 border border-slate-300 rounded-lg text-xs ${bankClass}" ${bankDisabledAttr}>${bankOptionsHtml}</select>
        </td>
        <td class="p-2"><input type="text" inputmode="numeric" class="pb-tu-norek w-full px-2 py-1 border border-slate-300 rounded-lg text-xs ${norekClass}" placeholder="No Rekening" value="${pbEsc(norek || '')}" ${norekReadonlyAttr}></td>
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
                <td colspan="7" class="p-3 text-center text-slate-400">Belum ada pegawai ditambahkan.</td>
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
    const kantorOptions = PB_DAFTAR_KANTOR.map(k => `<option value="${pbEsc(k)}"></option>`).join('');

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-plus mr-2"></i>Tambah Usulan Perbantuan</h3>
            <button id="pb-tu-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
                <label class="${labelClass}">ID Kegiatan</label>
                <input id="pb-tu-idkegiatan" type="text" placeholder="ID Kegiatan" class="${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">Kantor (KPKNL / Kanwil DJKN)</label>
                <input id="pb-tu-kantor" type="text" placeholder="Ketik nama kantor..." list="pb-tu-kantor-list" autocomplete="off" class="${inputClass}">
                <datalist id="pb-tu-kantor-list">${kantorOptions}</datalist>
            </div>
        </div>

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
                        <th class="p-2 text-left">Nama Bank</th>
                        <th class="p-2 text-left">No Rekening</th>
                        <th class="p-2 text-center w-14">Aksi</th>
                    </tr>
                </thead>
                <tbody id="pb-tu-pegawai-tbody">
                    <tr class="pb-pegawai-empty-row">
                        <td colspan="7" class="p-3 text-center text-slate-400">Belum ada pegawai ditambahkan.</td>
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
    `, 'max-w-4xl');

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
        const namaBank = match ? (match.namaBank || match.NamaBank || '') : '';
        const norek = match ? (match.norek || match.Norek || '') : '';

        pbTuAddPegawaiRow(tbody, nama, nip, status, namaBank, norek);
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
            jumlah: tr.querySelector('.pb-tu-jumlah').value.replace(/\./g, ''),
            namaBank: tr.querySelector('.pb-tu-namabank').value,
            norek: tr.querySelector('.pb-tu-norek').value.trim()
        }));

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const namaUser = localStorage.getItem('nama') || '';
            const kantor = popup.querySelector('#pb-tu-kantor').value.trim();

            const result = await apiPost({
                action: 'simpanPerbantuan',
                idKegiatan, kantor, noSt, tglSt, tglMulai, tglSelesai, tujuan,
                userLogin: namaUser,
                pelaksanaData
            });

            if (result.status === 'success') {
                showToast('Usulan perbantuan berhasil ditambahkan');
                if (Array.isArray(result.refPegawaiErrors) && result.refPegawaiErrors.length > 0) {
                    alert('Perhatian: data kegiatan berhasil disimpan, tapi data pegawai berikut GAGAL disinkronkan ke ref_pegawai:\n\n' + result.refPegawaiErrors.join('\n'));
                }
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
                        <th class="p-2 text-left">Nama Bank</th>
                        <th class="p-2 text-left">No Rekening</th>
                        <th class="p-2 text-center w-14">Aksi</th>
                    </tr>
                </thead>
                <tbody id="pb-ed-pegawai-tbody">
                    <tr class="pb-pegawai-empty-row">
                        <td colspan="7" class="p-3 text-center text-slate-400">Belum ada pegawai ditambahkan.</td>
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
    `, 'max-w-4xl');

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
            existingMatch ? (existingMatch.status !== undefined ? existingMatch.status : existingMatch.Status) : '',
            existingMatch ? (existingMatch.namaBank || existingMatch.NamaBank || '') : '',
            existingMatch ? (existingMatch.norek || existingMatch.Norek || '') : ''
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
        const namaBank = match ? (match.namaBank || match.NamaBank || '') : '';
        const norek = match ? (match.norek || match.Norek || '') : '';

        pbTuAddPegawaiRow(tbody, nama, nip, status, namaBank, norek);
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
            jumlah: tr.querySelector('.pb-tu-jumlah').value.replace(/\./g, ''),
            namaBank: tr.querySelector('.pb-tu-namabank').value,
            norek: tr.querySelector('.pb-tu-norek').value.trim()
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
                if (Array.isArray(result.refPegawaiErrors) && result.refPegawaiErrors.length > 0) {
                    alert('Perhatian: data kegiatan berhasil disimpan, tapi data pegawai berikut GAGAL disinkronkan ke ref_pegawai:\n\n' + result.refPegawaiErrors.join('\n'));
                }
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
// Dokumen PDF (kuitansi & SPBy, upload/lihat/reupload/hapus ke Google Drive
// folder simab_doc). Sama seperti di halaman Kegiatan: backend generik yang
// dipakai (uploadDokumenKegiatan/hapusDokumenKegiatan utk kuitansi,
// uploadSpbyKegiatan/hapusSpbyKegiatan utk SPBy) berbasis ID Kegiatan (kolom A).
// ==========================================
function pbUpdateDokBtnColor(trEl, row) {
    if (!trEl || !row) return;
    const dokBtn = trEl.querySelector('.pb-btn-dokumen');
    if (!dokBtn) return;
    const ada = !!(row.T || row.U);
    dokBtn.classList.toggle('text-emerald-600', ada);
    dokBtn.classList.toggle('text-slate-400', !ada);
    dokBtn.title = ada ? 'Dokumen PDF (sudah ada)' : 'Dokumen PDF (belum ada)';
}

function pbApplyDokLinksToTable(links, field) {
    Object.keys(links || {}).forEach(rowId => {
        const link = links[rowId];
        const found = pbAllRows.find(r => String(r.A) === String(rowId));
        if (found) found[field] = link;

        const trEl = document.querySelector(`#pb-tbody tr[data-id="${CSS.escape(String(rowId))}"]`);
        pbUpdateDokBtnColor(trEl, found);
    });
}

function pbWireDokSlot(opts) {
    const { popup, prefix, id, row, field, uploadAction, deleteAction, allowTempelLink, viewTitle, searchTextForView, rerender } = opts;

    const btnLihat = popup.querySelector(`#${prefix}Lihat`);
    const btnUpload = popup.querySelector(`#${prefix}Upload`);
    const btnTempelLink = allowTempelLink ? popup.querySelector(`#${prefix}TempelLink`) : null;
    const btnHapus = popup.querySelector(`#${prefix}Hapus`);
    const fileInput = popup.querySelector(`#${prefix}FileInput`);
    const linkForm = allowTempelLink ? popup.querySelector(`#${prefix}LinkForm`) : null;
    const linkInput = allowTempelLink ? popup.querySelector(`#${prefix}LinkInput`) : null;
    const btnLinkSimpan = allowTempelLink ? popup.querySelector(`#${prefix}LinkSimpan`) : null;
    const statusEl = popup.querySelector(`#${prefix}Status`);

    const link = row[field];

    const setBusy = (busy) => {
        btnLihat.disabled = busy || !row[field];
        btnUpload.disabled = busy;
        if (btnTempelLink) btnTempelLink.disabled = busy;
        btnHapus.disabled = busy || !row[field];
    };

    if (link) {
        btnLihat.onclick = () => {
            window.simabOpenPdfViewer({ title: viewTitle, link: link, searchText: searchTextForView });
        };
        btnHapus.onclick = async () => {
            if (!confirm('Yakin ingin menghapus dokumen ini?')) return;
            statusEl.textContent = 'Menghapus dokumen...';
            statusEl.className = 'text-center text-xs text-sky-600 min-h-[16px]';
            setBusy(true);
            try {
                const result = await apiPost({ action: deleteAction, id: id }, 30000);
                if (result.status === 'success') {
                    row[field] = '';
                    pbApplyDokLinksToTable(result.links || { [id]: '' }, field);
                    showToast('Dokumen berhasil dihapus');
                    rerender();
                } else {
                    statusEl.textContent = '❌ ' + (result.message || 'Gagal menghapus dokumen.');
                    statusEl.className = 'text-center text-xs text-red-500 min-h-[16px]';
                    setBusy(false);
                }
            } catch (e) {
                statusEl.textContent = '❌ ' + (e.message || 'Gagal menghapus dokumen.');
                statusEl.className = 'text-center text-xs text-red-500 min-h-[16px]';
                setBusy(false);
            }
        };
    }

    btnUpload.onclick = () => fileInput.click();

    fileInput.onchange = async function () {
        const file = this.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            alert('File harus berformat PDF.');
            this.value = '';
            return;
        }
        const maxSizeMB = 10;
        if (file.size > maxSizeMB * 1024 * 1024) {
            alert(`Ukuran file maksimal ${maxSizeMB}MB.`);
            this.value = '';
            return;
        }

        statusEl.textContent = 'Mengupload dokumen...';
        statusEl.className = 'text-center text-xs text-sky-600 min-h-[16px]';
        setBusy(true);

        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = () => reject(new Error('Gagal membaca file.'));
                reader.readAsDataURL(file);
            });

            const result = await apiPost({
                action: uploadAction,
                id: id,
                fileData: base64,
                fileName: file.name
            }, 60000);

            if (result.status === 'success') {
                row[field] = result.link;
                pbApplyDokLinksToTable(result.links || { [id]: result.link }, field);
                showToast('Dokumen berhasil diupload');
                rerender();
            } else {
                statusEl.textContent = '❌ ' + (result.message || 'Upload gagal.');
                statusEl.className = 'text-center text-xs text-red-500 min-h-[16px]';
                setBusy(false);
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + (e.message || 'Upload gagal.');
            statusEl.className = 'text-center text-xs text-red-500 min-h-[16px]';
            setBusy(false);
        } finally {
            this.value = '';
        }
    };

    if (allowTempelLink) {
        btnTempelLink.onclick = () => {
            linkForm.classList.toggle('hidden');
            linkForm.classList.toggle('flex');
            if (!linkForm.classList.contains('hidden')) linkInput.focus();
        };

        const simpanLink = async () => {
            const linkBaru = linkInput.value.trim();
            if (!linkBaru) {
                alert('Tempel link dokumen terlebih dahulu.');
                return;
            }
            if (!/^https?:\/\//i.test(linkBaru)) {
                alert('Link harus diawali http:// atau https://');
                return;
            }

            statusEl.textContent = 'Menyimpan link...';
            statusEl.className = 'text-center text-xs text-sky-600 min-h-[16px]';
            setBusy(true);

            try {
                const result = await apiPost({ action: 'simpanLinkDokumenKegiatan', id: id, link: linkBaru }, 30000);
                if (result.status === 'success') {
                    row[field] = result.link;
                    pbApplyDokLinksToTable(result.links || { [id]: result.link }, field);
                    rerender();
                } else {
                    statusEl.textContent = '❌ ' + (result.message || 'Gagal menyimpan link.');
                    statusEl.className = 'text-center text-xs text-red-500 min-h-[16px]';
                    setBusy(false);
                }
            } catch (e) {
                statusEl.textContent = '❌ ' + (e.message || 'Gagal menyimpan link.');
                statusEl.className = 'text-center text-xs text-red-500 min-h-[16px]';
                setBusy(false);
            }
        };
        btnLinkSimpan.onclick = simpanLink;
        linkInput.onkeydown = (e) => { if (e.key === 'Enter') simpanLink(); };
    }
}

function pbOpenDokumenModal(row, tr) {
    const id = row.A;

    const slotHtml = (prefix, label, link, allowTempelLink) => `
        <div class="border border-slate-200 rounded-xl p-3">
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-slate-700">${label}</span>
                <span class="text-xs ${link ? 'text-emerald-600' : 'text-slate-400'}">${link ? 'Sudah ada' : 'Belum ada'}</span>
            </div>
            <div class="flex items-center justify-center gap-2 flex-wrap">
                <button id="${prefix}Lihat" type="button" ${link ? '' : 'disabled'} class="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs font-medium ${link ? 'border-sky-300 text-sky-700 hover:bg-sky-50 cursor-pointer' : 'border-slate-200 text-slate-300 cursor-not-allowed'}">
                    <i class="fa-solid fa-eye"></i>Lihat
                </button>
                <button id="${prefix}Upload" type="button" class="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 cursor-pointer text-xs font-medium">
                    <i class="fa-solid fa-upload"></i>${link ? 'Ganti File' : 'Upload'}
                </button>
                ${allowTempelLink ? `
                <button id="${prefix}TempelLink" type="button" class="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 cursor-pointer text-xs font-medium">
                    <i class="fa-solid fa-link"></i>${link ? 'Ganti Link' : 'Tempel Link'}
                </button>` : ''}
                <button id="${prefix}Hapus" type="button" ${link ? '' : 'disabled'} class="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs font-medium ${link ? 'border-red-300 text-red-600 hover:bg-red-50 cursor-pointer' : 'border-slate-200 text-slate-300 cursor-not-allowed'}">
                    <i class="fa-solid fa-trash"></i>Hapus
                </button>
            </div>
            ${allowTempelLink ? `
            <div id="${prefix}LinkForm" class="hidden gap-2 items-center mt-2">
                <input id="${prefix}LinkInput" type="url" placeholder="Tempel link dokumen (mis. dari Nadine/Satu Kemenkeu)..."
                    value="${link && link.includes('drive.google.com') ? '' : (link || '')}"
                    class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <button id="${prefix}LinkSimpan" type="button" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg">Simpan</button>
            </div>` : ''}
            <input id="${prefix}FileInput" type="file" accept="application/pdf,.pdf" class="hidden">
            <div id="${prefix}Status" class="text-center text-xs text-slate-400 min-h-[16px] mt-1"></div>
        </div>
    `;

    const renderContent = () => `
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-file-pdf mr-2"></i>Dokumen Kegiatan #${pbEsc(id)}</h3>
            <button id="pb-dok-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="flex flex-col gap-3">
            ${slotHtml('pbDokKuitansi', 'Kuitansi / Dokumen', row.T, true)}
            ${slotHtml('pbDokSpby', 'SPBy', row.U, false)}
        </div>
    `;

    const { overlay, popup } = commonOpenOverlay(renderContent(), 'max-w-md');

    function rerender() {
        popup.innerHTML = renderContent();
        wireAll();
    }

    function wireAll() {
        popup.querySelector('#pb-dok-closeBtn').onclick = () => overlay.remove();

        const spmNumber = String(row.R || '').trim();

        pbWireDokSlot({
            popup, prefix: 'pbDokKuitansi', id, row, field: 'T',
            uploadAction: 'uploadDokumenKegiatan',
            deleteAction: 'hapusDokumenKegiatan',
            allowTempelLink: true,
            viewTitle: `Kuitansi / Dokumen #${id}`,
            searchTextForView: null,
            rerender
        });
        pbWireDokSlot({
            popup, prefix: 'pbDokSpby', id, row, field: 'U',
            uploadAction: 'uploadSpbyKegiatan',
            deleteAction: 'hapusSpbyKegiatan',
            allowTempelLink: false,
            viewTitle: `SPBy #${id}`,
            searchTextForView: spmNumber ? `${spmNumber}/PB/` : null,
            rerender
        });

        pbUpdateDokBtnColor(tr, row);
    }

    wireAll();
}

// ==========================================
// Hapus
// ==========================================
function pbHapusRow(row) {
    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h3 class="text-lg font-semibold text-slate-800">Hapus Data</h3>
        </div>
        <p class="text-sm text-slate-600">
            Yakin ingin menghapus kegiatan <span class="font-medium text-slate-800">"${pbEsc(row.C)}"</span> (MAK ${pbEsc(row.B)})?
            Tindakan ini tidak dapat dibatalkan.
        </p>
        <div class="flex justify-end gap-2 mt-3">
            <button id="pb-hapus-cancelBtn" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium">Batal</button>
            <button id="pb-hapus-confirmBtn" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-trash mr-1"></i> Hapus
            </button>
        </div>
    `, 'max-w-sm');

    popup.querySelector('#pb-hapus-cancelBtn').onclick = () => overlay.remove();
    popup.querySelector('#pb-hapus-confirmBtn').onclick = async function () {
        const btn = this;
        btn.disabled = true;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menghapus...';

        try {
            const result = await apiPost({ action: 'deleteKegiatan', id: row.A });
            if (result.status === 'success') {
                overlay.remove();
                showToast('Data berhasil dihapus');
                initPerbantuanPage();
            } else {
                alert('Gagal menghapus: ' + (result.message || 'Terjadi kesalahan.'));
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    };
}

window.initPerbantuanPage = initPerbantuanPage;
