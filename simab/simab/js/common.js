/**
 * Fungsi umum yang dipakai di banyak halaman.
 */

function logout() {
    ['nama', 'nip', 'realUrl', 'admin', 'jabatan', 'pangkat', 'kepeg', 'kantor', 'aksesMenu', 'superadmin', 'superadminMode', 'tahunAktif', 'lastActivity']
        .forEach(k => localStorage.removeItem(k));
    window.location.href = 'index.html?reason=logout';
}

function showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.style.cssText = "background: rgba(29,29,31,0.92); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); color: #fff; font-family: var(--sf); font-size: 13.5px; font-weight: 500;";
    toast.className = "px-5 py-3 rounded-xl shadow-lg flex items-center animate-in slide-in-from-right-10";
    toast.innerHTML = `<i class="fa-solid fa-circle-check mr-2" style="color: var(--ios-green);"></i> ${message}`;
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
    const nama = localStorage.getItem('nama') || 'Guest';
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

// Daftar Bank untuk dropdown Rekening (tab Settings > Rekening)
const CS_DAFTAR_BANK = [
    'BRI', 'BNI', 'BCA', 'Mandiri', 'BSI', 'BTN', 'CIMB Niaga', 'Danamon',
    'Permata', 'Panin', 'Maybank Indonesia', 'OCBC NISP', 'HSBC Indonesia',
    'Citibank', 'UOB Indonesia', 'BTPN', 'KB Bukopin', 'Mega', 'Sinarmas',
    'Commonwealth', 'DBS Indonesia', 'Muamalat', 'Bank Jago', 'Bank Jatim',
    'Bank DKI', 'Bank Jabar Banten (BJB)', 'Bank Jateng', 'Bank Nagari',
    'Bank Sumut', 'Bank Sumsel Babel', 'Bank Kalbar', 'Bank Kalsel',
    'Bank Kaltimtara', 'Bank Sulselbar', 'Bank NTB Syariah', 'Bank Papua',
    'Bank Aceh Syariah', 'Bank Riau Kepri'
];

function commonOpenOverlay(innerHtml, widthClass) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 flex items-center justify-center z-[9999] p-4 overflow-x-hidden';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.backdropFilter = 'blur(3px)';

    const popup = document.createElement('div');
    popup.className = `w-full ${widthClass || 'max-w-md'} p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto overflow-x-hidden`;
    popup.style.cssText = "background: #fff; border-radius: 18px; box-shadow: 0 24px 60px -12px rgba(0,0,0,0.35); font-family: var(--sf);";
    popup.innerHTML = innerHtml;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    return { overlay, popup };
}

// ==========================================
// Popup Switcher Tahun Anggaran
// ==========================================

// Dipanggil dari tombol "Tahun Anggaran <tahun>" di dashboard.html (sebelah
// Logout). Nunjukin semua tahun yg beneran ada datanya (via
// getTahunTersediaList) buat kantor aktif sekarang, biarin user pilih salah
// satu, lalu reload halaman skrng biar semua query di halaman itu ke-refresh
// pakai tahun baru (paling sederhana & paling aman drpd coba re-render
// manual tiap halaman -- konsisten sama pola ganti kantor pas login).
async function openTahunAnggaranSwitcher() {
    const tahunSaatIni = await getTahunAktif();
    const kantorId = (typeof getKantorAktif === 'function') ? getKantorAktif() : (localStorage.getItem('kantor') || '');

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background: rgba(0,113,227,0.1); color: var(--ios-blue);">
                <i class="fa-solid fa-calendar-days"></i>
            </div>
            <h3 class="text-lg font-semibold text-slate-800">Tahun Anggaran</h3>
        </div>
        <p class="text-sm text-slate-500 -mt-1">Pilih tahun anggaran yang ingin ditampilkan. Data Kegiatan, Perjadin, dan POK akan menyesuaikan.</p>
        <div id="tahunSwitcherList" class="space-y-2 mt-1">
            <div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-slate-400"></i></div>
        </div>
    `, 'max-w-sm');

    const listEl = popup.querySelector('#tahunSwitcherList');
    try {
        const daftarTahun = await getTahunTersediaList(kantorId);
        listEl.innerHTML = daftarTahun.map(t => `
            <button type="button" class="tahunSwitcher-opt w-full text-left px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between transition"
                data-tahun="${t}"
                style="background: ${t === tahunSaatIni ? 'rgba(0,113,227,0.1)' : 'rgba(118,118,128,0.1)'}; color: ${t === tahunSaatIni ? 'var(--ios-blue)' : 'var(--label)'};">
                <span>${t}</span>
                ${t === tahunSaatIni ? '<i class="fa-solid fa-check"></i>' : ''}
            </button>
        `).join('');

        listEl.querySelectorAll('.tahunSwitcher-opt').forEach(btn => {
            btn.onclick = () => {
                const tahunBaru = Number(btn.getAttribute('data-tahun'));
                setTahunAktif(tahunBaru);
                overlay.remove();
                showToast(`Tahun anggaran diganti ke ${tahunBaru}`);
                setTimeout(() => window.location.reload(), 400);
            };
        });
    } catch (e) {
        listEl.innerHTML = `<p class="text-sm text-red-500 text-center py-4">Gagal memuat daftar tahun: ${e.message || 'Tidak diketahui'}</p>`;
    }

    // Tutup popup kalau klik area luar (di luar kotak putihnya)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
window.openTahunAnggaranSwitcher = openTahunAnggaranSwitcher;

// Dipanggil dashboard.html saat halaman dimuat, buat isi label tombol
// switcher-nya ("Tahun Anggaran 2026" dst) tanpa perlu buka popup dulu.
async function initTahunAnggaranLabel() {
    const el = document.getElementById('tahunAktifLabel');
    if (!el) return;
    try {
        el.textContent = await getTahunAktif();
    } catch (e) {
        el.textContent = new Date().getFullYear();
    }
}
window.initTahunAnggaranLabel = initTahunAnggaranLabel;

function openSettings() {
    const nip = localStorage.getItem('nip') || '';
    const nama = localStorage.getItem('nama') || '';
    const jabatan = localStorage.getItem('jabatan') || '';
    const pangkat = localStorage.getItem('pangkat') || '';
    const kepeg = localStorage.getItem('kepeg') || '';

    const pangkatOptions = CS_DAFTAR_PANGKAT.map(p =>
        `<option value="${p}" ${p === pangkat ? 'selected' : ''}>${p}</option>`
    ).join('');
    // Kalau pangkat yang tersimpan tidak ada di daftar (data lama/tidak baku), tetap tampilkan sebagai opsi tersendiri
    const pangkatExtraOption = (pangkat && !CS_DAFTAR_PANGKAT.includes(pangkat))
        ? `<option value="${pangkat}" selected>${pangkat}</option>` : '';

    const bankOptions = CS_DAFTAR_BANK.map(b => `<option value="${b}">${b}</option>`).join('');

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-gear mr-2"></i>Pengaturan</h3>
            <button id="cs-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="flex border-b border-slate-200 mb-2 overflow-x-auto">
            <button id="cs-tabBtnProfil" class="px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap">Profil</button>
            <button id="cs-tabBtnRekening" class="px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap">Rekening</button>
            <button id="cs-tabBtnPejabat" class="px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap">Pejabat</button>
            <button id="cs-tabBtnPassword" class="px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap">Ganti Password</button>
            <button id="cs-tabBtnTambahPegawai" class="px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap">Tambah Pegawai</button>
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

        <div id="cs-tabRekening" class="hidden flex-col gap-3">
            <div id="cs-rekeningLoading" class="text-center text-slate-400 py-6">
                <i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data rekening...
            </div>
            <div id="cs-rekeningForm" class="hidden flex-col gap-3">
                <label class="${csLabelClass}">Nama Bank</label>
                <select id="cs-rekBank" disabled class="${csInputClass} bg-slate-100">
                    <option value="">-- Pilih Bank --</option>
                    ${bankOptions}
                </select>
                <label class="${csLabelClass}">Nomor Rekening</label>
                <input id="cs-rekNorek" type="text" inputmode="numeric" readonly class="${csInputClass} bg-slate-100" placeholder="Nomor rekening">
                <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <i class="fa-solid fa-circle-info mr-1"></i>
                    Catatan: Rekening selain BRI akan ada Fee Benificiary Rp.2500,-
                </p>
                <div class="flex justify-end gap-2 mt-2">
                    <button id="cs-btnUbahRekening" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                        <i class="fa-solid fa-pen-to-square mr-1"></i> Ubah
                    </button>
                    <button id="cs-btnSimpanRekening" class="hidden px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                        <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
                    </button>
                </div>
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
            <div>
                <label class="${csLabelClass}">Nama</label>
                <input id="cs-tpNama" type="text" placeholder="Nama lengkap pegawai" class="${csInputClass}">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="${csLabelClass}">NIP</label>
                    <input id="cs-tpNip" type="text" placeholder="NIP pegawai" class="${csInputClass}">
                </div>
                <div>
                    <label class="${csLabelClass}">Jabatan</label>
                    <input id="cs-tpJabatan" type="text" placeholder="Jabatan" class="${csInputClass}">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="${csLabelClass}">Pangkat</label>
                    <select id="cs-tpPangkat" class="${csInputClass}">
                        <option value="">-- Pilih Pangkat --</option>
                        ${CS_DAFTAR_PANGKAT.map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="${csLabelClass}">Kepegawaian</label>
                    <select id="cs-tpKepeg" class="${csInputClass}">
                        <option value="1">1 - PNS</option>
                        <option value="0">0 - PPNPN</option>
                    </select>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="${csLabelClass}">Admin</label>
                    <select id="cs-tpAdmin" class="${csInputClass}">
                        <option value="0">0 - Bukan Admin</option>
                        <option value="1">1 - Admin</option>
                    </select>
                </div>
                <div>
                    <label class="${csLabelClass}">Akses Menu</label>
                    <select id="cs-tpAksesMenu" class="${csInputClass}">
                        <option value="0">0 - Terbatas</option>
                        <option value="1">1 - Penuh</option>
                    </select>
                </div>
            </div>
            <div class="flex justify-end mt-2">
                <button id="cs-btnSimpanTambahPegawai" class="btn-ios px-4 py-2 text-sm">
                    <i class="fa-solid fa-user-plus mr-1"></i> Simpan
                </button>
            </div>
        </div>
    `, 'max-w-lg');

    popup.querySelector('#cs-closeBtn').onclick = () => overlay.remove();

    // ---- Tab switching ----
    const tabBtnProfil = popup.querySelector('#cs-tabBtnProfil');
    const tabBtnRekening = popup.querySelector('#cs-tabBtnRekening');
    const tabBtnPejabat = popup.querySelector('#cs-tabBtnPejabat');
    const tabBtnPassword = popup.querySelector('#cs-tabBtnPassword');
    const tabBtnTambahPegawai = popup.querySelector('#cs-tabBtnTambahPegawai');
    const tabProfil = popup.querySelector('#cs-tabProfil');
    const tabRekening = popup.querySelector('#cs-tabRekening');
    const tabPejabat = popup.querySelector('#cs-tabPejabat');
    const tabPassword = popup.querySelector('#cs-tabPassword');
    const tabTambahPegawai = popup.querySelector('#cs-tabTambahPegawai');

    function csActivateTab(tab) {
        const tabs = {
            profil: [tabProfil, tabBtnProfil],
            rekening: [tabRekening, tabBtnRekening],
            pejabat: [tabPejabat, tabBtnPejabat],
            password: [tabPassword, tabBtnPassword],
            tambahPegawai: [tabTambahPegawai, tabBtnTambahPegawai]
        };

        Object.keys(tabs).forEach(key => {
            const [content, btn] = tabs[key];
            const active = key === tab;
            content.classList.toggle('hidden', !active);
            content.classList.toggle('flex', active);
            btn.className = `px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap ${active ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500'}`;
        });

        if (tab === 'pejabat') csLoadPejabatData(popup);
        if (tab === 'rekening') csLoadRekeningData(popup);
    }

    tabBtnProfil.onclick = () => csActivateTab('profil');
    tabBtnRekening.onclick = () => csActivateTab('rekening');
    tabBtnPejabat.onclick = () => csActivateTab('pejabat');
    tabBtnPassword.onclick = () => csActivateTab('password');
    tabBtnTambahPegawai.onclick = () => csActivateTab('tambahPegawai');

    // User tingkat 'biasa' (lihat router.js getAksesLevel()) tidak boleh
    // melihat atau mengakses tab Pejabat sama sekali.
    if ((typeof window.getAksesLevel === 'function' ? window.getAksesLevel() : 'biasa') === 'biasa') {
        tabBtnPejabat.remove();
        tabPejabat.remove();
    }

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
        const aksesMenu = popup.querySelector('#cs-tpAksesMenu').value;

        if (!nama || !nip || !jabatan || !pangkat) {
            alert('Nama, NIP, Jabatan, dan Pangkat harus diisi!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            await waitSupabaseAuthReady();

            // 1. Insert baris pegawai baru ke Supabase. Password default = NIP
            //    itu sendiri (dibuatkan akun Auth-nya di langkah 2 di bawah).
            const { error: insError } = await sb.from('pegawai').insert({
                id: nip, nama, jabatan, pangkat, kepeg, admin, akses_menu: aksesMenu,
                nama_bank: '', no_rekening: ''
            });
            if (insError) throw new Error(insError.message);

            // 2. Bikinkan akun Supabase Auth (password = NIP), pakai instance
            //    KEDUA (client terpisah dgn storageKey unik) supaya sesi login
            //    admin yang sedang buka Settings ini TIDAK ikut ke-logout/ke-
            //    ganti (signUp otomatis "login sbg user baru itu" kalau dipakai
            //    di instance utama).
            const emailBaru = `${nip}@simab.local`;
            try {
                const secondaryDbTp = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { storageKey: 'sb-secondary-tambahpegawai-' + Date.now() }
                });
                const { error: signUpError } = await secondaryDbTp.auth.signUp({ email: emailBaru, password: nip });
                if (signUpError && !(signUpError.message || '').toLowerCase().includes('already registered')) {
                    console.error('Gagal bikin akun Supabase:', signUpError);
                }
                try { await secondaryDbTp.auth.signOut(); } catch (e2) { /* abaikan */ }
            } catch (sbOuterErr) {
                console.error('Gagal bikin akun Supabase:', sbOuterErr);
            }

            showToast(`Pegawai baru berhasil ditambahkan. Password default login: ${nip}`);
            popup.querySelector('#cs-tpNama').value = '';
            popup.querySelector('#cs-tpNip').value = '';
            popup.querySelector('#cs-tpJabatan').value = '';
            popup.querySelector('#cs-tpPangkat').value = '';
            popup.querySelector('#cs-tpKepeg').value = '1';
            popup.querySelector('#cs-tpAdmin').value = '0';
            popup.querySelector('#cs-tpAksesMenu').value = '0';
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
        if (pwBaru.length < 6) {
            alert('Password baru minimal 6 karakter!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        const email = `${nipVal}@simab.local`;

        try {
            // 1. Verifikasi password lama BENAR dulu di Supabase (sign-in ulang
            //    dgn password lama) — kalau salah, akan otomatis error di sini
            //    dan tidak lanjut ke langkah berikutnya.
            const { error: verifyError } = await sb.auth.signInWithPassword({ email, password: pwLama });
            if (verifyError) throw new Error('Password lama salah.');

            // 2. Update password di Supabase Auth (sesi sekarang sudah pasti
            //    valid dari langkah verifikasi di atas).
            const { error: updateSbError } = await sb.auth.updateUser({ password: pwBaru });
            if (updateSbError) throw new Error(updateSbError.message);

            showToast('Password berhasil diubah');
            overlay.remove();
        } catch (e) {
            alert('Gagal: ' + (e.message || 'Password lama salah.'));
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
        const nip = localStorage.getItem('nip') || '';
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
            await waitSupabaseAuthReady();
            const { error } = await sb.from('pegawai')
                .update({ jabatan, pangkat, kepeg })
                .eq('id', nip);
            if (error) throw new Error(error.message);

            showToast('Profil berhasil diubah');

            localStorage.setItem('jabatan', jabatan);
            localStorage.setItem('pangkat', pangkat);
            localStorage.setItem('kepeg', kepeg);

            jabatanInput.setAttribute('readonly', 'readonly');
            jabatanInput.classList.add('bg-slate-100');
            pangkatSelect.disabled = true;
            pangkatSelect.classList.add('bg-slate-100');
            kepegInput.setAttribute('readonly', 'readonly');
            kepegInput.classList.add('bg-slate-100');

            btnSimpan.classList.add('hidden');
            btnUbah.classList.remove('hidden');
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

async function csLoadRekeningData(popup) {
    const loadingEl = popup.querySelector('#cs-rekeningLoading');
    const formEl = popup.querySelector('#cs-rekeningForm');

    if (!formEl.classList.contains('hidden')) return; // sudah dimuat sebelumnya

    loadingEl.classList.remove('hidden');
    formEl.classList.add('hidden');

    const nip = localStorage.getItem('nip') || '';

    try {
        await waitSupabaseAuthReady();
        const { data, error } = await sb.from('pegawai').select('nama_bank, no_rekening').eq('id', nip).single();
        if (error) throw new Error(error.message);

        popup.querySelector('#cs-rekBank').value = data?.nama_bank || '';
        popup.querySelector('#cs-rekNorek').value = data?.no_rekening || '';

        loadingEl.classList.add('hidden');
        formEl.classList.remove('hidden');
        formEl.classList.add('flex');

        csBindRekeningButtons(popup);
    } catch (e) {
        loadingEl.innerHTML = `<span class="text-red-500">❌ ${e.message || 'Gagal memuat data rekening'}</span>`;
    }
}

function csBindRekeningButtons(popup) {
    const bankSelect = popup.querySelector('#cs-rekBank');
    const norekInput = popup.querySelector('#cs-rekNorek');
    const btnUbah = popup.querySelector('#cs-btnUbahRekening');
    const btnSimpan = popup.querySelector('#cs-btnSimpanRekening');

    btnUbah.onclick = function () {
        bankSelect.disabled = false;
        bankSelect.classList.remove('bg-slate-100');
        norekInput.removeAttribute('readonly');
        norekInput.classList.remove('bg-slate-100');

        btnUbah.classList.add('hidden');
        btnSimpan.classList.remove('hidden');
        bankSelect.focus();
    };

    btnSimpan.onclick = async function () {
        const btn = this;
        const nip = localStorage.getItem('nip') || '';
        const namaBank = bankSelect.value;
        const norek = norekInput.value.trim();

        if (!namaBank || !norek) {
            alert('Nama Bank dan Nomor Rekening harus diisi!');
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';

        try {
            await waitSupabaseAuthReady();
            const { error } = await sb.from('pegawai')
                .update({ nama_bank: namaBank, no_rekening: norek })
                .eq('id', nip);
            if (error) throw new Error(error.message);

            // Buat/timpa notifikasi utk admin (id=nip -> maks 1 notifikasi
            // pending per pegawai; upsert supaya perubahan berulang sebelum
            // notifikasi lama sempat dihapus tetap aman, bukan error duplikat).
            const namaUser = localStorage.getItem('nama') || '';
            const { error: notifError } = await sb.from('notifikasi').upsert({
                id: nip, nama: namaUser, keterangan: 'Ubah Nomor Rekening',
                tanggal: new Date().toISOString()
            });
            if (notifError) console.error('Gagal membuat notifikasi:', notifError);

            showToast('Data rekening berhasil diubah');

            bankSelect.disabled = true;
            bankSelect.classList.add('bg-slate-100');
            norekInput.setAttribute('readonly', 'readonly');
            norekInput.classList.add('bg-slate-100');

            btnSimpan.classList.add('hidden');
            btnUbah.classList.remove('hidden');

            if (typeof refreshNotifikasi === 'function') refreshNotifikasi();
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
        await waitSupabaseAuthReady();
        const { data, error } = await sb.from('pejabat').select('*').eq('id', 'main').maybeSingle();
        if (error) throw new Error(error.message);

        popup.querySelector('#cs-ppkNama').value = data?.ppk_nama || '';
        popup.querySelector('#cs-ppkNip').value = data?.ppk_nip || '';
        popup.querySelector('#cs-bendaharaNama').value = data?.bendahara_nama || '';
        popup.querySelector('#cs-bendaharaNip').value = data?.bendahara_nip || '';

        loadingEl.classList.add('hidden');
        formEl.classList.remove('hidden');
        formEl.classList.add('flex');

        csBindPejabatButtons(popup);
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
            await waitSupabaseAuthReady();
            const { error } = await sb.from('pejabat')
                .update({ ppk_nama: ppkNama, ppk_nip: ppkNip, bendahara_nama: bendaharaNama, bendahara_nip: bendaharaNip })
                .eq('id', 'main');
            if (error) throw new Error(error.message);

            showToast('Data pejabat berhasil diubah');
            inputs.forEach(inp => {
                inp.setAttribute('readonly', 'readonly');
                inp.classList.add('bg-slate-100');
            });
            btnSimpan.classList.add('hidden');
            btnUbah.classList.remove('hidden');
        } catch (e) {
            alert('Error koneksi: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

// ==========================================
// Notifikasi (lonceng)
// - Data dari sheet ref_notifikasi (admin: semua, bukan admin: sesuai NIP login)
// - Update background setiap 5 menit
// - Badge menampilkan jumlah notifikasi
// - Ada tombol hapus per notifikasi
// ==========================================

const NOTIF_POLL_MS = 5 * 60 * 1000; // 5 menit
let notifPollTimer = null;
let notifDropdownOpen = false;

async function refreshNotifikasi() {
    const badge = document.getElementById('notif-badge');
    const listEl = document.getElementById('notif-list');
    if (!badge || !listEl) return; // halaman ini tidak punya lonceng notifikasi

    try {
        await waitSupabaseAuthReady();
        const { data, error } = await sb.from('notifikasi').select('*').order('tanggal', { ascending: false });
        if (error) { console.error('Gagal memuat notifikasi', error); return; }

        const rows = data || [];

        if (rows.length > 0) {
            badge.textContent = rows.length > 99 ? '99+' : String(rows.length);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        if (rows.length === 0) {
            listEl.innerHTML = `<div class="p-4 text-center text-slate-400 text-sm">Tidak ada notifikasi</div>`;
            return;
        }

        listEl.innerHTML = rows.map(n => `
            <div class="p-3 flex items-start gap-2 hover:bg-slate-50">
                <div class="flex-1 min-w-0 cursor-pointer notif-item" data-nip="${n.id}" title="Lihat detail rekening">
                    <p class="text-sm font-medium text-slate-700 truncate">${n.nama}</p>
                    <p class="text-xs text-slate-500">${n.keterangan}</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">${n.tanggal}</p>
                </div>
                <button class="notif-delete-btn text-slate-300 hover:text-red-500 text-sm shrink-0" title="Hapus notifikasi" data-id="${n.id}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');

        listEl.querySelectorAll('.notif-item').forEach(item => {
            item.onclick = () => {
                // Tutup dropdown notifikasi, lalu tampilkan popup detail rekening
                notifDropdownOpen = false;
                document.getElementById('notif-dropdown').classList.add('hidden');
                showNotifRekeningDetail(item.getAttribute('data-nip'));
            };
        });

        listEl.querySelectorAll('.notif-delete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const { error: delError } = await sb.from('notifikasi').delete().eq('id', id);
                    if (delError) throw new Error(delError.message);
                    refreshNotifikasi();
                } catch (err) {
                    alert('Error koneksi: ' + (err.message || 'Tidak diketahui'));
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                }
            };
        });
    } catch (e) {
        console.error('Gagal memuat notifikasi', e);
    }
}

// Popup detail rekening, dipanggil saat sebuah notifikasi diklik
async function showNotifRekeningDetail(nip) {

    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold text-sky-700"><i class="fa-solid fa-building-columns mr-2"></i>Data Rekening</h3>
            <button id="nrd-closeBtn" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="nrd-loading" class="text-center text-slate-400 py-6">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...
        </div>
        <div id="nrd-content" class="hidden flex-col gap-3">
            <label class="${csLabelClass}">Nama</label>
            <input id="nrd-nama" type="text" readonly class="${csInputClass} bg-slate-100">
            <label class="${csLabelClass}">NIP</label>
            <input id="nrd-nip" type="text" readonly class="${csInputClass} bg-slate-100">
            <label class="${csLabelClass}">Nama Bank</label>
            <input id="nrd-bank" type="text" readonly class="${csInputClass} bg-slate-100">
            <label class="${csLabelClass}">Nomor Rekening</label>
            <input id="nrd-norek" type="text" readonly class="${csInputClass} bg-slate-100">
        </div>
    `, 'max-w-sm');

    popup.querySelector('#nrd-closeBtn').onclick = () => overlay.remove();

    const loadingEl = popup.querySelector('#nrd-loading');
    const contentEl = popup.querySelector('#nrd-content');

    try {
        await waitSupabaseAuthReady();
        const { data, error } = await sb.from('pegawai').select('nama, nama_bank, no_rekening').eq('id', nip).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Data pegawai tidak ditemukan.');

        popup.querySelector('#nrd-nama').value = data.nama || '';
        popup.querySelector('#nrd-nip').value = nip;
        popup.querySelector('#nrd-bank').value = data.nama_bank || '';
        popup.querySelector('#nrd-norek').value = data.no_rekening || '';

        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');
        contentEl.classList.add('flex');
    } catch (e) {
        loadingEl.innerHTML = `<span class="text-red-500">❌ ${e.message || 'Gagal memuat data rekening'}</span>`;
    }
}

function toggleNotifikasiDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;
    notifDropdownOpen = !notifDropdownOpen;
    dropdown.classList.toggle('hidden', !notifDropdownOpen);
    if (notifDropdownOpen) refreshNotifikasi();
}

// Klik di luar dropdown -> tutup
document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('notif-wrapper');
    const dropdown = document.getElementById('notif-dropdown');
    if (!wrapper || !dropdown) return;
    if (notifDropdownOpen && !wrapper.contains(e.target)) {
        notifDropdownOpen = false;
        dropdown.classList.add('hidden');
    }
});

function initNotifikasiPolling() {
    if (!document.getElementById('notif-badge')) return; // halaman ini tidak punya lonceng notifikasi
    refreshNotifikasi();
    if (notifPollTimer) clearInterval(notifPollTimer);
    notifPollTimer = setInterval(refreshNotifikasi, NOTIF_POLL_MS);
}

// Initialize user name & notifikasi saat halaman dimuat
document.addEventListener('DOMContentLoaded', initializeUserName);
document.addEventListener('DOMContentLoaded', initNotifikasiPolling);

window.logout = logout;
window.showToast = showToast;
window.formatRibuan = formatRibuan;
window.generateIdUsulan = generateIdUsulan;
window.initializeUserName = initializeUserName;
window.openSettings = openSettings;
window.commonOpenOverlay = commonOpenOverlay;
window.toggleNotifikasiDropdown = toggleNotifikasiDropdown;
window.refreshNotifikasi = refreshNotifikasi;
window.showNotifRekeningDetail = showNotifRekeningDetail;
