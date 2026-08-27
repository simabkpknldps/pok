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
let refUserManagerData = [];
let refUserManagerLoaded = false;
let refKantorData = [];
let refKantorLoaded = false;

const refInputClass = 'w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500';

function refAksesLevel() {
    return (typeof window.getAksesLevel === 'function') ? window.getAksesLevel() : 'biasa';
}

// Hanya admin (localStorage 'admin' === '1') yang boleh mengubah/menghapus data referensi.
// Pegawai non-admin tetap bisa melihat & mencari data, tapi kolom Aksi disembunyikan.
function refIsAdmin() {
    return localStorage.getItem('admin') === '1';
}

// Superadmin: tingkat di atas admin biasa. Admin biasa TETAP boleh ubah data
// pegawai lain (nama/jabatan/pangkat/status), TAPI TIDAK boleh melihat/ubah
// siapa saja yang berstatus admin — itu cuma hak superadmin.
//
// PENTING: yang dicek di sini 'superadminMode' (mode SESI ini), BUKAN
// 'superadmin' (identitas akun). Superadmin yang login pilih "User Biasa"
// harus diperlakukan PERSIS seperti admin biasa di kantornya sendiri —
// termasuk TIDAK melihat tab User Manager/Kantor & kolom Admin. Cuma pas
// mereka pilih mode "SuperAdmin" (superadminMode='1') semua privilese ini aktif.
function refIsSuperadmin() {
    return localStorage.getItem('superadminMode') === '1';
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
    refUserManagerLoaded = false;
    refKantorLoaded = false;

    const tabBtnSbm = document.getElementById('ref-tabBtnSbm');
    const tabBtnPegawai = document.getElementById('ref-tabBtnPegawai');
    const tabBtnRekening = document.getElementById('ref-tabBtnRekening');
    const tabBtnUserManager = document.getElementById('ref-tabBtnUserManager');
    const tabBtnKantor = document.getElementById('ref-tabBtnKantor');
    const tabSbm = document.getElementById('ref-tabSbm');
    const tabPegawai = document.getElementById('ref-tabPegawai');
    const tabRekening = document.getElementById('ref-tabRekening');
    const tabUserManager = document.getElementById('ref-tabUserManager');
    const tabKantor = document.getElementById('ref-tabKantor');

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

    // Tab User Manager & Kantor: TERPISAH dari 3 tingkat di atas, cuma utk superadmin
    // yang SEDANG dalam mode SuperAdmin (bukan cuma punya identitas superadmin).
    if (localStorage.getItem('superadminMode') !== '1') {
        tabBtnUserManager?.remove();
        tabUserManager?.remove();
        tabBtnKantor?.remove();
        tabKantor?.remove();
    }

    const isRestricted = aksesLevel === 'biasa'; // dipakai activateTab() di bawah

    const tabs = {
        sbm: { btn: tabBtnSbm, content: tabSbm },
        pegawai: { btn: document.getElementById('ref-tabBtnPegawai'), content: document.getElementById('ref-tabPegawai') },
        rekening: { btn: document.getElementById('ref-tabBtnRekening'), content: document.getElementById('ref-tabRekening') },
        userManager: { btn: document.getElementById('ref-tabBtnUserManager'), content: document.getElementById('ref-tabUserManager') },
        kantor: { btn: document.getElementById('ref-tabBtnKantor'), content: document.getElementById('ref-tabKantor') }
    };

    function activateTab(tab) {
        if (isRestricted) tab = 'sbm'; // paksa selalu di tab SBM untuk user terbatas
        if (tab === 'rekening' && !tabs.rekening.btn) tab = 'sbm'; // jaga-jaga kalau tab rekening tidak ada (non-admin)
        if (tab === 'userManager' && !tabs.userManager.btn) tab = 'sbm'; // jaga-jaga kalau tab ini tidak ada (non-superadmin)
        if (tab === 'kantor' && !tabs.kantor.btn) tab = 'sbm'; // jaga-jaga kalau tab ini tidak ada (non-superadmin)

        Object.keys(tabs).forEach(key => {
            const t = tabs[key];
            if (!t.btn || !t.content) return; // tab dihapus (non-admin / restricted / non-superadmin)
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
        } else if (tab === 'userManager') {
            refUserManagerLoaded ? refRenderUserManagerTable(document.getElementById('ref-um-search')?.value || '') : refLoadUserManagerData();
        } else if (tab === 'kantor') {
            refKantorLoaded ? refRenderKantorTable(document.getElementById('ref-kantor-search')?.value || '') : refLoadKantorData();
        }
    }

    if (tabBtnSbm) tabBtnSbm.onclick = () => activateTab('sbm');
    if (tabBtnPegawai) tabBtnPegawai.onclick = () => activateTab('pegawai');
    if (tabs.rekening.btn) tabs.rekening.btn.onclick = () => activateTab('rekening');
    if (tabs.userManager.btn) tabs.userManager.btn.onclick = () => activateTab('userManager');
    if (tabs.kantor.btn) tabs.kantor.btn.onclick = () => activateTab('kantor');

    const sbmSearchEl = document.getElementById('ref-sbm-search');
    if (sbmSearchEl) sbmSearchEl.oninput = (e) => refRenderSbmTable(e.target.value);
    const pegawaiSearchEl = document.getElementById('ref-pegawai-search');
    if (pegawaiSearchEl) pegawaiSearchEl.oninput = (e) => refRenderPegawaiTable(e.target.value);
    const rekeningSearchEl = document.getElementById('ref-rekening-search');
    if (rekeningSearchEl) rekeningSearchEl.oninput = (e) => refRenderRekeningTable(e.target.value);
    const umSearchEl = document.getElementById('ref-um-search');
    if (umSearchEl) umSearchEl.oninput = (e) => refRenderUserManagerTable(e.target.value);
    const kantorSearchEl = document.getElementById('ref-kantor-search');
    if (kantorSearchEl) kantorSearchEl.oninput = (e) => refRenderKantorTable(e.target.value);
    const kantorBtnTambah = document.getElementById('ref-kantor-btnTambah');
    if (kantorBtnTambah) kantorBtnTambah.onclick = () => refTambahKantorPopup();

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

async function refGetKantorOptions(force) {
    if (refKantorLoaded && !force) return refKantorData;
    const rows = await sbFetchAll('kantor', 'id, nama, status');
    refKantorData = rows.map(d => ({ id: d.id, nama: d.nama || '', status: d.status || 'aktif' }))
        .sort((a, b) => a.nama.localeCompare(b.nama));
    refKantorLoaded = true;
    return refKantorData;
}

function refKantorSelectOptions(selected) {
    const opts = refKantorData.map(k =>
        `<option value="${k.id}" ${k.id === selected ? 'selected' : ''}>${k.nama}${k.status !== 'aktif' ? ' (nonaktif)' : ''}</option>`
    ).join('');
    return `<option value="" ${!selected ? 'selected' : ''}>-- Belum ada / Kantor Lain --</option>${opts}`;
}

async function refLoadPegawaiData() {
    const tbody = document.getElementById('ref-pegawai-tbody');
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-slate-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;
    try {
        await waitSupabaseAuthReady();
        await refGetKantorOptions();

        // Superadmin lihat SEMUA pegawai lintas kantor (perlu ini utk bisa
        // reassign kantor siapapun). Admin/aksesMenu HANYA lihat pegawai
        // kantornya sendiri (kantor aktif sesi ini).
        const isSuperadminView = refIsSuperadmin();
        const filters = isSuperadminView
            ? undefined
            : { kantor_id: (typeof getKantorAktif === 'function' ? getKantorAktif() : '') };

        const rows = await sbFetchAll('pegawai', '*', filters);
        refPegawaiData = rows.map(d => ({
            row: d.id, // 'row' dipertahankan sbg nama field spy kode lain di bawah tdk perlu diubah
            nama: d.nama || '', nip: d.id, jabatan: d.jabatan || '', pangkat: d.pangkat || '',
            kepeg: d.kepeg || '0', admin: d.admin || '0', status: d.status ?? '1',
            kantorId: d.kantor_id || ''
        }));
        refPegawaiLoaded = true;
        refRenderPegawaiTable('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-red-500 py-8">❌ Error koneksi: ${e.message || 'Tidak diketahui'}</td></tr>`;
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
    const isSuperadminView = refIsSuperadmin(); // kolom Admin CUMA utk superadmin, admin biasa tidak boleh lihat/ubah

    // Sembunyikan header "Admin" kalau bukan superadmin (admin biasa & aksesMenu
    // TIDAK boleh melihat kolom ini sama sekali).
    document.getElementById('ref-th-admin')?.classList.toggle('hidden', !isSuperadminView);

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
                <select class="ref-peg-kantor ${refInputClass}" disabled>${refKantorSelectOptions(row.kantorId)}</select>
            </td>
            <td class="py-2 px-4">
                <div class="flex flex-col items-center gap-1">
                    ${refToggleSwitch('ref-peg-kepeg', String(row.kepeg) === '1')}
                    <span class="ref-peg-kepeg-label text-xs text-slate-500">${String(row.kepeg) === '1' ? 'PNS' : 'PPNPN'}</span>
                </div>
            </td>
            <td class="py-2 px-4 ${isSuperadminView ? '' : 'hidden'}">
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
    const kantorSelect = tr.querySelector('.ref-peg-kantor');
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
        kantorSelect.disabled = !on;
        kantorSelect.classList.toggle('bg-slate-100', !on);
        kantorSelect.classList.toggle('bg-white', on);
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
            kantor: kantorSelect.value,
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
        kantorSelect.value = originalValues.kantor;
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
        const kantorId = kantorSelect.value || null;

        // Field 'admin' CUMA diikutkan kalau viewer superadmin — admin biasa
        // tidak boleh mengubah siapa saja yang berstatus admin, walau
        // secara UI kolomnya sudah disembunyikan (ini pengaman tambahan,
        // bukan cuma sembunyi visual). Field 'kantor_id' BOLEH diubah baik
        // oleh admin maupun superadmin (reassign pegawai ke kantor lain).
        const updatePayload = { nama, jabatan, pangkat, kepeg, status, kantor_id: kantorId };
        if (refIsSuperadmin()) updatePayload.admin = admin;

        // Pegawai yang dinonaktifkan (status=0) otomatis kehilangan akses_menu
        // (nonaktif tidak boleh tetap punya akses penuh ke semua halaman).
        // Sebaliknya, pegawai yang DIAKTIFKAN (status=1) otomatis DAPAT
        // akses_menu='1' -- konsisten sama aturan login (kantor aktif +
        // status aktif = akses penuh tanpa perlu toggle akses_menu terpisah).
        if (status === '0') updatePayload.akses_menu = '';
        if (status === '1') updatePayload.akses_menu = '1';

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
                item.kantorId = kantorId || '';
                if (refIsSuperadmin()) item.admin = admin;
                item.status = status;
                item.akses_menu = updatePayload.akses_menu ?? item.akses_menu;
            }
            showToast('Data pegawai berhasil diubah' + (status === '0' ? ' (akses menu ikut dicabut)' : (status === '1' ? ' (akses menu ikut diaktifkan)' : '')));
            setEditing(false);

            // Kalau viewer admin biasa (bukan superadmin) mereassign pegawai ini
            // KELUAR dari kantor aktifnya sendiri, baris ini otomatis hilang dari
            // daftar setelah refresh berikutnya (karena filter kantor_id). Muat
            // ulang sekarang juga supaya tabel langsung konsisten.
            if (!refIsSuperadmin() && kantorId !== (typeof getKantorAktif === 'function' ? getKantorAktif() : '')) {
                refPegawaiLoaded = false;
                refLoadPegawaiData();
            }
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

// ============================================
// TAB USER MANAGER (superadmin saja) — Reset Password ke NIP (default)
// ============================================

async function refLoadUserManagerData() {
    const tbody = document.getElementById('ref-um-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="2" class="text-center text-slate-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;

    try {
        await waitSupabaseAuthReady();
        const rows = await sbFetchAll('pegawai', 'id, nama');
        refUserManagerData = rows.map(d => ({ nip: d.id, nama: d.nama || '' }));
        refUserManagerLoaded = true;
        refRenderUserManagerTable('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-center text-red-500 py-8">❌ Error koneksi: ${e.message || 'Tidak diketahui'}</td></tr>`;
    }
}

function refRenderUserManagerTable(keyword) {
    const tbody = document.getElementById('ref-um-tbody');
    const emptyMsg = document.getElementById('ref-um-empty');
    const kw = (keyword || '').trim().toLowerCase();

    const filtered = refUserManagerData.filter(row =>
        !kw || String(row.nama).toLowerCase().includes(kw) || String(row.nip).toLowerCase().includes(kw)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    tbody.innerHTML = filtered.map(row => `
        <tr data-nip="${row.nip}" class="hover:bg-slate-50">
            <td class="py-2 px-4">
                <div class="font-medium text-slate-700">${row.nama}</div>
                <div class="text-xs text-slate-400">${row.nip}</div>
            </td>
            <td class="py-2 px-4 text-center">
                <button class="ref-um-btnReset px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium">
                    <i class="fa-solid fa-rotate-left mr-1"></i>Reset Password
                </button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
        const btn = tr.querySelector('.ref-um-btnReset');
        const nip = tr.getAttribute('data-nip');
        const nama = tr.querySelector('.font-medium').textContent;

        btn.onclick = () => {
            refConfirmHapusPopup(
                `Reset password <span class="font-medium text-slate-800">${nama}</span> (${nip}) ke default (NIP)?`,
                async () => {
                    btn.disabled = true;
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    try {
                        await waitSupabaseAuthReady();
                        const { data: { session } } = await sb.auth.getSession();
                        if (!session) throw new Error('Sesi tidak valid, login ulang.');

                        const result = await apiPost({
                            action: 'resetUserPasswordSuperadmin',
                            accessToken: session.access_token,
                            targetNip: nip
                        });

                        if (result.status === 'success') {
                            showToast(`Password ${nama} berhasil direset ke NIP`);
                        } else {
                            alert('Gagal: ' + (result.message || 'Terjadi kesalahan.'));
                        }
                    } catch (e) {
                        alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
                    } finally {
                        btn.disabled = false;
                        btn.innerHTML = originalHtml;
                    }
                }
            );
        };
    });
}

/* ==========================================================
 * ==================== TAB KANTOR =========================
 * ========================================================== */

async function refLoadKantorData() {
    const tbody = document.getElementById('ref-kantor-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-slate-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;

    try {
        await waitSupabaseAuthReady();
        await refGetKantorOptions(true); // force refresh, jangan pakai cache basi
        refRenderKantorTable('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 py-8">❌ Error koneksi: ${e.message || 'Tidak diketahui'}</td></tr>`;
    }
}

function refRenderKantorTable(keyword) {
    const tbody = document.getElementById('ref-kantor-tbody');
    const emptyMsg = document.getElementById('ref-kantor-empty');
    const kw = (keyword || '').trim().toLowerCase();

    const filtered = refKantorData.filter(row =>
        !kw || String(row.nama).toLowerCase().includes(kw) || String(row.id).toLowerCase().includes(kw)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    tbody.innerHTML = filtered.map(row => `
        <tr data-id="${row.id}" class="hover:bg-slate-50">
            <td class="py-2 px-4 font-medium text-slate-700">${row.id}</td>
            <td class="py-2 px-4">
                <input type="text" class="ref-kantor-nama ${refInputClass}" value="${row.nama}" readonly>
            </td>
            <td class="py-2 px-4 text-center">
                <span class="ref-kantor-statusBadge px-2.5 py-1 rounded-full text-xs font-medium ${row.status === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}">
                    ${row.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
            <td class="py-2 px-4 text-center whitespace-nowrap">
                <button class="ref-kantor-btnEdit text-sky-600 hover:text-sky-800 mr-2" title="Ubah nama">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="ref-kantor-btnSave hidden text-green-600 hover:text-green-800 mr-2" title="Simpan">
                    <i class="fa-solid fa-floppy-disk"></i>
                </button>
                <button class="ref-kantor-btnCancel hidden text-slate-400 hover:text-slate-600 mr-2" title="Batal">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <button class="ref-kantor-btnToggleStatus text-amber-600 hover:text-amber-800" title="${row.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}">
                    <i class="fa-solid ${row.status === 'aktif' ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                </button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
        const id = tr.getAttribute('data-id');
        const namaInput = tr.querySelector('.ref-kantor-nama');
        const btnEdit = tr.querySelector('.ref-kantor-btnEdit');
        const btnSave = tr.querySelector('.ref-kantor-btnSave');
        const btnCancel = tr.querySelector('.ref-kantor-btnCancel');
        const btnToggle = tr.querySelector('.ref-kantor-btnToggleStatus');
        let namaSebelumEdit = namaInput.value;

        btnEdit.onclick = () => {
            namaSebelumEdit = namaInput.value;
            namaInput.readOnly = false;
            namaInput.classList.remove('bg-slate-100');
            namaInput.focus();
            btnEdit.classList.add('hidden');
            btnSave.classList.remove('hidden');
            btnCancel.classList.remove('hidden');
        };

        btnCancel.onclick = () => {
            namaInput.value = namaSebelumEdit;
            namaInput.readOnly = true;
            namaInput.classList.add('bg-slate-100');
            btnEdit.classList.remove('hidden');
            btnSave.classList.add('hidden');
            btnCancel.classList.add('hidden');
        };

        btnSave.onclick = async () => {
            const namaBaru = namaInput.value.trim();
            if (!namaBaru) { alert('Nama kantor tidak boleh kosong.'); return; }
            btnSave.disabled = true;
            const originalHtml = btnSave.innerHTML;
            btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                await waitSupabaseAuthReady();
                const { error } = await sb.from('kantor').update({ nama: namaBaru }).eq('id', id);
                if (error) throw error;
                const rowData = refKantorData.find(r => r.id === id);
                if (rowData) rowData.nama = namaBaru;
                namaInput.readOnly = true;
                namaInput.classList.add('bg-slate-100');
                btnEdit.classList.remove('hidden');
                btnSave.classList.add('hidden');
                btnCancel.classList.add('hidden');
                showToast(`Kantor ${id} berhasil diubah`);
            } catch (e) {
                alert('Gagal menyimpan: ' + (e.message || 'Tidak diketahui'));
            } finally {
                btnSave.disabled = false;
                btnSave.innerHTML = originalHtml;
            }
        };

        btnToggle.onclick = async () => {
            const rowData = refKantorData.find(r => r.id === id);
            const statusBaru = (rowData.status === 'aktif') ? 'nonaktif' : 'aktif';
            const aksiLabel = statusBaru === 'aktif' ? 'mengaktifkan' : 'menonaktifkan';
            refConfirmHapusPopup(
                `Yakin ingin ${aksiLabel} kantor <span class="font-medium text-slate-800">${rowData.nama}</span> (${id})? ${statusBaru === 'nonaktif' ? 'Kantor nonaktif tidak akan muncul lagi di popup pilih kantor saat login.' : ''}`,
                async () => {
                    btnToggle.disabled = true;
                    try {
                        await waitSupabaseAuthReady();
                        const { error } = await sb.from('kantor').update({ status: statusBaru }).eq('id', id);
                        if (error) throw error;
                        rowData.status = statusBaru;
                        refRenderKantorTable(document.getElementById('ref-kantor-search')?.value || '');
                        showToast(`Kantor ${id} berhasil di-${aksiLabel}`);
                    } catch (e) {
                        alert('Gagal mengubah status: ' + (e.message || 'Tidak diketahui'));
                        btnToggle.disabled = false;
                    }
                }
            );
        };
    });
}

function refTambahKantorPopup() {
    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 shrink-0">
                <i class="fa-solid fa-building"></i>
            </div>
            <h3 class="text-lg font-semibold text-slate-800">Tambah Kantor</h3>
        </div>
        <div class="space-y-3 mt-3">
            <div>
                <label class="text-xs font-medium text-slate-500 block mb-1">Kode Kantor (kode satker)</label>
                <input id="ref-kantor-inputKode" type="text" placeholder="mis. 538065" class="${refInputClass} bg-white">
            </div>
            <div>
                <label class="text-xs font-medium text-slate-500 block mb-1">Nama Kantor</label>
                <input id="ref-kantor-inputNama" type="text" placeholder="mis. KPKNL Jember" class="${refInputClass} bg-white">
            </div>
        </div>
        <p id="ref-kantor-tambahError" class="hidden text-[13px] px-3.5 py-2.5 rounded-xl text-center mt-3 bg-red-50 text-red-600"></p>
        <div class="flex justify-end gap-2 mt-4">
            <button id="ref-kantor-tambahCancelBtn" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium">Batal</button>
            <button id="ref-kantor-tambahSimpanBtn" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-plus mr-1"></i> Tambah
            </button>
        </div>
    `, 'max-w-sm');

    popup.querySelector('#ref-kantor-tambahCancelBtn').onclick = () => overlay.remove();
    popup.querySelector('#ref-kantor-tambahSimpanBtn').onclick = async () => {
        const kode = popup.querySelector('#ref-kantor-inputKode').value.trim();
        const nama = popup.querySelector('#ref-kantor-inputNama').value.trim();
        const errEl = popup.querySelector('#ref-kantor-tambahError');
        errEl.classList.add('hidden');

        if (!kode || !nama) {
            errEl.textContent = 'Kode dan Nama kantor harus diisi.';
            errEl.classList.remove('hidden');
            return;
        }

        const btn = popup.querySelector('#ref-kantor-tambahSimpanBtn');
        btn.disabled = true;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            await waitSupabaseAuthReady();
            const { error } = await sb.from('kantor').insert({ id: kode, nama, status: 'aktif' });
            if (error) throw error;
            overlay.remove();
            showToast(`Kantor ${nama} berhasil ditambahkan`);
            refKantorLoaded = false;
            refLoadKantorData();
        } catch (e) {
            errEl.textContent = 'Gagal menambahkan: ' + (e.message || 'Kode kantor mungkin sudah dipakai.');
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    };
}
