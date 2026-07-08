/**
 * Fungsi umum yang dipakai di banyak halaman.
 */

function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

function showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = "bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center animate-in slide-in-from-right-10";
    toast.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatRibuan(angka) {
    let v = String(angka).replace(/\D/g, "");
    return v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function generateIdUsulan() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 10; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

function initializeUserName() {
    const nama = sessionStorage.getItem('nama') || 'Guest';
    const namaLoginElement = document.getElementById('nama-login');
    if (namaLoginElement) {
        namaLoginElement.textContent = nama;
    }
}

// ==========================================
// Popup Settings (Ganti Password & Pejabat)
// ==========================================

const csInputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';
const csLabelClass = 'text-sm font-medium text-slate-600';

// Daftar Golongan/Pangkat PNS (format disamakan dengan data di sheet ref_pegawai: "Sebutan / Golongan.sub")
const CS_DAFTAR_PANGKAT = [
    'Juru Muda / I.a',
    'Juru Muda Tk. I / I.b',
    'Juru / I.c',
    'Juru Tk. I / I.d',
    'Pengatur Muda / II.a',
    'Pengatur Muda Tk. I / II.b',
    'Pengatur / II.c',
    'Pengatur Tk. I / II.d',
    'Penata Muda / III.a',
    'Penata Muda Tk. I / III.b',
    'Penata / III.c',
    'Penata Tk. I / III.d',
    'Pembina / IV.a',
    'Pembina Tk. I / IV.b',
    'Pembina Muda / IV.c',
    'Pembina Madya / IV.d',
    'Pembina Utama / IV.e'
];

function commonOpenOverlay(innerHtml, widthClass) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4';

    const popup = document.createElement('div');
    popup.className = `bg-white rounded-2xl shadow-xl w-full ${widthClass || 'max-w-md'} p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto`;
    popup.innerHTML = innerHtml;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    return { overlay, popup };
}

function openSettings() {
    const nip = sessionStorage.getItem('nip') || '';
    const nama = sessionStorage.getItem('nama') || '';
    const jabatan = sessionStorage.getItem('jabatan') || '';
    const pangkat = sessionStorage.getItem('pangkat') || '';
    const kepeg = sessionStorage.getItem('kepeg') || '';

    const pangkatOptions = CS_DAFTAR_PANGKAT.map(p =>
        `<option value="${p}" ${p === pangkat ? 'selected' : ''}>${p}</option>`
    ).join('');
    // Kalau pangkat yang tersimpan tidak ada di daftar (data lama/tidak baku), tetap tampilkan sebagai opsi tersendiri
    const pangkatExtraOption = (pangkat && !CS_DAFTAR_PANGKAT.includes(pangkat))
        ? `<option value="${pangkat}" selected>${pangkat}</option>` : '';

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-gear mr-2"></i>Pengaturan</h3>
            <button id="cs-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="flex border-b border-slate-200 mb-2">
            <button id="cs-tabBtnProfil" class="px-4 py-2 text-sm font-medium border-b-2 transition">Profil</button>
            <button id="cs-tabBtnPejabat" class="px-4 py-2 text-sm font-medium border-b-2 transition">Pejabat</button>
            <button id="cs-tabBtnPassword" class="px-4 py-2 text-sm font-medium border-b-2 transition">Ganti Password</button>
            <button id="cs-tabBtnTambahPegawai" class="px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap">Tambah Pegawai</button>
        </div>

        <div id="cs-tabProfil" class="flex-col gap-3">
            <label class="${csLabelClass}">Nama</label>
            <input id="cs-profilNama" type="text" value="${nama}" readonly class="${csInputClass} bg-slate-100">
            <label class="${csLabelClass}">NIP</label>
            <input id="cs-profilNip" type="text" value="${nip}" readonly class="${csInputClass} bg-slate-100">
            <label class="${csLabelClass}">Jabatan</label>
            <input id="cs-profilJabatan" type="text" value="${jabatan}" readonly class="${csInputClass} bg-slate-100">
            <label class="${csLabelClass}">Pangkat</label>
            <select id="cs-profilPangkat" disabled class="${csInputClass} bg-slate-100">
                <option value="">-- Pilih Pangkat --</option>
                ${pangkatExtraOption}
                ${pangkatOptions}
            </select>
            <label class="${csLabelClass}">Kepegawaian</label>
            <input id="cs-profilKepeg" type="text" value="${kepeg}" readonly class="${csInputClass} bg-slate-100">
            <div class="flex justify-end gap-2 mt-2">
                <button id="cs-btnUbahProfil" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                    <i class="fa-solid fa-pen-to-square mr-1"></i> Ubah
                </button>
                <button id="cs-btnSimpanProfil" class="hidden px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                    <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
                </button>
            </div>
        </div>

        <div id="cs-tabPejabat" class="hidden flex-col gap-3">
            <div id="cs-pejabatLoading" class="text-center text-slate-400 py-6">
                <i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data pejabat...
            </div>
            <div id="cs-pejabatForm" class="hidden flex-col gap-3">
                <label class="${csLabelClass}">Nama PPK</label>
                <input id="cs-ppkNama" type="text" readonly class="${csInputClass} bg-slate-100">
                <label class="${csLabelClass}">NIP PPK</label>
                <input id="cs-ppkNip" type="text" readonly class="${csInputClass} bg-slate-100">
                <label class="${csLabelClass}">Nama Bendahara</label>
                <input id="cs-bendaharaNama" type="text" readonly class="${csInputClass} bg-slate-100">
                <label class="${csLabelClass}">NIP Bendahara</label>
                <input id="cs-bendaharaNip" type="text" readonly class="${csInputClass} bg-slate-100">
                <div class="flex justify-end gap-2 mt-2">
                    <button id="cs-btnUbahPejabat" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                        <i class="fa-solid fa-pen-to-square mr-1"></i> Ubah Pejabat
                    </button>
                    <button id="cs-btnSimpanPejabat" class="hidden px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                        <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
                    </button>
                </div>
            </div>
        </div>

        <div id="cs-tabPassword" class="hidden flex-col gap-3">
            <label class="${csLabelClass}">NIP</label>
            <input id="cs-nip" type="text" value="${nip}" ${nip ? 'readonly' : ''} class="${csInputClass} ${nip ? 'bg-slate-100' : ''}" placeholder="Masukkan NIP">
            <label class="${csLabelClass}">Password Lama</label>
            <input id="cs-pwLama" type="password" class="${csInputClass}">
            <label class="${csLabelClass}">Password Baru</label>
            <input id="cs-pwBaru" type="password" class="${csInputClass}">
            <label class="${csLabelClass}">Konfirmasi Password Baru</label>
            <input id="cs-pwKonfirmasi" type="password" class="${csInputClass}">
            <div class="flex justify-end mt-2">
                <button id="cs-btnSimpanPassword" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                    <i class="fa-solid fa-key mr-1"></i> Simpan Password
                </button>
            </div>
        </div>

        <div id="cs-tabTambahPegawai" class="hidden flex-col gap-3">
            <label class="${csLabelClass}">Nama</label>
            <input id="cs-tpNama" type="text" placeholder="Nama lengkap pegawai" class="${csInputClass}">
            <label class="${csLabelClass}">NIP</label>
            <input id="cs-tpNip" type="text" placeholder="NIP pegawai" class="${csInputClass}">
            <label class="${csLabelClass}">Jabatan</label>
            <input id="cs-tpJabatan" type="text" placeholder="Jabatan" class="${csInputClass}">
            <label class="${csLabelClass}">Pangkat</label>
            <select id="cs-tpPangkat" class="${csInputClass}">
                <option value="">-- Pilih Pangkat --</option>
                ${CS_DAFTAR_PANGKAT.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
            <label class="${csLabelClass}">Kepegawaian</label>
            <input id="cs-tpKepeg" type="text" placeholder="Kepegawaian" class="${csInputClass}">
            <label class="${csLabelClass}">Admin</label>
            <select id="cs-tpAdmin" class="${csInputClass}">
                <option value="0">0 - Bukan Admin</option>
                <option value="1">1 - Admin</option>
            </select>
            <div class="flex justify-end mt-2">
                <button id="cs-btnSimpanTambahPegawai" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                    <i class="fa-solid fa-user-plus mr-1"></i> Simpan
                </button>
            </div>
        </div>
    `, 'max-w-md');

    popup.querySelector('#cs-closeBtn').onclick = () => overlay.remove();

    // ---- Tab switching ----
    const tabBtnProfil = popup.querySelector('#cs-tabBtnProfil');
    const tabBtnPejabat = popup.querySelector('#cs-tabBtnPejabat');
    const tabBtnPassword = popup.querySelector('#cs-tabBtnPassword');
    const tabBtnTambahPegawai = popup.querySelector('#cs-tabBtnTambahPegawai');
    const tabProfil = popup.querySelector('#cs-tabProfil');
    const tabPejabat = popup.querySelector('#cs-tabPejabat');
    const tabPassword = popup.querySelector('#cs-tabPassword');
    const tabTambahPegawai = popup.querySelector('#cs-tabTambahPegawai');

    function csActivateTab(tab) {
        const tabs = {
            profil: [tabProfil, tabBtnProfil],
            pejabat: [tabPejabat, tabBtnPejabat],
            password: [tabPassword, tabBtnPassword],
            tambahPegawai: [tabTambahPegawai, tabBtnTambahPegawai]
        };

        Object.keys(tabs).forEach(key => {
            const [content, btn] = tabs[key];
            const active = key === tab;
            content.classList.toggle('hidden', !active);
            content.classList.toggle('flex', active);
            btn.className = `px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${active ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500'}`;
        });

        if (tab === 'pejabat') csLoadPejabatData(popup);
    }

    tabBtnProfil.onclick = () => csActivateTab('profil');
    tabBtnPejabat.onclick = () => csActivateTab('pejabat');
    tabBtnPassword.onclick = () => csActivateTab('password');
    tabBtnTambahPegawai.onclick = () => csActivateTab('tambahPegawai');

    // ---- Profil ----
    csBindProfilButtons(popup);

    // ---- Tambah Pegawai ----
    popup.querySelector('#cs-btnSimpanTambahPegawai').onclick = async function () {
        const btn = this;
        const nama = popup.querySelector('#cs-tpNama').value.trim();
        const nip = popup.querySelector('#cs-tpNip').value.trim();
        const jabatan = popup.querySelector('#cs-tpJabatan').value.trim();
        const pangkat = popup.querySelector('#cs-tpPangkat').value;
        const kepeg = popup.querySelector('#cs-tpKepeg').value.trim();
        const admin = popup.querySelector('#cs-tpAdmin').value;

        if (!nama || !nip || !jabatan || !pangkat) {
            alert('Nama, NIP, Jabatan, dan Pangkat harus diisi!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const result = await apiPost({
                action: 'tambahPegawai',
                nama, nip, jabatan, pangkat, kepeg, admin
            });
            if (result.status === 'success') {
                showToast('Pegawai baru berhasil ditambahkan');
                popup.querySelector('#cs-tpNama').value = '';
                popup.querySelector('#cs-tpNip').value = '';
                popup.querySelector('#cs-tpJabatan').value = '';
                popup.querySelector('#cs-tpPangkat').value = '';
                popup.querySelector('#cs-tpKepeg').value = '';
                popup.querySelector('#cs-tpAdmin').value = '0';
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

    // ---- Ganti Password ----
    popup.querySelector('#cs-btnSimpanPassword').onclick = async function () {
        const btn = this;
        const nipVal = popup.querySelector('#cs-nip').value.trim();
        const pwLama = popup.querySelector('#cs-pwLama').value;
        const pwBaru = popup.querySelector('#cs-pwBaru').value;
        const pwKonfirmasi = popup.querySelector('#cs-pwKonfirmasi').value;

        if (!nipVal || !pwLama || !pwBaru || !pwKonfirmasi) {
            alert('Semua field harus diisi!');
            return;
        }
        if (pwBaru !== pwKonfirmasi) {
            alert('Konfirmasi password baru tidak cocok!');
            return;
        }
        if (pwBaru.length < 4) {
            alert('Password baru minimal 4 karakter!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const result = await apiPost({
                action: 'gantiPassword',
                nip: nipVal,
                passwordLama: pwLama,
                passwordBaru: pwBaru
            });
            if (result.status === 'success') {
                showToast('Password berhasil diubah');
                overlay.remove();
            } else {
                alert('Gagal: ' + (result.message || 'Password lama salah.'));
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    // Tab awal
    csActivateTab('profil');
}

function csBindProfilButtons(popup) {
    const jabatanInput = popup.querySelector('#cs-profilJabatan');
    const pangkatSelect = popup.querySelector('#cs-profilPangkat');
    const kepegInput = popup.querySelector('#cs-profilKepeg');
    const btnUbah = popup.querySelector('#cs-btnUbahProfil');
    const btnSimpan = popup.querySelector('#cs-btnSimpanProfil');

    btnUbah.onclick = function () {
        jabatanInput.removeAttribute('readonly');
        jabatanInput.classList.remove('bg-slate-100');
        pangkatSelect.disabled = false;
        pangkatSelect.classList.remove('bg-slate-100');
        kepegInput.removeAttribute('readonly');
        kepegInput.classList.remove('bg-slate-100');

        btnUbah.classList.add('hidden');
        btnSimpan.classList.remove('hidden');
        jabatanInput.focus();
    };

    btnSimpan.onclick = async function () {
        const btn = this;
        const nip = sessionStorage.getItem('nip') || '';
        const jabatan = jabatanInput.value.trim();
        const pangkat = pangkatSelect.value;
        const kepeg = kepegInput.value.trim();

        if (!jabatan || !pangkat) {
            alert('Jabatan dan Pangkat harus diisi!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const result = await apiPost({
                action: 'updateProfilData',
                nip, jabatan, pangkat, kepeg
            });
            if (result.status === 'success') {
                showToast('Profil berhasil diubah');

                sessionStorage.setItem('jabatan', jabatan);
                sessionStorage.setItem('pangkat', pangkat);
                sessionStorage.setItem('kepeg', kepeg);

                jabatanInput.setAttribute('readonly', 'readonly');
                jabatanInput.classList.add('bg-slate-100');
                pangkatSelect.disabled = true;
                pangkatSelect.classList.add('bg-slate-100');
                kepegInput.setAttribute('readonly', 'readonly');
                kepegInput.classList.add('bg-slate-100');

                btnSimpan.classList.add('hidden');
                btnUbah.classList.remove('hidden');
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

async function csLoadPejabatData(popup) {
    const loadingEl = popup.querySelector('#cs-pejabatLoading');
    const formEl = popup.querySelector('#cs-pejabatForm');

    if (!formEl.classList.contains('hidden')) return; // sudah dimuat sebelumnya

    loadingEl.classList.remove('hidden');
    formEl.classList.add('hidden');

    try {
        const result = await apiPost({ action: 'getPejabatData' });
        if (result.status === 'success') {
            popup.querySelector('#cs-ppkNama').value = result.ppkNama || '';
            popup.querySelector('#cs-ppkNip').value = result.ppkNip || '';
            popup.querySelector('#cs-bendaharaNama').value = result.bendaharaNama || '';
            popup.querySelector('#cs-bendaharaNip').value = result.bendaharaNip || '';

            loadingEl.classList.add('hidden');
            formEl.classList.remove('hidden');
            formEl.classList.add('flex');

            csBindPejabatButtons(popup);
        } else {
            loadingEl.innerHTML = `<span class="text-red-500">❌ ${result.message || 'Gagal memuat data pejabat'}</span>`;
        }
    } catch (e) {
        loadingEl.innerHTML = `<span class="text-red-500">❌ ${e.message || 'Gagal memuat data pejabat'}</span>`;
    }
}

function csBindPejabatButtons(popup) {
    const inputs = ['#cs-ppkNama', '#cs-ppkNip', '#cs-bendaharaNama', '#cs-bendaharaNip'].map(sel => popup.querySelector(sel));
    const btnUbah = popup.querySelector('#cs-btnUbahPejabat');
    const btnSimpan = popup.querySelector('#cs-btnSimpanPejabat');

    btnUbah.onclick = function () {
        inputs.forEach(inp => {
            inp.removeAttribute('readonly');
            inp.classList.remove('bg-slate-100');
        });
        btnUbah.classList.add('hidden');
        btnSimpan.classList.remove('hidden');
        inputs[0].focus();
    };

    btnSimpan.onclick = async function () {
        const btn = this;
        const ppkNama = popup.querySelector('#cs-ppkNama').value.trim();
        const ppkNip = popup.querySelector('#cs-ppkNip').value.trim();
        const bendaharaNama = popup.querySelector('#cs-bendaharaNama').value.trim();
        const bendaharaNip = popup.querySelector('#cs-bendaharaNip').value.trim();

        if (!ppkNama || !ppkNip || !bendaharaNama || !bendaharaNip) {
            alert('Semua field pejabat harus diisi!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            const result = await apiPost({
                action: 'updatePejabatData',
                ppkNama, ppkNip, bendaharaNama, bendaharaNip
            });
            if (result.status === 'success') {
                showToast('Data pejabat berhasil diubah');
                inputs.forEach(inp => {
                    inp.setAttribute('readonly', 'readonly');
                    inp.classList.add('bg-slate-100');
                });
                btnSimpan.classList.add('hidden');
                btnUbah.classList.remove('hidden');
            } else {
                alert('Gagal: ' + result.message);
            }
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

// Initialize user name saat halaman dimuat
document.addEventListener('DOMContentLoaded', initializeUserName);

window.logout = logout;
window.showToast = showToast;
window.formatRibuan = formatRibuan;
window.generateIdUsulan = generateIdUsulan;
window.initializeUserName = initializeUserName;
window.openSettings = openSettings;
window.commonOpenOverlay = commonOpenOverlay;
