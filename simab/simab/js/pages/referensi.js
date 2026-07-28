/**
 * referensi.js
 * -----------------------------------------------------------------------
 * Halaman "Referensi" -> 2 tab:
 *   1. SBM Uang Harian  (sheet ref_sbm  : A Kabupaten/Kota | B Luar Kota | C Dalam Kota | D Diklat)
 *   2. Pegawai          (sheet ref_pegawai: A Nama | B NIP | C Jabatan | D Pangkat | E Kepeg | F Admin | G password | H Status)
 *
 * Aksi tiap baris: pensil (mulai edit) -> disket (simpan) + x (batal).
 * Kolom kunci (Kabupaten/Kota utk SBM, NIP utk Pegawai) tidak pernah bisa diubah.
 * -----------------------------------------------------------------------
 */

let refSbmData = [];
let refSbmLoaded = false;
let refPegawaiData = [];
let refPegawaiLoaded = false;

const refInputClass = 'w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500';

function initReferensiPage() {
    const tabBtnSbm = document.getElementById('ref-tabBtnSbm');
    const tabBtnPegawai = document.getElementById('ref-tabBtnPegawai');
    const tabSbm = document.getElementById('ref-tabSbm');
    const tabPegawai = document.getElementById('ref-tabPegawai');

    function activateTab(tab) {
        const isSbm = tab === 'sbm';
        tabSbm.classList.toggle('hidden', !isSbm);
        tabPegawai.classList.toggle('hidden', isSbm);
        tabBtnSbm.className = `ref-tab-btn px-3 sm:px-4 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition ${isSbm ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;
        tabBtnPegawai.className = `ref-tab-btn px-3 sm:px-4 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition ${!isSbm ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

        if (isSbm && !refSbmLoaded) refLoadSbmData();
        if (!isSbm && !refPegawaiLoaded) refLoadPegawaiData();
    }

    tabBtnSbm.onclick = () => activateTab('sbm');
    tabBtnPegawai.onclick = () => activateTab('pegawai');

    document.getElementById('ref-sbm-search').oninput = (e) => refRenderSbmTable(e.target.value);
    document.getElementById('ref-pegawai-search').oninput = (e) => refRenderPegawaiTable(e.target.value);

    activateTab('sbm');
}

/* ==========================================================
 * ==================== TAB SBM ============================
 * ========================================================== */

async function refLoadSbmData() {
    const tbody = document.getElementById('ref-sbm-tbody');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-slate-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;
    try {
        const result = await apiPost({ action: 'getRefSbmData' });
        if (result.status === 'success') {
            refSbmData = result.data || [];
            refSbmLoaded = true;
            refRenderSbmTable('');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-8">❌ ${result.message || 'Gagal memuat data SBM'}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-8">❌ Error koneksi: ${e.message || 'Tidak diketahui'}</td></tr>`;
    }
}

function refRenderSbmTable(keyword) {
    const tbody = document.getElementById('ref-sbm-tbody');
    const emptyMsg = document.getElementById('ref-sbm-empty');
    const kw = (keyword || '').trim().toLowerCase();

    const filtered = refSbmData.filter(row => !kw || String(row.kabupaten).toLowerCase().includes(kw));

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    tbody.innerHTML = filtered.map(row => `
        <tr data-row="${row.row}" class="hover:bg-slate-50">
            <td class="py-2 px-4 font-medium text-slate-700">${row.kabupaten}</td>
            <td class="py-2 px-4">
                <input type="text" class="ref-sbm-luarKota ${refInputClass}" value="${formatRibuan(row.luarKota)}" readonly>
            </td>
            <td class="py-2 px-4">
                <input type="text" class="ref-sbm-dalamKota ${refInputClass}" value="${formatRibuan(row.dalamKota)}" readonly>
            </td>
            <td class="py-2 px-4">
                <input type="text" class="ref-sbm-diklat ${refInputClass}" value="${formatRibuan(row.diklat)}" readonly>
            </td>
            <td class="py-2 px-4">
                <div class="flex items-center justify-center gap-2">
                    <button class="ref-sbm-btnEdit text-sky-600 hover:text-sky-800" title="Ubah"><i class="fa-solid fa-pen"></i></button>
                    <button class="ref-sbm-btnSave hidden text-green-600 hover:text-green-800" title="Simpan"><i class="fa-solid fa-floppy-disk"></i></button>
                    <button class="ref-sbm-btnCancel hidden text-slate-400 hover:text-slate-600" title="Batal"><i class="fa-solid fa-xmark"></i></button>
                    <button class="ref-sbm-btnDelete text-red-500 hover:text-red-700" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(tr => refBindSbmRow(tr));
}

function refBindSbmRow(tr) {
    const rowId = tr.getAttribute('data-row');
    const luarKotaInput = tr.querySelector('.ref-sbm-luarKota');
    const dalamKotaInput = tr.querySelector('.ref-sbm-dalamKota');
    const diklatInput = tr.querySelector('.ref-sbm-diklat');
    const btnEdit = tr.querySelector('.ref-sbm-btnEdit');
    const btnSave = tr.querySelector('.ref-sbm-btnSave');
    const btnCancel = tr.querySelector('.ref-sbm-btnCancel');
    const btnDelete = tr.querySelector('.ref-sbm-btnDelete');

    const editableInputs = [luarKotaInput, dalamKotaInput, diklatInput];
    let originalValues = {};

    function setEditing(on) {
        editableInputs.forEach(inp => {
            inp.toggleAttribute('readonly', !on);
            inp.classList.toggle('bg-slate-100', !on);
            inp.classList.toggle('bg-white', on);
        });
        btnEdit.classList.toggle('hidden', on);
        btnSave.classList.toggle('hidden', !on);
        btnCancel.classList.toggle('hidden', !on);
        btnDelete.classList.toggle('hidden', on);
    }

    btnEdit.onclick = () => {
        originalValues = {
            luarKota: luarKotaInput.value,
            dalamKota: dalamKotaInput.value,
            diklat: diklatInput.value
        };
        setEditing(true);
        luarKotaInput.focus();
    };

    btnCancel.onclick = () => {
        luarKotaInput.value = originalValues.luarKota;
        dalamKotaInput.value = originalValues.dalamKota;
        diklatInput.value = originalValues.diklat;
        setEditing(false);
    };

    editableInputs.forEach(inp => {
        inp.addEventListener('input', () => {
            const clean = inp.value.replace(/\D/g, '');
            inp.value = clean ? formatRibuan(clean) : '';
        });
    });

    btnSave.onclick = async () => {
        const payload = {
            action: 'updateRefSbmRow',
            row: rowId,
            luarKota: luarKotaInput.value.replace(/\D/g, ''),
            dalamKota: dalamKotaInput.value.replace(/\D/g, ''),
            diklat: diklatInput.value.replace(/\D/g, '')
        };
        btnSave.disabled = true;
        const originalIcon = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            const result = await apiPost(payload);
            if (result.status === 'success') {
                const item = refSbmData.find(r => String(r.row) === String(rowId));
                if (item) {
                    item.luarKota = Number(payload.luarKota) || 0;
                    item.dalamKota = Number(payload.dalamKota) || 0;
                    item.diklat = Number(payload.diklat) || 0;
                }
                showToast('Data SBM berhasil diubah');
                setEditing(false);
            } else {
                alert('Gagal: ' + (result.message || 'Terjadi kesalahan.'));
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = originalIcon;
        }
    };

    btnDelete.onclick = async () => {
        const kabupaten = tr.querySelector('td').innerText;
        if (!confirm(`Hapus data SBM untuk "${kabupaten}"?`)) return;
        btnDelete.disabled = true;
        try {
            const result = await apiPost({ action: 'deleteRefSbmRow', row: rowId });
            if (result.status === 'success') {
                refSbmData = refSbmData.filter(r => String(r.row) !== String(rowId));
                showToast('Data SBM berhasil dihapus');
                refRenderSbmTable(document.getElementById('ref-sbm-search').value);
            } else {
                alert('Gagal: ' + (result.message || 'Terjadi kesalahan.'));
                btnDelete.disabled = false;
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
            btnDelete.disabled = false;
        }
    };
}

/* ==========================================================
 * =================== TAB PEGAWAI =========================
 * ========================================================== */

async function refLoadPegawaiData() {
    const tbody = document.getElementById('ref-pegawai-tbody');
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-slate-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;
    try {
        const result = await apiPost({ action: 'getRefPegawaiFullData' });
        if (result.status === 'success') {
            refPegawaiData = result.data || [];
            refPegawaiLoaded = true;
            refRenderPegawaiTable('');
        } else {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red-500 py-8">❌ ${result.message || 'Gagal memuat data Pegawai'}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red-500 py-8">❌ Error koneksi: ${e.message || 'Tidak diketahui'}</td></tr>`;
    }
}

function refPangkatOptions(selected) {
    const extra = (selected && !CS_DAFTAR_PANGKAT.includes(selected))
        ? `<option value="${selected}" selected>${selected}</option>` : '';
    return `<option value="">-- Pilih Pangkat --</option>${extra}${CS_DAFTAR_PANGKAT.map(p =>
        `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('')}`;
}

function refToggleSwitch(cls, checked) {
    return `
        <label class="${cls}-wrap relative inline-flex items-center cursor-pointer">
            <input type="checkbox" class="${cls} sr-only peer" ${checked ? 'checked' : ''} disabled>
            <div class="w-10 h-5 bg-slate-300 rounded-full peer peer-checked:bg-sky-600 transition-colors relative
                after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full
                after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
        </label>`;
}

function refRenderPegawaiTable(keyword) {
    const tbody = document.getElementById('ref-pegawai-tbody');
    const emptyMsg = document.getElementById('ref-pegawai-empty');
    const kw = (keyword || '').trim().toLowerCase();

    const filtered = refPegawaiData.filter(row =>
        !kw || String(row.nama).toLowerCase().includes(kw) || String(row.nip).toLowerCase().includes(kw)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    tbody.innerHTML = filtered.map(row => `
        <tr data-row="${row.row}" class="hover:bg-slate-50">
            <td class="py-2 px-4">
                <input type="text" class="ref-peg-nama ${refInputClass}" value="${row.nama}" readonly>
            </td>
            <td class="py-2 px-4 text-slate-600 whitespace-nowrap">${row.nip}</td>
            <td class="py-2 px-4">
                <input type="text" class="ref-peg-jabatan ${refInputClass}" value="${row.jabatan}" readonly>
            </td>
            <td class="py-2 px-4">
                <select class="ref-peg-pangkat ${refInputClass}" disabled>${refPangkatOptions(row.pangkat)}</select>
            </td>
            <td class="py-2 px-4">
                <div class="flex flex-col items-center gap-1">
                    ${refToggleSwitch('ref-peg-kepeg', String(row.kepeg) === '1')}
                    <span class="ref-peg-kepeg-label text-xs text-slate-500">${String(row.kepeg) === '1' ? 'PNS' : 'PPNPN'}</span>
                </div>
            </td>
            <td class="py-2 px-4">
                <div class="flex flex-col items-center gap-1">
                    ${refToggleSwitch('ref-peg-admin', String(row.admin) === '1')}
                    <span class="ref-peg-admin-label text-xs text-slate-500">${String(row.admin) === '1' ? 'Admin' : 'User'}</span>
                </div>
            </td>
            <td class="py-2 px-4">
                <div class="flex flex-col items-center gap-1">
                    ${refToggleSwitch('ref-peg-status', String(row.status) === '1')}
                    <span class="ref-peg-status-label text-xs text-slate-500">${String(row.status) === '1' ? 'Aktif' : 'Tidak Aktif'}</span>
                </div>
            </td>
            <td class="py-2 px-4">
                <div class="flex items-center justify-center gap-2">
                    <button class="ref-peg-btnEdit text-sky-600 hover:text-sky-800" title="Ubah"><i class="fa-solid fa-pen"></i></button>
                    <button class="ref-peg-btnSave hidden text-green-600 hover:text-green-800" title="Simpan"><i class="fa-solid fa-floppy-disk"></i></button>
                    <button class="ref-peg-btnCancel hidden text-slate-400 hover:text-slate-600" title="Batal"><i class="fa-solid fa-xmark"></i></button>
                    <button class="ref-peg-btnDelete text-red-500 hover:text-red-700" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(tr => refBindPegawaiRow(tr));
}

function refBindPegawaiRow(tr) {
    const rowId = tr.getAttribute('data-row');
    const namaInput = tr.querySelector('.ref-peg-nama');
    const jabatanInput = tr.querySelector('.ref-peg-jabatan');
    const pangkatSelect = tr.querySelector('.ref-peg-pangkat');
    const kepegCheckbox = tr.querySelector('.ref-peg-kepeg');
    const kepegLabel = tr.querySelector('.ref-peg-kepeg-label');
    const adminCheckbox = tr.querySelector('.ref-peg-admin');
    const adminLabel = tr.querySelector('.ref-peg-admin-label');
    const statusCheckbox = tr.querySelector('.ref-peg-status');
    const statusLabel = tr.querySelector('.ref-peg-status-label');
    const btnEdit = tr.querySelector('.ref-peg-btnEdit');
    const btnSave = tr.querySelector('.ref-peg-btnSave');
    const btnCancel = tr.querySelector('.ref-peg-btnCancel');
    const btnDelete = tr.querySelector('.ref-peg-btnDelete');

    const textInputs = [namaInput, jabatanInput];
    let originalValues = {};

    kepegCheckbox.addEventListener('change', () => {
        kepegLabel.textContent = kepegCheckbox.checked ? 'PNS' : 'PPNPN';
    });
    adminCheckbox.addEventListener('change', () => {
        adminLabel.textContent = adminCheckbox.checked ? 'Admin' : 'User';
    });
    statusCheckbox.addEventListener('change', () => {
        statusLabel.textContent = statusCheckbox.checked ? 'Aktif' : 'Tidak Aktif';
    });

    function setEditing(on) {
        textInputs.forEach(inp => {
            inp.toggleAttribute('readonly', !on);
            inp.classList.toggle('bg-slate-100', !on);
            inp.classList.toggle('bg-white', on);
        });
        pangkatSelect.disabled = !on;
        pangkatSelect.classList.toggle('bg-slate-100', !on);
        pangkatSelect.classList.toggle('bg-white', on);
        [kepegCheckbox, adminCheckbox, statusCheckbox].forEach(cb => cb.disabled = !on);

        btnEdit.classList.toggle('hidden', on);
        btnSave.classList.toggle('hidden', !on);
        btnCancel.classList.toggle('hidden', !on);
        btnDelete.classList.toggle('hidden', on);
    }

    btnEdit.onclick = () => {
        originalValues = {
            nama: namaInput.value,
            jabatan: jabatanInput.value,
            pangkat: pangkatSelect.value,
            kepeg: kepegCheckbox.checked,
            admin: adminCheckbox.checked,
            status: statusCheckbox.checked
        };
        setEditing(true);
        namaInput.focus();
    };

    btnCancel.onclick = () => {
        namaInput.value = originalValues.nama;
        jabatanInput.value = originalValues.jabatan;
        pangkatSelect.value = originalValues.pangkat;
        kepegCheckbox.checked = originalValues.kepeg;
        kepegLabel.textContent = originalValues.kepeg ? 'PNS' : 'PPNPN';
        adminCheckbox.checked = originalValues.admin;
        adminLabel.textContent = originalValues.admin ? 'Admin' : 'User';
        statusCheckbox.checked = originalValues.status;
        statusLabel.textContent = originalValues.status ? 'Aktif' : 'Tidak Aktif';
        setEditing(false);
    };

    btnSave.onclick = async () => {
        const nama = namaInput.value.trim();
        const jabatan = jabatanInput.value.trim();
        const pangkat = pangkatSelect.value;

        if (!nama || !jabatan || !pangkat) {
            alert('Nama, Jabatan, dan Pangkat harus diisi!');
            return;
        }

        const payload = {
            action: 'updateRefPegawaiRow',
            row: rowId,
            nama, jabatan, pangkat,
            kepeg: kepegCheckbox.checked ? '1' : '0',
            admin: adminCheckbox.checked ? '1' : '0',
            status: statusCheckbox.checked ? '1' : '0'
        };

        btnSave.disabled = true;
        const originalIcon = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            const result = await apiPost(payload);
            if (result.status === 'success') {
                const item = refPegawaiData.find(r => String(r.row) === String(rowId));
                if (item) {
                    item.nama = nama;
                    item.jabatan = jabatan;
                    item.pangkat = pangkat;
                    item.kepeg = payload.kepeg;
                    item.admin = payload.admin;
                    item.status = payload.status;
                }
                showToast('Data pegawai berhasil diubah');
                setEditing(false);
            } else {
                alert('Gagal: ' + (result.message || 'Terjadi kesalahan.'));
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = originalIcon;
        }
    };

    btnDelete.onclick = async () => {
        const nama = namaInput.value;
        if (!confirm(`Hapus data pegawai "${nama}"?`)) return;
        btnDelete.disabled = true;
        try {
            const result = await apiPost({ action: 'deleteRefPegawaiRow', row: rowId });
            if (result.status === 'success') {
                refPegawaiData = refPegawaiData.filter(r => String(r.row) !== String(rowId));
                showToast('Data pegawai berhasil dihapus');
                refRenderPegawaiTable(document.getElementById('ref-pegawai-search').value);
            } else {
                alert('Gagal: ' + (result.message || 'Terjadi kesalahan.'));
                btnDelete.disabled = false;
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
            btnDelete.disabled = false;
        }
    };
}

window.initReferensiPage = initReferensiPage;
