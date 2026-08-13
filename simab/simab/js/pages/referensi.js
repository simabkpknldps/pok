/**
 * referensi.js
 * -----------------------------------------------------------------------
 * Halaman "Referensi" -> 3 tab, FULL Supabase (tabel 'sbm' & 'pegawai'):
 *   1. SBM Uang Harian  (tabel sbm     : id(kabupaten) | luar_kota | dalam_kota | diklat)
 *   2. Pegawai          (tabel pegawai : id(nip) | nama | jabatan | pangkat | kepeg | admin | akses_menu | status)
 *   3. Data Rekening    (tabel pegawai : id(nip) | nama | nama_bank | no_rekening) — HANYA ADMIN
 *
 * TINGKAT AKSES (localStorage.admin / localStorage.aksesMenu, lihat router.js
 * getAksesLevel()):
 *   'biasa'     -> cuma tab SBM (tab Pegawai & Rekening disembunyikan total)
 *   'aksesMenu' -> tab SBM + Pegawai (TANPA kolom Admin, TANPA tab Rekening)
 *   'admin'     -> semua tab, termasuk kolom Admin & tab Rekening
 *
 * Aksi tiap baris (tab SBM & Pegawai): pensil (mulai edit) -> disket (simpan) + x (batal).
 * Kolom kunci (Kabupaten/Kota utk SBM, NIP utk Pegawai) tidak pernah bisa diubah.
 * Tab Data Rekening cuma tampilan+edit sederhana, dan hanya admin yang bisa melihat tabnya.
 * -----------------------------------------------------------------------
 */

let refSbmData = [];
let refSbmLoaded = false;
let refPegawaiData = [];
let refPegawaiLoaded = false;
let refRekeningData = [];
let refRekeningLoaded = false;

const refInputClass = 'w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500';

function refAksesLevel() {
    return (typeof window.getAksesLevel === 'function') ? window.getAksesLevel() : 'biasa';
}

// Hanya admin (localStorage 'admin' === '1') yang boleh mengubah/menghapus data referensi.
// Pegawai non-admin tetap bisa melihat & mencari data, tapi kolom Aksi disembunyikan.
function refIsAdmin() {
    return localStorage.getItem('admin') === '1';
}

// Aksi kolom Aksi: kalau bukan admin, tampilkan kunci sebagai pengganti tombol edit/hapus.
function refAksiCell(disabledIconClass) {
    return `<span class="${disabledIconClass} text-slate-300" title="Hanya admin yang bisa mengubah data ini"><i class="fa-solid fa-lock"></i></span>`;
}

// Popup konfirmasi hapus (pengganti confirm() browser). onConfirm dipanggil
// kalau user klik "Hapus"; popup ditutup otomatis setelahnya baik konfirmasi
// maupun dibatalkan.
function refConfirmHapusPopup(message, onConfirm) {
    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h3 class="text-lg font-semibold text-slate-800">Hapus Data</h3>
        </div>
        <p class="text-sm text-slate-600">${message}</p>
        <div class="flex justify-end gap-2 mt-3">
            <button id="ref-hapus-cancelBtn" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium">Batal</button>
            <button id="ref-hapus-confirmBtn" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-trash mr-1"></i> Hapus
            </button>
        </div>
    `, 'max-w-sm');

    popup.querySelector('#ref-hapus-cancelBtn').onclick = () => overlay.remove();
    popup.querySelector('#ref-hapus-confirmBtn').onclick = () => {
        overlay.remove();
        onConfirm();
    };
}

function initReferensiPage() {
    // Setiap kali halaman Referensi dibuka (termasuk balik lagi setelah pindah
    // ke halaman lain), selalu ambil data terbaru dari database — jangan pakai
    // cache lama dari kunjungan sebelumnya (yang tersimpan di refSbmData dkk,
    // variabel global yang tidak ke-reset otomatis oleh router SPA).
    refSbmLoaded = false;
    refPegawaiLoaded = false;
    refRekeningLoaded = false;

    const tabBtnSbm = document.getElementById('ref-tabBtnSbm');
    const tabBtnPegawai = document.getElementById('ref-tabBtnPegawai');
    const tabBtnRekening = document.getElementById('ref-tabBtnRekening');
    const tabSbm = document.getElementById('ref-tabSbm');
    const tabPegawai = document.getElementById('ref-tabPegawai');
    const tabRekening = document.getElementById('ref-tabRekening');

    // 3 tingkat akses (lihat catatan di kepala file) — sembunyikan tab yang
    // tidak boleh dilihat sesuai tingkatnya.
    const aksesLevel = refAksesLevel();
    if (aksesLevel === 'biasa') {
        tabBtnPegawai?.remove();
        tabPegawai?.remove();
        tabBtnRekening?.remove();
        tabRekening?.remove();
    } else if (aksesLevel === 'aksesMenu') {
        // Tab Pegawai tetap ada, tapi kolom Admin disembunyikan (lihat
        // refRenderPegawaiTable). Tab Rekening tetap cuma utk admin.
        tabBtnRekening?.remove();
        tabRekening?.remove();
    }
    // aksesLevel === 'admin' -> semua tab tetap ada apa adanya.

    const isRestricted = aksesLevel === 'biasa'; // dipakai activateTab() di bawah

    const tabs = {
        sbm: { btn: tabBtnSbm, content: tabSbm },
        pegawai: { btn: document.getElementById('ref-tabBtnPegawai'), content: document.getElementById('ref-tabPegawai') },
        rekening: { btn: document.getElementById('ref-tabBtnRekening'), content: document.getElementById('ref-tabRekening') }
    };

    function activateTab(tab) {
        if (isRestricted) tab = 'sbm'; // paksa selalu di tab SBM untuk user terbatas
        if (tab === 'rekening' && !tabs.rekening.btn) tab = 'sbm'; // jaga-jaga kalau tab rekening tidak ada (non-admin)

        Object.keys(tabs).forEach(key => {
            const t = tabs[key];
            if (!t.btn || !t.content) return; // tab dihapus (non-admin / restricted)
            const active = key === tab;
            t.content.classList.toggle('hidden', !active);
            t.btn.className = `ref-tab-btn px-3 sm:px-4 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition ${active ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;
        });

        // Kalau data sudah pernah dimuat sebelumnya (mis. sempat pindah ke halaman lain lalu balik
        // ke Referensi), tabel/tbody di fragment HTML ini baru (isinya spinner "Memuat data...").
        // Jangan cuma skip fetch-nya, tapi render ulang dari cache supaya tabel langsung muncul
        // instan tanpa perlu request ulang ke server.
        if (tab === 'sbm') {
            refSbmLoaded ? refRenderSbmTable(document.getElementById('ref-sbm-search')?.value || '') : refLoadSbmData();
        } else if (tab === 'pegawai') {
            refPegawaiLoaded ? refRenderPegawaiTable(document.getElementById('ref-pegawai-search')?.value || '') : refLoadPegawaiData();
        } else if (tab === 'rekening') {
            refRekeningLoaded ? refRenderRekeningTable(document.getElementById('ref-rekening-search')?.value || '') : refLoadRekeningDataAll();
        }
    }

    if (tabBtnSbm) tabBtnSbm.onclick = () => activateTab('sbm');
    if (tabBtnPegawai) tabBtnPegawai.onclick = () => activateTab('pegawai');
    if (tabs.rekening.btn) tabs.rekening.btn.onclick = () => activateTab('rekening');

    const sbmSearchEl = document.getElementById('ref-sbm-search');
    if (sbmSearchEl) sbmSearchEl.oninput = (e) => refRenderSbmTable(e.target.value);
    const pegawaiSearchEl = document.getElementById('ref-pegawai-search');
    if (pegawaiSearchEl) pegawaiSearchEl.oninput = (e) => refRenderPegawaiTable(e.target.value);
    const rekeningSearchEl = document.getElementById('ref-rekening-search');
    if (rekeningSearchEl) rekeningSearchEl.oninput = (e) => refRenderRekeningTable(e.target.value);

    activateTab('sbm');
}

/* ==========================================================
 * ==================== TAB SBM ============================
 * ========================================================== */

async function refLoadSbmData() {
    const tbody = document.getElementById('ref-sbm-tbody');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-slate-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;
    try {
        await waitSupabaseAuthReady();
        const rows = await sbFetchAll('sbm');
        refSbmData = rows.map(d => ({
            row: d.id, // 'row' dipertahankan sbg nama field spy kode lain di bawah tdk perlu diubah
            kabupaten: d.id,
            luarKota: Number(d.luar_kota) || 0,
            dalamKota: Number(d.dalam_kota) || 0,
            diklat: Number(d.diklat) || 0
        }));
        refSbmLoaded = true;
        refRenderSbmTable('');
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
                    ${refIsAdmin() ? `
                    <button class="ref-sbm-btnEdit text-sky-600 hover:text-sky-800" title="Ubah"><i class="fa-solid fa-pen"></i></button>
                    <button class="ref-sbm-btnSave hidden text-green-600 hover:text-green-800" title="Simpan"><i class="fa-solid fa-floppy-disk"></i></button>
                    <button class="ref-sbm-btnCancel hidden text-slate-400 hover:text-slate-600" title="Batal"><i class="fa-solid fa-xmark"></i></button>
                    <button class="ref-sbm-btnDelete text-red-500 hover:text-red-700" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                    ` : refAksiCell('ref-sbm-locked')}
                </div>
            </td>
        </tr>
    `).join('');

    if (refIsAdmin()) {
        tbody.querySelectorAll('tr').forEach(tr => refBindSbmRow(tr));
    }
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
        const luarKota = Number(luarKotaInput.value.replace(/\D/g, '')) || 0;
        const dalamKota = Number(dalamKotaInput.value.replace(/\D/g, '')) || 0;
        const diklat = Number(diklatInput.value.replace(/\D/g, '')) || 0;

        btnSave.disabled = true;
        const originalIcon = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            await waitSupabaseAuthReady();
            const { error } = await sb.from('sbm')
                .update({ luar_kota: luarKota, dalam_kota: dalamKota, diklat })
                .eq('id', rowId);
            if (error) throw new Error(error.message);

            const item = refSbmData.find(r => String(r.row) === String(rowId));
            if (item) {
                item.luarKota = luarKota;
                item.dalamKota = dalamKota;
                item.diklat = diklat;
            }
            showToast('Data SBM berhasil diubah');
            setEditing(false);
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = originalIcon;
        }
    };

    btnDelete.onclick = () => {
        const kabupaten = tr.querySelector('td').innerText;
        refConfirmHapusPopup(`Hapus data SBM untuk <span class="font-medium text-slate-800">"${kabupaten}"</span>?`, async () => {
            btnDelete.disabled = true;
            try {
                await waitSupabaseAuthReady();
                const { error } = await sb.from('sbm').delete().eq('id', rowId);
                if (error) throw new Error(error.message);

                refSbmData = refSbmData.filter(r => String(r.row) !== String(rowId));
                showToast('Data SBM berhasil dihapus');
                refRenderSbmTable(document.getElementById('ref-sbm-search').value);
            } catch (e) {
                alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
                btnDelete.disabled = false;
            }
        });
    };
}

/* ==========================================================
 * =================== TAB PEGAWAI =========================
 * ========================================================== */

async function refLoadPegawaiData() {
    const tbody = document.getElementById('ref-pegawai-tbody');
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-slate-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;
    try {
        await waitSupabaseAuthReady();
        const rows = await sbFetchAll('pegawai');
        refPegawaiData = rows.map(d => ({
            row: d.id, // 'row' dipertahankan sbg nama field spy kode lain di bawah tdk perlu diubah
            nama: d.nama || '', nip: d.id, jabatan: d.jabatan || '', pangkat: d.pangkat || '',
            kepeg: d.kepeg || '0', admin: d.admin || '0', status: d.status ?? '1'
        }));
        refPegawaiLoaded = true;
        refRenderPegawaiTable('');
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
    const isAdminView = refIsAdmin(); // kolom Admin cuma utk tingkat admin, bukan aksesMenu biasa

    // Sembunyikan header "Admin" kalau bukan admin (tab ini juga muncul utk
    // tingkat 'aksesMenu', yang TIDAK boleh melihat kolom ini sama sekali).
    document.getElementById('ref-th-admin')?.classList.toggle('hidden', !isAdminView);

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
            <td class="py-2 px-4 ${isAdminView ? '' : 'hidden'}">
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
                    ${refIsAdmin() ? `
                    <button class="ref-peg-btnEdit text-sky-600 hover:text-sky-800" title="Ubah"><i class="fa-solid fa-pen"></i></button>
                    <button class="ref-peg-btnSave hidden text-green-600 hover:text-green-800" title="Simpan"><i class="fa-solid fa-floppy-disk"></i></button>
                    <button class="ref-peg-btnCancel hidden text-slate-400 hover:text-slate-600" title="Batal"><i class="fa-solid fa-xmark"></i></button>
                    <button class="ref-peg-btnDelete text-red-500 hover:text-red-700" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                    ` : refAksiCell('ref-peg-locked')}
                </div>
            </td>
        </tr>
    `).join('');

    if (refIsAdmin()) {
        tbody.querySelectorAll('tr').forEach(tr => refBindPegawaiRow(tr));
    }
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

        const kepeg = kepegCheckbox.checked ? '1' : '0';
        const admin = adminCheckbox.checked ? '1' : '0';
        const status = statusCheckbox.checked ? '1' : '0';

        // Pegawai yang dinonaktifkan (status=0) otomatis kehilangan akses_menu
        // (nonaktif tidak boleh tetap punya akses penuh ke semua halaman).
        const updatePayload = { nama, jabatan, pangkat, kepeg, admin, status };
        if (status === '0') updatePayload.akses_menu = '';

        btnSave.disabled = true;
        const originalIcon = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            await waitSupabaseAuthReady();
            const { error } = await sb.from('pegawai')
                .update(updatePayload)
                .eq('id', rowId);
            if (error) throw new Error(error.message);

            const item = refPegawaiData.find(r => String(r.row) === String(rowId));
            if (item) {
                item.nama = nama;
                item.jabatan = jabatan;
                item.pangkat = pangkat;
                item.kepeg = kepeg;
                item.admin = admin;
                item.status = status;
            }
            showToast('Data pegawai berhasil diubah' + (status === '0' ? ' (akses menu ikut dicabut)' : ''));
            setEditing(false);
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = originalIcon;
        }
    };

    btnDelete.onclick = () => {
        const nama = namaInput.value;
        refConfirmHapusPopup(`Hapus data pegawai <span class="font-medium text-slate-800">"${nama}"</span>?`, async () => {
            btnDelete.disabled = true;
            try {
                await waitSupabaseAuthReady();
                const { error } = await sb.from('pegawai').delete().eq('id', rowId);
                if (error) throw new Error(error.message);

                refPegawaiData = refPegawaiData.filter(r => String(r.row) !== String(rowId));
                showToast('Data pegawai berhasil dihapus');
                refRenderPegawaiTable(document.getElementById('ref-pegawai-search').value);
            } catch (e) {
                alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
                btnDelete.disabled = false;
            }
        });
    };
}

window.initReferensiPage = initReferensiPage;

/* ==========================================================
 * ================= TAB DATA REKENING (admin) =============
 * ========================================================== */

async function refLoadRekeningDataAll() {
    const tbody = document.getElementById('ref-rekening-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-slate-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;

    try {
        await waitSupabaseAuthReady();
        const rows = await sbFetchAll('pegawai');
        refRekeningData = rows.map(d => ({
            row: d.id, nama: d.nama || '', nip: d.id,
            namaBank: d.nama_bank || '', norek: d.no_rekening || ''
        }));
        refRekeningLoaded = true;
        refRenderRekeningTable('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 py-8">❌ Error koneksi: ${e.message || 'Tidak diketahui'}</td></tr>`;
    }
}

function refBankOptions(selected) {
    const bankList = (typeof CS_DAFTAR_BANK !== 'undefined') ? CS_DAFTAR_BANK : [];
    const extra = (selected && !bankList.includes(selected))
        ? `<option value="${selected}" selected>${selected}</option>` : '';
    return `<option value="">-- Pilih Bank --</option>${extra}${bankList.map(b =>
        `<option value="${b}" ${b === selected ? 'selected' : ''}>${b}</option>`).join('')}`;
}

function refRenderRekeningTable(keyword) {
    const tbody = document.getElementById('ref-rekening-tbody');
    const emptyMsg = document.getElementById('ref-rekening-empty');
    if (!tbody) return;
    const kw = (keyword || '').trim().toLowerCase();

    const filtered = refRekeningData.filter(row =>
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
            <td class="py-2 px-4">${row.nama || '-'}</td>
            <td class="py-2 px-4 text-slate-600 whitespace-nowrap">${row.nip || '-'}</td>
            <td class="py-2 px-4">
                <select class="ref-rek-namabank ${refInputClass}" disabled>${refBankOptions(row.namaBank)}</select>
            </td>
            <td class="py-2 px-4">
                <input type="text" class="ref-rek-norek ${refInputClass}" value="${row.norek || ''}" readonly>
            </td>
            <td class="py-2 px-4">
                <div class="flex items-center justify-center gap-2">
                    ${refIsAdmin() ? `
                    <button class="ref-rek-btnEdit text-sky-600 hover:text-sky-800" title="Ubah"><i class="fa-solid fa-pen"></i></button>
                    <button class="ref-rek-btnSave hidden text-green-600 hover:text-green-800" title="Simpan"><i class="fa-solid fa-floppy-disk"></i></button>
                    <button class="ref-rek-btnCancel hidden text-slate-400 hover:text-slate-600" title="Batal"><i class="fa-solid fa-xmark"></i></button>
                    ` : refAksiCell('ref-rek-locked')}
                </div>
            </td>
        </tr>
    `).join('');

    if (refIsAdmin()) {
        tbody.querySelectorAll('tr').forEach(tr => refBindRekeningRow(tr));
    }
}

function refBindRekeningRow(tr) {
    const rowId = tr.getAttribute('data-row');
    const bankSelect = tr.querySelector('.ref-rek-namabank');
    const norekInput = tr.querySelector('.ref-rek-norek');
    const btnEdit = tr.querySelector('.ref-rek-btnEdit');
    const btnSave = tr.querySelector('.ref-rek-btnSave');
    const btnCancel = tr.querySelector('.ref-rek-btnCancel');

    let originalValues = {};

    function setEditing(on) {
        bankSelect.disabled = !on;
        bankSelect.classList.toggle('bg-slate-100', !on);
        bankSelect.classList.toggle('bg-white', on);
        norekInput.toggleAttribute('readonly', !on);
        norekInput.classList.toggle('bg-slate-100', !on);
        norekInput.classList.toggle('bg-white', on);

        btnEdit.classList.toggle('hidden', on);
        btnSave.classList.toggle('hidden', !on);
        btnCancel.classList.toggle('hidden', !on);
    }

    btnEdit.onclick = () => {
        originalValues = { namaBank: bankSelect.value, norek: norekInput.value };
        setEditing(true);
        norekInput.focus();
    };

    btnCancel.onclick = () => {
        bankSelect.value = originalValues.namaBank;
        norekInput.value = originalValues.norek;
        setEditing(false);
    };

    btnSave.onclick = async () => {
        const namaBank = bankSelect.value;
        const norek = norekInput.value.trim();

        btnSave.disabled = true;
        const originalIcon = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            await waitSupabaseAuthReady();
            const { error } = await sb.from('pegawai')
                .update({ nama_bank: namaBank, no_rekening: norek })
                .eq('id', rowId);
            if (error) throw new Error(error.message);

            const item = refRekeningData.find(r => String(r.row) === String(rowId));
            if (item) {
                item.namaBank = namaBank;
                item.norek = norek;
            }
            setEditing(false);
            btnSave.innerHTML = originalIcon;
            btnSave.disabled = false;
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
            btnSave.innerHTML = originalIcon;
            btnSave.disabled = false;
        }
    };
}
