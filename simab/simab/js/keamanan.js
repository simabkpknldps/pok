/**
 * Keamanan akun
 * - Pegawai yang masuk dengan password = NIP dipaksa: (1) mendaftarkan nomor WA dan
 *   memverifikasinya dengan kode yang dikirim bot lewat WhatsApp, (2) mengganti password.
 * - Lupa password (halaman login): kode reset dikirim ke WA terverifikasi.
 * - Semua pembuatan kode dan perubahan data dilakukan Edge Function "akun".
 */
(function () {
    const FN = () => SUPABASE_URL + '/functions/v1/akun';
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Aturan password: minimal 8 karakter, huruf dan angka, tidak sama dengan NIP.
    window.akunValidasiPassword = function (pw, nip) {
        if (String(pw).length < 8) return 'Password minimal 8 karakter.';
        if (String(pw) === String(nip || '')) return 'Password tidak boleh sama dengan NIP.';
        if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password harus mengandung huruf dan angka.';
        return '';
    };

    async function panggil(body, pakaiLogin) {
        const h = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
        if (pakaiLogin) {
            await waitSupabaseAuthReady();
            const { data } = await sb.auth.getSession();
            const jwt = data && data.session && data.session.access_token;
            if (!jwt) throw Object.assign(new Error('Sesi login habis, silakan login ulang.'), { status: 401 });
            h.Authorization = 'Bearer ' + jwt;
        }
        let r;
        try { r = await fetch(FN(), { method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); }
        catch (e) { throw Object.assign(new Error('Tidak dapat menghubungi server.'), { jaringan: true }); }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(j.error || ('Error ' + r.status)), { status: r.status });
        return j;
    }

    const CSS = `
    #ak-ov{position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif}
    #ak-box{background:#fff;border-radius:20px;width:100%;max-width:420px;max-height:92vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3);color:#1d1d1f}
    #ak-box h3{margin:0 0 4px;font-size:18px;font-weight:700}
    #ak-box p.s{margin:0 0 14px;font-size:13px;color:#6e6e73}
    #ak-box label{display:block;font-size:12px;font-weight:600;color:#6e6e73;margin:12px 0 4px}
    #ak-box input{width:100%;height:44px;border:1px solid #d2d2d7;border-radius:12px;padding:0 12px;font-size:15px;box-sizing:border-box;font-family:inherit}
    #ak-box input:focus{outline:2px solid #0071e3;border-color:transparent}
    #ak-box .b{width:100%;height:44px;margin-top:16px;border:0;border-radius:12px;background:#0071e3;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
    #ak-box .b:disabled{opacity:.6;cursor:wait}
    #ak-box .b2{width:100%;height:40px;margin-top:8px;border:0;border-radius:12px;background:#f2f2f5;color:#1d1d1f;font-size:14px;cursor:pointer}
    #ak-box .e{margin-top:12px;padding:9px 12px;border-radius:10px;background:rgba(255,59,48,.1);color:#c0281d;font-size:13px}
    #ak-box .o{margin-top:12px;padding:9px 12px;border-radius:10px;background:rgba(52,199,89,.12);color:#248a3d;font-size:13px}
    #ak-box .stp{font-size:11px;font-weight:700;letter-spacing:.06em;color:#0071e3;text-transform:uppercase;margin-bottom:6px}`;

    function overlay() {
        if (!document.getElementById('ak-css')) { const s = document.createElement('style'); s.id = 'ak-css'; s.textContent = CSS; document.head.appendChild(s); }
        const old = document.getElementById('ak-ov'); if (old) old.remove();
        const ov = document.createElement('div'); ov.id = 'ak-ov';
        ov.innerHTML = '<div id="ak-box"></div>';
        document.body.appendChild(ov);
        return { ov, box: ov.querySelector('#ak-box') };
    }
    const pesan = (box, teks, ok) => { let e = box.querySelector('.pesan'); if (!e) { e = document.createElement('div'); box.appendChild(e); } e.className = 'pesan ' + (ok ? 'o' : 'e'); e.textContent = teks; };
    const bersih = (box) => { const e = box.querySelector('.pesan'); if (e) e.remove(); };
    async function kerja(btn, fn, box) {
        const awal = btn.textContent; btn.disabled = true; btn.textContent = 'Memproses...'; bersih(box);
        try { await fn(); } catch (e) { pesan(box, e.message || String(e)); } finally { btn.disabled = false; btn.textContent = awal; }
    }

    // ===== Langkah daftarkan nomor WA (sudah login) =====
    // onSelesai dipanggil setelah nomor terverifikasi
    function langkahWa(box, { judulLangkah, bolehNanti, onSelesai, onNanti, onLewatBilaTidakAda }) {
        box.innerHTML = `${judulLangkah ? `<div class="stp">${judulLangkah}</div>` : ''}
            <h3>Nomor WhatsApp</h3>
            <p class="s">Nomor ini dipakai untuk mengirim kode jika Anda lupa password. Kode verifikasi dikirim lewat WhatsApp.</p>
            <label for="ak-wa">Nomor WA</label>
            <input id="ak-wa" type="tel" inputmode="tel" placeholder="0812xxxxxxxx" autocomplete="tel">
            <button class="b" id="ak-kirim">Kirim kode</button>
            ${bolehNanti ? '<button class="b2" id="ak-nanti">Nanti saja</button>' : ''}`;
        if (bolehNanti) box.querySelector('#ak-nanti').onclick = onNanti;
        box.querySelector('#ak-kirim').onclick = function () {
            const wa = box.querySelector('#ak-wa').value.trim();
            kerja(this, async () => {
                if (!wa) throw new Error('Isi nomor WA terlebih dahulu.');
                try { await panggil({ aksi: 'wa_kirim', no_wa: wa }, true); }
                catch (e) { if ((e.status === 404 || e.jaringan) && onLewatBilaTidakAda) return onLewatBilaTidakAda(); throw e; }
                langkahKode(box, { wa, onSelesai, bolehNanti, onNanti, judulLangkah, onLewatBilaTidakAda });
            }, box);
        };
    }
    function langkahKode(box, o) {
        box.innerHTML = `${o.judulLangkah ? `<div class="stp">${o.judulLangkah}</div>` : ''}
            <h3>Masukkan kode</h3>
            <p class="s">Kode 6 digit sudah dikirim ke WhatsApp <b>${esc(o.wa)}</b>. Berlaku 10 menit.</p>
            <label for="ak-kode">Kode verifikasi</label>
            <input id="ak-kode" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code">
            <button class="b" id="ak-ver">Verifikasi</button>
            <button class="b2" id="ak-ulang">Ganti nomor / kirim ulang</button>`;
        box.querySelector('#ak-ulang').onclick = () => langkahWa(box, o);
        box.querySelector('#ak-ver').onclick = function () {
            const kode = box.querySelector('#ak-kode').value.trim();
            kerja(this, async () => {
                if (!/^\d{6}$/.test(kode)) throw new Error('Kode terdiri dari 6 angka.');
                await panggil({ aksi: 'wa_verifikasi', kode }, true);
                o.onSelesai();
            }, box);
        };
    }

    // ===== Langkah ganti password setelah login (paksa) =====
    function langkahPassword(box, { judulLangkah, onSelesai }) {
        const nip = localStorage.getItem('nip') || '';
        box.innerHTML = `${judulLangkah ? `<div class="stp">${judulLangkah}</div>` : ''}
            <h3>Buat password baru</h3>
            <p class="s">Password awal (sama dengan NIP) tidak aman. Minimal 8 karakter, huruf dan angka, tidak boleh sama dengan NIP.</p>
            <label for="ak-pw1">Password baru</label>
            <input id="ak-pw1" type="password" autocomplete="new-password">
            <label for="ak-pw2">Ulangi password baru</label>
            <input id="ak-pw2" type="password" autocomplete="new-password">
            <button class="b" id="ak-simpan">Simpan password</button>`;
        box.querySelector('#ak-simpan').onclick = function () {
            const a = box.querySelector('#ak-pw1').value, b2 = box.querySelector('#ak-pw2').value;
            kerja(this, async () => {
                const err = window.akunValidasiPassword(a, nip);
                if (err) throw new Error(err);
                if (a !== b2) throw new Error('Konfirmasi password tidak sama.');
                await waitSupabaseAuthReady();
                const { error } = await sb.auth.updateUser({ password: a });
                if (error) throw new Error(error.message);
                try { localStorage.removeItem('wajibGanti'); } catch (e) { }
                onSelesai();
            }, box);
        };
    }

    async function sudahPunyaWa() {
        try {
            await waitSupabaseAuthReady();
            const nip = localStorage.getItem('nip') || '';
            const { data, error } = await sb.from('pegawai_kontak').select('terverifikasi_pada').eq('nip', nip).maybeSingle();
            if (error) return null;           // tabel belum ada -> tidak diketahui
            return !!(data && data.terverifikasi_pada);
        } catch (e) { return null; }
    }

    // Dialog bagi yang wajib ganti password (tidak bisa ditutup)
    async function dialogPaksa() {
        const { ov, box } = overlay();
        const selesai = () => { ov.remove(); if (typeof showToast === 'function') showToast('Akun Anda sudah aman. Terima kasih.'); };
        const adaWa = await sudahPunyaWa();
        const keLangkahPw = (nomor) => langkahPassword(box, { judulLangkah: nomor ? 'Langkah 2 dari 2' : '', onSelesai: selesai });
        if (adaWa === true || adaWa === null) { keLangkahPw(false); return; }
        langkahWa(box, {
            judulLangkah: 'Langkah 1 dari 2', bolehNanti: false,
            onSelesai: () => keLangkahPw(true),
            onLewatBilaTidakAda: () => keLangkahPw(false)
        });
    }

    // Dialog ajakan daftar nomor WA (boleh ditunda; untuk yang passwordnya sudah diganti)
    function dialogDaftarWa({ bolehNanti }) {
        const { ov, box } = overlay();
        langkahWa(box, {
            bolehNanti, onNanti: () => { try { sessionStorage.setItem('ak_nanti', '1'); } catch (e) { } ov.remove(); },
            onSelesai: () => { ov.remove(); if (typeof showToast === 'function') showToast('Nomor WA terverifikasi'); window.dispatchEvent(new Event('akun-wa-berubah')); }
        });
        // tombol tutup lewat klik latar bila boleh ditunda
        if (bolehNanti) ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    }
    window.akunDaftarWa = () => dialogDaftarWa({ bolehNanti: true });

    // Dipanggil dashboard saat dibuka
    window.keamananPeriksa = async function () {
        // Sesi lama (login sebelum fitur ini ada): cek sekali per sesi apakah password masih = NIP,
        // memakai klien terpisah agar sesi yang sedang berjalan tidak terganggu.
        try {
            const nip0 = localStorage.getItem('nip') || '';
            if (localStorage.getItem('wajibGanti') !== '1' && nip0 && sessionStorage.getItem('ak_cek') !== '1') {
                sessionStorage.setItem('ak_cek', '1');
                const tmp = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
                const { data: d0 } = await tmp.auth.signInWithPassword({ email: nip0 + '@simab.local', password: nip0 });
                if (d0 && d0.session) localStorage.setItem('wajibGanti', '1');
            }
        } catch (e) { /* abaikan */ }
        if (localStorage.getItem('wajibGanti') === '1') return dialogPaksa();
        try { if (sessionStorage.getItem('ak_nanti') === '1') return; } catch (e) { }
        const ada = await sudahPunyaWa();
        if (ada === false) dialogDaftarWa({ bolehNanti: true });
    };

    // Tab "Nomor WA" di Pengaturan
    window.csLoadWaTab = async function (popup) {
        const box = popup.querySelector('#cs-tabWA');
        if (!box) return;
        box.innerHTML = '<div class="text-center text-slate-400 py-6"><i class="fa-solid fa-spinner fa-spin"></i></div>';
        let info = 'Belum ada nomor WA terverifikasi.';
        try {
            await waitSupabaseAuthReady();
            const { data } = await sb.from('pegawai_kontak').select('no_wa,terverifikasi_pada').eq('nip', localStorage.getItem('nip') || '').maybeSingle();
            if (data && data.terverifikasi_pada) {
                const n = String(data.no_wa);
                info = 'Nomor terverifikasi: ' + n.slice(0, 4) + '••••••' + n.slice(-3);
            }
        } catch (e) { /* tabel belum ada */ }
        box.innerHTML = `<div class="text-sm font-semibold">${esc(info)}</div>
            <div class="text-xs" style="color:#6e6e73;">Dipakai untuk mengirim kode jika Anda lupa password.</div>
            <div><button id="cs-btnWa" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium"><i class="fa-brands fa-whatsapp mr-1"></i> Daftarkan / ubah nomor WA</button></div>`;
        box.querySelector('#cs-btnWa').onclick = () => dialogDaftarWa({ bolehNanti: true });
    };

    // ===== Lupa password (halaman login) =====
    window.akunLupaPassword = function (nipAwal) {
        const { ov, box } = overlay();
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        let nip = '';
        const langkah1 = () => {
            box.innerHTML = `<h3>Lupa password</h3>
                <p class="s">Masukkan NIP. Kode reset dikirim lewat WhatsApp ke nomor yang sudah Anda daftarkan di SiMAB.</p>
                <label for="ak-nip">NIP</label>
                <input id="ak-nip" inputmode="numeric" autocomplete="username" value="${esc(nipAwal || '')}">
                <button class="b" id="ak-lk">Kirim kode</button>
                <button class="b2" id="ak-batal">Batal</button>`;
            box.querySelector('#ak-batal').onclick = () => ov.remove();
            box.querySelector('#ak-lk').onclick = function () {
                nip = box.querySelector('#ak-nip').value.trim();
                kerja(this, async () => { await panggil({ aksi: 'lupa_kirim', nip }); langkah2(); }, box);
            };
        };
        const langkah2 = () => {
            box.innerHTML = `<h3>Atur password baru</h3>
                <p class="s">Jika NIP terdaftar dan nomor WA-nya sudah terverifikasi, kode 6 digit dikirim ke WhatsApp (berlaku 10 menit). Belum punya nomor WA terdaftar? Hubungi admin untuk reset.</p>
                <label for="ak-k">Kode dari WhatsApp</label>
                <input id="ak-k" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
                <label for="ak-p1">Password baru</label>
                <input id="ak-p1" type="password" autocomplete="new-password">
                <label for="ak-p2">Ulangi password baru</label>
                <input id="ak-p2" type="password" autocomplete="new-password">
                <button class="b" id="ak-rs">Simpan password baru</button>
                <button class="b2" id="ak-bt">Batal</button>`;
            box.querySelector('#ak-bt').onclick = () => ov.remove();
            box.querySelector('#ak-rs').onclick = function () {
                const kode = box.querySelector('#ak-k').value.trim(), p1 = box.querySelector('#ak-p1').value, p2 = box.querySelector('#ak-p2').value;
                kerja(this, async () => {
                    if (!/^\d{6}$/.test(kode)) throw new Error('Kode terdiri dari 6 angka.');
                    const err = window.akunValidasiPassword(p1, nip); if (err) throw new Error(err);
                    if (p1 !== p2) throw new Error('Konfirmasi password tidak sama.');
                    await panggil({ aksi: 'lupa_reset', nip, kode, password_baru: p1 });
                    box.innerHTML = '<h3>Password diubah</h3><p class="s">Silakan masuk dengan password baru Anda.</p><button class="b" id="ak-ok">Tutup</button>';
                    box.querySelector('#ak-ok').onclick = () => ov.remove();
                }, box);
            };
        };
        langkah1();
    };

    document.addEventListener('DOMContentLoaded', () => {
        // hanya di dashboard (ada sidebar); index.html tidak memicu dialog paksa
        if (document.getElementById('app') && localStorage.getItem('nip')) setTimeout(() => window.keamananPeriksa(), 1200);
    });
})();
