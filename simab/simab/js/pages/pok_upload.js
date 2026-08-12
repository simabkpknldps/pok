/**
 * Halaman Upload POK (Kertas Kerja)
 * -----------------------------------------------------------------------
 * Upload file Excel Kertas Kerja RKAKL (format .xls hasil export, isinya
 * sebenarnya tabel HTML — lihat contoh KertasKerja.xls) -> ekstrak SELURUH
 * baris (semua level hierarki: Kegiatan, RO, Komponen, SubKomponen, Huruf,
 * Akun, dan Detail) -> preview (bisa diedit manual, tiap baris bisa ditandai
 * >1 Seksi) -> simpan ke sheet pok_upload untuk direview (backend:
 * simpanPOKDataUpload) -> dari popup "Lihat Data di pok_upload", admin bisa
 * cek ulang semuanya lalu klik "Kirim ke pok_sumber_2026" (backend:
 * submitPokUploadToSumber) yang upsert ke pok_sumber_2026 dan otomatis
 * mengisi formula SUMIF Blokir/Realisasi/Sisa KHUSUS utk baris detail.
 *
 * Setiap baris tabel di file Excel-nya punya format:
 *   <td> <span style="display:none">538065.015.09.CD.4796...00001||</span> label </td>
 *   <td>Uraian...</td> <td>Vol</td> <td>Harga Satuan</td> <td>Jumlah</td> <td></td> <td>SD/CP</td>
 * Kode penuh (di dalam span tersembunyi) dipakai utk transformasi kode
 * pendek — lihat pkuParseAnyCode & pkuTransformAllRows.
 *
 * Semua baris preview BISA DIEDIT MANUAL sebelum disimpan, sebagai jaring
 * pengaman terhadap kemungkinan format file yang sedikit beda.
 * -----------------------------------------------------------------------
 */

let pkuParsedRows = [];   // hasil transformasi kode (seluruh hierarki), sebelum duplikasi Seksi
let pkuSeksiList = [];    // daftar Seksi yang tersedia utk dipilih
let pkuRawLeaf = [];      // baris mentah hasil ekstraksi tabel (debug)

async function initPokUploadPage() {
    const btnParse = document.getElementById('pku-btnParse');
    if (!btnParse) return; // fragment belum ter-render

    pkuParsedRows = [];
    pkuRawLeaf = [];
    document.getElementById('pku-previewWrap').classList.add('hidden');
    document.getElementById('pku-seksiBox').classList.add('hidden');
    document.getElementById('pku-debugBox').classList.add('hidden');
    document.getElementById('pku-status').textContent = '';

    btnParse.onclick = pkuHandleParse;
    document.getElementById('pku-btnToggleDebug').onclick = () => document.getElementById('pku-debugBox').classList.toggle('hidden');
    document.getElementById('pku-btnTambahSeksi').onclick = pkuTambahSeksiBaru;
    document.getElementById('pku-btnSimpan').onclick = pkuSimpanKeServer;
    document.getElementById('pku-btnViewUpload').onclick = pkuOpenViewUploadPopup;

    // Ambil daftar Seksi yang sudah pernah dipakai, buat pilihan checklist per baris.
    try {
        const result = await apiPost({ action: 'getDaftarSeksi' });
        pkuSeksiList = (result && result.status === 'success') ? (result.seksi || []) : [];
    } catch (e) {
        console.error('Gagal memuat daftar Seksi:', e);
        pkuSeksiList = [];
    }
}

// ==========================================================
// 1) EKSTRAKSI DARI FILE EXCEL (isinya tabel HTML) — ambil SEMUA baris
//    yang punya kode (semua level), bukan cuma detail.
// ==========================================================
async function pkuExtractAllInputsFromExcel(file) {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const trs = doc.querySelectorAll('tr');

    const inputs = [];

    trs.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;

        const span = tds[0].querySelector('span');
        if (!span) return;

        const fullCode = span.textContent.replace(/\|\|\s*$/, '').trim();
        if (!fullCode) return;

        const uraian = tds[1] ? tds[1].textContent.replace(/\s+/g, ' ').trim() : '';
        if (!uraian) return;

        const vol = tds[2] ? tds[2].textContent.replace(/\s+/g, ' ').trim() : '';
        // Kolom "Jumlah" ada di td index ke-4 (Kode=0, Uraian=1, Vol=2, Harga Satuan=3, Jumlah=4)
        const jumlahText = tds[4] ? tds[4].textContent.replace(/\s+/g, ' ').trim() : '';
        const jumlah = pkuParseAngka(jumlahText);

        inputs.push({ fullCode, uraian, jumlah, vol });
    });

    return inputs;
}

function pkuParseAngka(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    let s = String(v).trim();
    if (s === '' || s === '-') return 0;
    s = s.replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

// ==========================================================
// 2) PARSING KODE PENUH -> info per level (Kegiatan/RO/Komponen/SubKomponen/
//    Huruf/Akun/Detail). Dipakai utk SEMUA baris, bukan cuma detail.
// ==========================================================
// Format kode penuh: satker.BA.EsI.Prog.Kegiatan.RO.22.12.Komponen.SubKomponen.Huruf.Akun.SD.NomorAsli
// ("22"."12" itu segmen tetap yang selalu di-skip dari kode pendek).
// Kode pendek terbentuk BERTAHAP tergantung sampai level mana baris itu ada:
//   5 segmen  -> Kegiatan                         (mis. "4700")
//   6 segmen  -> +RO                               (mis. "4700.EBA")
//   9 segmen  -> +Komponen (lewati 22,12)           (mis. "4700.EBA.969")
//   10 segmen -> +SubKomponen                       (mis. "4700.EBA.969.100")
//   11 segmen -> +Huruf                             (mis. "4700.EBA.969.100.A")
//   12 segmen -> +Akun                              (mis. "4700.EBA.969.100.A.521219")
//   13 segmen -> +huruf SD (A/D) -- baris Akun itu sendiri (SD diekstrak, tidak masuk kode)
//   14 segmen -> +nomor urut asli (00001 dst) -- baris DETAIL
function pkuParseAnyCode(fullCode) {
    const s = String(fullCode).split('.');
    if (s.length < 5) return null; // level satker/BA/EsI/Prog saja -> tidak relevan

    const ba = s[1], esI = s[2], prog = s[3];
    const parts = [s[4]]; // Kegiatan

    if (s.length >= 6) parts.push(s[5]); // RO

    let sdLetter = null;
    let isDetail = false;
    let akun = null;

    if (s.length >= 9) {
        parts.push(s[8]); // Komponen (s[6],s[7] = "22","12" -> di-skip)
        if (s.length >= 10) parts.push(s[9]);  // SubKomponen
        if (s.length >= 11) parts.push(s[10]); // Huruf
        if (s.length >= 12) { parts.push(s[11]); akun = s[11]; } // Akun
        if (s.length >= 13) sdLetter = s[12];  // huruf SD (A/D)
        if (s.length >= 14) isDetail = true;   // ada nomor urut asli -> baris detail
    }

    return {
        ba, esI, prog, akun,
        kodePendek: parts.join('.'),
        sdLetter,
        isDetail
    };
}

// ==========================================================
// 3) TRANSFORMASI SELURUH BARIS
// ==========================================================
// Akun yang header(">")+multi-item("-") DIGABUNG jadi 1 baris (pagu dijumlah).
// Akun lain: tiap item ttp jadi baris sendiri (pakai teks header kalau ada).
const PKU_AKUN_MERGE_HEADER = ['524111'];

function pkuTransformAllRows(allInputs) {
    const seqCounters = {};   // nomor urut per prefixKey (khusus baris detail)
    const outputRows = [];
    let pendingHeader = null; // { text, jumlahSum, itemCount, prefixKey, akun, sd, ba, esI, prog }

    function sdLabel(letter) {
        return letter === 'D' ? 'PNBP' : (letter === 'A' ? 'RM' : '');
    }

    function flushPendingHeader() {
        if (pendingHeader && PKU_AKUN_MERGE_HEADER.includes(pendingHeader.akun) && pendingHeader.itemCount > 0) {
            emitDetailRow(pendingHeader.prefixKey, {
                uraian: pendingHeader.text,
                jumlah: pendingHeader.jumlahSum,
                vol: '',
                sd: pendingHeader.sd,
                ba: pendingHeader.ba,
                esI: pendingHeader.esI,
                prog: pendingHeader.prog
            });
        }
        pendingHeader = null;
    }

    function emitDetailRow(prefixKey, f) {
        seqCounters[prefixKey] = (seqCounters[prefixKey] || 0) + 1;
        const seq = String(seqCounters[prefixKey]).padStart(2, '0');
        outputRows.push({
            kode: prefixKey + '.' + seq,
            uraian: f.uraian,
            vol: f.vol || '',
            pagu: f.jumlah || 0,
            sd: f.sd,
            ba: f.ba,
            esI: f.esI,
            prog: f.prog,
            isDetail: true,
            seksi: []
        });
    }

    allInputs.forEach(input => {
        const info = pkuParseAnyCode(input.fullCode);
        if (!info) return;

        const sd = sdLabel(info.sdLetter);

        if (!info.isDetail) {
            // Baris hierarki (Kegiatan/RO/Komponen/SubKomponen/Huruf/Akun) -> baris sendiri langsung,
            // tanpa nomor urut & tanpa logic header/item (itu cuma berlaku di level detail).
            flushPendingHeader();
            outputRows.push({
                kode: info.kodePendek,
                uraian: String(input.uraian || '').trim(),
                vol: input.vol || '',
                pagu: input.jumlah || 0,
                sd,
                ba: info.ba,
                esI: info.esI,
                prog: info.prog,
                isDetail: false,
                seksi: []
            });
            return;
        }

        // ---- Baris DETAIL ----
        const prefixKey = info.kodePendek;
        if (pendingHeader && pendingHeader.prefixKey !== prefixKey) flushPendingHeader();

        const label = String(input.uraian || '').trim();
        const isHeader = label.startsWith('>');
        const isItem = label.startsWith('-');
        const akun = info.akun;

        if (isHeader) {
            flushPendingHeader();
            pendingHeader = {
                text: label.replace(/^>\s*/, '').trim(),
                jumlahSum: 0,
                itemCount: 0,
                prefixKey, akun, sd, ba: info.ba, esI: info.esI, prog: info.prog
            };
            return;
        }

        if (isItem) {
            const itemText = label.replace(/^-\s*/, '').trim();
            if (pendingHeader && pendingHeader.prefixKey === prefixKey) {
                pendingHeader.jumlahSum += (input.jumlah || 0);
                pendingHeader.itemCount += 1;
                if (PKU_AKUN_MERGE_HEADER.includes(akun)) return; // akumulasi dulu, di-emit saat flush
                emitDetailRow(prefixKey, { uraian: pendingHeader.text, jumlah: input.jumlah, vol: input.vol, sd, ba: info.ba, esI: info.esI, prog: info.prog });
                return;
            }
            emitDetailRow(prefixKey, { uraian: itemText, jumlah: input.jumlah, vol: input.vol, sd, ba: info.ba, esI: info.esI, prog: info.prog });
            return;
        }

        // Baris detail tanpa "-"/">" (jarang, jaga2): perlakukan sbg item biasa.
        emitDetailRow(prefixKey, { uraian: label, jumlah: input.jumlah, vol: input.vol, sd, ba: info.ba, esI: info.esI, prog: info.prog });
    });

    flushPendingHeader();
    return outputRows;
}

// ==========================================================
// 4) ALUR UTAMA: parse file -> tampilkan preview
// ==========================================================
async function pkuHandleParse() {
    const fileInput = document.getElementById('pku-fileInput');
    const statusEl = document.getElementById('pku-status');
    const file = fileInput.files[0];

    if (!file) {
        alert('Pilih file Excel Kertas Kerja terlebih dahulu.');
        return;
    }
    const namaLower = file.name.toLowerCase();
    if (!namaLower.endsWith('.xls') && !namaLower.endsWith('.xlsx') && !namaLower.endsWith('.html') && !namaLower.endsWith('.htm')) {
        alert('File harus hasil export Kertas Kerja (.xls).');
        return;
    }

    statusEl.textContent = 'Membaca & mengekstrak data dari file...';
    statusEl.className = 'text-sm text-sky-600';

    try {
        const allInputs = await pkuExtractAllInputsFromExcel(file);
        pkuRawLeaf = allInputs;
        document.getElementById('pku-debugText').value = allInputs
            .map(l => `${l.fullCode}|| ${l.uraian}  [Vol: ${l.vol || '-'}]  [Jumlah: ${l.jumlah}]`)
            .join('\n');

        pkuParsedRows = pkuTransformAllRows(allInputs);

        if (pkuParsedRows.length === 0) {
            statusEl.textContent = '⚠️ Tidak ada baris yang berhasil diparsing. Klik "Lihat Data Mentah" untuk cek hasil ekstraksinya, atau pastikan file yang diupload benar (hasil export Kertas Kerja).';
            statusEl.className = 'text-sm text-amber-600';
            document.getElementById('pku-debugBox').classList.remove('hidden');
            document.getElementById('pku-previewWrap').classList.add('hidden');
            document.getElementById('pku-seksiBox').classList.add('hidden');
            return;
        }

        const jumlahDetail = pkuParsedRows.filter(r => r.isDetail).length;
        statusEl.textContent = `✅ Berhasil parsing ${pkuParsedRows.length} baris (${jumlahDetail} di antaranya baris detail). Cek & koreksi dulu di preview sebelum disimpan.`;
        statusEl.className = 'text-sm text-emerald-600';

        document.getElementById('pku-seksiBox').classList.remove('hidden');
        pkuRenderPreview();
        document.getElementById('pku-previewWrap').classList.remove('hidden');

    } catch (e) {
        console.error('Gagal parsing file:', e);
        statusEl.textContent = '❌ ' + (e.message || 'Gagal memproses file.');
        statusEl.className = 'text-sm text-red-500';
    }
}

// ==========================================================
// 5) PREVIEW (editable) & PILIH SEKSI PER BARIS (bisa >1)
// ==========================================================
function pkuEsc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Escape khusus utk isi atribut HTML yang dibungkus tanda kutip TUNGGAL
// (dipakai utk nyimpen JSON array Seksi di data-seksi='...').
function pkuAttrEscSingle(s) {
    return String(s ?? '').replace(/'/g, '&#39;');
}

function pkuRenderPreview() {
    const tbody = document.getElementById('pku-previewBody');
    document.getElementById('pku-jumlahBaris').textContent = pkuParsedRows.length;

    tbody.innerHTML = pkuParsedRows.map((r, idx) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 ${r.isDetail ? '' : 'bg-slate-50'}" data-idx="${idx}" data-is-detail="${r.isDetail ? '1' : '0'}">
            <td class="p-1.5"><input type="text" class="pku-f-kode w-40 px-1.5 py-1 border border-slate-200 rounded text-xs ${r.isDetail ? 'font-semibold text-slate-800' : 'text-slate-500'}" value="${pkuEsc(r.kode)}"></td>
            <td class="p-1.5"><input type="text" class="pku-f-uraian w-full min-w-[260px] px-1.5 py-1 border border-slate-200 rounded text-xs" value="${pkuEsc(r.uraian)}"></td>
            <td class="p-1.5"><input type="text" class="pku-f-vol w-20 px-1.5 py-1 border border-slate-200 rounded text-xs" value="${pkuEsc(r.vol)}"></td>
            <td class="p-1.5"><input type="text" class="pku-f-pagu w-28 px-1.5 py-1 border border-slate-200 rounded text-xs text-right" value="${pkuEsc(r.pagu)}"></td>
            <td class="p-1.5">
                <select class="pku-f-sd w-20 px-1 py-1 border border-slate-200 rounded text-xs">
                    <option value="" ${!r.sd ? 'selected' : ''}>-</option>
                    <option value="RM" ${r.sd === 'RM' ? 'selected' : ''}>RM</option>
                    <option value="PNBP" ${r.sd === 'PNBP' ? 'selected' : ''}>PNBP</option>
                </select>
            </td>
            <td class="p-1.5">
                <button type="button" class="pku-btnPilihSeksi px-2 py-1 border border-slate-200 rounded text-xs bg-white hover:bg-slate-50 w-32 text-left truncate"
                    data-idx="${idx}" data-seksi='${pkuAttrEscSingle(JSON.stringify(r.seksi || []))}'>
                    ${(r.seksi && r.seksi.length) ? pkuEsc(r.seksi.join(', ')) : '-- pilih --'}
                </button>
            </td>
            <td class="p-1.5"><input type="text" class="pku-f-ba w-14 px-1.5 py-1 border border-slate-200 rounded text-xs text-center" value="${pkuEsc(r.ba)}"></td>
            <td class="p-1.5"><input type="text" class="pku-f-esi w-14 px-1.5 py-1 border border-slate-200 rounded text-xs text-center" value="${pkuEsc(r.esI)}"></td>
            <td class="p-1.5"><input type="text" class="pku-f-prog w-16 px-1.5 py-1 border border-slate-200 rounded text-xs text-center" value="${pkuEsc(r.prog)}"></td>
            <td class="p-1.5 text-center"><button class="pku-btnHapusRow text-red-500 hover:text-red-700" title="Hapus baris ini"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.pku-btnHapusRow').forEach(btn => {
        btn.onclick = () => {
            const tr = btn.closest('tr');
            const idx = Number(tr.dataset.idx);
            pkuParsedRows.splice(idx, 1);
            pkuRenderPreview();
        };
    });

    tbody.querySelectorAll('.pku-btnPilihSeksi').forEach(btn => {
        btn.onclick = () => pkuOpenPilihSeksiPopup(btn);
    });
}

// Popup kecil (checklist) utk pilih Seksi 1 baris — boleh centang lebih dari 1.
// Update dilakukan LANGSUNG ke tombolnya (dataset + teks), TIDAK render ulang
// seluruh tabel, supaya edit manual di kolom lain tidak ikut hilang.
function pkuOpenPilihSeksiPopup(btnEl) {
    let selected;
    try { selected = new Set(JSON.parse(btnEl.dataset.seksi || '[]')); } catch (e) { selected = new Set(); }

    const { overlay, popup } = commonOpenOverlay(`
        <h3 class="text-base font-semibold text-sky-700 mb-1"><i class="fa-solid fa-building mr-2"></i>Pilih Seksi</h3>
        <p class="text-xs text-slate-400 mb-2">Boleh pilih lebih dari 1 — baris ini akan diduplikasi per Seksi yang dipilih saat disimpan.</p>
        <div id="pku-pilihSeksiList" class="flex flex-col gap-2 max-h-64 overflow-y-auto mb-3 border border-slate-100 rounded-lg p-2">
            ${pkuSeksiList.length ? pkuSeksiList.map(s => `
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" value="${pkuEsc(s)}" ${selected.has(s) ? 'checked' : ''}> ${pkuEsc(s)}
                </label>
            `).join('') : '<span class="text-xs text-slate-400">Belum ada Seksi tersedia, tambahkan dulu lewat kotak "Tambah Seksi baru" di atas tabel.</span>'}
        </div>
        <div class="flex justify-end gap-2">
            <button id="pku-pilihSeksiBatal" class="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="pku-pilihSeksiOk" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">Terapkan</button>
        </div>
    `, 'max-w-xs');

    popup.querySelector('#pku-pilihSeksiBatal').onclick = () => overlay.remove();
    popup.querySelector('#pku-pilihSeksiOk').onclick = () => {
        const chosen = Array.from(popup.querySelectorAll('#pku-pilihSeksiList input:checked')).map(cb => cb.value);
        btnEl.textContent = chosen.length ? chosen.join(', ') : '-- pilih --';
        btnEl.dataset.seksi = JSON.stringify(chosen);
        overlay.remove();
    };
}

// Baca ulang nilai dari input-input di preview (jaga2 kalau user sempat edit
// manual tapi belum di-render ulang) sebelum disimpan. seksiList tiap baris
// diambil dari dataset tombol Pilih Seksi (bisa berisi >1 nama).
function pkuReadPreviewFromDom() {
    const rows = [];
    document.querySelectorAll('#pku-previewBody tr').forEach(tr => {
        const seksiBtn = tr.querySelector('.pku-btnPilihSeksi');
        let seksiList = [];
        try { seksiList = JSON.parse(seksiBtn ? (seksiBtn.dataset.seksi || '[]') : '[]'); } catch (e) { seksiList = []; }

        rows.push({
            kode: tr.querySelector('.pku-f-kode').value.trim(),
            uraian: tr.querySelector('.pku-f-uraian').value.trim(),
            vol: tr.querySelector('.pku-f-vol').value.trim(),
            pagu: pkuParseAngka(tr.querySelector('.pku-f-pagu').value),
            sd: tr.querySelector('.pku-f-sd').value,
            seksiList,
            ba: tr.querySelector('.pku-f-ba').value.trim(),
            esI: tr.querySelector('.pku-f-esi').value.trim(),
            prog: tr.querySelector('.pku-f-prog').value.trim(),
            isDetail: tr.dataset.isDetail === '1'
        });
    });
    return rows;
}

// Kotak "Tambah Seksi baru" (di atas tabel) — nama yang ditambahkan langsung
// tersedia di popup Pilih Seksi berikutnya (tidak perlu render ulang apapun).
function pkuTambahSeksiBaru() {
    const input = document.getElementById('pku-seksiBaruInput');
    const nama = input.value.trim();
    if (!nama) return;
    if (!pkuSeksiList.includes(nama)) {
        pkuSeksiList.push(nama);
    }
    input.value = '';
}

// ==========================================================
// 6) SIMPAN KE SHEET pok_upload (antrean review)
// ==========================================================
async function pkuSimpanKeServer() {
    const baseRows = pkuReadPreviewFromDom();
    if (baseRows.length === 0) {
        alert('Tidak ada baris untuk disimpan.');
        return;
    }

    const tanpaSeksi = baseRows.filter(r => !r.seksiList || r.seksiList.length === 0).length;
    if (tanpaSeksi > 0) {
        alert(`Masih ada ${tanpaSeksi} baris yang belum dipilih Seksi-nya. Isi dulu kolom Seksi di semua baris sebelum menyimpan.`);
        return;
    }

    // Baris dengan >1 Seksi diduplikasi, 1 baris per Seksi yang dipilih.
    const finalRows = [];
    baseRows.forEach(r => {
        const { seksiList, ...rest } = r;
        seksiList.forEach(seksi => finalRows.push({ ...rest, seksi }));
    });

    const btn = document.getElementById('pku-btnSimpan');
    const statusEl = document.getElementById('pku-status');
    btn.disabled = true;
    statusEl.textContent = `Mengirim ${finalRows.length} baris ke sheet pok_upload untuk direview...`;
    statusEl.className = 'text-sm text-sky-600';

    try {
        const result = await apiPost({
            action: 'simpanPOKDataUpload',
            rows: finalRows,
            userLogin: localStorage.getItem('nama') || ''
        }, 60000);
        if (result.status === 'success') {
            statusEl.textContent = `✅ ${result.jumlah} baris berhasil masuk ke sheet pok_upload. Klik "Lihat Data di pok_upload" di atas utk review & submit ke pok_sumber_2026.`;
            statusEl.className = 'text-sm text-emerald-600';
            showToast('Data berhasil dikirim untuk direview');
        } else {
            statusEl.textContent = '❌ ' + (result.message || 'Gagal menyimpan.');
            statusEl.className = 'text-sm text-red-500';
        }
    } catch (e) {
        statusEl.textContent = '❌ ' + (e.message || 'Gagal menyimpan.');
        statusEl.className = 'text-sm text-red-500';
    } finally {
        btn.disabled = false;
    }
}

// ==========================================================
// 7) POPUP: Lihat Data di pok_upload + Kirim ke pok_sumber_2026
// ==========================================================
async function pkuOpenViewUploadPopup() {
    const { overlay, popup } = commonOpenOverlay(`
        <div class="flex items-center justify-between mb-2 gap-3">
            <h3 class="text-base font-semibold text-sky-700"><i class="fa-solid fa-table mr-2"></i>Data di Sheet pok_upload</h3>
            <button id="pku-viewClose" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="pku-viewBody" class="overflow-auto max-h-[60vh] border border-slate-200 rounded-xl">
            <div class="text-center text-slate-400 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</div>
        </div>
        <div class="flex justify-end gap-2 mt-3">
            <button id="pku-viewCancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Tutup</button>
            <button id="pku-viewSubmit" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-paper-plane mr-1"></i> Kirim ke pok_sumber_2026
            </button>
        </div>
    `, 'max-w-6xl');

    popup.querySelector('#pku-viewClose').onclick = () => overlay.remove();
    popup.querySelector('#pku-viewCancel').onclick = () => overlay.remove();

    const bodyEl = popup.querySelector('#pku-viewBody');

    async function loadData() {
        bodyEl.innerHTML = `<div class="text-center text-slate-400 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</div>`;
        try {
            const result = await apiPost({ action: 'getPokUploadData' });
            if (!result || result.status !== 'success') throw new Error(result && result.message);
            const rows = result.rows || [];
            if (!rows.length) {
                bodyEl.innerHTML = `<div class="text-center text-slate-400 py-10">Belum ada data di pok_upload.</div>`;
                return;
            }
            bodyEl.innerHTML = `
                <table class="w-full text-xs border-collapse">
                    <thead class="bg-slate-100 sticky top-0">
                        <tr>
                            <th class="p-2 text-left">Kode</th><th class="p-2 text-left">Uraian</th>
                            <th class="p-2 text-left">Vol</th><th class="p-2 text-right">Pagu</th>
                            <th class="p-2 text-center">SD</th><th class="p-2 text-center">Seksi</th>
                            <th class="p-2 text-center">BA</th><th class="p-2 text-center">Es I</th>
                            <th class="p-2 text-center">Prog</th><th class="p-2 text-center">Detail?</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr class="border-b border-slate-100 ${r.isDetail ? '' : 'bg-slate-50'}">
                                <td class="p-2 whitespace-nowrap">${pkuEsc(r.kode)}</td>
                                <td class="p-2">${pkuEsc(r.uraian)}</td>
                                <td class="p-2 whitespace-nowrap">${pkuEsc(r.vol)}</td>
                                <td class="p-2 text-right whitespace-nowrap">${Number(r.pagu || 0).toLocaleString('id-ID')}</td>
                                <td class="p-2 text-center">${pkuEsc(r.sd)}</td>
                                <td class="p-2 text-center">${pkuEsc(r.seksi)}</td>
                                <td class="p-2 text-center">${pkuEsc(r.ba)}</td>
                                <td class="p-2 text-center">${pkuEsc(r.esI)}</td>
                                <td class="p-2 text-center">${pkuEsc(r.prog)}</td>
                                <td class="p-2 text-center">${r.isDetail ? '<i class="fa-solid fa-check text-emerald-600"></i>' : ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            bodyEl.innerHTML = `<div class="text-center text-red-500 py-10">❌ ${e.message || 'Gagal memuat data.'}</div>`;
        }
    }

    popup.querySelector('#pku-viewSubmit').onclick = async function () {
        if (!confirm('Yakin ingin mengirim SEMUA data di pok_upload ke pok_sumber_2026?\n\nBaris detail otomatis diisi formula Blokir/Realisasi/Sisa. Data di pok_upload akan dikosongkan setelah berhasil.')) return;

        const btn = this;
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Mengirim...';

        try {
            const result = await apiPost({ action: 'submitPokUploadToSumber' }, 90000);
            if (result.status === 'success') {
                showToast(`Berhasil: ${result.jumlahBaru} baris baru, ${result.jumlahUpdate} baris diperbarui di pok_sumber_2026`);
                await loadData();
            } else {
                alert('Gagal: ' + (result.message || 'Tidak diketahui'));
            }
        } catch (e) {
            alert('Gagal: ' + (e.message || 'Tidak diketahui'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    };

    await loadData();
}

window.initPokUploadPage = initPokUploadPage;
