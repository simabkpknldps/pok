/**
 * Sinyal "aktif" pengguna (heartbeat) untuk halaman Monitoring User.
 * - Beat pertama per sesi tab mengisi login_terakhir; beat berikutnya hanya
 *   memperbarui aktif_terakhir (+ halaman). Berjalan tiap 60 dtk saat tab tampak.
 * - Gagal mengirim TIDAK mengganggu aplikasi (tabel belum dibuat pun aman).
 */
(function () {
    const JEDA = 60000;
    let mati = false, timer = null;
    const ls = k => { try { return localStorage.getItem(k) || null; } catch (e) { return null; } };
    const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { } return null; };

    function perangkat() {
        const u = navigator.userAgent || '';
        const os = /Windows/i.test(u) ? 'Windows' : /Android/i.test(u) ? 'Android' : /iPhone|iPad|iPod/i.test(u) ? 'iOS' : /Mac OS X|Macintosh/i.test(u) ? 'macOS' : /Linux/i.test(u) ? 'Linux' : 'Lainnya';
        const br = /Edg\//i.test(u) ? 'Edge' : /Firefox|FxiOS/i.test(u) ? 'Firefox' : /Chrome|CriOS/i.test(u) ? 'Chrome' : /Safari/i.test(u) ? 'Safari' : 'Browser';
        return os + ' · ' + br;
    }

    async function beat() {
        if (mati || !window.sb || !ls('nip')) return;
        try {
            const judul = (document.getElementById('page-title') || {}).innerText || '';
            const baris = {
                nip: ls('nip'), nama: ls('nama'), jabatan: ls('jabatan'), kantor_id: ls('kantor'),
                aktif_terakhir: new Date().toISOString(), keluar_pada: null,
                halaman: judul, perangkat: perangkat()
            };
            if (!ss('hbMulai')) { baris.login_terakhir = new Date().toISOString(); }
            const { error } = await window.sb.from('sesi_user').upsert(baris, { onConflict: 'nip' });
            if (error) { mati = true; return; }       // tabel belum ada / ditolak: berhenti diam-diam
            ss('hbMulai', '1');
        } catch (e) { }
    }

    function mulai() {
        beat();
        timer = setInterval(() => { if (document.visibilityState === 'visible') beat(); }, JEDA);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(); });
    }

    // Dipanggil saat logout: tandai keluar (maks. 1,2 dtk)
    window.tandaiKeluarSesi = async function () {
        try {
            if (timer) clearInterval(timer);
            mati = true;
            if (!window.sb || !ls('nip')) return;
            await Promise.race([
                window.sb.from('sesi_user').update({ keluar_pada: new Date().toISOString() }).eq('nip', ls('nip')),
                new Promise(r => setTimeout(r, 1200))
            ]);
        } catch (e) { }
    };

    if (typeof waitSupabaseAuthReady === 'function') waitSupabaseAuthReady().then(mulai).catch(() => { });
    else setTimeout(mulai, 2000);
})();
