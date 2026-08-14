/**
 * Halaman Daftar Kegiatan
 * Diadaptasi dari data_kegiatan.html (versi standalone) ke pola SPA:
 * - Entry point: initKegiatanPage()
 * - Komunikasi backend lewat apiPost() / apiGet() (js/api.js)
 * - Helper umum: showToast(), formatRibuan() (js/common.js)
 *
 * Struktur baris data dari backend (lihat GAS: getKegiatanData) memakai key huruf
 * kolom sheet Data_Kegiatan_2026: A id, B mak, C uraian, D pelaksana, E tujuan,
 * F tglST, G tglMulai, H tglSelesai, I tglLPT, J tglBayar, M jumlah, N user,
 * P status, R nomorSPM.
 */

let kgCurrentTableRowsData = [];
let kgAllRows = [];       // SEMUA data dari Firestore (dimuat sekali per masuk halaman/Refresh)
let kgPegawaiList = [];
let kgLokasiList = [];
let kgFirstLoad = true;

// State filter aktif — sekarang semua difilter di CLIENT (dari kgAllRows),
// karena tanpa paginasi semua data sudah dimuat sekali di awal.
let kgQuery = {
    statusFilter: 'Dalam Proses',
    search: '',
    spm: ''
};

async function initKegiatanPage() {
    const root = document.getElementById('kg-mainDataTable');
    if (!root) return; // fragment belum ter-render coba

    // reset state setiap masuk halaman
    kgCurrentTableRowsData = [];
    kgAllRows = [];
    kgFirstLoad = true;
    kgQuery = { statusFilter: 'Dalam Proses', search: '', spm: '' };

    bindKegiatanEvents();
    await kgLoadData(true);
}

function bindKegiatanEvents() {
    document.getElementById('kg-btnRefreshData').onclick = async function () {
        const btn = this;
        const icon = btn.querySelector('i');
        btn.disabled = true;
        btn.classList.add('opacity-70', 'cursor-not-allowed');
        icon.classList.add('fa-spin');
        try {
            await kgLoadData(true); // forceRefresh: ambil ulang dari Firestore
        } finally {
            icon.classList.remove('fa-spin');
            btn.classList.remove('opacity-70', 'cursor-not-allowed');
            btn.disabled = false;
        }
    };
    document.getElementById('kg-btnDownloadExcel').onclick = kgDownloadExcel;
    document.getElementById('kg-btnOpenNominatif').onclick = kgOpenNominatifPopup;
    document.getElementById('kg-btnTambahKegiatan').onclick = kgOpenTambahKegiatanPopup;

    const runSearch = () => {
        kgQuery.search = document.getElementById('kg-searchBox').value.trim();
        kgQuery.spm = ''; // pencarian bebas membatalkan mode pencarian SPM
        kgApplyFilterAndRender();
    };
    document.getElementById('kg-btnSearch').onclick = runSearch;
    document.getElementById('kg-searchBox').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') runSearch();
    });

    document.getElementById('kg-btnSearchSPM').onclick = function () {
        const valBox = document.getElementById('kg-spmSearchBox').value.trim();
        if (!valBox) {
            alert('Masukkan nomor SPM terlebih dahulu!');
            return;
        }
        kgQuery.spm = valBox;
        kgQuery.search = '';
        document.getElementById('kg-searchBox').value = '';
        document.querySelector('input[name="kg-statusFilter"][value="Semua"]').checked = true;
        kgApplyFilterAndRender();
    };

    document.querySelectorAll('input[name="kg-statusFilter"]').forEach(rb => {
        rb.addEventListener('change', function () {
            kgQuery.statusFilter = this.value;
            kgQuery.spm = ''; // ganti filter status membatalkan mode pencarian SPM
            kgApplyFilterAndRender();
        });
    });

    document.getElementById('kg-dataTableBody').addEventListener('click', function (e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const isAdmin = localStorage.getItem('admin') === '1';
        const statusKegiatan = tr.cells[8].textContent.trim();

        if (btn.classList.contains('kg-pelaksana-link')) { kgShowPegawaiDetilPopup(btn.dataset.nama); return; }
        else if (btn.classList.contains('kg-btn-copy')) kgShowCopyPopup(tr);
        else if (btn.classList.contains('kg-btn-ubah')) {
            if (statusKegiatan === 'Rekam Data' || isAdmin) kgShowEditPopup(tr);
            else alert('Anda tidak memiliki kewenangan!');
        }
        else if (btn.classList.contains('kg-btn-hapus')) {
            if (isAdmin || statusKegiatan === 'Rekam Data') kgShowDeletePopup(tr);
            else alert('Anda tidak memiliki kewenangan!');
        }
        else if (btn.classList.contains('kg-btn-detil')) kgShowDetilPopup(tr);
        else if (btn.classList.contains('kg-btn-dokumen')) kgShowDokumenPopup(tr);
        else if (btn.classList.contains('kg-btn-pelaksana')) kgShowPelaksanaPopup(tr);
        else if (btn.classList.contains('kg-btn-lpt')) kgShowLPTPopup(tr);
        else if (btn.classList.contains('kg-btn-bayar')) {
            if (isAdmin) kgShowBayarPopup(tr); else alert('Anda tidak memiliki kewenangan!');
        }
        else if (btn.classList.contains('kg-btn-sp2d')) {
            if (isAdmin) kgShowSP2DPopup(tr); else alert('Anda tidak memiliki kewenangan!');
        }
    });
}

function kgSetTotalJumlahLabel(total) {
    document.getElementById('kg-totalJumlahLabel').textContent = Number(total || 0).toLocaleString('id-ID');
}

function kgStatusClasses(status) {
    switch (status) {
        case 'Rekam Data': return 'bg-red-300';
        case 'Terlaksana': return 'bg-slate-300';
        case 'LPT': return 'bg-yellow-300';
        case 'Terbayar': return 'bg-green-400';
        case 'Selesai': return 'bg-blue-400 text-white';
        default: return '';
    }
}

// Tentukan warna & title tombol dokumen berdasarkan kombinasi kuitansi (T) & SPBy (U):
// abu-abu = belum ada dokumen, kuning = kuitansi saja, biru = SPBy saja, hijau = keduanya sudah ada.
function kgDokBtnStyle(rowData) {
    const adaT = !!(rowData && rowData.T);
    const adaU = !!(rowData && rowData.U);
    if (adaT && adaU) return { cls: 'text-emerald-600', title: 'Dokumen PDF (kuitansi & SPBy sudah ada)' };
    if (adaT) return { cls: 'text-amber-500', title: 'Dokumen PDF (kuitansi sudah ada, SPBy belum)' };
    if (adaU) return { cls: 'text-sky-500', title: 'Dokumen PDF (SPBy sudah ada, kuitansi belum)' };
    return { cls: 'text-slate-400', title: 'Dokumen PDF (belum ada)' };
}

function kgRenderTable(rows) {
    kgCurrentTableRowsData = rows;
    const tbody = document.getElementById('kg-dataTableBody');
    const fragment = document.createDocumentFragment(); // batch semua baris dulu, baru sekali append ke DOM -> hindari reflow berulang tiap baris

    const formatDate = (v) => {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    rows.forEach(r => {
        const jumlahFormatted = Number(r.M || 0).toLocaleString('id-ID');
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-200 hover:bg-slate-50';
        tr.dataset.id = r.A;

        tr.innerHTML = `
            <td class="p-2.5 align-top">${r.B ?? ''}</td>
            <td class="p-2.5 align-top">${r.C ?? ''}</td>
            <td class="p-2.5 align-top">${r.D ? `<button type="button" class="kg-pelaksana-link text-sky-700 hover:text-sky-900 underline decoration-dotted underline-offset-2 text-left" data-nama="${String(r.D).replace(/"/g, '&quot;')}">${r.D}</button>` : ''}</td>
            <td class="p-2.5 align-top">${r.E ?? ''}</td>
            <td class="p-2.5 align-top whitespace-nowrap">${formatDate(r.F)}</td>
            <td class="p-2.5 align-top whitespace-nowrap">${formatDate(r.G)}</td>
            <td class="p-2.5 align-top text-right whitespace-nowrap">${jumlahFormatted}</td>
            <td class="p-2.5 align-top">${r.N ?? ''}</td>
            <td class="p-2.5 align-top text-center font-semibold rounded ${kgStatusClasses(r.P)}">${r.P ?? ''}</td>
            <td class="p-2 align-top sticky right-0 bg-white">
                <div class="flex items-center justify-center gap-1">
                    <button class="kg-btn-copy w-7 h-7 rounded hover:bg-slate-100" title="Salin Uraian"><i class="fa-solid fa-clipboard"></i></button>
                    <button class="kg-btn-ubah w-7 h-7 rounded hover:bg-slate-100" title="Ubah"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="kg-btn-pelaksana w-7 h-7 rounded hover:bg-slate-100" title="Pelaksana"><i class="fa-solid fa-user-check"></i></button>
                    <button class="kg-btn-lpt w-7 h-7 rounded hover:bg-slate-100" title="LPT"><i class="fa-solid fa-file-lines"></i></button>
                    <button class="kg-btn-bayar w-7 h-7 rounded hover:bg-slate-100" title="Bayar"><i class="fa-solid fa-hand-holding-dollar"></i></button>
                    <button class="kg-btn-sp2d w-7 h-7 rounded hover:bg-slate-100" title="SP2D"><i class="fa-solid fa-money-bill-transfer"></i></button>
                    <button class="kg-btn-detil w-7 h-7 rounded hover:bg-slate-100 text-sky-600" title="Detil"><i class="fa-solid fa-circle-info"></i></button>
                    <button class="kg-btn-dokumen w-7 h-7 rounded hover:bg-slate-100 ${kgDokBtnStyle(r).cls}" title="${kgDokBtnStyle(r).title}"><i class="fa-solid fa-file-pdf"></i></button>
                    <button class="kg-btn-hapus w-7 h-7 rounded hover:bg-slate-100 text-red-500" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}


function kgPopulateDatalist() {
    const pegawaiDL = document.getElementById('kg-listPegawai');
    const lokasiDL = document.getElementById('kg-listLokasi');
    pegawaiDL.innerHTML = '';
    lokasiDL.innerHTML = '';
    kgPegawaiList.forEach(nama => {
        const opt = document.createElement('option');
        opt.value = nama;
        pegawaiDL.appendChild(opt);
    });
    kgLokasiList.forEach(lok => {
        const opt = document.createElement('option');
        opt.value = lok;
        lokasiDL.appendChild(opt);
    });
}

// Ambil SEMUA data dari Firestore (koleksi 'kegiatan') — cuma dipanggil sekali
// pas masuk halaman, atau saat tombol Refresh diklik. Sesudahnya, ganti
// filter/pencarian/SPM cukup filter ulang kgAllRows di client (kgApplyFilterAndRender),
// TANPA fetch ulang ke Firestore — makanya nggak perlu paginasi lagi, semua
// data (yang lolos filter status) langsung tampil sekaligus.
async function kgLoadData(forceRefresh) {
    const container = document.getElementById('kg-dataTableBody');

    if (!forceRefresh && kgAllRows.length > 0) {
        kgApplyFilterAndRender();
        return;
    }

    try {
        if (kgFirstLoad) {
            container.innerHTML = `<tr><td colspan="10" class="p-10 text-center text-sky-600"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></td></tr>`;
        } else {
            kgShowLoading(true);
        }

        await waitSupabaseAuthReady();
        const rows = await sbFetchAll('kegiatan');

        kgAllRows = rows.map(d => ({
            A: d.id,
            B: d.mak || '', C: d.uraian || '', D: d.pelaksana || '', E: d.tujuan || '',
            F: d.tgl_st || '', G: d.tgl_mulai || '', H: d.tgl_selesai || '',
            I: d.tgl_lpt || '', J: d.tgl_bayar || '',
            M: Number(d.jumlah) || 0, N: d.user || '', O: d.tgl_rekam || '',
            P: d.status || '', Q: d.tgl_sp2d || '', R: d.nomor_spm || '',
            T: d.dokumen_link || '', U: d.spby_link || ''
        }));

        kgShowLoading(false);

        if (kgFirstLoad) {
            // Daftar Pegawai/Lokasi utk datalist diturunkan dari data yang ada
            // (nilai unik kolom Pelaksana/Tujuan) — bukan lagi action terpisah.
            kgPegawaiList = [...new Set(kgAllRows.map(r => r.D).filter(Boolean))].sort();
            kgLokasiList = [...new Set(kgAllRows.map(r => r.E).filter(Boolean))].sort();
            kgPopulateDatalist();
        }

        kgApplyFilterAndRender();
        kgFirstLoad = false;
    } catch (e) {
        kgShowLoading(false);
        console.error('Error loadData kegiatan:', e);
        container.innerHTML = `<tr><td colspan="10" class="p-10 text-center text-red-500">❌ ${e.message || 'Gagal memuat data kegiatan.'}</td></tr>`;
    }
}

// Filter kgAllRows (SPM / status+search) sesuai kgQuery, lalu render — semua
// di client, tanpa fetch ulang. searchCols dipakai oleh Pencarian Global
// Dashboard (lihat dashboard-search.js) utk batasi kolom pencarian.
function kgApplyFilterAndRender() {
    let rows = kgAllRows;

    const spmQuery = String(kgQuery.spm || '').trim();
    if (spmQuery) {
        rows = rows.filter(r => {
            const spmRow = String(r.R || '').trim();
            return spmRow === spmQuery || parseInt(spmRow, 10) === parseInt(spmQuery, 10);
        });
    } else {
        const statusMap = {
            'Dalam Proses': ['Rekam Data', 'Terlaksana'],
            'LPT': ['LPT'],
            'Terbayar': ['Terbayar'],
            'Selesai': ['Selesai'],
            'Semua': ['Rekam Data', 'Terlaksana', 'LPT', 'Terbayar', 'Selesai']
        };
        const allowedStatus = statusMap[kgQuery.statusFilter] || statusMap['Dalam Proses'];
        rows = rows.filter(r => allowedStatus.includes(r.P));

        const search = String(kgQuery.search || '').trim().toLowerCase();
        if (search) {
            const cols = Array.isArray(kgQuery.searchCols) && kgQuery.searchCols.length
                ? kgQuery.searchCols
                : ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'M', 'N', 'O', 'P', 'Q', 'R', 'T', 'U'];
            rows = rows.filter(r => cols.some(k => String(r[k] || '').toLowerCase().includes(search)));
        }
    }

    kgCurrentTableRowsData = rows;
    kgRenderTable(rows);

    const totalJumlah = rows.reduce((sum, r) => sum + (Number(r.M) || 0), 0);
    kgSetTotalJumlahLabel(totalJumlah);

    if (spmQuery && rows.length === 0) {
        alert('Data dengan Nomor SPM ' + spmQuery + ' tidak ditemukan.');
    }
}

// ==========================================
// Download Excel
// ==========================================
function kgDownloadExcel() {
    const table = document.getElementById('kg-mainDataTable');
    const clonedTable = table.cloneNode(true);

    const ths = clonedTable.querySelectorAll('thead tr th');
    if (ths.length > 0) ths[ths.length - 1].remove();

    const trs = clonedTable.querySelectorAll('tbody tr');
    trs.forEach(tr => {
        if (tr.cells.length > 0) {
            const cellJumlah = tr.cells[6];
            if (cellJumlah) {
                const rawValue = cellJumlah.textContent.replace(/\./g, '').trim();
                const numericValue = parseFloat(rawValue);
                if (!isNaN(numericValue)) cellJumlah.textContent = numericValue;
            }
            tr.cells[tr.cells.length - 1].remove();
        }
    });

    const wb = XLSX.utils.table_to_book(clonedTable, { sheet: 'Data Kegiatan', raw: false });
    XLSX.writeFile(wb, 'Daftar_Kegiatan_SiMAB.xlsx');
}

// ==========================================
// Popup helpers
// ==========================================
function kgOpenOverlay(innerHtml, widthClass) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4';

    const popup = document.createElement('div');
    popup.className = `bg-white rounded-2xl shadow-xl w-full ${widthClass || 'max-w-md'} p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto`;
    popup.innerHTML = innerHtml;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    return { overlay, popup };
}

const kgInputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';

// kgComputeStatus() & kgGenerateRandomId() sekarang didefinisikan di
// firebase-config.js (dipakai bersama dengan pok.js, yang juga punya fitur
// Pelaksana Kegiatan sendiri) — lihat file itu, jangan didefinisikan ulang
// di sini supaya tidak terulang bug "identifier already declared" seperti
// kasus waitFirebaseAuthReady sebelumnya.
const kgLabelClass = 'text-sm font-medium text-slate-600';

// ---- Salin Uraian ----
function kgShowCopyPopup(tr) {
    const uraianTarget = tr.cells[1].textContent.trim();
    const allMainRows = document.querySelectorAll('#kg-dataTableBody tr');
    const filteredRows = Array.from(allMainRows).filter(row => row.cells[1].textContent.trim() === uraianTarget);

    const rowCount = filteredRows.length;
    const firstRow = filteredRows[0];
    const targetUraianRaw = firstRow.cells[1].textContent.trim();
    const targetTujuan = firstRow.cells[3].textContent.trim();
    const targetTgl = firstRow.cells[4].textContent.trim();

    let cleanNoST = targetUraianRaw;
    if (targetUraianRaw.includes(')')) {
        const parts = targetUraianRaw.split(')');
        cleanNoST = parts[parts.length - 1].trim();
    }

    let teksOpsi1;
    if (rowCount > 1) {
        const namaPertama = filteredRows.map(row => row.cells[2].textContent.trim())[0];
        teksOpsi1 = `Belanja barang untuk keperluan perjalanan dinas sesuai surat tugas nomor ${cleanNoST} tanggal ${targetTgl} tujuan ${targetTujuan} an ${namaPertama} dkk`;
    } else {
        const namaPegawai = firstRow.cells[2].textContent.trim();
        teksOpsi1 = `Belanja barang untuk keperluan perjalanan dinas sesuai surat tugas nomor ${cleanNoST} tanggal ${targetTgl} tujuan ${targetTujuan} an ${namaPegawai}`;
    }
    const teksOpsi2 = targetUraianRaw;

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base mb-1">Salin Uraian</h3>
        <table class="w-full text-sm text-left border-collapse">
            <thead>
                <tr class="bg-slate-100 border-b-2 border-slate-200">
                    <th class="p-2 w-1/6">Opsi</th><th class="p-2">Teks Uraian</th><th class="p-2 w-1/6 text-center">Aksi</th>
                </tr>
            </thead>
            <tbody>
                <tr class="border-b border-slate-200">
                    <td class="p-2 font-semibold text-slate-600">Opsi 1</td>
                    <td class="p-2 break-words">${teksOpsi1}</td>
                    <td class="p-2 text-center"><button class="kg-copy-action px-3 py-1.5 bg-sky-700 text-white text-xs rounded-md" data-text="${teksOpsi1.replace(/"/g, '&quot;')}">Salin</button></td>
                </tr>
                <tr class="border-b border-slate-200">
                    <td class="p-2 font-semibold text-slate-600">Opsi 2</td>
                    <td class="p-2 break-words">${teksOpsi2}</td>
                    <td class="p-2 text-center"><button class="kg-copy-action px-3 py-1.5 bg-sky-700 text-white text-xs rounded-md" data-text="${teksOpsi2.replace(/"/g, '&quot;')}">Salin</button></td>
                </tr>
            </tbody>
        </table>
        <div class="flex justify-end mt-2">
            <button id="kg-closeCopyPopup" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Tutup</button>
        </div>
    `, 'max-w-2xl');

    popup.querySelector('#kg-closeCopyPopup').onclick = () => overlay.remove();
    popup.querySelectorAll('.kg-copy-action').forEach(button => {
        button.onclick = function () {
            const textToCopy = this.getAttribute('data-text');
            navigator.clipboard.writeText(textToCopy).then(() => {
                const original = this.innerText;
                this.innerText = 'Tersalin!';
                this.classList.replace('bg-sky-700', 'bg-green-500');
                setTimeout(() => { this.innerText = original; this.classList.replace('bg-green-500', 'bg-sky-700'); }, 1500);
            }).catch(() => alert('Gagal menyalin teks.'));
        };
    });
}

// ---- Detil Pegawai (klik nama di kolom Pelaksana Tugas) ----
function kgShowPegawaiDetilPopup(nama) {
    const { overlay, popup } = kgOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-base font-semibold text-sky-700"><i class="fa-solid fa-id-card mr-2"></i>Detil Pegawai</h3>
            <button id="kg-pgwClose" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="kg-pgwLoading" class="text-center text-slate-400 py-6">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...
        </div>
        <div id="kg-pgwContent" class="hidden flex-col gap-2.5"></div>
    `, 'max-w-sm');

    popup.querySelector('#kg-pgwClose').onclick = () => overlay.remove();

    const loadingEl = popup.querySelector('#kg-pgwLoading');
    const contentEl = popup.querySelector('#kg-pgwContent');

    const field = (label, value, id) => `
        <div class="flex flex-col gap-1">
            <label class="${kgLabelClass}">${label}</label>
            <div class="flex items-center gap-2">
                <input id="${id}" type="text" value="${String(value ?? '').replace(/"/g, '&quot;')}" readonly class="${kgInputClass} bg-slate-100">
                <button type="button" class="kg-pgw-copy w-9 h-9 flex-shrink-0 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-500" data-target="${id}" title="Salin">
                    <i class="fa-solid fa-copy"></i>
                </button>
            </div>
        </div>
    `;

    (async () => {
        try {
            const result = await apiPost({ action: 'getPegawaiDetailByNama', nama });
            if (result.status === 'success') {
                const statusLabel = String(result.kepeg) === '0' ? 'PPNPN' : 'PNS';

                contentEl.innerHTML =
                    field('Nama', result.nama, 'kg-pgw-nama') +
                    field('NIP', result.nip, 'kg-pgw-nip') +
                    field('Jabatan', result.jabatan, 'kg-pgw-jabatan') +
                    field('Pangkat', result.pangkat, 'kg-pgw-pangkat') +
                    field('Status', statusLabel, 'kg-pgw-status') +
                    field('Nama Bank', result.namaBank, 'kg-pgw-bank') +
                    field('No Rekening', result.norek, 'kg-pgw-norek');

                loadingEl.classList.add('hidden');
                contentEl.classList.remove('hidden');
                contentEl.classList.add('flex');

                contentEl.querySelectorAll('.kg-pgw-copy').forEach(btn => {
                    btn.onclick = () => {
                        const input = popup.querySelector('#' + btn.dataset.target);
                        const val = input.value;
                        if (!val) return;
                        navigator.clipboard.writeText(val).then(() => {
                            const icon = btn.querySelector('i');
                            icon.classList.replace('fa-copy', 'fa-check');
                            btn.classList.add('text-green-600', 'border-green-400');
                            setTimeout(() => {
                                icon.classList.replace('fa-check', 'fa-copy');
                                btn.classList.remove('text-green-600', 'border-green-400');
                            }, 1200);
                        }).catch(() => alert('Gagal menyalin.'));
                    };
                });
            } else {
                loadingEl.innerHTML = `<span class="text-red-500">❌ ${result.message || 'Data pegawai tidak ditemukan'}</span>`;
            }
        } catch (e) {
            loadingEl.innerHTML = `<span class="text-red-500">❌ ${e.message || 'Gagal memuat detil pegawai'}</span>`;
        }
    })();
}

// ---- Tambah Kegiatan (dari halaman Kegiatan / popup Search global) ----
// Field & alurnya sengaja dibuat MIRIP "Rekam Kegiatan" di halaman POK, tapi
// MAK-nya dipilih lewat popup "Pilih MAK dari POK" (kgOpenPilihMakPopup, sudah
// ada) — jadi tidak perlu bolak-balik buka halaman POK dulu buat klik barisnya.
function kgOpenTambahKegiatanPopup() {
    const idKegiatan = kgGenerateRandomId(10);

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base mb-1">Tambah Kegiatan Baru</h3>
        <label class="${kgLabelClass}">ID Usulan</label>
        <input id="tk-idUsulan" type="text" readonly value="${idKegiatan}" class="${kgInputClass} bg-slate-100 text-slate-500 cursor-not-allowed">

        <label class="${kgLabelClass}">No ST/ND / Uraian Kegiatan</label>
        <input id="tk-uraian" type="text" class="${kgInputClass}">

        <label class="${kgLabelClass}">Tgl ST/ND</label>
        <input id="tk-tglSt" type="date" class="${kgInputClass}">

        <label class="${kgLabelClass}">Tujuan</label>
        <input id="tk-tujuan" type="text" list="kg-listLokasi" class="${kgInputClass}">

        <label class="${kgLabelClass}">MAK</label>
        <div class="flex gap-2">
            <input id="tk-mak" type="text" readonly placeholder="Belum dipilih" class="${kgInputClass} bg-slate-100 text-slate-500 cursor-not-allowed flex-1">
            <button id="tk-btnPilihMak" type="button" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium shrink-0 whitespace-nowrap">
                <i class="fa-solid fa-list-check mr-1"></i> Pilih MAK
            </button>
        </div>
        <label class="${kgLabelClass}">Uraian MAK</label>
        <input id="tk-uraianMak" type="text" readonly class="${kgInputClass} bg-slate-100 text-slate-500">

        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="${kgLabelClass}">Pagu</label>
                <input id="tk-pagu" type="text" readonly class="${kgInputClass} bg-slate-100 text-slate-500">
            </div>
            <div>
                <label class="${kgLabelClass}">Blokir</label>
                <input id="tk-blokir" type="text" readonly class="${kgInputClass} bg-slate-100 text-slate-500">
            </div>
            <div>
                <label class="${kgLabelClass}">Realisasi</label>
                <input id="tk-realisasi" type="text" readonly class="${kgInputClass} bg-slate-100 text-slate-500">
            </div>
            <div>
                <label class="${kgLabelClass}">Sisa</label>
                <input id="tk-sisa" type="text" readonly class="${kgInputClass} bg-slate-100 text-slate-500">
            </div>
        </div>

        <label class="${kgLabelClass}">Estimasi Biaya</label>
        <input id="tk-estimasi" type="text" class="${kgInputClass}">

        <label class="${kgLabelClass}">Status Kecukupan Dana</label>
        <input id="tk-statusDana" readonly value="Dana Tersedia" class="${kgInputClass}">

        <div class="flex justify-end gap-2 mt-3">
            <button id="tk-cancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="tk-simpan" class="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
            </button>
        </div>
    `, 'max-w-lg');

    let makTerpilih = null;
    const estimasiInput = popup.querySelector('#tk-estimasi');
    const statusEl = popup.querySelector('#tk-statusDana');

    function cekEstimasi() {
        const sisa = makTerpilih ? Number(makTerpilih.sisa) || 0 : 0;
        const estimasi = Number(estimasiInput.value.replace(/\./g, '')) || 0;
        if (makTerpilih && estimasi > sisa) {
            statusEl.value = 'Dana Tidak Cukup';
            statusEl.className = `${kgInputClass} border-red-300 bg-red-50 text-red-700 font-bold`;
        } else if (estimasi === 0) {
            statusEl.value = 'Dana Tersedia';
            statusEl.className = kgInputClass;
        } else {
            statusEl.value = 'Dana Tersedia';
            statusEl.className = `${kgInputClass} border-green-300 bg-green-50 text-green-700 font-bold`;
        }
    }
    estimasiInput.addEventListener('input', () => {
        estimasiInput.value = formatRibuan(estimasiInput.value);
        cekEstimasi();
    });

    popup.querySelector('#tk-btnPilihMak').onclick = () => {
        kgOpenPilihMakPopup((kode) => {
            const item = kgMakPokData.find(r => String(r.kode) === String(kode));
            if (!item) return;
            makTerpilih = item;
            popup.querySelector('#tk-mak').value = item.kode;
            popup.querySelector('#tk-uraianMak').value = item.uraian;
            popup.querySelector('#tk-pagu').value = Number(item.pagu || 0).toLocaleString('id-ID');
            popup.querySelector('#tk-blokir').value = Number(item.blokir || 0).toLocaleString('id-ID');
            popup.querySelector('#tk-realisasi').value = Number(item.realisasi || 0).toLocaleString('id-ID');
            popup.querySelector('#tk-sisa').value = Number(item.sisa || 0).toLocaleString('id-ID');
            cekEstimasi();
        });
    };

    popup.querySelector('#tk-cancel').onclick = () => overlay.remove();
    popup.querySelector('#tk-simpan').onclick = async function () {
        const btn = this;
        if (!makTerpilih) { alert('Pilih MAK terlebih dahulu.'); return; }
        const uraian = popup.querySelector('#tk-uraian').value.trim();
        if (!uraian) { alert('Uraian tidak boleh kosong.'); return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';
        try {
            await waitSupabaseAuthReady();
            const namaUser = localStorage.getItem('nama') || 'Guest';
            const { error } = await sb.from('kegiatan').insert({
                id: idKegiatan,
                mak: makTerpilih.kode,
                uraian,
                pelaksana: '',
                tujuan: popup.querySelector('#tk-tujuan').value,
                tgl_st: normDate(popup.querySelector('#tk-tglSt').value),
                tgl_mulai: null, tgl_selesai: null, tgl_lpt: null, tgl_bayar: null,
                jumlah: Number(estimasiInput.value.replace(/\./g, '')) || 0,
                user: namaUser,
                status: 'Rekam Data',
                tgl_sp2d: null, nomor_spm: '', dokumen_link: '', spby_link: '',
                tgl_rekam: normDate(new Date().toISOString().split('T')[0]),
                perbantuan: false
            });
            if (error) throw new Error(error.message);

            overlay.remove();
            showToast('Kegiatan berhasil disimpan');
            kgLoadData(true);
        } catch (e) {
            alert('Gagal menyimpan: ' + (e.message || e));
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Simpan';
        }
    };
}
window.kgOpenTambahKegiatanPopup = kgOpenTambahKegiatanPopup;

// ---- Ubah Kegiatan ----
function kgShowEditPopup(tr) {
    const idKegiatan = tr.dataset.id;
    const mak = tr.cells[0].textContent.trim();
    const uraian = tr.cells[1].textContent;
    const pelaksana = tr.cells[2].textContent;
    const tujuan = tr.cells[3].textContent;
    const tglST = tr.cells[4].textContent;
    const jumlah = tr.cells[6].textContent.replace(/\./g, '');

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base mb-1">Ubah Kegiatan #${idKegiatan}</h3>
        <label class="${kgLabelClass}">MAK</label>
        <div class="flex gap-2">
            <input id="kg-editMak" type="text" readonly value="${mak}" class="${kgInputClass} bg-slate-100 text-slate-500 cursor-not-allowed flex-1">
            <button id="kg-editUbahMak" type="button" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium shrink-0 whitespace-nowrap">
                <i class="fa-solid fa-list-check mr-1"></i> Ubah MAK
            </button>
        </div>
        <label class="${kgLabelClass}">Uraian</label>
        <input id="kg-editUraian" type="text" value="${uraian}" class="${kgInputClass}">
        <label class="${kgLabelClass}">Pelaksana</label>
        <input id="kg-editPelaksana" type="text" list="kg-listPegawai" value="${pelaksana}" class="${kgInputClass}">
        <label class="${kgLabelClass}">Tujuan</label>
        <input id="kg-editTujuan" type="text" list="kg-listLokasi" value="${tujuan}" class="${kgInputClass}">
        <label class="${kgLabelClass}">Tgl ST/ND</label>
        <input id="kg-editTglST" type="date" value="${tglST}" class="${kgInputClass}">
        <label class="${kgLabelClass}">Jumlah</label>
        <input id="kg-editJumlah" type="number" value="${jumlah}" class="${kgInputClass}">
        <div class="flex justify-end gap-2 mt-3">
            <button id="kg-editCancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="kg-editUpdate" class="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium">Update</button>
        </div>
    `);

    popup.querySelector('#kg-editUbahMak').onclick = () => {
        kgOpenPilihMakPopup((kodeMak) => {
            popup.querySelector('#kg-editMak').value = kodeMak;
        });
    };

    popup.querySelector('#kg-editCancel').onclick = () => overlay.remove();
    popup.querySelector('#kg-editUpdate').onclick = async function () {
        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);
        try {
            const makBaru = document.getElementById('kg-editMak').value;
            const updateFields = {
                uraian: document.getElementById('kg-editUraian').value,
                pelaksana: document.getElementById('kg-editPelaksana').value,
                tujuan: document.getElementById('kg-editTujuan').value,
                tgl_st: normDate(document.getElementById('kg-editTglST').value),
                jumlah: Number(document.getElementById('kg-editJumlah').value) || 0
            };
            // MAK cuma diikutkan kalau memang ada isinya (mis. diubah lewat popup "Pilih MAK dari POK")
            if (makBaru) updateFields.mak = makBaru;

            await waitSupabaseAuthReady();
            const { error } = await sb.from('kegiatan').update(updateFields).eq('id', idKegiatan);
            if (error) throw new Error(error.message);

            overlay.remove();
            showToast('Kegiatan berhasil diubah');
            kgLoadData(true);
        } catch (e) {
            alert('Gagal update: ' + (e.message || e));
        } finally {
            kgShowLoading(false);
            btn.disabled = false;
        }
    };
}

// ==========================================================
// ================= Popup "Pilih MAK dari POK" =============
// ==========================================================
// Menampilkan data POK dengan desain sama seperti halaman POK (kode, uraian,
// pagu, blokir, realisasi, sisa, sumber dana, dikelompokkan per Seksi/Bidang
// dan bisa expand/collapse) — tapi kolom Aksi cuma tombol "Pilih" (centang).
// Klik "Pilih" akan menutup popup ini dan mengisi textbox MAK yang dituju.
// State (data POK, kode/seksi yang sedang expand) dibuat terpisah dari
// pok.js (window.rawPokData dkk) supaya tidak saling bentrok kalau kedua
// script sama-sama ter-load di halaman yang sama.
let kgMakPokData = [];
let kgMakExpandedCodes = new Set();
let kgMakExpandedSeksi = new Set();
let kgMakOnPilih = null;

function kgMakSeksiBadgeClass(seksi) {
    let hash = 0;
    for (let i = 0; i < seksi.length; i++) hash = seksi.charCodeAt(i) + ((hash << 5) - hash);
    const palette = [
        'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800',
        'bg-purple-100 text-purple-800', 'bg-rose-100 text-rose-800', 'bg-indigo-100 text-indigo-800',
        'bg-teal-100 text-teal-800', 'bg-orange-100 text-orange-800'
    ];
    return palette[Math.abs(hash) % palette.length];
}

async function kgOpenPilihMakPopup(onPilih) {
    kgMakOnPilih = onPilih;
    kgMakExpandedCodes = new Set();
    kgMakExpandedSeksi = new Set();

    const { overlay, popup } = kgOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-list-check mr-2"></i>Pilih MAK dari POK</h3>
            <button id="kg-mak-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <input type="text" id="kg-mak-search" placeholder="Cari kode / uraian..."
            class="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500">
        <div class="border border-slate-200 rounded-xl max-h-[65vh] overflow-y-auto">
            <table class="w-full text-sm">
                <tbody id="kg-mak-tbody">
                    <tr><td class="text-center p-6 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>
                </tbody>
            </table>
        </div>
    `, 'max-w-4xl');

    popup.querySelector('#kg-mak-closeBtn').onclick = () => overlay.remove();
    popup.querySelector('#kg-mak-search').oninput = () => kgRenderMakTable(overlay);

    try {
        await waitSupabaseAuthReady();

        // Ambil pok, kegiatan, & blokir SEGAR setiap kali popup ini dibuka (BUKAN
        // pakai cache) — popup ini nunjukin Realisasi/Sisa sebelum user commit
        // kegiatan baru, jadi akurasinya penting, lebih penting dari hemat baca.
        // Cache global (window.kegiatanRowsCache/blokirRowsCache) tetap
        // di-refresh juga di sini, supaya halaman lain yang dibuka setelah ini
        // ikut kebagian data terbaru juga.
        const [pokRows, kegiatanRowsFetched, blokirRowsFetched] = await Promise.all([
            sbFetchAll('pok'),
            sbFetchAll('kegiatan'),
            sbFetchAll('blokir')
        ]);

        const kegiatanRows = kegiatanRowsFetched;
        window.kegiatanRowsCache = kegiatanRows;
        const blokirRows = blokirRowsFetched.map(d => ({ id: d.id, nilai: Number(d.nilai) || 0 }));
        window.blokirRowsCache = blokirRows;

        const realisasiByMak = {};
        kegiatanRows.forEach(d => {
            const mak = String(d.mak || '').trim();
            if (!mak) return;
            realisasiByMak[mak] = (realisasiByMak[mak] || 0) + (Number(d.jumlah) || 0);
        });

        const blokirByKode = {};
        blokirRows.forEach(d => { blokirByKode[d.id] = d.nilai; });

        const data = pokRows.map(d => {
            const kode = d.kode || d.id; // fallback ke id kalau data lama blm ada kolom kode
            const pagu = d.pagu || 0;
            const blokir = blokirByKode[kode] || 0; // LIVE, dikunci per Kode
            const realisasi = realisasiByMak[kode] || 0; // LIVE, dikunci per Kode
            const sisa = pagu - blokir - realisasi; // LIVE
            return {
                docId: d.id,
                kode,
                uraian: d.uraian || '',
                pagu, blokir, realisasi, sisa,
                sumber: d.sd || '',
                bidang: d.seksi || '',
                ba: d.ba || '',
                es1: d.es_i || '',
                prog: d.prog || ''
            };
        });
        kgMakPokData = data;
        kgRenderMakTable(overlay);
    } catch (e) {
        document.getElementById('kg-mak-tbody').innerHTML =
            `<tr><td class="text-center text-red-500 p-6">❌ Gagal memuat data POK: ${e.message || 'Tidak diketahui'}</td></tr>`;
    }
}

function kgRenderMakTable(overlay) {
    const tbody = document.getElementById('kg-mak-tbody');
    if (!tbody) return;

    const uniqueMap = new Map();
    kgMakPokData.forEach(item => uniqueMap.set(String(item.kode) + '|' + (item.bidang || ''), item));
    const uniqueData = Array.from(uniqueMap.values());

    const keyword = (document.getElementById('kg-mak-search')?.value || '').toLowerCase().trim();

    const groups = new Map();
    uniqueData.forEach(item => {
        const seksi = item.bidang || 'Lainnya';
        if (!groups.has(seksi)) groups.set(seksi, []);
        groups.get(seksi).push(item);
    });

    // Kalau lagi mencari, otomatis buka semua seksi & induk yang relevan supaya hasil kelihatan.
    if (keyword) {
        groups.forEach((items, seksi) => {
            const anyMatch = items.some(i => String(i.kode).toLowerCase().includes(keyword) || String(i.uraian || '').toLowerCase().includes(keyword));
            if (anyMatch) kgMakExpandedSeksi.add(seksi);
        });
    }

    const rowHtml = (i, seksi, groupItems) => {
        const c = String(i.kode);
        const uraian = String(i.uraian || '').toLowerCase();
        const isParent = c.length === 12;
        const isLeaf = c.length > 27;
        const isChildVisible = Array.from(kgMakExpandedCodes).some(k => {
            if (!k.startsWith(seksi + '::')) return false;
            const p = k.slice((seksi + '::').length);
            return c.startsWith(p) && c !== p;
        });
        const isMatch = keyword && (c.toLowerCase().includes(keyword) || uraian.includes(keyword));

        if (!isParent && !isChildVisible && !isMatch) return '';

        const depth = c.split('.').length;
        const indentPx = Math.min(depth - 1, 5) * 18;

        let rowBg = 'bg-white hover:bg-slate-100';
        if (isMatch) rowBg = 'bg-yellow-200 hover:bg-yellow-300';
        else if (isLeaf) rowBg = i.sumber === 'PNBP' ? 'bg-pink-200 hover:bg-pink-300' : 'bg-blue-200 hover:bg-blue-300';
        else if (isParent) rowBg = 'bg-sky-50 hover:bg-sky-100';
        else if (depth <= 2) rowBg = 'bg-slate-50 hover:bg-slate-100';

        const textWeight = depth <= 2 ? 'font-bold text-slate-700' : (isLeaf ? 'font-normal text-slate-600' : 'font-semibold text-slate-700');
        const hasChildren = groupItems.some(ch => String(ch.kode).startsWith(c) && String(ch.kode) !== c);
        const expandKey = seksi + '::' + c;

        const pagu = Number(i.pagu || 0);
        const blokir = Number(i.blokir || 0);
        const realisasi = Number(i.realisasi || 0);
        const sisa = Number(i.sisa || 0);
        const paguEfektif = pagu - blokir;
        const persenRealisasi = paguEfektif > 0 ? Math.min((realisasi / paguEfektif) * 100, 100) : 0;
        const barColor = persenRealisasi >= 90 ? 'bg-green-500' : (persenRealisasi >= 50 ? 'bg-sky-500' : 'bg-amber-400');
        const sisaClass = sisa < 0 ? 'text-red-600 font-semibold' : 'text-slate-700';

        return `<tr data-kode="${c}" data-seksi="${seksi}" class="border-b transition ${rowBg} cursor-pointer">
            <td class="p-3 font-mono text-xs ${isLeaf ? 'font-bold text-slate-700' : 'text-slate-500'} whitespace-nowrap">${c}</td>
            <td class="p-3 ${textWeight}" style="padding-left:${12 + indentPx}px">
                <span class="whitespace-normal break-words">${i.uraian}</span>
                ${hasChildren ? (kgMakExpandedCodes.has(expandKey) ? ' <i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i>' : ' <i class="fa-solid fa-chevron-right text-[10px] text-slate-400"></i>') : ''}
            </td>
            <td class="p-3 text-right whitespace-nowrap">${pagu.toLocaleString('id-ID')}</td>
            <td class="p-3 text-right whitespace-nowrap">${blokir.toLocaleString('id-ID')}</td>
            <td class="p-3 text-right whitespace-nowrap">
                <div>${realisasi.toLocaleString('id-ID')}</div>
                ${paguEfektif > 0 ? `
                    <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                        <div class="h-full ${barColor} rounded-full" style="width:${persenRealisasi}%"></div>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-0.5">${persenRealisasi.toFixed(1)}%</div>
                ` : ''}
            </td>
            <td class="p-3 text-right whitespace-nowrap ${sisaClass}">${sisa.toLocaleString('id-ID')}</td>
            <td class="p-3 text-center whitespace-nowrap text-slate-500">${i.sumber || '-'}</td>
            <td class="p-3 text-center whitespace-nowrap">
                ${isLeaf ? `
                    <button class="kg-mak-btnPilih bg-emerald-600 text-white w-6 h-6 inline-flex items-center justify-center rounded hover:bg-emerald-700" title="Pilih MAK ini">
                        <i class="fa-solid fa-check text-[11px] leading-none w-[11px] text-center"></i>
                    </button>
                ` : ''}
            </td>
        </tr>`;
    };

    const groupHeaderRow = (seksi, count, isOpen) => `
        <tr class="select-none">
            <td colspan="8" class="p-3 font-bold text-sm ${kgMakSeksiBadgeClass(seksi)} kg-mak-toggleSeksi cursor-pointer" data-seksi="${seksi}">
                <i class="fa-solid ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'} text-xs mr-2"></i>
                ${seksi}
                <span class="ml-2 font-normal text-xs opacity-70">(${count} item)</span>
            </td>
        </tr>`;

    const columnSubHeaderRow = () => `
        <tr class="text-slate-500 text-[11px] uppercase">
            <td class="p-2 text-left bg-slate-50 font-semibold">Kode</td>
            <td class="p-2 text-left bg-slate-50 font-semibold">Uraian</td>
            <td class="p-2 text-right bg-slate-50 font-semibold">Pagu</td>
            <td class="p-2 text-right bg-slate-50 font-semibold">Blokir</td>
            <td class="p-2 text-right bg-slate-50 font-semibold">Realisasi</td>
            <td class="p-2 text-right bg-slate-50 font-semibold">Sisa</td>
            <td class="p-2 text-center bg-slate-50 font-semibold">SD</td>
            <td class="p-2 text-center bg-slate-50 font-semibold">Aksi</td>
        </tr>`;

    let html = '';
    groups.forEach((items, seksi) => {
        const isOpen = kgMakExpandedSeksi.has(seksi);
        html += groupHeaderRow(seksi, items.length, isOpen);
        if (isOpen) {
            html += columnSubHeaderRow();
            html += items.map(i => rowHtml(i, seksi, items)).join('');
        }
    });

    tbody.innerHTML = html;

    // Bind toggle seksi
    tbody.querySelectorAll('.kg-mak-toggleSeksi').forEach(td => {
        td.onclick = () => {
            const seksi = td.dataset.seksi;
            kgMakExpandedSeksi.has(seksi) ? kgMakExpandedSeksi.delete(seksi) : kgMakExpandedSeksi.add(seksi);
            kgRenderMakTable(overlay);
        };
    });

    // Bind expand/collapse baris (klik baris selain tombol Pilih)
    tbody.querySelectorAll('tr[data-kode]').forEach(tr => {
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.kg-mak-btnPilih')) return;
            const c = tr.dataset.kode;
            const seksi = tr.dataset.seksi;
            const key = seksi + '::' + c;
            kgMakExpandedCodes.has(key) ? kgMakExpandedCodes.delete(key) : kgMakExpandedCodes.add(key);
            kgRenderMakTable(overlay);
        });
    });

    // Bind tombol Pilih
    tbody.querySelectorAll('.kg-mak-btnPilih').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const tr = btn.closest('tr[data-kode]');
            const kode = tr.dataset.kode;
            if (typeof kgMakOnPilih === 'function') kgMakOnPilih(kode);
            overlay.remove();
        };
    });
}

// ---- Pelaksana ----
function kgShowPelaksanaPopup(tr) {
    const idKegiatan = tr.dataset.id;
    const mak = tr.cells[0].textContent;
    const uraian = tr.cells[1].textContent;
    const tujuan = tr.cells[3].textContent;
    const tglST = tr.cells[4].textContent;
    const user = tr.cells[7].textContent;

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base">Pelaksana Kegiatan #${idKegiatan}</h3>
        <label class="${kgLabelClass}">MAK</label>
        <input type="text" value="${mak}" readonly class="${kgInputClass} bg-slate-100">
        <label class="${kgLabelClass}">Uraian</label>
        <input id="kg-pelUraian" type="text" value="${uraian}" class="${kgInputClass}">
        <label class="${kgLabelClass}">Tujuan</label>
        <input type="text" value="${tujuan}" readonly class="${kgInputClass} bg-slate-100">
        <div class="flex gap-3">
            <div class="flex-1 flex flex-col gap-1">
                <label class="${kgLabelClass}">User</label>
                <input type="text" value="${user}" readonly class="${kgInputClass} bg-slate-100">
            </div>
            <div class="flex-1 flex flex-col gap-1">
                <label class="${kgLabelClass}">Tgl ST/ND</label>
                <input id="kg-pelTglST" type="date" value="${tglST}" class="${kgInputClass}">
            </div>
        </div>
        <label class="${kgLabelClass}">Pelaksana</label>
        <div class="flex gap-2">
            <input id="kg-pelNama" type="text" list="kg-listPegawai" class="${kgInputClass} flex-1">
            <button id="kg-btnTambahPelaksana" class="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium whitespace-nowrap">Submit</button>
        </div>
        <div class="border border-slate-200 rounded-lg max-h-56 overflow-y-auto mt-1">
            <table class="w-full text-xs border-collapse">
                <thead class="bg-slate-100 sticky top-0">
                    <tr>
                        <th class="p-2">Nama</th><th class="p-2">Tgl Mulai</th><th class="p-2">Tgl Selesai</th>
                        <th class="p-2 text-right">Jumlah</th><th class="p-2 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody id="kg-pelaksanaTableBody"></tbody>
            </table>
        </div>
        <div class="flex justify-end gap-2 mt-2">
            <button id="kg-pelCancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="kg-pelSave" class="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">Simpan</button>
        </div>
    `, 'max-w-2xl');

    popup.querySelector('#kg-btnTambahPelaksana').onclick = function () {
        const namaInput = popup.querySelector('#kg-pelNama');
        const nama = namaInput.value.trim();
        if (!nama) return;

        const tbody = popup.querySelector('#kg-pelaksanaTableBody');
        const row = document.createElement('tr');
        row.className = 'border-t border-slate-100';
        row.innerHTML = `
            <td class="p-1.5">${nama}</td>
            <td class="p-1.5"><input type="date" class="px-2 py-1 border border-slate-300 rounded-md text-xs w-full"></td>
            <td class="p-1.5"><input type="date" class="px-2 py-1 border border-slate-300 rounded-md text-xs w-full"></td>
            <td class="p-1.5"><input type="text" class="kg-jumlah-input w-full px-2 py-1 border border-slate-300 rounded-md text-xs text-right"></td>
            <td class="p-1.5 text-center"><button class="text-red-500"><i class="fa-solid fa-trash"></i></button></td>
        `;
        row.querySelector('button').onclick = () => row.remove();
        tbody.appendChild(row);

        const jumlahInput = row.querySelector('.kg-jumlah-input');
        jumlahInput.addEventListener('input', function () {
            const value = this.value.replace(/\D/g, '');
            this.value = value ? Number(value).toLocaleString('id-ID') : '';
        });

        namaInput.value = '';
        namaInput.focus();
    };

    popup.querySelector('#kg-pelCancel').onclick = () => overlay.remove();

    popup.querySelector('#kg-pelSave').onclick = async function () {
        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);

        const rows = popup.querySelectorAll('#kg-pelaksanaTableBody tr');
        const dataPelaksana = [];
        rows.forEach(r => {
            const nama = r.cells[0].textContent;
            const mulaiRaw = r.cells[1].querySelector('input').value;
            const selesaiRaw = r.cells[2].querySelector('input').value;
            const jumlahText = r.cells[3].querySelector('input').value;
            dataPelaksana.push({
                nama,
                tglMulai: mulaiRaw ? mulaiRaw.split('T')[0] : '',
                tglSelesai: selesaiRaw ? selesaiRaw.split('T')[0] : '',
                jumlah: Number(jumlahText.replace(/\./g, '')) || 0
            });
        });

        if (dataPelaksana.length === 0) {
            alert('Tidak ada data pelaksana.');
            kgShowLoading(false);
            btn.disabled = false;
            return;
        }

        try {
            await waitSupabaseAuthReady();

            const uraianVal = popup.querySelector('#kg-pelUraian').value;
            const tglStVal = popup.querySelector('#kg-pelTglST').value;
            const namaUser = localStorage.getItem('nama') || user;
            const todayStr = new Date().toISOString().split('T')[0];

            // 1. Hapus baris lama
            const { error: delError } = await sb.from('kegiatan').delete().eq('id', idKegiatan);
            if (delError) throw new Error(delError.message);

            // 2. Buat 1 baris baru per pelaksana (ID baru masing2, sama seperti pola lama)
            const rowsBaru = dataPelaksana.map(p => {
                const status = kgComputeStatus(p.tglMulai, '', '', '');
                return {
                    id: kgGenerateRandomId(10),
                    mak, uraian: uraianVal, pelaksana: p.nama, tujuan,
                    tgl_st: normDate(tglStVal), tgl_mulai: normDate(p.tglMulai), tgl_selesai: normDate(p.tglSelesai),
                    tgl_lpt: null, tgl_bayar: null, jumlah: p.jumlah,
                    user: namaUser, status, tgl_sp2d: null, nomor_spm: '',
                    dokumen_link: '', spby_link: '', tgl_rekam: normDate(todayStr),
                    perbantuan: false
                };
            });

            const { error: insError } = await sb.from('kegiatan').insert(rowsBaru);
            if (insError) throw new Error(insError.message);

            overlay.remove();
            showToast('Pelaksana berhasil disimpan');
            kgLoadData(true);
        } catch (e) {
            alert('Gagal: ' + (e.message || e));
        } finally {
            kgShowLoading(false);
            btn.disabled = false;
        }
    };
}

// ---- LPT ----
function kgShowLPTPopup(tr) {
    const uraianTarget = tr.cells[1].textContent;
    const allMainRows = document.querySelectorAll('#kg-dataTableBody tr');
    const filteredRows = Array.from(allMainRows).filter(row => row.cells[1].textContent === uraianTarget);

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base">LPT Kegiatan</h3>
        <label class="${kgLabelClass}">Tanggal LPT</label>
        <input id="kg-lptTanggal" type="date" class="${kgInputClass}">
        <div class="border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
            <table class="w-full text-xs border-collapse">
                <thead class="bg-slate-100 sticky top-0">
                    <tr><th class="p-2">ID Kegiatan</th><th class="p-2">Uraian / No ST</th><th class="p-2">Pelaksana Tugas</th><th class="p-2 text-center">Aksi</th></tr>
                </thead>
                <tbody id="kg-lptTableBody"></tbody>
            </table>
        </div>
        <div class="flex justify-end gap-2 mt-2">
            <button id="kg-lptCancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="kg-lptSave" class="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">Simpan</button>
        </div>
    `, 'max-w-2xl');

    const tbody = popup.querySelector('#kg-lptTableBody');
    filteredRows.forEach(row => {
        const id = row.dataset.id;
        const uraian = row.cells[1].textContent;
        const pelaksana = row.cells[2].textContent;
        const newRow = document.createElement('tr');
        newRow.className = 'border-t border-slate-100';
        newRow.innerHTML = `
            <td class="p-1.5">${id}</td><td class="p-1.5">${uraian}</td><td class="p-1.5">${pelaksana}</td>
            <td class="p-1.5 text-center"><button class="text-red-500"><i class="fa-solid fa-trash"></i></button></td>
        `;
        newRow.querySelector('button').onclick = () => newRow.remove();
        tbody.appendChild(newRow);
    });

    popup.querySelector('#kg-lptCancel').onclick = () => overlay.remove();
    popup.querySelector('#kg-lptSave').onclick = async function () {
        const tanggal = popup.querySelector('#kg-lptTanggal').value;
        if (!tanggal) { alert('Tanggal LPT harus diisi!'); return; }

        const rows = popup.querySelectorAll('#kg-lptTableBody tr');
        const ids = Array.from(rows).map(r => r.cells[0].textContent);

        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);
        try {
            await waitSupabaseAuthReady();
            const results = await Promise.all(ids.map(id => {
                const rowData = kgAllRows.find(r => String(r.A) === String(id));
                const status = kgComputeStatus(rowData?.G, tanggal, rowData?.J, rowData?.Q);
                return sb.from('kegiatan').update({ tgl_lpt: normDate(tanggal), status }).eq('id', id);
            }));
            const gagal = results.find(r => r.error);
            if (gagal) throw new Error(gagal.error.message);

            overlay.remove();
            showToast('LPT berhasil disimpan');
            kgLoadData(true);
        } catch (e) {
            alert('Gagal update LPT: ' + (e.message || e));
        } finally {
            kgShowLoading(false);
            btn.disabled = false;
        }
    };
}

// ---- Bayar ----
function kgShowBayarPopup(tr) {
    const idKegiatan = tr.dataset.id;
    const uraian = tr.cells[1].textContent;

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base">Bayar Kegiatan #${idKegiatan}</h3>
        <label class="${kgLabelClass}">Uraian / No ST</label>
        <input id="kg-bayarUraian" type="text" value="${uraian}" class="${kgInputClass}">
        <label class="${kgLabelClass}">Tanggal Bayar</label>
        <input id="kg-tglBayar" type="date" class="${kgInputClass}">
        <label class="${kgLabelClass}">Daftar Pelaksana Tugas</label>
        <table class="w-full text-xs border border-slate-300 border-collapse">
            <thead class="bg-slate-100">
                <tr><th class="p-1.5 border-b border-slate-300">ID Kegiatan</th><th class="p-1.5 border-b border-slate-300">Pelaksana Tugas</th><th class="p-1.5 border-b border-slate-300">Aksi</th></tr>
            </thead>
            <tbody id="kg-bayarTableBody"></tbody>
        </table>
        <div class="flex justify-end gap-2 mt-3">
            <button id="kg-bayarCancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="kg-bayarSave" class="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">Simpan</button>
        </div>
    `, 'max-w-xl');

    popup.querySelector('#kg-bayarCancel').onclick = () => overlay.remove();

    const tbody = popup.querySelector('#kg-bayarTableBody');
    document.querySelectorAll('#kg-dataTableBody tr').forEach(r => {
        if (r.cells[1].textContent === uraian) {
            const id = r.dataset.id;
            const pelaksana = r.cells[2].textContent;
            const newRow = document.createElement('tr');
            newRow.dataset.id = id;
            newRow.className = 'border-t border-slate-100';
            newRow.innerHTML = `
                <td class="p-1.5">${id}</td><td class="p-1.5">${pelaksana}</td>
                <td class="p-1.5 text-center"><button class="text-red-500"><i class="fa-solid fa-trash"></i></button></td>
            `;
            newRow.querySelector('button').onclick = () => newRow.remove();
            tbody.appendChild(newRow);
        }
    });

    popup.querySelector('#kg-bayarSave').onclick = async function () {
        const uraianValue = popup.querySelector('#kg-bayarUraian').value.trim();
        const tglBayar = popup.querySelector('#kg-tglBayar').value;
        if (!tglBayar) { alert('Tanggal Bayar harus diisi!'); return; }

        const rows = popup.querySelectorAll('#kg-bayarTableBody tr');
        const ids = Array.from(rows).map(r => r.dataset.id);

        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);
        try {
            await waitSupabaseAuthReady();
            const results = await Promise.all(ids.map(id => {
                const rowData = kgAllRows.find(r => String(r.A) === String(id));
                const status = kgComputeStatus(rowData?.G, rowData?.I, tglBayar, rowData?.Q);
                return sb.from('kegiatan').update({ uraian: uraianValue, tgl_bayar: normDate(tglBayar), status }).eq('id', id);
            }));
            const gagal = results.find(r => r.error);
            if (gagal) throw new Error(gagal.error.message);

            overlay.remove();
            showToast('Pembayaran berhasil disimpan');
            kgLoadData(true);
        } catch (e) {
            alert('Gagal: ' + (e.message || e));
        } finally {
            kgShowLoading(false);
            btn.disabled = false;
        }
    };
}

// ---- SP2D ----
function kgShowSP2DPopup(tr) {
    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base">SP2D Kegiatan</h3>
        <label class="${kgLabelClass}">Nomor SPM</label>
        <input id="kg-spmNomor" type="text" placeholder="0000" maxlength="4" class="${kgInputClass}">
        <label class="${kgLabelClass}">Tanggal SP2D</label>
        <input id="kg-tglSP2D" type="date" class="${kgInputClass}">
        <label class="${kgLabelClass}">Cari di tabel</label>
        <input id="kg-sp2dSearch" type="text" placeholder="Cari..." class="${kgInputClass}">
        <div class="border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
            <table class="w-full text-xs border-collapse">
                <thead class="bg-slate-100 sticky top-0">
                    <tr>
                        <th class="p-2">ID Kegiatan</th><th class="p-2">Uraian / No ST</th><th class="p-2">Nama</th>
                        <th class="p-2">Tujuan</th><th class="p-2 text-right">Jumlah</th><th class="p-2 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody id="kg-sp2dTableBody"></tbody>
            </table>
        </div>
        <div class="flex justify-end gap-2 mt-2">
            <button id="kg-sp2dCancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="kg-sp2dSave" class="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">Simpan</button>
        </div>
    `, 'max-w-2xl');

    const tbody = popup.querySelector('#kg-sp2dTableBody');
    document.querySelectorAll('#kg-dataTableBody tr').forEach(row => {
        const id = row.dataset.id;
        const uraian = row.cells[1].textContent;
        const nama = row.cells[2].textContent;
        const tujuan = row.cells[3].textContent;
        const jumlah = row.cells[6].textContent;
        const newRow = document.createElement('tr');
        newRow.className = 'border-t border-slate-100';
        newRow.innerHTML = `
            <td class="p-1.5">${id}</td><td class="p-1.5">${uraian}</td><td class="p-1.5">${nama}</td>
            <td class="p-1.5">${tujuan}</td><td class="p-1.5 text-right">${jumlah}</td>
            <td class="p-1.5 text-center"><button class="text-red-500"><i class="fa-solid fa-trash"></i></button></td>
        `;
        newRow.querySelector('button').onclick = () => newRow.remove();
        tbody.appendChild(newRow);
    });

    popup.querySelector('#kg-sp2dCancel').onclick = () => overlay.remove();
    popup.querySelector('#kg-sp2dSearch').addEventListener('input', function () {
        const val = this.value.toLowerCase();
        tbody.querySelectorAll('tr').forEach(tr2 => {
            const match = Array.from(tr2.cells).some(td => td.textContent.toLowerCase().includes(val));
            tr2.style.display = match ? '' : 'none';
        });
    });
    popup.querySelector('#kg-spmNomor').addEventListener('blur', function () {
        const val = parseInt(this.value) || 0;
        this.value = String(val).padStart(4, '0');
    });

    popup.querySelector('#kg-sp2dSave').onclick = async function () {
        const nomorSPM = popup.querySelector('#kg-spmNomor').value.trim();
        const tglSP2D = popup.querySelector('#kg-tglSP2D').value;
        if (!nomorSPM || !tglSP2D) { alert('Nomor SPM dan Tanggal SP2D harus diisi!'); return; }

        const rows = popup.querySelectorAll('#kg-sp2dTableBody tr');
        const ids = Array.from(rows).map(r => r.cells[0].textContent);

        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);
        try {
            await waitSupabaseAuthReady();
            const results = await Promise.all(ids.map(id => {
                const rowData = kgAllRows.find(r => String(r.A) === String(id));
                const status = kgComputeStatus(rowData?.G, rowData?.I, rowData?.J, tglSP2D);
                return sb.from('kegiatan').update({ tgl_sp2d: normDate(tglSP2D), nomor_spm: nomorSPM, status }).eq('id', id);
            }));
            const gagal = results.find(r => r.error);
            if (gagal) throw new Error(gagal.error.message);

            overlay.remove();
            showToast('SP2D berhasil disimpan');
            kgLoadData(true);
        } catch (e) {
            alert('Gagal: ' + (e.message || e));
        } finally {
            kgShowLoading(false);
            btn.disabled = false;
        }
    };
}

// ---- Detil ----
function kgShowDetilPopup(tr) {
    const id = tr.dataset.id;
    const data = kgCurrentTableRowsData.find(r => String(r.A) === String(id));

    if (!data) {
        alert('Data detil tidak ditemukan.');
        return;
    }

    const formatDate = (v) => {
        if (!v) return '-';
        const d = new Date(v);
        if (isNaN(d.getTime())) return String(v);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const jumlahFormatted = 'Rp ' + Number(data.M || 0).toLocaleString('id-ID');

    const baris = (label, value) => `
        <div class="flex justify-between items-start gap-4 py-2 border-b border-slate-100 text-sm">
            <span class="text-slate-500 whitespace-nowrap">${label}</span>
            <span class="font-medium text-slate-800 text-right break-words">${(value === undefined || value === null || value === '') ? '-' : value}</span>
        </div>`;

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base mb-1">Detil Kegiatan #${data.A ?? ''}</h3>
        <div class="flex flex-col">
            ${baris('ID Kegiatan', data.A)}
            ${baris('MAK', data.B)}
            ${baris('Uraian / No ST', data.C)}
            ${baris('Pelaksana Tugas', data.D)}
            ${baris('Tujuan', data.E)}
            ${baris('Tgl ST', formatDate(data.F))}
            ${baris('Tgl Mulai', formatDate(data.G))}
            ${baris('Tgl Selesai', formatDate(data.H))}
            ${baris('Tgl LPT', formatDate(data.I))}
            ${baris('Tgl Bayar', formatDate(data.J))}
            ${baris('Jumlah', jumlahFormatted)}
            ${baris('User', data.N)}
            ${baris('Status', data.P)}
            ${baris('Tgl SP2D', formatDate(data.Q))}
            ${baris('Nomor SPM', data.R)}
        </div>
        <div class="flex justify-end mt-2">
            <button id="kg-detilClose" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Tutup</button>
        </div>
    `, 'max-w-md');

    popup.querySelector('#kg-detilClose').onclick = () => overlay.remove();
}

// ---- Dokumen PDF (kuitansi & SPBy, upload/lihat/reupload/hapus ke Google Drive folder simab_doc) ----

// Update warna tombol dokumen di baris tabel: abu-abu = belum ada, kuning =
// kuitansi saja, biru = SPBy saja, hijau = kuitansi & SPBy sudah ada.
function kgUpdateDokBtnColor(trEl, rowData) {
    if (!trEl || !rowData) return;
    const dokBtn = trEl.querySelector('.kg-btn-dokumen');
    if (!dokBtn) return;
    const style = kgDokBtnStyle(rowData);
    dokBtn.classList.remove('text-emerald-600', 'text-amber-500', 'text-sky-500', 'text-slate-400');
    dokBtn.classList.add(style.cls);
    dokBtn.title = style.title;
}

// Terapkan hasil {idKegiatan: link} ke kgCurrentTableRowsData + tombol tabel,
// untuk field tertentu ('T' = kuitansi, 'U' = SPBy). Dipakai setelah
// upload/tempel-link/hapus, karena satu aksi bisa berlaku ke beberapa baris
// sekaligus (kuitansi: Uraian sama; SPBy: No. SPM sama).
// Deteksi tag SPBy-XXXX / Kkp-XXXX / SPM-XXXX di teks Uraian — sama persis
// pola yang dulu dipakai backend (kgParseDokumenTag_), dipindah ke client
// karena sekarang backend tidak lagi tahu isi Uraian (data sumbernya Firestore).
function kgFindDokTagMatchText(uraian) {
    const u = String(uraian || '');
    let m = u.match(/SPBy-\d+/i); if (m) return m[0];
    m = u.match(/Kkp-\d+/i); if (m) return m[0];
    m = u.match(/SPM-\d+/i); if (m) return m[0];
    return null;
}

// Cari SEMUA id kegiatan (dari kgAllRows, sumber Firestore) yang harus ikut
// dapat link dokumen yang sama dengan baris sumber (rowData) — menggantikan
// logic pencarian-baris yang dulu dilakukan backend lewat scan Sheet:
// - Kuitansi (field T): baris lain dgn tag SPBy/KKP/SPM yg sama di Uraian,
//   fallback ke Uraian identik persis kalau tidak ada tag sama sekali.
// - SPBy (field U): baris lain dengan No. SPM (kolom R) yang sama.
function kgFindTargetIdsForDokLink(field, rowData) {
    if (field === 'U') {
        const spmTarget = String(rowData.R || '').trim();
        if (spmTarget) {
            return kgAllRows.filter(r => String(r.R || '').trim() === spmTarget).map(r => r.A);
        }
        return [rowData.A];
    }

    const uraianSource = String(rowData.C || '').trim();
    const tagMatch = kgFindDokTagMatchText(uraianSource);
    if (tagMatch) {
        const tagLower = tagMatch.toLowerCase();
        return kgAllRows.filter(r => String(r.C || '').toLowerCase().includes(tagLower)).map(r => r.A);
    }
    return kgAllRows.filter(r => String(r.C || '').trim() === uraianSource).map(r => r.A);
}

function kgApplyDokLinksToTable(links, field) {
    Object.keys(links || {}).forEach(rowId => {
        const link = links[rowId];
        const found = kgCurrentTableRowsData.find(r => String(r.A) === String(rowId));
        if (found) found[field] = link;
        // kgAllRows juga diupdate (sumber "master" client-side) supaya konsisten
        // kalau user ganti filter tanpa Refresh dulu.
        const foundAll = kgAllRows.find(r => String(r.A) === String(rowId));
        if (foundAll) foundAll[field] = link;

        const trEl = document.querySelector(`#kg-dataTableBody tr[data-id="${CSS.escape(String(rowId))}"]`);
        kgUpdateDokBtnColor(trEl, found);
    });
}

// File dokumen tetap di-upload lewat GAS (butuh akses Drive server-side), tapi
// link hasilnya (result.links dari GAS, sudah berisi semua baris terkait —
// misal semua baris dgn tag SPBy/No.SPM yang sama) disinkronkan juga ke
// Supabase di sini.
async function kgSyncDokLinksToDb(links, field) {
    const dbField = field === 'T' ? 'dokumen_link' : 'spby_link';
    const ids = Object.keys(links || {});
    if (ids.length === 0) return;

    try {
        await waitSupabaseAuthReady();
        // upsert (bukan update biasa) supaya tetap aman kalau barisnya ternyata
        // belum ada di tabel (mis. baris lama yang belum sempat ke-migrasi) —
        // update() akan diam-diam skip (0 baris kena) kalau id tidak ditemukan,
        // sedangkan upsert otomatis membuatnya kalau belum ada.
        const rows = ids.map(id => ({ id, [dbField]: links[id] }));
        const { error } = await sb.from('kegiatan').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(error.message);
    } catch (e) {
        console.error('Gagal sinkron link dokumen ke Supabase:', e);
    }
}

// Wire satu "slot" dokumen (kuitansi ATAU SPBy) di dalam popup Dokumen.
// Dipakai 2x oleh kgShowDokumenPopup supaya logic upload/lihat/hapus/tempel-link
// tidak perlu ditulis dua kali.
function kgWireDokSlot(opts) {
    const { popup, prefix, id, rowData, field, uploadAction, deleteAction, allowTempelLink, viewTitle, searchTextForView, rerender } = opts;

    const btnLihat = popup.querySelector(`#${prefix}Lihat`);
    const btnUpload = popup.querySelector(`#${prefix}Upload`);
    const btnTempelLink = allowTempelLink ? popup.querySelector(`#${prefix}TempelLink`) : null;
    const btnHapus = popup.querySelector(`#${prefix}Hapus`);
    const fileInput = popup.querySelector(`#${prefix}FileInput`);
    const linkForm = allowTempelLink ? popup.querySelector(`#${prefix}LinkForm`) : null;
    const linkInput = allowTempelLink ? popup.querySelector(`#${prefix}LinkInput`) : null;
    const btnLinkSimpan = allowTempelLink ? popup.querySelector(`#${prefix}LinkSimpan`) : null;
    const statusEl = popup.querySelector(`#${prefix}Status`);

    const link = rowData[field];

    const setBusy = (busy) => {
        btnLihat.disabled = busy || !rowData[field];
        btnUpload.disabled = busy;
        if (btnTempelLink) btnTempelLink.disabled = busy;
        btnHapus.disabled = busy || !rowData[field];
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
                const result = await apiPost({ action: deleteAction, id: id, uraian: rowData.C, nomorSPM: rowData.R }, 30000);
                if (result.status === 'success') {
                    const targetIds = kgFindTargetIdsForDokLink(field, rowData);
                    const links = {};
                    targetIds.forEach(tid => { links[tid] = ''; });
                    rowData[field] = '';
                    kgApplyDokLinksToTable(links, field);
                    await kgSyncDokLinksToDb(links, field);
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
                fileName: file.name,
                uraian: rowData.C,
                nomorSPM: rowData.R
            }, 60000);

            if (result.status === 'success') {
                const targetIds = kgFindTargetIdsForDokLink(field, rowData);
                const links = {};
                targetIds.forEach(tid => { links[tid] = result.link; });
                rowData[field] = result.link;
                kgApplyDokLinksToTable(links, field);
                await kgSyncDokLinksToDb(links, field);
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
                    rowData[field] = result.link;
                    kgApplyDokLinksToTable(result.links || { [id]: result.link }, field);
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

// Deteksi tag dokumen (SPBy / KKP / LS) dari Uraian (kolom C) — cermin dari
// kgParseDokumenTag_ di backend (GAS), dipakai utk menentukan label slot
// dokumen kedua di popup ("SPBy" / "DRPP (KKP)" / "DRPP (LS)" / "DRPP") dan
// utk auto-jump ke halaman yang tepat saat Lihat SPBy diklik.
function kgParseDokumenTagClient(uraian) {
    const u = String(uraian || '');
    let m = u.match(/SPBy-(\d+)/i);
    if (m) return { nomor: m[1], suffix: 'SPBy', label: 'SPBy' };
    m = u.match(/Kkp-(\d+)/i);
    if (m) return { nomor: m[1], suffix: 'KKP', label: 'DRPP (KKP)' };
    m = u.match(/SPM-(\d+)/i);
    if (m) return { nomor: m[1], suffix: 'LS', label: 'DRPP (LS)' };
    return null;
}

function kgShowDokumenPopup(tr) {
    const id = tr.dataset.id;
    const rowData = kgCurrentTableRowsData.find(r => String(r.A) === String(id));
    if (!rowData) {
        alert('Data kegiatan tidak ditemukan.');
        return;
    }

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

    const dokTag = kgParseDokumenTagClient(rowData.C);
    const slotKeduaLabel = dokTag ? dokTag.label : 'DRPP';

    const renderContent = () => `
        <h3 class="text-center text-sky-700 font-semibold text-base mb-2"><i class="fa-solid fa-file-pdf mr-2"></i>Dokumen Kegiatan #${id}</h3>
        <div class="flex flex-col gap-3">
            ${slotHtml('kgDokKuitansi', 'Kuitansi / Dokumen', rowData.T, false)}
            ${slotHtml('kgDokSpby', slotKeduaLabel, rowData.U, false)}
        </div>
        <div class="flex justify-end mt-1">
            <button id="kg-dokClose" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Tutup</button>
        </div>
    `;

    const { overlay, popup } = kgOpenOverlay(renderContent(), 'max-w-md');

    function rerender() {
        popup.innerHTML = renderContent();
        wireAll();
    }

    function wireAll() {
        popup.querySelector('#kg-dokClose').onclick = () => overlay.remove();

        // Auto-jump ke halaman yang memuat teks "<nomor>/PB/" cuma berlaku utk
        // dokumen SPBy (bukan DRPP-KKP/DRPP-LS, karena polanya belum diketahui).
        const spbySearchCandidates = (dokTag && dokTag.suffix === 'SPBy')
            ? [`${dokTag.nomor}/PB/`, `${parseInt(dokTag.nomor, 10)}/PB/`]
            : null;

        kgWireDokSlot({
            popup, prefix: 'kgDokKuitansi', id, rowData, field: 'T',
            uploadAction: 'uploadDokumenKegiatan',
            deleteAction: 'hapusDokumenKegiatan',
            allowTempelLink: false,
            viewTitle: `Kuitansi / Dokumen #${id}`,
            searchTextForView: null,
            rerender
        });
        kgWireDokSlot({
            popup, prefix: 'kgDokSpby', id, rowData, field: 'U',
            uploadAction: 'uploadSpbyKegiatan',
            deleteAction: 'hapusSpbyKegiatan',
            allowTempelLink: false,
            viewTitle: `${slotKeduaLabel} #${id}`,
            searchTextForView: spbySearchCandidates,
            rerender
        });

        kgUpdateDokBtnColor(tr, rowData);
    }

    wireAll();
}


// ---- Hapus ----
function kgShowDeletePopup(tr) {
    const idKegiatan = tr.dataset.id;
    const uraian = tr.cells[1].textContent;

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-red-600 font-semibold text-base">Konfirmasi Hapus</h3>
        <p class="text-center text-sm text-slate-600">Yakin ingin menghapus kegiatan:</p>
        <strong class="text-center block">${uraian}</strong>
        <div class="flex justify-center gap-2 mt-3">
            <button id="kg-deleteCancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="kg-deleteConfirm" class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">Hapus</button>
        </div>
    `);

    popup.querySelector('#kg-deleteCancel').onclick = () => overlay.remove();
    popup.querySelector('#kg-deleteConfirm').onclick = async function () {
        this.disabled = true;
        kgShowLoading(true);
        try {
            await waitSupabaseAuthReady();
            const { error } = await sb.from('kegiatan').delete().eq('id', idKegiatan);
            if (error) throw new Error(error.message);

            overlay.remove();
            showToast('Kegiatan berhasil dihapus');
            kgLoadData(true);
        } catch (e) {
            alert('Gagal hapus: ' + (e.message || e));
        } finally {
            kgShowLoading(false);
        }
    };
}

// ==========================================
// 🖨️ Cetak Nominatif
// ==========================================
async function kgOpenNominatifPopup() {
    if (!kgCurrentTableRowsData || kgCurrentTableRowsData.length === 0) {
        alert('Tidak ada data di tabel saat ini untuk dicetak.');
        return;
    }

    kgShowLoading(true);

    let ppkNama = 'BAYU ADINEGORO', ppkNip = '198802242008121002';
    let bpNama = 'ACHMAD CHABIB NURSALIM', bpNip = '199101162013101002';

    try {
        const sheetId = '10JQ3ysZai7yNXHMWw81UeztwbxSPwsCMiykJj2w5AHE';
        const refUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=ref&range=T3:W3`;
        const response = await fetch(refUrl);
        const text = await response.text();
        const dataJson = JSON.parse(text.substr(47).slice(0, -2));
        const rowCells = dataJson.table.rows[0].c;
        if (rowCells[0] && rowCells[0].v) ppkNama = rowCells[0].v;
        if (rowCells[1] && rowCells[1].v) ppkNip = String(rowCells[1].v);
        if (rowCells[2] && rowCells[2].v) bpNama = rowCells[2].v;
        if (rowCells[3] && rowCells[3].v) bpNip = String(rowCells[3].v);
    } catch (err) {
        console.warn('Gagal mengambil data penandatangan, pakai default.', err);
    }

    kgShowLoading(false);

    let totalBiaya = 0;
    const rekapMAK = {}, rekapWilayah = {}, rekapPeserta = {};
    let spmNomor = document.getElementById('kg-spmSearchBox') ? document.getElementById('kg-spmSearchBox').value.trim() : '';
    if (!spmNomor) spmNomor = '0075';

    kgCurrentTableRowsData.forEach(r => {
        const jml = Number(r.M || 0);
        totalBiaya += jml;
        rekapMAK[r.B] = (rekapMAK[r.B] || 0) + jml;
        rekapWilayah[r.E] = (rekapWilayah[r.E] || 0) + jml;
        const keyPeserta = r.D;
        if (!rekapPeserta[keyPeserta]) {
            rekapPeserta[keyPeserta] = { nama: r.D, uraian: `SPM-${spmNomor} (${String(r.C).split('/')[0].replace('ST-', '')})`, jumlah: 0 };
        }
        rekapPeserta[keyPeserta].jumlah += jml;
    });

    let rowsHtml = '';
    kgCurrentTableRowsData.forEach(r => {
        const cleanST = r.F ? String(r.F).split('T')[0] : '';
        const cleanMulai = r.G ? String(r.G).split('T')[0] : '';
        const cleanSelesai = r.H ? String(r.H).split('T')[0] : '';
        const barisJml = Number(r.M || 0);
        let hari = 1;
        if (r.G && r.H) {
            const diff = new Date(r.H) - new Date(r.G);
            hari = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
        }
        rowsHtml += `<tr class="border-b border-slate-200">
            <td class="p-1.5 border-r border-slate-200">${r.D}</td>
            <td class="p-1.5 border-r border-slate-200">${r.B}</td>
            <td class="p-1.5 border-r border-slate-200">${r.C}</td>
            <td class="p-1.5 border-r border-slate-200">${cleanST}</td>
            <td class="p-1.5 border-r border-slate-200">${cleanMulai}</td>
            <td class="p-1.5 border-r border-slate-200">${cleanSelesai}</td>
            <td class="p-1.5 border-r border-slate-200 text-center">${hari}</td>
            <td class="p-1.5 border-r border-slate-200">${r.E}</td>
            <td class="p-1.5 border-r border-slate-200 text-right" data-raw="${barisJml}">${barisJml.toLocaleString('id-ID')},00</td>
            <td class="p-1.5 text-center"><button class="kg-nominatif-del text-red-600"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`;
    });

    const rekapBlock = (title, obj, cols) => `
        <div class="flex flex-col gap-1">
            <h4 class="text-xs font-semibold text-slate-600">${title}</h4>
            <div class="bg-white border border-slate-300 rounded-md flex-1 overflow-y-auto max-h-44">
                <table class="w-full text-xs border-collapse text-left">
                    <thead class="bg-slate-50 border-b border-slate-300 sticky top-0"><tr>${cols}</tr></thead>
                    <tbody>${Object.keys(obj).map(k => typeof obj[k] === 'object'
                        ? `<tr class="border-b border-slate-100"><td class="p-1 border-r border-slate-100">${obj[k].nama}</td><td class="p-1 border-r border-slate-100">${obj[k].uraian}</td><td class="p-1 text-right">${obj[k].jumlah.toLocaleString('id-ID')}</td></tr>`
                        : `<tr class="border-b border-slate-100"><td class="p-1 border-r border-slate-100">${k}</td><td class="p-1 text-right">${obj[k].toLocaleString('id-ID')}</td></tr>`
                    ).join('')}</tbody>
                </table>
            </div>
        </div>`;

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-sky-700 font-semibold text-base border-b border-slate-300 pb-2"><i class="fa-solid fa-print"></i> Cetak Daftar Nominatif Biaya Perjalanan Dinas</h3>
        <div class="bg-white border border-slate-300 rounded-md max-h-56 overflow-y-auto">
            <table id="kg-popupMainTable" class="w-full text-xs border-collapse text-left">
                <thead class="bg-slate-50 sticky top-0 border-b border-slate-300">
                    <tr>
                        <th class="p-2 border-r border-slate-200">Nama</th><th class="p-2 border-r border-slate-200">MAK</th>
                        <th class="p-2 border-r border-slate-200">Nomor ST</th><th class="p-2 border-r border-slate-200">Tanggal ST</th>
                        <th class="p-2 border-r border-slate-200">Tanggal Mulai</th><th class="p-2 border-r border-slate-200">Tanggal Selesai</th>
                        <th class="p-2 border-r border-slate-200">Hari</th><th class="p-2 border-r border-slate-200">Tujuan</th>
                        <th class="p-2 border-r border-slate-200 text-right">Jumlah</th><th class="p-2 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-sm">
            <label class="font-medium">Total Daftar Nominatif</label>
            <input id="kg-nominatifTotalInput" type="text" value="${totalBiaya.toLocaleString('id-ID')}" readonly class="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-semibold text-right w-40">
            <label class="font-medium ml-3">Nomor SPM</label>
            <input id="kg-nominatifSpmInput" type="text" value="${spmNomor}" class="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-semibold text-center w-24">
            <div class="flex gap-2 ml-auto">
                <button id="kg-nominatifCancel" class="px-4 py-2 border border-slate-300 bg-white text-slate-600 rounded-lg text-sm font-medium">Batal</button>
                <button id="kg-nominatifPrint" class="px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-print"></i> Cetak</button>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${rekapBlock('Rekapitulasi Per MAK', rekapMAK, '<th class="p-1.5 border-r border-slate-200">MAK</th><th class="p-1.5 text-right">Jumlah</th>')}
            ${rekapBlock('Rekapitulasi Per Wilayah', rekapWilayah, '<th class="p-1.5 border-r border-slate-200">Wilayah</th><th class="p-1.5 text-right">Jumlah</th>')}
            ${rekapBlock('Rekapitulasi Per Peserta', rekapPeserta, '<th class="p-1.5 border-r border-slate-200">Nama</th><th class="p-1.5 border-r border-slate-200">Uraian</th><th class="p-1.5 text-right">Jumlah</th>')}
        </div>
    `, 'max-w-5xl');
    popup.classList.add('bg-slate-100');

    const mainTableWrapper = popup.querySelector('#kg-popupMainTable').closest('div');
    mainTableWrapper.addEventListener('click', function (e) {
        const delBtn = e.target.closest('.kg-nominatif-del');
        if (!delBtn) return;
        const row = delBtn.closest('tr');
        row.remove();
        let newTotal = 0;
        mainTableWrapper.querySelectorAll('tbody tr').forEach(rowEl => {
            newTotal += Number(rowEl.cells[8]?.getAttribute('data-raw') || 0);
        });
        popup.querySelector('#kg-nominatifTotalInput').value = newTotal.toLocaleString('id-ID');
    });

    popup.querySelector('#kg-nominatifCancel').onclick = () => overlay.remove();

    popup.querySelector('#kg-nominatifPrint').onclick = () => {
        const customSpm = popup.querySelector('#kg-nominatifSpmInput').value.trim() || spmNomor;
        const activePopupRows = mainTableWrapper.querySelectorAll('tbody tr');
        if (activePopupRows.length === 0) {
            alert('Tidak ada data tersisa untuk dicetak.');
            return;
        }

        overlay.remove();

        const printWindow = window.open('', '_blank');
        let printTableRows = '';
        let finalTotalCetak = 0;

        activePopupRows.forEach((tr2, idx) => {
            const nama = tr2.cells[0].textContent;
            const mak = tr2.cells[1].textContent;
            const noST = tr2.cells[2].textContent;
            const tglST = tr2.cells[3].textContent;
            const tglMulai = tr2.cells[4].textContent;
            const tglSelesai = tr2.cells[5].textContent;
            const hari = tr2.cells[6].textContent;
            const tujuan = tr2.cells[7].textContent;
            const rawJml = Number(tr2.cells[8].getAttribute('data-raw') || 0);
            finalTotalCetak += rawJml;

            printTableRows += `
                <tr>
                    <td style="text-align:center; padding:5px;">${idx + 1}</td>
                    <td style="padding:5px;">${nama}</td>
                    <td style="padding:5px; font-size:10px;">${mak}</td>
                    <td style="padding:5px; font-size:10px;">${noST}</td>
                    <td style="text-align:center; padding:5px; white-space:nowrap;">${tglST}</td>
                    <td style="text-align:center; padding:5px; white-space:nowrap;">${tglMulai}</td>
                    <td style="text-align:center; padding:5px; white-space:nowrap;">${tglSelesai}</td>
                    <td style="text-align:center; padding:5px;">${hari}</td>
                    <td style="padding:5px;">${tujuan}</td>
                    <td style="text-align:right; padding:5px; white-space:nowrap;">${rawJml.toLocaleString('id-ID')}</td>
                    <td style="padding:5px;"></td>
                </tr>
            `;
        });

        printWindow.document.write(`
            <html>
            <head>
                <title>Daftar Nominatif Perjalanan Dinas - SPM ${customSpm}</title>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 11px; margin: 30px; color: #000; }
                    .kop { text-align: left; font-weight: bold; line-height: 1.3; font-size: 11px; margin-bottom: 20px; text-transform: uppercase; }
                    .title { text-align: center; font-weight: bold; font-size: 13px; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th { background: #f2f2f2; font-weight: bold; text-align: center; padding: 6px; border: 1px solid #000; font-size: 10px; }
                    td { border: 1px solid #000; padding: 5px; font-size: 10px; vertical-align: middle; }
                    .tte-container { width: 100%; margin-top: 25px; display: table; table-layout: fixed; page-break-inside: avoid; }
                    .tte-info { font-style: normal; color: #64748b; margin: 25px 0 10px 0; padding: 0; display: block; font-size: 10px; text-align: center; }
                    .tte-box { display: table-cell; width: 50%; text-align: center; vertical-align: top; font-size: 11px; padding-top: 10px; }
                    @media print { @page { size: landscape; margin: 20px; } body { margin: 10px; } }
                </style>
            </head>
            <body>
                <div class="kop">
                    KEMENTERIAN KEUANGAN REPUBLIK INDONESIA<br>
                    DIREKTORAT JENDERAL KEKAYAAN NEGARA<br>
                    KANTOR WILAYAH BALI DAN NUSA TENGGARA<br>
                    KANTOR PELAYANAN KEKAYAAN NEGARA DAN LELANG DENPASAR
                </div>
                <div class="title">DAFTAR NOMINATIF BIAYA PERJALANAN DINAS</div>
                <table>
                    <thead>
                        <tr>
                            <th style="width:3%;">No</th><th style="width:18%;">Nama</th><th style="width:14%;">MAK</th>
                            <th style="width:16%;">Nomor ST</th><th style="width:8%;">Tgl ST</th><th style="width:8%;">Tgl Mulai</th>
                            <th style="width:8%;">Tgl Selesai</th><th style="width:4%;">Hari</th><th style="width:12%;">Tujuan</th>
                            <th style="width:9%;">Jumlah</th><th style="width:4%;">Tanda Tangan</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${printTableRows}
                        <tr style="font-weight:bold; background:#fafafa;">
                            <td colspan="3" style="border-right:none;"></td>
                            <td colspan="6" style="text-align:center; font-weight:bold; padding:7px; border-left:none;">JUMLAH</td>
                            <td style="text-align:right; padding:7px; white-space:nowrap;">${finalTotalCetak.toLocaleString('id-ID')}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
                <div class="tte-container">
                    <div class="tte-box">
                        Mengetahui / Menyetujui<br>Pejabat Pembuat Komitmen
                        <br><br><br><br><br><br><br><br>
                        <div class="tte-info">Ditandatangani secara elektronik</div>
                        <strong>${ppkNama}</strong><br>NIP. ${ppkNip}
                    </div>
                    <div class="tte-box">
                        <br>Bendahara Pengeluaran
                        <br><br><br><br><br><br><br><br>
                        <div class="tte-info">Ditandatangani secara elektronik</div>
                        <strong>${bpNama}</strong><br>NIP. ${bpNip}
                    </div>
                </div>
            </body>
            </html>
        `);

        printWindow.document.close();
        setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
    };
}

function kgShowLoading(show) {
    let ov = document.getElementById('kg-loadingOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'kg-loadingOverlay';
        ov.className = 'fixed inset-0 bg-white/70 z-[20000] flex items-center justify-center';
        ov.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-sky-500 text-4xl"></i>';
        document.body.appendChild(ov);
    }
    ov.style.display = show ? 'flex' : 'none';
}

window.initKegiatanPage = initKegiatanPage;
