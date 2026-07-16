/**
 * session.js
 * -----------------------------------------------------------------------
 * Session guard untuk SiMAB.
 *
 * - Login disimpan di localStorage (bukan sessionStorage), sehingga kalau
 *   user membuka tab/jendela baru dari domain yang sama, tetap dianggap
 *   login (tidak perlu login ulang).
 * - Auto-logout jika tidak ada aktivitas (klik/ketik/scroll/mouse/touch)
 *   selama IDLE_LIMIT_MS (default: 1 jam).
 * - Kalau logout terjadi di satu tab (manual lewat tombol Logout, atau
 *   otomatis karena idle), semua tab lain yang sedang terbuka ikut
 *   ter-redirect ke halaman login (sinkron lewat event 'storage').
 *
 * PENTING: taruh <script src="js/session.js"></script> SEBAGAI SCRIPT
 * PALING PERTAMA di setiap halaman yang butuh login (dashboard.html),
 * SEBELUM common.js / api.js / js halaman lain, supaya guard-nya jalan
 * lebih dulu sebelum halaman sempat memanggil API dengan sesi yang sudah
 * tidak valid.
 *
 * Fungsi logout() (klik tombol Logout) TETAP didefinisikan di common.js
 * seperti sebelumnya — file ini tidak menimpanya, hanya memanggilnya saat
 * auto-logout idle terdeteksi, supaya perilaku manual logout & auto-logout
 * konsisten (key yang dihapus & halaman tujuan sama).
 * -----------------------------------------------------------------------
 */

(function () {
    const IDLE_LIMIT_MS = 60 * 60 * 1000;   // 1 jam
    const CHECK_INTERVAL_MS = 15 * 1000;    // cek idle tiap 15 detik
    const LOGIN_PAGE = 'index.html';
    const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    function isLoggedIn() {
        return !!(localStorage.getItem('nama') && localStorage.getItem('realUrl'));
    }

    function touchActivity() {
        localStorage.setItem('lastActivity', Date.now().toString());
    }

    // Guard: kalau halaman ini butuh login tapi user belum/sudah tidak login, tendang ke login.
    if (!isLoggedIn()) {
        window.location.href = LOGIN_PAGE;
        return; // hentikan eksekusi sisa script di halaman ini
    }

    // User valid saat halaman dibuka -> anggap sebagai aktivitas awal.
    touchActivity();

    // Catat aktivitas user supaya timer idle ter-reset.
    ACTIVITY_EVENTS.forEach(evt => {
        window.addEventListener(evt, touchActivity, { passive: true });
    });

    // Cek berkala apakah sudah melewati batas idle.
    function checkIdle() {
        if (!isLoggedIn()) return; // sudah logout dari tab lain, biarkan handler 'storage' yang redirect

        const last = parseInt(localStorage.getItem('lastActivity') || '0', 10);
        if (!last) {
            touchActivity();
            return;
        }
        if (Date.now() - last > IDLE_LIMIT_MS) {
            // Hapus key sesi yang sama persis dengan yang dihapus logout() di common.js,
            // supaya perilaku konsisten, lalu redirect dengan alasan 'idle'.
            ['nama', 'nip', 'realUrl', 'admin', 'jabatan', 'pangkat', 'kepeg', 'kantor', 'lastActivity']
                .forEach(k => localStorage.removeItem(k));
            window.location.href = LOGIN_PAGE + '?reason=idle';
        }
    }
    setInterval(checkIdle, CHECK_INTERVAL_MS);

    // Sinkron antar tab: kalau di tab lain sesi dihapus (logout manual/idle), tab ini ikut ter-redirect.
    window.addEventListener('storage', (e) => {
        if (e.key === 'nama' && !e.newValue) {
            window.location.href = LOGIN_PAGE;
        }
    });

    // Helper opsional: halaman lain bisa pakai ini utk menampilkan nama user, dsb.
    window.getSessionUser = function () {
        return {
            nama: localStorage.getItem('nama') || 'Guest',
            nip: localStorage.getItem('nip') || '',
            realUrl: localStorage.getItem('realUrl') || '',
            admin: localStorage.getItem('admin') || '',
            jabatan: localStorage.getItem('jabatan') || '',
            pangkat: localStorage.getItem('pangkat') || '',
            kepeg: localStorage.getItem('kepeg') || ''
        };
    };
})();
