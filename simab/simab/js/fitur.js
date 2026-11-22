/**
 * Pengaturan Fitur per kantor
 * -----------------------------------------------------------------------
 * Tiap kantor punya daftar fitur aktif/nonaktif sendiri (tabel Supabase
 * `fitur_kantor`: kantor_id, fitur, aktif). Mengubahnya di satu kantor TIDAK
 * memengaruhi kantor lain. Fitur yang belum pernah diatur memakai nilai
 * bawaan (default) pada FITUR_DAFTAR di bawah, jadi perilaku lama tidak berubah.
 *
 * Penerapan: tombol sidebar bertanda data-fitur disembunyikan, halaman
 * ditolak di router, Jarwo & Dashboard Pimpinan ditolak. Hanya admin dan
 * superadmin yang bisa mengubah (tab "Pengaturan Fitur" di Pengaturan).
 * -----------------------------------------------------------------------
 */
(function () {
    // kunci = nilai di DB. page = nama halaman router. sel = elemen yang disembunyikan.
    const FITUR_DAFTAR = [
        { kunci: 'dashboard_pimpinan', nama: 'Dashboard Pimpinan', desc: 'Ringkasan untuk pimpinan; muncul otomatis setelah login pejabat berjabatan Kepala.', def: true, sel: ['#nav-pimpinan'] },
        { kunci: 'statistik', nama: 'Statistik', desc: 'Halaman grafik dan statistik anggaran.', def: true, page: 'statistik', sel: ['[onclick="navigate(\'statistik\')"]'] },
        { kunci: 'rpd', nama: 'RPD', desc: 'Rencana penarikan dana per bulan.', def: true, page: 'rpd', sel: ['[onclick="navigate(\'rpd\')"]'] },
        { kunci: 'impor_pok', nama: 'Impor POK', desc: 'Unggah dan impor data POK dari berkas.', def: true, page: 'pok_impor', sel: ['#nav-pok-impor'] },
        { kunci: 'impor_pegawai', nama: 'Impor Pegawai', desc: 'Unggah data pegawai dari berkas Excel.', def: true, page: 'pegawai_impor', sel: ['#nav-pegawai-impor'] },
        { kunci: 'perjadin', nama: 'Perjadinku', desc: 'Ringkasan perjalanan dinas pribadi pegawai.', def: true, page: 'perjadin', sel: ['[onclick="navigate(\'perjadin\')"]'] },
        { kunci: 'perbantuan', nama: 'Perbantuan', desc: 'Pencatatan usulan dan pelaksanaan perbantuan.', def: true, page: 'perbantuan', sel: ['[onclick="navigate(\'perbantuan\')"]'] },
        { kunci: 'kalender', nama: 'Kalender', desc: 'Kalender kegiatan dan perjalanan dinas.', def: true, page: 'kalender', sel: ['[onclick="navigate(\'kalender\')"]'] },
        { kunci: 'info_perbendaharaan', nama: 'Info Perbendaharaan', desc: '', def: true, page: 'info', sel: ['#nav-info'] },
        { kunci: 'jarwo', nama: 'Jarwo AI', desc: 'Asisten AI untuk bertanya dan merekam dokumen (tombol melayang dan menu).', def: true, sel: ['#jw-fab', '#jw-panel', '[onclick*="toggleJarwo"]'] }
    ];
    window.FITUR_DAFTAR = FITUR_DAFTAR;

    const kunciCache = () => 'fitur_' + (typeof getKantorAktif === 'function' ? getKantorAktif() : (localStorage.getItem('kantor') || ''));
    let peta = null;   // { kunci: boolean }

    function bacaCache() {
        try { return JSON.parse(localStorage.getItem(kunciCache()) || 'null') || {}; } catch (e) { return {}; }
    }
    function tulisCache(m) {
        try { localStorage.setItem(kunciCache(), JSON.stringify(m)); } catch (e) { }
    }

    function fiturAktif(kunci) {
        if (!peta) peta = bacaCache();
        if (Object.prototype.hasOwnProperty.call(peta, kunci)) return !!peta[kunci];
        const f = FITUR_DAFTAR.find(x => x.kunci === kunci);
        return f ? f.def : true;
    }
    window.fiturAktif = fiturAktif;

    // Fitur yang menaungi sebuah halaman router (atau null kalau halaman inti).
    window.fiturUntukHalaman = function (page) {
        const f = FITUR_DAFTAR.find(x => x.page === page);
        return f ? f.kunci : null;
    };

    function terapkanFitur() {
        FITUR_DAFTAR.forEach(f => {
            const off = !fiturAktif(f.kunci);
            (f.sel || []).forEach(s => {
                document.querySelectorAll(s).forEach(el => {
                    if (off) el.setAttribute('data-fitur-off', '1'); else el.removeAttribute('data-fitur-off');
                });
            });
        });
    }
    window.terapkanFitur = terapkanFitur;

    async function muatFitur() {
        try {
            await waitSupabaseAuthReady();
            const { data, error } = await sb.from('fitur_kantor').select('fitur,aktif').eq('kantor_id', getKantorAktif());
            if (error) throw error;
            const m = {};
            (data || []).forEach(r => { m[r.fitur] = !!r.aktif; });
            peta = m;
            tulisCache(m);
        } catch (e) {
            peta = bacaCache();   // tabel belum ada / offline -> pakai cache / bawaan
        }
        terapkanFitur();
        return peta;
    }
    window.muatFitur = muatFitur;

    // ---- Gaya: elemen yang dimatikan fiturnya ----
    const st = document.createElement('style');
    st.textContent = '[data-fitur-off]{display:none !important}';
    document.head.appendChild(st);

    // Terapkan dari cache sedini mungkin, lalu segarkan dari database.
    const mulai = () => {
        terapkanFitur();
        muatFitur();
        // elemen yang dibuat belakangan (mis. tombol Jarwo) ikut disembunyikan
        let t = null;
        new MutationObserver(() => { clearTimeout(t); t = setTimeout(terapkanFitur, 120); })
            .observe(document.body, { childList: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else mulai();

    // ============================================================
    // Tab "Pengaturan Fitur" di popup Pengaturan (admin & superadmin)
    // ============================================================
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    window.csLoadFiturTab = async function (popup) {
        const box = popup.querySelector('#cs-tabFitur');
        if (!box) return;
        box.innerHTML = '<div class="text-center text-slate-400 py-6"><i class="fa-solid fa-spinner fa-spin"></i></div>';
        const kantor = getKantorAktif();
        let kantorNama = kantor || '-';
        try {
            await waitSupabaseAuthReady();
            const k = await sb.from('kantor').select('nama').eq('id', kantor).maybeSingle();
            if (k.data && k.data.nama) kantorNama = k.data.nama;
        } catch (e) { /* pakai kode */ }
        await muatFitur();

        box.innerHTML = `
            <div class="text-sm font-semibold" style="color:#1d1d1f;">${esc(kantorNama)}</div>
            <div id="cs-fiturList" class="flex flex-col"></div>`;

        const list = box.querySelector('#cs-fiturList');
        list.innerHTML = FITUR_DAFTAR.map(f => `
            <label class="flex items-center gap-3 py-2.5 cursor-pointer" style="border-bottom:1px solid #eef0f3;">
                <span class="flex-1 min-w-0 text-sm font-medium" style="color:#1d1d1f;">${esc(f.nama)}</span>
                <span class="cs-switch">
                    <input type="checkbox" data-fitur="${esc(f.kunci)}" ${fiturAktif(f.kunci) ? 'checked' : ''}>
                    <span class="cs-switch-track"></span>
                </span>
            </label>`).join('');

        list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.onchange = async () => {
                const kunci = cb.dataset.fitur;
                const aktif = cb.checked;
                cb.disabled = true;
                try {
                    await waitSupabaseAuthReady();
                    const { error } = await sb.from('fitur_kantor').upsert(
                        { kantor_id: getKantorAktif(), fitur: kunci, aktif, diubah_oleh: localStorage.getItem('nip') || null, diubah_pada: new Date().toISOString() },
                        { onConflict: 'kantor_id,fitur' }
                    );
                    if (error) throw new Error(error.message);
                    if (!peta) peta = {};
                    peta[kunci] = aktif;
                    tulisCache(peta);
                    terapkanFitur();
                    if (typeof showToast === 'function') showToast((aktif ? 'Fitur diaktifkan: ' : 'Fitur dinonaktifkan: ') + (FITUR_DAFTAR.find(f => f.kunci === kunci) || {}).nama);
                } catch (e) {
                    cb.checked = !aktif;   // batalkan tampilan
                    if (typeof showToast === 'function') showToast('Gagal menyimpan: ' + e.message + ' (pastikan SQL fitur sudah dijalankan)');
                } finally {
                    cb.disabled = false;
                }
            };
        });
    };
})();
