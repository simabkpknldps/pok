/**
 * Info Perbendaharaan
 * - Halaman: pages/info.html, entry initInfoPage() (PAGE_INIT.info)
 * - Data: tabel Supabase info_perbendaharaan (umum untuk semua kantor)
 * - Jarwo mencari info baru lewat Edge Function (mode "info_perbendaharaan"). Hasilnya disimpan
 *   sebagai jenis 'kabar' (asal 'jarwo'); penanda "Baru" muncul di sidebar sampai halaman dibuka.
 * - Pencarian otomatis: admin/superadmin yang membuka SiMAB memicu pencarian bila yang terakhir > 24 jam.
 */
(function () {
    const JAM_CEK = 24;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const kunciLihat = () => 'info_dilihat_' + (localStorage.getItem('nip') || '');
    const bolehKelola = () => localStorage.getItem('admin') === '1' || localStorage.getItem('superadmin') === '1';
    let rows = [];
    let filter = 'Semua';
    let sedangCari = false;

    function tgl(iso) {
        const d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    async function muat() {
        await waitSupabaseAuthReady();
        const { data, error } = await sb.from('info_perbendaharaan').select('*').order('urutan', { ascending: true }).order('id', { ascending: true });
        if (error) throw new Error(error.message);
        rows = data || [];
        return rows;
    }

    // ---------- penanda "Baru" ----------
    function pasangBadge(n) {
        const b = document.getElementById('nav-info');
        if (!b) return;
        let el = b.querySelector('.inf-nav-badge');
        if (!n) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('span');
            el.className = 'inf-nav-badge';
            el.style.cssText = 'margin-left:auto;background:#e11d48;color:#fff;border-radius:9999px;font-size:10.5px;font-weight:700;padding:1px 7px;';
            b.appendChild(el);
        }
        el.textContent = n > 9 ? '9+' : String(n);
    }

    async function hitungBaru() {
        try {
            await waitSupabaseAuthReady();
            const lihat = localStorage.getItem(kunciLihat());
            let q = sb.from('info_perbendaharaan').select('id', { count: 'exact', head: true }).neq('asal', 'awal');
            if (lihat) q = q.gt('dibuat_pada', lihat);
            const { count, error } = await q;
            if (error) return 0;
            pasangBadge(count || 0);
            return count || 0;
        } catch (e) { return 0; }
    }

    // ---------- Jarwo ----------
    async function panggilJarwo(body) {
        await waitSupabaseAuthReady();
        const { data } = await sb.auth.getSession();
        const jwt = data && data.session && data.session.access_token;
        if (!jwt) throw new Error('Sesi login habis, silakan login ulang.');
        const r = await fetch(SUPABASE_URL + '/functions/v1/jarwo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt, apikey: SUPABASE_KEY },
            body: JSON.stringify({ ...body, kantor: getKantorAktif(), tahun: await getTahunAktif() }),
            signal: AbortSignal.timeout(130000)
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
        return j;
    }

    async function cariInfoBaru(manual) {
        if (sedangCari) return 0;
        sedangCari = true;
        try {
            await muat();
            const ada = rows.filter(r => r.jenis === 'kabar');
            const j = await panggilJarwo({ mode: 'info_perbendaharaan', sudah_ada: ada.map(r => ({ judul: r.judul, url: r.sumber_url })) });
            const normalisasi = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const kunci = new Set(); ada.forEach(r => { kunci.add(normalisasi(r.judul)); if (r.sumber_url) kunci.add(normalisasi(r.sumber_url)); });
            const baru = (j.items || []).filter(x => x && x.judul && !kunci.has(normalisasi(x.judul)) && !(x.sumber_url && kunci.has(normalisasi(x.sumber_url))));
            if (baru.length) {
                const nip = localStorage.getItem('nip') || null;
                const { error } = await sb.from('info_perbendaharaan').insert(baru.map(x => ({
                    jenis: 'kabar', kelompok: 'Kabar Terbaru', urutan: 1000, label: String(x.tanggal_terbit || ''), judul: String(x.judul).slice(0, 300),
                    isi: String(x.ringkasan || '').slice(0, 800), sumber: String(x.sumber || ''), sumber_url: String(x.sumber_url || ''), asal: 'jarwo', dibuat_oleh: nip
                })));
                if (error) throw new Error(error.message);
            }
            await sb.from('info_perbendaharaan_cek').update({ terakhir_cek: new Date().toISOString(), oleh: localStorage.getItem('nip') || null }).eq('id', 1);
            return baru.length;
        } finally { sedangCari = false; }
    }

    // Dipanggil saat SiMAB dibuka: penanda "Baru" + pencarian otomatis (admin/superadmin, maks 1x per 24 jam)
    async function cekOtomatis() {
        try {
            if (window.fiturAktif && !window.fiturAktif('info_perbendaharaan')) return;
            await hitungBaru();
            if (!bolehKelola() || (window.fiturAktif && !window.fiturAktif('jarwo'))) return;
            const { data } = await sb.from('info_perbendaharaan_cek').select('terakhir_cek').eq('id', 1).maybeSingle();
            const t = data && data.terakhir_cek ? new Date(data.terakhir_cek).getTime() : 0;
            if (Date.now() - t < JAM_CEK * 3600 * 1000) return;
            // klaim dulu agar admin lain tidak ikut mencari bersamaan
            const { error: e0 } = await sb.from('info_perbendaharaan_cek').update({ terakhir_cek: new Date().toISOString(), oleh: localStorage.getItem('nip') || null }).eq('id', 1);
            if (e0) return;
            const n = await cariInfoBaru(false);
            const jumlah = await hitungBaru();
            if (n > 0 && typeof showToast === 'function') showToast('Jarwo menemukan ' + n + ' info perbendaharaan baru');
            else if (jumlah === 0) pasangBadge(0);
        } catch (e) { console.warn('Cek info perbendaharaan:', e.message || e); }
    }
    window.infoCekOtomatis = cekOtomatis;

    // ---------- tampilan ----------
    function render() {
        const kabar = rows.filter(r => r.jenis === 'kabar').sort((a, b) => new Date(b.dibuat_pada) - new Date(a.dibuat_pada));
        const lihat = localStorage.getItem(kunciLihat());
        const box = document.getElementById('inf-kabarBox');
        if (kabar.length) {
            box.classList.remove('hidden');
            document.getElementById('inf-kabar').innerHTML = kabar.map(r => {
                const baru = r.asal !== 'awal' && (!lihat || new Date(r.dibuat_pada) > new Date(lihat));
                return `<div class="inf-kabar">
                    <div class="flex items-start gap-2">
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-semibold">${baru ? '<span class="inf-baru">Baru</span>' : ''}${esc(r.judul)}</div>
                            ${r.isi ? `<div class="text-[13px] mt-1" style="color:#3a3a3c;">${esc(r.isi)}</div>` : ''}
                            <div class="text-[11.5px] mt-1.5" style="color:#6e6e73;">${[r.label, r.asal === 'jarwo' ? 'dicari Jarwo' : '', r.sumber_url ? `<a href="${esc(r.sumber_url)}" target="_blank" rel="noopener">Sumber</a>` : ''].filter(Boolean).join(' · ')}</div>
                        </div>
                        ${bolehKelola() ? `<button data-hapus="${r.id}" class="shrink-0 text-slate-300 hover:text-red-500" title="Hapus"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div></div>`;
            }).join('');
            document.querySelectorAll('#inf-kabar [data-hapus]').forEach(b => b.onclick = async () => {
                if (!confirm('Hapus info ini?')) return;
                const { error } = await sb.from('info_perbendaharaan').delete().eq('id', b.dataset.hapus);
                if (error) return showToast('Gagal menghapus: ' + error.message);
                await muat(); render();
            });
        } else box.classList.add('hidden');

        // kelompok jadwal & checklist, urut menurut kemunculan
        const grup = []; const peta = {};
        rows.filter(r => r.jenis !== 'kabar').forEach(r => {
            if (!peta[r.kelompok]) { peta[r.kelompok] = { nama: r.kelompok, jenis: r.jenis, item: [] }; grup.push(peta[r.kelompok]); }
            peta[r.kelompok].item.push(r);
        });
        const chips = document.getElementById('inf-chips');
        chips.innerHTML = ['Semua'].concat(grup.map(g => g.nama)).map(n => `<button class="inf-chip ${n === filter ? 'on' : ''}" data-n="${esc(n)}">${esc(n.replace(/^Checklist: /, ''))}</button>`).join('');
        chips.querySelectorAll('button').forEach(b => b.onclick = () => { filter = b.dataset.n; render(); });

        document.getElementById('inf-grup').innerHTML = grup.filter(g => filter === 'Semua' || g.nama === filter).map(g => {
            if (g.jenis === 'checklist') {
                return `<div class="inf-card"><div class="inf-head">${esc(g.nama.replace(/^Checklist: /, ''))}</div><ul class="inf-ck">${g.item.map(i => `<li>${esc(i.isi)}</li>`).join('')}</ul></div>`;
            }
            return `<div class="inf-card"><div class="inf-head">${esc(g.nama)}</div>${g.item.map((i, k) => `<div class="inf-row"><div class="inf-tgl inf-c${k % 6}">${esc(i.label)}</div><div class="inf-isi">${esc(i.isi)}</div></div>`).join('')}</div>`;
        }).join('') || '<div class="text-sm" style="color:var(--label-secondary);">Belum ada data. Jalankan supabase-info-perbendaharaan.sql di Supabase.</div>';
    }

    async function infoCekLabel() {
        try {
            const { data } = await sb.from('info_perbendaharaan_cek').select('terakhir_cek').eq('id', 1).maybeSingle();
            document.getElementById('inf-cekInfo').textContent = data && data.terakhir_cek ? 'Terakhir dicari: ' + tgl(data.terakhir_cek) : '';
        } catch (e) { /* abaikan */ }
    }

    window.initInfoPage = async function () {
        const root = document.getElementById('inf-root');
        if (!root) return;
        try { await muat(); }
        catch (e) { root.innerHTML = `<div class="text-center text-red-500 mt-10">Gagal memuat data: ${esc(e.message)}. Pastikan supabase-info-perbendaharaan.sql sudah dijalankan.</div>`; return; }
        filter = 'Semua';
        render();
        // tandai sudah dilihat (penanda "Baru" tetap tampil di daftar sampai halaman dibuka lagi)
        try { localStorage.setItem(kunciLihat(), new Date().toISOString()); } catch (e) { }
        pasangBadge(0);

        if (bolehKelola()) {
            document.getElementById('inf-aksiAdmin').classList.remove('hidden');
            infoCekLabel();
            const btn = document.getElementById('inf-btnCari');
            btn.onclick = async () => {
                btn.disabled = true; const awal = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> Jarwo mencari...';
                try {
                    const n = await cariInfoBaru(true);
                    await muat(); render(); infoCekLabel();
                    showToast(n ? 'Ditemukan ' + n + ' info baru' : 'Belum ada info baru');
                } catch (e) { showToast('Gagal mencari: ' + e.message); }
                finally { btn.disabled = false; btn.innerHTML = awal; }
            };
            const form = document.getElementById('inf-form');
            document.getElementById('inf-btnTambah').onclick = () => form.classList.toggle('hidden');
            document.getElementById('inf-fBatal').onclick = () => form.classList.add('hidden');
            document.getElementById('inf-fSimpan').onclick = async () => {
                const judul = document.getElementById('inf-fJudul').value.trim();
                if (!judul) return showToast('Judul wajib diisi');
                const { error } = await sb.from('info_perbendaharaan').insert({
                    jenis: 'kabar', kelompok: 'Kabar Terbaru', urutan: 1000, judul, isi: document.getElementById('inf-fIsi').value.trim(),
                    label: document.getElementById('inf-fTgl').value.trim(), sumber_url: document.getElementById('inf-fUrl').value.trim(),
                    asal: 'manual', dibuat_oleh: localStorage.getItem('nip') || null
                });
                if (error) return showToast('Gagal menyimpan: ' + error.message);
                ['inf-fJudul', 'inf-fIsi', 'inf-fTgl', 'inf-fUrl'].forEach(i => document.getElementById(i).value = '');
                form.classList.add('hidden');
                await muat(); render();
                showToast('Info ditambahkan');
            };
        }
    };

    const mulai = () => setTimeout(cekOtomatis, 2500);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else mulai();
})();
