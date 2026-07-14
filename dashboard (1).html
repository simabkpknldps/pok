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


let kgAllRows = [];
let kgCurrentTableRowsData = [];
let kgPegawaiList = [];
let kgLokasiList = [];
let kgFirstLoad = true;

async function initKegiatanPage() {
    const root = document.getElementById('kg-mainDataTable');
    if (!root) return; // fragment belum ter-render coba

    // reset state setiap masuk halaman
    kgAllRows = [];
    kgCurrentTableRowsData = [];
    kgFirstLoad = true;

    bindKegiatanEvents();
    await kgLoadData(true);
}

function bindKegiatanEvents() {
    document.getElementById('kg-btnRefreshData').onclick = () => kgLoadData(true);
    document.getElementById('kg-btnDownloadExcel').onclick = kgDownloadExcel;
    document.getElementById('kg-btnOpenNominatif').onclick = kgOpenNominatifPopup;

    document.getElementById('kg-searchBox').addEventListener('input', function () {
        const val = this.value.toLowerCase();
        const radioVal = document.querySelector('input[name="kg-statusFilter"]:checked').value;
        let filtered = kgFilterByStatus(kgAllRows, radioVal);
        if (val) {
            filtered = filtered.filter(r =>
                Object.keys(r).filter(k => k !== 'N').some(k => String(r[k] || '').toLowerCase().includes(val))
            );
        }
        kgRenderTable(filtered);
    });

    document.getElementById('kg-btnSearchSPM').onclick = function () {
        const valBox = document.getElementById('kg-spmSearchBox').value.trim();
        if (!valBox) {
            alert('Masukkan nomor SPM terlebih dahulu!');
            return;
        }
        const filtered = kgAllRows.filter(r => {
            const spmSheet = String(r.R || '').trim();
            return spmSheet === valBox || parseInt(spmSheet, 10) === parseInt(valBox, 10);
        });
        document.querySelector('input[name="kg-statusFilter"][value="Semua"]').checked = true;
        kgRenderTable(filtered);
        if (filtered.length === 0) alert('Data dengan Nomor SPM ' + valBox + ' tidak ditemukan.');
    };

    document.querySelectorAll('input[name="kg-statusFilter"]').forEach(rb => {
        rb.addEventListener('change', function () {
            const searchVal = document.getElementById('kg-searchBox').value.toLowerCase();
            let filtered = kgFilterByStatus(kgAllRows, this.value);
            if (searchVal) {
                filtered = filtered.filter(r => Object.keys(r).some(k => String(r[k] || '').toLowerCase().includes(searchVal)));
            }
            kgRenderTable(filtered);
        });
    });

    document.getElementById('kg-dataTableBody').addEventListener('click', function (e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const isAdmin = sessionStorage.getItem('admin') === '1';
        const statusKegiatan = tr.cells[8].textContent.trim();

        if (btn.classList.contains('kg-btn-copy')) kgShowCopyPopup(tr);
        else if (btn.classList.contains('kg-btn-ubah')) {
            if (statusKegiatan === 'Rekam Data' || isAdmin) kgShowEditPopup(tr);
            else alert('Anda tidak memiliki kewenangan!');
        }
        else if (btn.classList.contains('kg-btn-hapus')) {
            if (isAdmin || statusKegiatan === 'Rekam Data') kgShowDeletePopup(tr);
            else alert('Anda tidak memiliki kewenangan!');
        }
        else if (btn.classList.contains('kg-btn-detil')) kgShowDetilPopup(tr);
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

function kgFilterByStatus(rows, status) {
    switch (status) {
        case 'Dalam Proses': return rows.filter(r => ['Rekam Data', 'Terlaksana'].includes(r.P));
        case 'LPT': return rows.filter(r => r.P === 'LPT');
        case 'Terbayar': return rows.filter(r => r.P === 'Terbayar');
        case 'Selesai': return rows.filter(r => r.P === 'Selesai');
        case 'Semua': return rows.filter(r => ['Rekam Data', 'Terlaksana', 'LPT', 'Terbayar', 'Selesai'].includes(r.P));
        default: return rows;
    }
}

function kgKalkulasiTotalJumlah(rows) {
    const total = rows.reduce((sum, r) => sum + Number(r.M || 0), 0);
    document.getElementById('kg-totalJumlahLabel').textContent = total.toLocaleString('id-ID');
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

function kgRenderTable(rows) {
    kgCurrentTableRowsData = rows;
    const tbody = document.getElementById('kg-dataTableBody');
    tbody.innerHTML = '';

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
            <td class="p-2.5 align-top">${r.D ?? ''}</td>
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
                    <button class="kg-btn-hapus w-7 h-7 rounded hover:bg-slate-100 text-red-500" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    kgKalkulasiTotalJumlah(rows);
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

async function kgLoadData(showSpinner) {
    const container = document.getElementById('kg-dataTableBody');
    try {
        if (showSpinner && kgFirstLoad) {
            container.innerHTML = `<tr><td colspan="10" class="p-10 text-center text-sky-600"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></td></tr>`;
        }

        const data = await apiPost({ action: 'getKegiatanData', kantor: sessionStorage.getItem('kantor') });

        if (!data || data.status !== 'success') {
            container.innerHTML = `<tr><td colspan="10" class="p-10 text-center text-red-500">Gagal memuat data kegiatan.</td></tr>`;
            return;
        }

        kgAllRows = data.rows || [];
        kgPegawaiList = data.pegawai || [];
        kgLokasiList = data.lokasi || [];
        kgPopulateDatalist();

        const defaultRadio = document.querySelector('input[name="kg-statusFilter"]:checked').value;
        kgRenderTable(kgFilterByStatus(kgAllRows, defaultRadio));

        kgFirstLoad = false;
    } catch (e) {
        console.error('Error loadData kegiatan:', e);
        container.innerHTML = `<tr><td colspan="10" class="p-10 text-center text-red-500">❌ ${e.message || 'Gagal memuat data kegiatan.'}</td></tr>`;
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

// ---- Ubah Kegiatan ----
function kgShowEditPopup(tr) {
    const idKegiatan = tr.dataset.id;
    const uraian = tr.cells[1].textContent;
    const pelaksana = tr.cells[2].textContent;
    const tujuan = tr.cells[3].textContent;
    const tglST = tr.cells[4].textContent;
    const jumlah = tr.cells[6].textContent.replace(/\./g, '');

    const { overlay, popup } = kgOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base mb-1">Ubah Kegiatan #${idKegiatan}</h3>
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

    popup.querySelector('#kg-editCancel').onclick = () => overlay.remove();
    popup.querySelector('#kg-editUpdate').onclick = async function () {
        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);
        try {
            const result = await apiPost({
                action: 'updateKegiatanDetail',
                kantor: sessionStorage.getItem('kantor'),
                id: idKegiatan,
                uraian: document.getElementById('kg-editUraian').value,
                pelaksana: document.getElementById('kg-editPelaksana').value,
                tujuan: document.getElementById('kg-editTujuan').value,
                tglST: document.getElementById('kg-editTglST').value,
                jumlah: Number(document.getElementById('kg-editJumlah').value) || 0
            });
            if (result.status === 'success') {
                overlay.remove();
                showToast('Kegiatan berhasil diubah');
                kgLoadData(false);
            } else {
                alert('Gagal update: ' + result.message);
            }
        } catch (e) {
            alert('Gagal update: ' + e.message);
        } finally {
            kgShowLoading(false);
            btn.disabled = false;
        }
    };
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

        try {
            const result = await apiPost({
                action: 'updatePelaksanaKegiatan',
                kantor: sessionStorage.getItem('kantor'),
                idKegiatanLama: idKegiatan,
                mak: mak,
                uraian: popup.querySelector('#kg-pelUraian').value,
                tujuan: tujuan,
                tglSt: popup.querySelector('#kg-pelTglST').value,
                userLogin: sessionStorage.getItem('nama') || user,
                pelaksanaData: dataPelaksana
            });
            if (result.status === 'success') {
                overlay.remove();
                showToast('Pelaksana berhasil disimpan');
                kgLoadData(false);
            } else {
                alert('Gagal: ' + result.message);
            }
        } catch (e) {
            alert('Gagal: ' + e.message);
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
        const dataLPT = [];
        rows.forEach(r => dataLPT.push({ id: r.cells[0].textContent, lptDate: tanggal }));

        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);
        try {
            const result = await apiPost({ action: 'updateLPT', kantor: sessionStorage.getItem('kantor'), rows: dataLPT });
            if (result.status === 'success') {
                overlay.remove();
                showToast('LPT berhasil disimpan');
                kgLoadData(false);
            } else {
                alert('Gagal update LPT: ' + result.message);
            }
        } catch (e) {
            alert('Gagal update LPT: ' + e.message);
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
        const tblData = [];
        rows.forEach(r => tblData.push({ id: r.dataset.id, pelaksana: r.cells[1].textContent, uraian: uraianValue, tglBayar }));

        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);
        try {
            const result = await apiPost({ action: 'updateBayarMultiple', kantor: sessionStorage.getItem('kantor'), data: tblData });
            if (result.status === 'success') {
                overlay.remove();
                showToast('Pembayaran berhasil disimpan');
                kgLoadData(false);
            } else {
                alert('Gagal: ' + result.message);
            }
        } catch (e) {
            alert('Gagal: ' + e.message);
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
        const dataSP2D = [];
        rows.forEach(r => dataSP2D.push({ id: r.cells[0].textContent, nomorSPM, tglSP2D }));

        const btn = this;
        btn.disabled = true;
        kgShowLoading(true);
        try {
            const result = await apiPost({ action: 'saveSP2D', kantor: sessionStorage.getItem('kantor'), rows: dataSP2D });
            if (result.status === 'success') {
                overlay.remove();
                showToast('SP2D berhasil disimpan');
                kgLoadData(false);
            } else {
                alert('Gagal: ' + result.message);
            }
        } catch (e) {
            alert('Gagal: ' + e.message);
        } finally {
            kgShowLoading(false);
            btn.disabled = false;
        }
    };
}

// ---- Detil ----
function kgShowDetilPopup(tr) {
    const id = tr.dataset.id;
    const data = kgCurrentTableRowsData.find(r => String(r.A) === String(id))
        || kgAllRows.find(r => String(r.A) === String(id));

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
            const result = await apiPost({ action: 'deleteKegiatan', kantor: sessionStorage.getItem('kantor'), id: idKegiatan });
            if (result.status === 'success') {
                overlay.remove();
                showToast('Kegiatan berhasil dihapus');
                kgLoadData(false);
            } else {
                alert('Gagal hapus: ' + result.message);
            }
        } catch (e) {
            alert('Gagal hapus: ' + e.message);
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
