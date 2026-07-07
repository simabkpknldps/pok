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

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-gear mr-2"></i>Pengaturan</h3>
            <button id="cs-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="flex border-b border-slate-200 mb-2">
            <button id="cs-tabBtnPassword" class="px-4 py-2 text-sm font-medium border-b-2 transition">Ganti Password</button>
            <button id="cs-tabBtnPejabat" class="px-4 py-2 text-sm font-medium border-b-2 transition">Pejabat</button>
        </div>

        <div id="cs-tabPassword" class="flex-col gap-3">
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
    `, 'max-w-md');

    popup.querySelector('#cs-closeBtn').onclick = () => overlay.remove();

    // ---- Tab switching ----
    const tabBtnPassword = popup.querySelector('#cs-tabBtnPassword');
    const tabBtnPejabat = popup.querySelector('#cs-tabBtnPejabat');
    const tabPassword = popup.querySelector('#cs-tabPassword');
    const tabPejabat = popup.querySelector('#cs-tabPejabat');

    function csActivateTab(tab) {
        const isPassword = tab === 'password';

        tabPassword.classList.toggle('hidden', !isPassword);
        tabPassword.classList.toggle('flex', isPassword);
        tabPejabat.classList.toggle('hidden', isPassword);
        tabPejabat.classList.toggle('flex', !isPassword);

        tabBtnPassword.className = `px-4 py-2 text-sm font-medium border-b-2 transition ${isPassword ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500'}`;
        tabBtnPejabat.className = `px-4 py-2 text-sm font-medium border-b-2 transition ${!isPassword ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500'}`;

        if (!isPassword) csLoadPejabatData(popup);
    }

    tabBtnPassword.onclick = () => csActivateTab('password');
    tabBtnPejabat.onclick = () => csActivateTab('pejabat');

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
    csActivateTab('password');
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
