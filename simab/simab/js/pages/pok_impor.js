/**
 * js/pages/pok_impor.js
 * -----------------------------------------------------------------------
 * Halaman "Impor POK" — FULL Supabase (tanpa Google Sheet, tanpa extension).
 *
 * Alur:
 *  1. Admin memilih file Kertas Kerja (.xls hasil export SatuDJA; isinya tabel HTML).
 *  2. File dibaca di browser dengan logika parser yang SAMA dengan extension
 *     Sync POK (kode lengkap di <span> tersembunyi -> kode pendek + nomor urut .NN,
 *     baris judul ">" untuk akun 524111 digabung, huruf A/D -> RM/PNBP).
 *  3. Hasilnya DIBANDINGKAN dengan tabel `pok` (kantor + tahun aktif) per AKUN
 *     (Kegiatan.KRO.RO.Komponen.Huruf.Akun), karena detail POK di database boleh
 *     sudah disederhanakan:
 *       - Baru        : akun ada di file, belum ada di POK
 *       - Tidak ada   : akun ada di POK, tidak ada di file          (merah)
 *       - Pagu beda   : total pagu detail akun berbeda              (merah)
 *       - Sama        : tidak ada perbedaan
 *  4. TIDAK ADA yang tersimpan otomatis. Admin mencentang perubahan yang disetujui
 *     (tambah akun baru / ubah pagu detail / hapus baris), lalu klik Terapkan.
 *     Data lama TIDAK pernah ditimpa tanpa persetujuan. Baris yang dipakai kegiatan
 *     (kegiatan.mak = pok.kode) diberi peringatan sebelum dihapus.
 * -----------------------------------------------------------------------
 */

// ==========================================================
// 1) PARSER KERTAS KERJA (port dari extension Sync POK / pok_upload.js)
// ==========================================================
const PKI_AKUN_MERGE_HEADER = ['524111'];

function pkiParseAngka(v) {
    if (v === null || v === undefined || v === '') return 0;
    let s = String(v).trim();
    if (s === '' || s === '-') return 0;
    s = s.replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

function pkiExtractInputs(htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const inputs = [];
    doc.querySelectorAll('tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;
        const span = tds[0].querySelector('span');
        if (!span) return;
        const fullCode = span.textContent.replace(/\|\|\s*$/, '').trim();
        if (!fullCode) return;
        const clean = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
        const uraian = clean(tds[1]);
        if (!uraian) return;
        inputs.push({ fullCode, uraian, vol: clean(tds[2]), jumlah: pkiParseAngka(clean(tds[4])) });
    });
    return inputs;
}

function pkiParseAnyCode(fullCode) {
    const s = String(fullCode).split('.');
    if (s.length < 5) return null;
    const satker = s[0], ba = s[1], esI = s[2], prog = s[3];
    const parts = [s[4]];
    if (s.length >= 6) parts.push(s[5]);
    let sdLetter = null, isDetail = false, akun = null;
    if (s.length >= 9) {
        parts.push(s[8]);
        if (s.length >= 10) parts.push(s[9]);
        if (s.length >= 11) parts.push(s[10]);
        if (s.length >= 12) { parts.push(s[11]); akun = s[11]; }
        if (s.length >= 13) sdLetter = s[12];
        if (s.length >= 14) isDetail = true;
    }
    return { satker, ba, esI, prog, akun, kodePendek: parts.join('.'), sdLetter, isDetail };
}

function pkiTransform(allInputs) {
    const seq = {}, out = [];
    let pend = null;
    const sdLabel = l => (l === 'D' ? 'PNBP' : (l === 'A' ? 'RM' : ''));
    const emit = (prefix, f) => {
        seq[prefix] = (seq[prefix] || 0) + 1;
        out.push({ kode: prefix + '.' + String(seq[prefix]).padStart(2, '0'), uraian: f.uraian, vol: f.vol || '', pagu: f.jumlah || 0,
            sd: f.sd, ba: f.ba, esI: f.esI, prog: f.prog, satker: f.satker, isDetail: true });
    };
    const flush = () => {
        if (pend && PKI_AKUN_MERGE_HEADER.includes(pend.akun) && pend.itemCount > 0) {
            emit(pend.prefixKey, { uraian: pend.text, jumlah: pend.jumlahSum, vol: '', sd: pend.sd, ba: pend.ba, esI: pend.esI, prog: pend.prog, satker: pend.satker });
        }
        pend = null;
    };
    allInputs.forEach(input => {
        const info = pkiParseAnyCode(input.fullCode);
        if (!info) return;
        const sd = sdLabel(info.sdLetter);
        const base = { sd, ba: info.ba, esI: info.esI, prog: info.prog, satker: info.satker };
        if (!info.isDetail) {
            flush();
            if (info.kodePendek.split('.').length < 3) return; // Kegiatan/KRO tidak diangkut
            out.push({ kode: info.kodePendek, uraian: String(input.uraian || '').trim(), vol: input.vol || '', pagu: 0, ...base, isDetail: false });
            return;
        }
        const prefixKey = info.kodePendek;
        if (pend && pend.prefixKey !== prefixKey) flush();
        const label = String(input.uraian || '').trim();
        if (label.startsWith('>')) {
            flush();
            pend = { text: label.replace(/^>\s*/, '').trim(), jumlahSum: 0, itemCount: 0, prefixKey, akun: info.akun, ...base };
            return;
        }
        if (label.startsWith('-')) {
            const itemText = label.replace(/^-\s*/, '').trim();
            if (pend && pend.prefixKey === prefixKey) {
                pend.jumlahSum += (input.jumlah || 0);
                pend.itemCount += 1;
                if (PKI_AKUN_MERGE_HEADER.includes(info.akun)) return;
                emit(prefixKey, { uraian: pend.text, jumlah: input.jumlah, vol: input.vol, ...base });
                return;
            }
            emit(prefixKey, { uraian: itemText, jumlah: input.jumlah, vol: input.vol, ...base });
            return;
        }
        emit(prefixKey, { uraian: label, jumlah: input.jumlah, vol: input.vol, ...base });
    });
    flush();
    return out;
}

// ==========================================================
// 2) PERBANDINGAN PER AKUN
// ==========================================================
const pkiSeg = kode => String(kode || '').split('.');
const pkiAkunKey = kode => { const s = pkiSeg(kode); return s.length >= 6 ? s.slice(0, 6).join('.') : null; };
const pkiSubKey = kode => pkiSeg(kode).slice(0, 5).join('.');
const pkiNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * fileRows : hasil pkiTransform
 * dbRows   : baris tabel pok (kantor+tahun aktif)
 * pakai    : { [kode]: jumlahKegiatan } (kegiatan.mak = pok.kode)
 */
function pkiBandingkan(fileRows, dbRows, pakai) {
    const fileMap = new Map();   // akunKey -> { key, uraian, sd, details[], sum }
    fileRows.forEach(r => {
        const key = pkiAkunKey(r.kode); if (!key) return;
        if (!fileMap.has(key)) fileMap.set(key, { key, uraian: '', sd: r.sd, details: [], sum: 0 });
        const g = fileMap.get(key);
        if (r.isDetail) { g.details.push(r); g.sum += r.pagu || 0; }
        else if (pkiSeg(r.kode).length === 6) { g.uraian = r.uraian; g.sd = r.sd || g.sd; }
    });

    const dbMap = new Map();     // akunKey -> { key, uraian, rows[], details[], sum }
    dbRows.forEach(r => {
        const kode = String(r.kode || r.id || '');
        const key = pkiAkunKey(kode); if (!key) return;
        if (!dbMap.has(key)) dbMap.set(key, { key, uraian: '', rows: [], details: [], sum: 0 });
        const g = dbMap.get(key);
        g.rows.push(r);
        const n = pkiSeg(kode).length;
        if (n >= 7) { g.details.push(r); g.sum += Number(r.pagu) || 0; }
        else if (n === 6 && !g.uraian) g.uraian = r.uraian || '';
    });

    const keys = Array.from(new Set([...fileMap.keys(), ...dbMap.keys()])).sort();
    const baruPerSub = {};
    keys.forEach(k => { if (fileMap.has(k) && !dbMap.has(k)) (baruPerSub[pkiSubKey(k)] = baruPerSub[pkiSubKey(k)] || []).push(k); });

    return keys.map(key => {
        const f = fileMap.get(key), d = dbMap.get(key);
        let status;
        if (f && !d) status = 'baru';
        else if (!f && d) status = 'hilang';
        else status = Math.abs(f.sum - d.sum) > 0.5 ? 'beda' : 'sama';
        const kandidat = status === 'hilang' ? (baruPerSub[pkiSubKey(key)] || []).map(k => k.split('.').pop()) : [];
        const dipakai = d ? d.rows.reduce((t, r) => t + (pakai[r.kode || r.id] || 0), 0) : 0;
        return { key, status, file: f || null, db: d || null, kandidat, dipakai,
            selisih: (f ? f.sum : 0) - (d ? d.sum : 0) };
    });
}

// ==========================================================
// 3) HALAMAN
// ==========================================================
const PKI = { fileRows: [], hasil: [], dbRows: [], seksiList: [], pakai: {}, kppn: null, fileName: '', filter: 'perlu' };
const pkiEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pkiRp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const pkiEl = id => document.getElementById(id);

function pkiIsAdmin() {
    return localStorage.getItem('admin') === '1';
}

async function pkiMuatDb() {
    await waitSupabaseAuthReady();
    const kantor = getKantorAktif(), tahun = await getTahunAktif();
    PKI.tahun = tahun;
    const [pok, keg] = await Promise.all([
        sbFetchAll('pok', '*', { kantor_id: kantor, tahun }),
        sbFetchAll('kegiatan', 'mak', { kantor_id: kantor, tahun })
    ]);
    PKI.dbRows = pok;
    PKI.pakai = {};
    keg.forEach(k => { const m = String(k.mak || '').trim(); if (m) PKI.pakai[m] = (PKI.pakai[m] || 0) + 1; });
    // Daftar seksi: gabungan seksi baku + seksi yang pernah dipakai di tahun MANAPUN untuk kantor ini
    // (supaya tahun anggaran baru yang POK-nya masih kosong tetap punya pilihan lengkap).
    let lain = [];
    try { lain = await sbFetchAll('pok', 'kode,seksi,tahun', { kantor_id: kantor }); } catch (e) { console.warn('Gagal ambil seksi tahun lain:', e); }
    PKI.refSeksi = lain.filter(r => r.seksi && Number(r.tahun) !== Number(tahun));
    const baku = ['PN', 'HI', 'KI', 'Lelang', 'Penilaian', 'PKN', 'Umum'];
    PKI.seksiList = Array.from(new Set(baku.concat(pok.map(r => r.seksi), lain.map(r => r.seksi)).filter(Boolean))).sort();
    PKI.kppn = (pok.find(r => r.kppn) || {}).kppn || null;
}

async function initPokImporPage() {
    const title = pkiEl('page-title'); if (title) title.innerText = 'Impor POK';
    if (!pkiIsAdmin()) { pkiEl('pki-root').innerHTML = '<div class="text-center text-red-500 mt-10">Halaman ini khusus admin.</div>'; return; }
    pkiEl('pki-file').onchange = pkiBaca;
    pkiEl('pki-btnTerapkan').onclick = pkiTerapkan;
    pkiEl('pki-btnBaruSemua').onclick = () => { document.querySelectorAll('.pki-baru-cek').forEach(c => { c.checked = true; }); pkiHitungOps(); };
    document.querySelectorAll('[data-pki-filter]').forEach(b => { b.onclick = () => { PKI.filter = b.dataset.pkiFilter; pkiRender(); }; });
}

async function pkiBaca() {
    const f = pkiEl('pki-file').files[0];
    if (!f) return;
    const st = pkiEl('pki-status');
    st.textContent = 'Membaca file...';
    try {
        const text = await f.text();
        const inputs = pkiExtractInputs(text);
        if (!inputs.length) throw new Error('Tidak ada baris berkode. Pastikan file adalah Kertas Kerja SatuDJA (.xls) dengan filter "Detail".');
        PKI.fileRows = pkiTransform(inputs);
        PKI.fileName = f.name;
        st.textContent = 'Membandingkan dengan POK di database...';
        await pkiMuatDb();
        PKI.hasil = pkiBandingkan(PKI.fileRows, PKI.dbRows, PKI.pakai);
        PKI.filter = 'perlu';
        st.textContent = '';
        pkiEl('pki-hasil').classList.remove('hidden');
        pkiRender();
    } catch (e) {
        st.innerHTML = '<span class="text-red-500">' + pkiEsc(e.message || e) + '</span>';
    }
}

function pkiBadge(status) {
    const m = {
        baru: ['Baru di file', 'background:#dcfce7;color:#166534'],
        hilang: ['Tidak ada di file', 'background:#fee2e2;color:#b91c1c'],
        beda: ['Pagu beda', 'background:#fee2e2;color:#b91c1c'],
        sama: ['Sama', 'background:#f1f5f9;color:#475569']
    }[status];
    return `<span style="${m[1]};border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600">${m[0]}</span>`;
}

function pkiRender() {
    const h = PKI.hasil;
    const hit = s => h.filter(x => x.status === s).length;
    const sumFile = h.reduce((t, x) => t + (x.file ? x.file.sum : 0), 0);
    const sumDb = h.reduce((t, x) => t + (x.db ? x.db.sum : 0), 0);
    pkiEl('pki-ringkas').innerHTML =
        `<div><b>${pkiEsc(PKI.fileName)}</b> — ${h.length} akun dibandingkan</div>` +
        `<div class="mt-1">Total pagu file <b>${pkiRp(sumFile)}</b> · POK di database <b>${pkiRp(sumDb)}</b> · selisih <b style="color:${Math.abs(sumFile - sumDb) > 0.5 ? '#b91c1c' : '#166534'}">${pkiRp(sumFile - sumDb)}</b></div>` +
        `<div class="mt-1">${pkiBadge('baru')} ${hit('baru')} &nbsp; ${pkiBadge('hilang')} ${hit('hilang')} &nbsp; ${pkiBadge('beda')} ${hit('beda')} &nbsp; ${pkiBadge('sama')} ${hit('sama')}</div>`;

    document.querySelectorAll('[data-pki-filter]').forEach(b => {
        const on = b.dataset.pkiFilter === PKI.filter;
        b.style.background = on ? 'var(--ios-blue, #0071e3)' : '';
        b.style.color = on ? '#fff' : '';
    });

    const tampil = h.filter(x => PKI.filter === 'semua' ? true : PKI.filter === 'sama' ? x.status === 'sama' : x.status !== 'sama');
    const subUraian = {};
    PKI.fileRows.forEach(r => { subUraian[r.kode] = r.uraian; });
    PKI.dbRows.forEach(r => { if (!subUraian[r.kode]) subUraian[r.kode] = r.uraian; });

    const html = pkiTabelPok(tampil, subUraian);
    pkiEl('pki-daftar').innerHTML = html || '<div class="ios-panel text-center p-6" style="color:var(--label-secondary)">Tidak ada akun pada filter ini.</div>';

    pkiEl('pki-daftar').querySelectorAll('input,select').forEach(el => { el.addEventListener('change', pkiHitungOps); el.addEventListener('input', pkiHitungOps); });
    pkiHitungOps();
}

function pkiSeksiSelect(cls, key, pilih) {
    return `<select class="${cls} ios-field" data-key="${pkiEsc(key)}" style="width:auto;padding:2px 8px">${PKI.seksiList.map(s => `<option ${s === pilih ? 'selected' : ''}>${pkiEsc(s)}</option>`).join('')}</select>`;
}

function pkiSeksiDefault(key) {
    // Cari seksi dari POK tahun aktif dulu, lalu dari tahun lain (kode sama = seksi biasanya sama)
    for (const sumber of [PKI.dbRows, PKI.refSeksi || []]) {
        for (const n of [5, 3]) {
            const p = pkiSeg(key).slice(0, n).join('.');
            const r = sumber.find(x => (String(x.kode).startsWith(p + '.') || x.kode === p) && x.seksi);
            if (r) return r.seksi;
        }
    }
    return 'Umum';
}

// ---- Tampilan ala POK utuh: satu tabel berkisi, urut program (CD, WA, lainnya) lalu kode ----
function pkiProgRank(p) {
    p = String(p || '').trim().toUpperCase();
    return p === 'CD' ? 0 : (p === 'WA' ? 1 : 2);
}
function pkiProgDari(x) {
    return String((x.file && x.file.details[0] && x.file.details[0].prog) || (x.db && x.db.rows[0] && x.db.rows[0].prog) || '').trim().toUpperCase();
}
function pkiTabelPok(tampil, subUraian) {
    if (!tampil.length) return '';
    const urut = tampil.slice().sort((a, b) => {
        const pa = pkiProgDari(a), pb = pkiProgDari(b);
        return (pkiProgRank(pa) - pkiProgRank(pb)) || pa.localeCompare(pb) || a.key.localeCompare(b.key, 'id', { numeric: true });
    });
    const td = 'border:1px solid #9ca3af;';
    const sdWarna = sd => String(sd || '').toUpperCase() === 'PNBP' ? '#dc2626' : '#16a34a';
    const warnaStatus = { baru: '#f0fdf4', hilang: '#fef2f2', beda: '#fff7ed', sama: '#fff' };
    const sudah = new Set();
    let progSkrg = null;
    let rows = '';

    const kosong = n => '<td style="' + td + '"></td>'.repeat(n);
    const barisInduk = (kode, depth) => {
        const segs = kode.split('.');
        const kodeTampil = depth <= 3 ? kode : segs[segs.length - 1];
        const gaya = depth === 5 ? 'font-style:italic;' : '';
        return `<tr data-kode="${pkiEsc(kode)}"><td style="${td}padding:6px 8px;text-align:right;white-space:nowrap;font-size:11.5px;" title="${pkiEsc(kode)}">${pkiEsc(kodeTampil)}</td>
            <td style="${td}padding:6px 8px;${gaya}">${pkiEsc(subUraian[kode] || '')}</td>${kosong(5)}</tr>`;
    };

    urut.forEach(x => {
        const prog = pkiProgDari(x);
        if (prog !== progSkrg) {
            progSkrg = prog;
            rows += `<tr><td colspan="7" style="padding:8px 10px;font-weight:700;font-size:13px;background:#eef2ff;color:#3730a3;border:1px solid #9ca3af;">Program ${pkiEsc(prog || '-')}</td></tr>`;
        }
        const segs = x.key.split('.');
        for (let n = 3; n <= 5; n++) {
            const kode = segs.slice(0, n).join('.');
            if (!sudah.has(kode)) { sudah.add(kode); rows += barisInduk(kode, n); }
        }

        const bg = warnaStatus[x.status];
        const akun = segs[segs.length - 1];
        const nama = (x.file && x.file.uraian) || (x.db && x.db.uraian) || '';
        const fileSum = x.file ? x.file.sum : 0, dbSum = x.db ? x.db.sum : 0;
        let aksi = pkiBadge(x.status);
        if (x.status === 'baru') {
            aksi += `<label class="flex items-center gap-1.5 mt-1.5 text-[12px]"><input type="checkbox" class="pki-baru-cek" data-key="${pkiEsc(x.key)}"> Tambahkan ke seksi</label>${pkiSeksiSelect('pki-baru-seksi', x.key, pkiSeksiDefault(x.key))}`;
        }
        if (x.status === 'hilang') {
            aksi += `<label class="flex items-center gap-1.5 mt-1.5 text-[12px]"><input type="checkbox" class="pki-hapus-akun" data-key="${pkiEsc(x.key)}"> Hapus dari POK (${x.db.rows.length} baris)</label>`;
        }
        let ket = '';
        if (x.status === 'hilang') {
            ket += `<div class="text-[11.5px] mt-1" style="color:#b91c1c">Ada di POK, tidak ada di file${x.kandidat.length ? ` — sub komponen ini memuat akun baru di file: <b>${x.kandidat.join(', ')}</b> (kemungkinan kode akun berubah)` : ''}.</div>`;
            if (x.dipakai) ket += `<div class="text-[11.5px] mt-1 font-semibold" style="color:#b45309">⚠ Dipakai ${x.dipakai} kegiatan; menghapusnya membuat kegiatan itu kehilangan induk POK.</div>`;
        }
        const selisih = fileSum - dbSum;
        rows += `<tr data-kode="${pkiEsc(x.key)}" style="background:${bg}">
            <td style="${td}padding:6px 8px;text-align:right;white-space:nowrap;font-size:11.5px;" title="${pkiEsc(x.key)}">${pkiEsc(akun)}</td>
            <td style="${td}padding:6px 8px;"><span style="text-decoration:underline;">${pkiEsc(nama)}</span>${ket}</td>
            <td style="${td}padding:6px 8px;text-align:right;white-space:nowrap;">${x.file ? pkiRp(fileSum) : '-'}</td>
            <td style="${td}padding:6px 8px;text-align:right;white-space:nowrap;">${x.db ? pkiRp(dbSum) : '-'}</td>
            <td style="${td}padding:6px 8px;text-align:right;white-space:nowrap;font-weight:600;color:${Math.abs(selisih) > 0.5 ? '#b91c1c' : '#166534'};">${Math.abs(selisih) > 0.5 ? pkiRp(selisih) : '0'}</td>
            <td style="${td}padding:6px 8px;text-align:center;white-space:nowrap;">${x.file ? pkiEsc((x.file.details[0] && x.file.details[0].sd) || x.file.sd || '-') : '-'}</td>
            <td style="${td}padding:6px 8px;">${aksi}</td></tr>`;

        // ---- baris detail ----
        const fileDetail = x.file ? x.file.details : [];
        const fileByUraian = new Map(fileDetail.map(r => [pkiNorm(r.uraian), r]));
        const dbDetail = x.db ? x.db.details : [];
        const adaDb = new Set(dbDetail.map(r => pkiNorm(r.uraian)));
        const baris = (kodeTampil, uraian, sd, nFile, nDb, kanan, bgRow, catatan) => `<tr style="background:${bgRow || '#fff'}">
            <td style="${td}padding:5px 8px;text-align:right;white-space:nowrap;font-size:11px;color:${sdWarna(sd)};">${pkiEsc(kodeTampil)}</td>
            <td style="${td}padding:5px 8px 5px 30px;font-size:11.5px;color:${sdWarna(sd)};">- ${pkiEsc(uraian)}${catatan || ''}</td>
            <td style="${td}padding:5px 8px;text-align:right;white-space:nowrap;font-size:11.5px;color:${sdWarna(sd)};">${nFile}</td>
            <td style="${td}padding:5px 8px;text-align:right;white-space:nowrap;font-size:11.5px;color:${sdWarna(sd)};">${nDb}</td>
            <td style="${td}"></td>
            <td style="${td}padding:5px 8px;text-align:center;font-size:11.5px;color:${sdWarna(sd)};">${pkiEsc(sd || '-')}</td>
            <td style="${td}padding:5px 8px;">${kanan || ''}</td></tr>`;

        if (x.status === 'baru') {
            fileDetail.forEach(r => { rows += baris(String(r.kode).split('.').pop(), r.uraian, r.sd, pkiRp(r.pagu), '-', '', '#f0fdf4'); });
        } else if (x.status === 'hilang') {
            dbDetail.forEach(r => {
                const cat = (r.seksi ? ` <span class="text-[10.5px]" style="color:var(--label-secondary)">(${pkiEsc(r.seksi)})</span>` : '') + (PKI.pakai[r.kode] ? ` <span class="text-[10.5px]" style="color:#b45309">· dipakai ${PKI.pakai[r.kode]} kegiatan</span>` : '');
                rows += baris(String(r.kode).split('.').pop(), r.uraian, r.sd, '-', pkiRp(r.pagu), '', '#fef2f2', cat);
            });
        } else {
            // sama / beda: tampilkan detail POK berdampingan dengan nilai di file
            dbDetail.forEach(r => {
                const f = fileByUraian.get(pkiNorm(r.uraian));
                const cat = (r.seksi ? ` <span class="text-[10.5px]" style="color:var(--label-secondary)">(${pkiEsc(r.seksi)})</span>` : '') + (PKI.pakai[r.kode] ? ` <span class="text-[10.5px]" style="color:#b45309">· dipakai ${PKI.pakai[r.kode]} kegiatan</span>` : '');
                const beda = f && Math.abs((f.pagu || 0) - (Number(r.pagu) || 0)) > 0.5;
                const nDb = x.status === 'beda'
                    ? `<input type="number" class="pki-pagu ios-field" data-id="${pkiEsc(r.id)}" data-asal="${Number(r.pagu) || 0}" value="${Number(r.pagu) || 0}" style="width:120px;padding:2px 8px;text-align:right" title="Ubah pagu POK lalu tekan Terapkan">`
                    : pkiRp(r.pagu);
                rows += baris(String(r.kode).split('.').pop(), r.uraian, r.sd, f ? pkiRp(f.pagu) : '<span style="color:#b91c1c">tidak ada</span>', nDb, '', beda ? '#fff7ed' : '#fff', cat);
            });
            if (x.status === 'beda') {
                fileDetail.filter(r => !adaDb.has(pkiNorm(r.uraian))).forEach(r => {
                    rows += baris('baru', r.uraian, r.sd, pkiRp(r.pagu), '-',
                        `<label class="flex items-center gap-1.5 text-[12px]"><input type="checkbox" class="pki-tambah-detail" data-key="${pkiEsc(x.key)}" data-kode="${pkiEsc(r.kode)}"> Tambahkan ke POK</label>`,
                        '#f0fdf4', ' <span class="text-[10.5px]" style="color:#166534">(ada di file, belum di POK)</span>');
                });
            }
        }
    });

    return `<div class="ios-panel p-3 mb-4">
        <div class="rounded-xl overflow-auto" style="border:1px solid var(--divider);max-height:72vh;">
        <table class="w-full text-sm" style="border-collapse:collapse;">
            <thead style="position:sticky;top:0;z-index:2;"><tr class="text-[12px]" style="background:#fff;">
                <th style="${td}padding:8px;background:#fff;">Kode</th>
                <th style="${td}padding:8px;background:#fff;">Program/ Kegiatan/ Output/ Sub Output/ Komponen/ Akun/ Detail</th>
                <th style="${td}padding:8px;background:#fff;">Pagu File</th>
                <th style="${td}padding:8px;background:#fff;">Pagu POK</th>
                <th style="${td}padding:8px;background:#fff;">Selisih</th>
                <th style="${td}padding:8px;background:#fff;">SD/CP</th>
                <th style="${td}padding:8px;background:#fff;">Status / Aksi</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div></div>`;
}

// ---- kumpulkan operasi yang disetujui ----
function pkiKumpulOps() {
    const ops = { insert: [], update: [], hapus: [], pakaiHapus: 0 };
    const kantor = getKantorAktif();
    const tahun = PKI.tahun;
    const idAda = new Set(PKI.dbRows.map(r => r.id));
    const fileByKode = new Map(PKI.fileRows.map(r => [r.kode, r]));
    const baru = new Map(); // id -> payload (hindari duplikat)

    const buatRow = (r, seksi, pagu) => ({
        id: `${r.kode}__${seksi}`, kode: r.kode, uraian: r.uraian, pagu, sd: r.sd || null, seksi,
        ba: r.ba || null, es_i: r.esI || null, prog: r.prog || null, satker: r.satker || null, kppn: PKI.kppn,
        kantor_id: kantor, tahun
    });
    const tambahInduk = (key, seksi) => {
        const s = pkiSeg(key);
        for (let n = 3; n <= 6; n++) {
            const kode = s.slice(0, n).join('.');
            const r = fileByKode.get(kode);
            const id = `${kode}__${seksi}`;
            if (r && !idAda.has(id) && !baru.has(id)) baru.set(id, buatRow(r, seksi, 0));
        }
    };
    const nextNN = key => {
        let mx = 0;
        PKI.dbRows.forEach(r => { if (String(r.kode).startsWith(key + '.') && pkiSeg(r.kode).length === 7) mx = Math.max(mx, parseInt(pkiSeg(r.kode)[6], 10) || 0); });
        baru.forEach(p => { if (String(p.kode).startsWith(key + '.') && pkiSeg(p.kode).length === 7) mx = Math.max(mx, parseInt(pkiSeg(p.kode)[6], 10) || 0); });
        return mx + 1;
    };

    // 1) akun baru
    document.querySelectorAll('.pki-baru-cek:checked').forEach(cb => {
        const key = cb.dataset.key;
        const seksi = document.querySelector(`.pki-baru-seksi[data-key="${CSS.escape(key)}"]`).value;
        const hasil = PKI.hasil.find(x => x.key === key);
        tambahInduk(key, seksi);
        hasil.file.details.forEach(d => { const id = `${d.kode}__${seksi}`; if (!idAda.has(id)) baru.set(id, buatRow(d, seksi, d.pagu)); });
    });
    // 2) tambah detail pada akun yang pagunya beda
    document.querySelectorAll('.pki-tambah-detail:checked').forEach(cb => {
        const key = cb.dataset.key, d = fileByKode.get(cb.dataset.kode);
        const hasil = PKI.hasil.find(x => x.key === key);
        const seksi = (hasil.db.details[0] && hasil.db.details[0].seksi) || 'Umum';
        const nn = String(nextNN(key)).padStart(2, '0');
        const kode = `${key}.${nn}`;
        baru.set(`${kode}__${seksi}`, buatRow({ ...d, kode }, seksi, d.pagu));
    });
    ops.insert = Array.from(baru.values());
    // 3) ubah pagu
    document.querySelectorAll('.pki-pagu').forEach(inp => {
        const v = Number(inp.value) || 0, asal = Number(inp.dataset.asal) || 0;
        if (Math.abs(v - asal) > 0.5) ops.update.push({ id: inp.dataset.id, pagu: v, asal });
    });
    // 4) hapus akun
    document.querySelectorAll('.pki-hapus-akun:checked').forEach(cb => {
        const hasil = PKI.hasil.find(x => x.key === cb.dataset.key);
        hasil.db.rows.forEach(r => { ops.hapus.push(r.id); ops.pakaiHapus += PKI.pakai[r.kode] || 0; });
    });
    return ops;
}

function pkiHitungOps() {
    const o = pkiKumpulOps();
    pkiEl('pki-ops').textContent = `${o.insert.length} baris ditambah · ${o.update.length} pagu diubah · ${o.hapus.length} baris dihapus`;
    pkiEl('pki-btnTerapkan').disabled = !(o.insert.length || o.update.length || o.hapus.length);
}

async function pkiTerapkan() {
    const o = pkiKumpulOps();
    if (!(o.insert.length || o.update.length || o.hapus.length)) return;
    let pesan = `Terapkan perubahan ke POK kantor ini?\n\n• ${o.insert.length} baris ditambah\n• ${o.update.length} pagu diubah\n• ${o.hapus.length} baris dihapus`;
    if (o.pakaiHapus) pesan += `\n\n⚠ Baris yang dihapus dipakai ${o.pakaiHapus} kegiatan (kegiatan.mak). Kegiatan itu akan kehilangan induk POK.`;
    if (!confirm(pesan)) return;

    const btn = pkiEl('pki-btnTerapkan'), st = pkiEl('pki-status');
    btn.disabled = true; st.textContent = 'Menyimpan...';
    const kantor = getKantorAktif(), tahun = await getTahunAktif();
    try {
        await waitSupabaseAuthReady();
        for (let i = 0; i < o.insert.length; i += 200) {
            const { error } = await sb.from('pok').insert(o.insert.slice(i, i + 200));
            if (error) throw new Error('Tambah: ' + error.message);
        }
        for (const u of o.update) {
            const { error } = await sb.from('pok').update({ pagu: u.pagu }).eq('id', u.id).eq('kantor_id', kantor).eq('tahun', tahun);
            if (error) throw new Error('Ubah pagu: ' + error.message);
        }
        for (let i = 0; i < o.hapus.length; i += 100) {
            const { error } = await sb.from('pok').delete().in('id', o.hapus.slice(i, i + 100)).eq('kantor_id', kantor).eq('tahun', tahun);
            if (error) throw new Error('Hapus: ' + error.message);
        }
        if (typeof showToast === 'function') showToast('Perubahan POK diterapkan');
        window.pokRowsCache = null;
        await pkiMuatDb();
        PKI.hasil = pkiBandingkan(PKI.fileRows, PKI.dbRows, PKI.pakai);
        st.textContent = '';
        pkiRender();
    } catch (e) {
        st.innerHTML = '<span class="text-red-500">Gagal: ' + pkiEsc(e.message || e) + ' (sebagian perubahan mungkin sudah tersimpan — muat ulang file untuk melihat kondisi terbaru)</span>';
    }
}

window.initPokImporPage = initPokImporPage;
window.pkiTest = { pkiExtractInputs, pkiTransform, pkiBandingkan };

// Tombol sidebar hanya muncul untuk admin
(function () {
    const tampil = () => { const b = document.getElementById('nav-pok-impor'); if (b && pkiIsAdmin()) b.classList.remove('hidden'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tampil); else tampil();
})();
