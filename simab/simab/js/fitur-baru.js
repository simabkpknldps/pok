/**
 * Info fitur baru:
 *  1) Popup di awal (sekali per sesi login) berisi daftar fitur baru, dengan kotak
 *     "Jangan tampilkan lagi" (disimpan per pegawai & per versi popup).
 *  2) Setiap update fitur masuk ke lonceng notifikasi; saat diklik detailnya tampil
 *     dan notifikasinya hilang (status dibaca disimpan di browser per pegawai).
 *
 * CARA MENAMBAH UPDATE BARU: tambahkan satu objek di paling atas FITUR_UPDATE.
 * Mau popup muncul lagi untuk semua orang: naikkan FITUR_POPUP.versi.
 */
const FITUR_POPUP = {
    versi: '2026-11-27',
    judul: 'Fitur baru di SiMAB',
    item: [
        ['fa-solid fa-file-signature', 'Konsep LPT otomatis', 'Jarwo menyusun konsep Laporan Perjalanan Dinas dari PDF Surat Tugas, bisa diunduh Word dan PDF, lengkap dengan kop kantor, TTE, dan halaman foto dokumentasi.'],
        ['fa-solid fa-building', 'Pejabat & kop surat per kantor', 'Pengaturan Pejabat dan kop LPT kini terpisah untuk tiap kantor.'],
        ['fa-solid fa-ellipsis-vertical', 'Daftar Kegiatan lebih ringkas', 'Kolom Status dan Aksi tetap terlihat saat tabel digeser, dan aksi dibuka lewat tombol titik tiga.'],
        ['fa-solid fa-user-clock', 'Monitoring User', 'Admin dapat melihat siapa yang sedang login dan login terakhir tiap pegawai.']
    ]
};

// Terbaru paling atas. untuk: 'semua' | 'admin' (admin kantor & superadmin)
const FITUR_UPDATE = [
    { id: 'u-2026-11-27-monitoring', tanggal: '2026-11-27', untuk: 'admin', judul: 'Monitoring User', isi: 'Menu baru Monitoring User di sidebar menampilkan siapa yang sedang login, halaman yang dibuka, dan login terakhir tiap pegawai.' }
];

(function () {
    const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; };
    const nip = () => ls('nip') || '';
    const adm = () => ls('admin') === '1' || ls('superadmin') === '1';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const kunciBaca = () => 'fiturBacaId_' + nip();

    function sudahBaca() { try { return new Set(JSON.parse(ls(kunciBaca()) || '[]')); } catch (e) { return new Set(); } }
    function tandaiBaca(id) { const s = sudahBaca(); s.add(id); ls(kunciBaca(), JSON.stringify([...s])); }

    window.fiturBaruBelumDibaca = function () {
        const s = sudahBaca();
        return FITUR_UPDATE.filter(u => (u.untuk !== 'admin' || adm()) && !s.has(u.id));
    };

    function tutup() { const m = document.getElementById('fb-modal'); if (m) m.remove(); }
    function modal(html) {
        tutup();
        const w = document.createElement('div');
        w.id = 'fb-modal';
        w.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:16px';
        w.innerHTML = `<div style="background:#fff;border-radius:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;padding:24px;box-shadow:0 20px 60px -10px rgba(0,0,0,.35)">${html}</div>`;
        w.addEventListener('click', e => { if (e.target === w) tutup(); });
        document.body.appendChild(w);
        return w;
    }

    // Detail satu update (dari lonceng): tandai dibaca -> hilang dari daftar
    window.bukaFiturUpdate = function (id) {
        const u = FITUR_UPDATE.find(x => x.id === id);
        if (!u) return;
        tandaiBaca(id);
        if (typeof refreshNotifikasi === 'function') refreshNotifikasi();
        const w = modal(`<div style="font-size:12px;color:#6e6e73">${esc(u.tanggal)} · Pembaruan fitur</div>
            <h3 style="font-size:18px;font-weight:700;margin:4px 0 10px">${esc(u.judul)}</h3>
            <p style="font-size:14px;line-height:1.55;color:#1d1d1f">${esc(u.isi)}</p>
            <div style="text-align:right;margin-top:18px"><button id="fb-ok" style="background:#0071e3;color:#fff;border:0;border-radius:10px;padding:8px 18px;font-weight:600;cursor:pointer">Tutup</button></div>`);
        w.querySelector('#fb-ok').onclick = tutup;
    };

    function tampilPopup() {
        if (!nip()) return;
        const kunci = 'fiturBaruSembunyi_' + nip();
        if (ls(kunci) === FITUR_POPUP.versi) return;
        try { if (sessionStorage.getItem('fiturBaruTampil') === FITUR_POPUP.versi) return; } catch (e) { }
        const daftar = FITUR_POPUP.item.map(([ik, jd, tx]) => `
            <div style="display:flex;gap:12px;margin-top:14px">
                <div style="width:38px;height:38px;border-radius:11px;background:#e8f1fd;color:#0071e3;display:flex;align-items:center;justify-content:center;flex:none"><i class="${ik}"></i></div>
                <div><div style="font-weight:600;font-size:14px">${esc(jd)}</div><div style="font-size:12.5px;color:#6e6e73;line-height:1.5">${esc(tx)}</div></div>
            </div>`).join('');
        const w = modal(`<h3 style="font-size:19px;font-weight:700"><i class="fa-solid fa-wand-magic-sparkles" style="color:#0071e3"></i> ${esc(FITUR_POPUP.judul)}</h3>
            ${daftar}
            <label style="display:flex;align-items:center;gap:8px;margin-top:20px;font-size:13px;cursor:pointer"><input type="checkbox" id="fb-skip"> Jangan tampilkan lagi</label>
            <div style="text-align:right;margin-top:14px"><button id="fb-ok" style="background:#0071e3;color:#fff;border:0;border-radius:10px;padding:9px 22px;font-weight:600;cursor:pointer">Mengerti</button></div>`);
        const simpan = () => {
            try { sessionStorage.setItem('fiturBaruTampil', FITUR_POPUP.versi); } catch (e) { }
            const c = document.getElementById('fb-skip');
            if (c && c.checked) ls(kunci, FITUR_POPUP.versi);
        };
        w.querySelector('#fb-ok').onclick = () => { simpan(); tutup(); };
        w.addEventListener('click', e => { if (e.target === w) simpan(); });
        try { sessionStorage.setItem('fiturBaruTampil', FITUR_POPUP.versi); } catch (e) { }
    }

    window.tampilPopupFiturBaru = tampilPopup;
    const mulai = () => setTimeout(tampilPopup, 1200);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else mulai();
})();
