/**
 * Impor Data Pegawai (admin satker & superadmin)
 * -----------------------------------------------------------------------
 * - Template Excel dibuat di browser (SheetJS), lengkap dengan sheet Petunjuk.
 * - File diperiksa dulu (pratinjau); baru tersimpan setelah tombol Simpan.
 * - Wajib: NIP/NIK, Nama, Jenis (PNS/PPNPN), Pangkat/Golongan (khusus PNS), Kantor.
 * - Admin satker hanya boleh mengimpor ke kantornya sendiri; superadmin ke kantor mana pun.
 * - Akun login dibuat dengan password awal = NIP/NIK (sama dengan "Tambah Pegawai").
 */
(function () {
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const el = id => document.getElementById(id);
    const isSuper = () => localStorage.getItem('superadmin') === '1';
    const isAdmin = () => localStorage.getItem('admin') === '1' || isSuper();
    const kantorSaya = () => (typeof getKantorAktif === 'function' ? getKantorAktif() : (localStorage.getItem('kantor') || ''));

    const HEADER = ['NIP/NIK *', 'Nama *', 'Jenis (PNS/PPNPN) *', 'Pangkat/Golongan *', 'Jabatan', 'Kantor *', 'Nama Bank', 'No Rekening'];
    const S = { rows: [], kantor: [], filter: 'semua', sibuk: false };

    // ---------- normalisasi ----------
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    function kolomKe(namaHeader) {
        const h = norm(namaHeader);
        if (/^(nipnik|nip|nik)$/.test(h)) return 'nip';
        if (h === 'nama' || h === 'namalengkap') return 'nama';
        if (/^(jenis|jenispnsppnpn|statuskepegawaian|kepegawaian)$/.test(h)) return 'jenis';
        if (/^(pangkatgolongan|pangkat|golongan)$/.test(h)) return 'pangkat';
        if (h === 'jabatan') return 'jabatan';
        if (/^(kantor|kodekantor|satker)$/.test(h)) return 'kantor';
        if (h === 'namabank' || h === 'bank') return 'bank';
        if (h === 'norekening' || h === 'rekening') return 'rek';
        return null;
    }
    function pangkatCocok(teks) {
        const t = String(teks || '').trim();
        if (!t) return '';
        const daftar = (typeof CS_DAFTAR_PANGKAT !== 'undefined') ? CS_DAFTAR_PANGKAT : [];
        const persis = daftar.find(p => p.toLowerCase() === t.toLowerCase());
        if (persis) return persis;
        // cocokkan lewat kode golongan: III/c, III.c, IIIc, "Penata / III.c"
        const m = t.match(/\b(IV|III|II|I)\s*[\/.\-]?\s*([a-e])\b/i);
        if (m) {
            const kode = (m[1].toUpperCase() + '.' + m[2].toLowerCase());
            const hit = daftar.find(p => p.toLowerCase().endsWith('/ ' + kode.toLowerCase()));
            if (hit) return hit;
        }
        return null;
    }
    function jenisKePns(teks) {
        const t = norm(teks);
        if (/^(pns|cpns)$/.test(t)) return '1';
        if (/^(ppnpn|nonpns|nonasn)$/.test(t)) return '0';
        return null;
    }

    // ---------- template ----------
    async function muatKantor() {
        if (S.kantor.length) return S.kantor;
        await waitSupabaseAuthReady();
        const rows = await sbFetchAll('kantor', 'id, nama, status');
        S.kantor = rows.map(r => ({ id: String(r.id), nama: r.nama || '' }));
        return S.kantor;
    }
    async function unduhTemplate() {
        const btn = el('pgi-btnTemplate');
        btn.disabled = true;
        try {
            const kantor = await muatKantor().catch(() => []);
            const milikku = kantor.filter(k => isSuper() || k.id === kantorSaya());
            const contohKantor = kantorSaya() || (milikku[0] && milikku[0].id) || '';
            const data = [HEADER,
                ['199001012015011001', 'CONTOH PNS (baris ini dilewati)', 'PNS', 'Penata / III.c', 'Pelaksana', contohKantor, 'BRI', '1234567890'],
                ['3171010101010001', 'CONTOH PPNPN (baris ini dilewati)', 'PPNPN', '', 'Pengemudi', contohKantor, '', '']];
            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols'] = [{ wch: 22 }, { wch: 34 }, { wch: 20 }, { wch: 26 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
            // kolom NIP/NIK & rekening berformat Teks (hindari 18 digit berubah jadi 1.99E+17)
            const rangeAkhir = 500;
            [0, 7].forEach(c => {
                for (let r = 1; r <= rangeAkhir; r++) {
                    const ref = XLSX.utils.encode_cell({ r, c });
                    const lama = ws[ref];
                    ws[ref] = { t: 's', v: lama ? String(lama.v) : '', z: '@' };
                }
            });
            ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rangeAkhir, c: 7 } });

            const petunjuk = [
                ['PETUNJUK PENGISIAN'],
                ['1. Isi sheet "Pegawai" mulai baris ke-2. Baris yang namanya diawali "CONTOH" dilewati.'],
                ['2. Kolom bertanda * wajib diisi (Pangkat/Golongan wajib untuk PNS; boleh kosong untuk PPNPN).'],
                ['3. NIP/NIK: PNS = NIP 18 digit; PPNPN = NIK 16 digit. Jangan pakai spasi atau tanda baca. Kolom sudah berformat Teks.'],
                ['4. Jenis diisi PNS atau PPNPN.'],
                ['5. Pangkat/Golongan: pilih salah satu penulisan di bawah (boleh juga hanya golongan, mis. III/c atau III.c).'],
                ['6. Kantor: isi kode kantor (lihat daftar di bawah).' + (isSuper() ? '' : ' Admin satker hanya dapat mengimpor ke kantornya sendiri.')],
                ['7. Akun baru otomatis dibuat; password awal = NIP/NIK, dan pegawai diminta menggantinya saat login pertama.'],
                [],
                ['DAFTAR PANGKAT/GOLONGAN'],
                ...((typeof CS_DAFTAR_PANGKAT !== 'undefined' ? CS_DAFTAR_PANGKAT : []).map(p => [p])),
                [],
                ['DAFTAR KODE KANTOR', 'NAMA KANTOR'],
                ...milikku.map(k => [k.id, k.nama])
            ];
            const wsP = XLSX.utils.aoa_to_sheet(petunjuk);
            wsP['!cols'] = [{ wch: 110 }, { wch: 40 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Pegawai');
            XLSX.utils.book_append_sheet(wb, wsP, 'Petunjuk');
            XLSX.writeFile(wb, 'Template_Impor_Pegawai.xlsx');
        } catch (e) {
            alert('Gagal membuat template: ' + (e.message || e));
        } finally { btn.disabled = false; }
    }

    // ---------- baca & validasi ----------
    async function bacaFile(file) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', raw: true });
        const nama = wb.SheetNames.find(n => norm(n) === 'pegawai') || wb.SheetNames[0];
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nama], { header: 1, raw: false, defval: '' });
        if (!aoa.length) throw new Error('Berkas kosong.');
        let hdrIdx = aoa.findIndex(r => r.some(c => kolomKe(c) === 'nip') && r.some(c => kolomKe(c) === 'nama'));
        if (hdrIdx < 0) throw new Error('Baris judul (NIP/NIK, Nama, ...) tidak ditemukan. Gunakan template dari tombol Unduh.');
        const peta = {};
        aoa[hdrIdx].forEach((c, i) => { const k = kolomKe(c); if (k && !(k in peta)) peta[k] = i; });
        const out = [];
        for (let i = hdrIdx + 1; i < aoa.length; i++) {
            const r = aoa[i];
            if (!r.some(c => String(c).trim() !== '')) continue;
            const g = k => (k in peta ? String(r[peta[k]] ?? '').trim() : '');
            const item = { baris: i + 1, nip: g('nip').replace(/[\s'`]/g, ''), nama: g('nama'), jenisTeks: g('jenis'), pangkatTeks: g('pangkat'),
                jabatan: g('jabatan'), kantorTeks: g('kantor'), bank: g('bank'), rek: g('rek').replace(/[\s'`]/g, '') };
            if (/^contoh/i.test(item.nama)) continue;
            out.push(item);
        }
        if (!out.length) throw new Error('Tidak ada baris data (baris CONTOH dilewati).');
        return out;
    }

    async function validasi(items) {
        const kantor = await muatKantor();
        const mode = (document.querySelector('input[name="pgi-mode"]:checked') || {}).value || 'lewati';
        const sudahDi = new Map();   // nip -> baris pertama
        // pegawai yang sudah ada (terlihat oleh akun ini)
        const ada = new Map();
        const daftarNip = Array.from(new Set(items.map(i => i.nip).filter(Boolean)));
        for (let i = 0; i < daftarNip.length; i += 150) {
            const { data } = await sb.from('pegawai').select('id,nama,kantor_id').in('id', daftarNip.slice(i, i + 150));
            (data || []).forEach(d => ada.set(String(d.id), d));
        }
        items.forEach(it => {
            const err = [];
            it.kepeg = jenisKePns(it.jenisTeks);
            if (it.kepeg === null) err.push('Jenis harus PNS atau PPNPN');
            if (!it.nama) err.push('Nama kosong');
            if (!it.nip) err.push('NIP/NIK kosong');
            else if (/e\+/i.test(it.nip) || !/^\d+$/.test(it.nip)) err.push('NIP/NIK harus angka saja (format kolom Teks)');
            else if (it.kepeg === '1' && it.nip.length !== 18) err.push('NIP PNS harus 18 digit');
            else if (it.kepeg === '0' && (it.nip.length < 16 || it.nip.length > 18)) err.push('NIK PPNPN harus 16 digit');
            if (it.nip && sudahDi.has(it.nip)) err.push('NIP/NIK kembar dengan baris ' + sudahDi.get(it.nip));
            else if (it.nip) sudahDi.set(it.nip, it.baris);

            // pangkat
            const pk = pangkatCocok(it.pangkatTeks);
            if (it.kepeg === '1' && !it.pangkatTeks) err.push('Pangkat/Golongan wajib untuk PNS');
            else if (pk === null) err.push('Pangkat/Golongan tidak dikenali');
            it.pangkat = pk || '';

            // kantor
            let kid = '';
            if (!isSuper()) {
                kid = kantorSaya();
                if (it.kantorTeks) {
                    const k = kantor.find(x => norm(x.id) === norm(it.kantorTeks) || norm(x.nama) === norm(it.kantorTeks));
                    if (!k || k.id !== kid) err.push('Kantor bukan kantor Anda (' + kid + ')');
                }
            } else {
                if (!it.kantorTeks) err.push('Kantor wajib diisi');
                else {
                    const k = kantor.find(x => norm(x.id) === norm(it.kantorTeks) || norm(x.nama) === norm(it.kantorTeks));
                    if (!k) err.push('Kantor "' + it.kantorTeks + '" tidak ditemukan'); else kid = k.id;
                }
            }
            it.kantorId = kid;

            const lama = ada.get(it.nip);
            if (!err.length && lama) {
                it.aksi = mode === 'perbarui' ? 'perbarui' : 'lewati';
                it.catatan = mode === 'perbarui' ? 'Sudah ada — data diperbarui' : 'Sudah ada — dilewati';
            } else if (!err.length) { it.aksi = 'baru'; it.catatan = 'Baru'; }
            else { it.aksi = 'salah'; it.catatan = err.join('; '); }
        });
        return items;
    }

    // ---------- tampilan ----------
    function render() {
        const rows = S.rows;
        const hitung = a => rows.filter(r => r.aksi === a).length;
        el('pgi-ringkas').innerHTML =
            `<b>${rows.length}</b> baris dibaca &middot; ` +
            `<span class="px-2 py-0.5 rounded-full text-[11px]" style="background:#dcfce7;color:#166534">Baru ${hitung('baru')}</span> ` +
            `<span class="px-2 py-0.5 rounded-full text-[11px]" style="background:#fef3c7;color:#92400e">Perbarui ${hitung('perbarui')}</span> ` +
            `<span class="px-2 py-0.5 rounded-full text-[11px]" style="background:#e5e7eb;color:#374151">Dilewati ${hitung('lewati')}</span> ` +
            `<span class="px-2 py-0.5 rounded-full text-[11px]" style="background:#fee2e2;color:#991b1b">Bermasalah ${hitung('salah')}</span>`;
        const tampil = rows.filter(r => S.filter === 'semua' || (S.filter === 'siap' && (r.aksi === 'baru' || r.aksi === 'perbarui')) || (S.filter === 'masalah' && r.aksi === 'salah'));
        const warna = { baru: '#f0fdf4', perbarui: '#fffbeb', lewati: '#f3f4f6', salah: '#fef2f2' };
        el('pgi-tbody').innerHTML = tampil.map(r => `<tr style="background:${warna[r.aksi]};border-top:1px solid var(--divider);">
            <td class="p-2">${r.baris}</td>
            <td class="p-2 font-mono">${esc(r.nip)}</td>
            <td class="p-2">${esc(r.nama)}</td>
            <td class="p-2">${r.kepeg === '1' ? 'PNS' : (r.kepeg === '0' ? 'PPNPN' : esc(r.jenisTeks))}</td>
            <td class="p-2">${esc(r.pangkat || r.pangkatTeks)}</td>
            <td class="p-2">${esc(r.jabatan)}</td>
            <td class="p-2">${esc(r.kantorId || r.kantorTeks)}</td>
            <td class="p-2" style="${r.aksi === 'salah' ? 'color:#b91c1c;font-weight:600;' : ''}">${esc(r.catatan)}</td></tr>`).join('') ||
            '<tr><td colspan="8" class="p-4 text-center" style="color:var(--label-secondary)">Tidak ada baris pada filter ini.</td></tr>';
        const siap = hitung('baru') + hitung('perbarui');
        el('pgi-ops').textContent = siap + ' baris siap disimpan' + (hitung('salah') ? ' · ' + hitung('salah') + ' bermasalah tidak ikut disimpan' : '');
        el('pgi-btnSimpan').disabled = !siap || S.sibuk;
    }

    async function pilihFile(file) {
        const st = el('pgi-status');
        el('pgi-hasil').classList.add('hidden');
        if (!file) return;
        st.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Membaca dan memeriksa data...';
        try {
            await waitSupabaseAuthReady();
            const items = await bacaFile(file);
            S.rows = await validasi(items);
            S.filter = 'semua';
            st.textContent = '';
            el('pgi-hasil').classList.remove('hidden');
            render();
        } catch (e) {
            st.innerHTML = '<span class="text-red-500">Gagal: ' + esc(e.message || e) + '</span>';
        }
    }

    // ---------- simpan ----------
    const tidur = ms => new Promise(r => setTimeout(r, ms));
    async function buatAkun(klien, nip) {
        for (let coba = 0; coba < 3; coba++) {
            const { error } = await klien.auth.signUp({ email: nip + '@simab.local', password: nip });
            if (!error) return null;
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('already registered')) return null;
            if (error.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
                for (let s = 65; s > 0; s--) {
                    el('pgi-ops').textContent = 'Batas pembuatan akun tercapai, menunggu ' + s + ' detik lalu dilanjutkan otomatis...';
                    await tidur(1000);
                }
                continue;
            }
            return error.message || 'gagal';
        }
        return 'batas pembuatan akun terlampaui';
    }
    async function simpan() {
        if (S.sibuk) return;
        const kerja = S.rows.filter(r => r.aksi === 'baru' || r.aksi === 'perbarui');
        if (!kerja.length) return;
        if (!confirm(kerja.length + ' baris akan disimpan. Lanjutkan?')) return;
        S.sibuk = true; el('pgi-btnSimpan').disabled = true;
        await waitSupabaseAuthReady();
        const klien = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: 'sb-secondary-impor-pegawai-' + Date.now() } });
        let ok = 0, gagal = 0;
        for (let i = 0; i < kerja.length; i++) {
            const r = kerja[i];
            el('pgi-ops').textContent = 'Menyimpan ' + (i + 1) + ' dari ' + kerja.length + '...';
            try {
                if (r.aksi === 'baru') {
                    const { error } = await sb.from('pegawai').insert({
                        id: r.nip, nama: r.nama, jabatan: r.jabatan, pangkat: r.pangkat, kepeg: r.kepeg,
                        admin: '', akses_menu: '1', status: '1', nama_bank: r.bank, no_rekening: r.rek, kantor_id: r.kantorId
                    });
                    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'NIP/NIK sudah terdaftar (mungkin di kantor lain)' : error.message);
                    const gagalAkun = await buatAkun(klien, r.nip);
                    try { await klien.auth.signOut(); } catch (e) { /* abaikan */ }
                    r.catatan = gagalAkun ? 'Data tersimpan, akun login gagal: ' + gagalAkun : 'Tersimpan';
                    r.aksi = gagalAkun ? 'salah' : 'lewati';
                } else {
                    const p = { nama: r.nama, jabatan: r.jabatan, pangkat: r.pangkat, kepeg: r.kepeg };
                    if (r.bank) p.nama_bank = r.bank;
                    if (r.rek) p.no_rekening = r.rek;
                    if (isSuper() && r.kantorId) p.kantor_id = r.kantorId;
                    const { error } = await sb.from('pegawai').update(p).eq('id', r.nip);
                    if (error) throw new Error(error.message);
                    r.catatan = 'Diperbarui'; r.aksi = 'lewati';
                }
                ok++;
            } catch (e) {
                gagal++; r.aksi = 'salah'; r.catatan = e.message || String(e);
            }
            if (i % 5 === 4) render();
        }
        S.sibuk = false;
        render();
        el('pgi-ops').textContent = 'Selesai: ' + ok + ' berhasil' + (gagal ? ', ' + gagal + ' gagal (lihat kolom Status)' : '') + '.';
        if (typeof showToast === 'function') showToast('Impor pegawai selesai: ' + ok + ' berhasil' + (gagal ? ', ' + gagal + ' gagal' : ''));
        if (window.refPegawaiLoaded !== undefined) window.refPegawaiLoaded = false;
    }

    // ---------- init ----------
    window.initPegawaiImporPage = function () {
        if (!isAdmin()) { document.getElementById('pgi-root').innerHTML = '<div class="ios-panel p-6 text-center">Hanya admin yang dapat mengakses halaman ini.</div>'; return; }
        S.rows = []; S.filter = 'semua'; S.sibuk = false;
        el('pgi-btnTemplate').onclick = unduhTemplate;
        el('pgi-file').onchange = e => pilihFile(e.target.files[0]);
        document.querySelectorAll('input[name="pgi-mode"]').forEach(r => r.onchange = () => { const f = el('pgi-file').files[0]; if (f) pilihFile(f); });
        el('pgi-btnSimpan').onclick = simpan;
        document.querySelectorAll('[data-pgi-filter]').forEach(b => b.onclick = () => { S.filter = b.dataset.pgiFilter; render(); });
    };
    window.pgiTest = { pangkatCocok, jenisKePns, kolomKe };

    // tombol sidebar hanya untuk admin / superadmin
    const tampil = () => { const b = document.getElementById('nav-pegawai-impor'); if (b && isAdmin()) b.classList.remove('hidden'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tampil); else tampil();
})();
