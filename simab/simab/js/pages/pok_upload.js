/**
 * Halaman Upload POK (Kertas Kerja)
 * -----------------------------------------------------------------------
 * Upload PDF Kertas Kerja RKAKL -> ekstrak baris rincian detail -> preview
 * (bisa diedit manual) -> pilih Seksi (bisa >1, data terduplikasi per
 * Seksi) -> simpan ke sheet pok_sumber_2026 (backend: simpanPOKDataUpload).
 *
 * ======================= CATATAN PENTING =======================
 * Aturan transformasi KODE (lihat pkuTransformLeafRows) sudah pasti/exact
 * sesuai spesifikasi yang diberikan — itu murni logic teks, tidak
 * tergantung PDF.
 *
 * Yang MASIH PERLU DIUJI dengan PDF asli adalah bagian EKSTRAKSI TEKS DARI
 * PDF (pkuExtractLinesFromPdf + pkuParseLine/pkuSplitRestIntoFields) —
 * karena posisi kolom (Vol/Harga Satuan/Jumlah) di PDF asli belum pernah
 * saya lihat langsung, cuma dari contoh & versi HTML/xls kertas kerja yang
 * mirip. Kalau hasil parsing meleset, klik "Lihat Teks Mentah" utk lihat
 * apa yang benar-benar diekstrak dari PDF-nya, lalu kirim itu supaya
 * logic pemisahan kolomnya bisa disesuaikan.
 *
 * Semua baris preview BISA DIEDIT MANUAL sebelum disimpan, sebagai jaring
 * pengaman terhadap kemungkinan parsing yang belum sempurna.
 * -----------------------------------------------------------------------
 */


let pkuParsedRows = [];   // hasil transformasi kode, sebelum duplikasi Seksi
let pkuSeksiList = [];    // daftar Seksi (checkbox)
let pkuRawLines = [];     // teks mentah per baris hasil ekstraksi pdf.js (debug)

async function initPokUploadPage() {
    const btnParse = document.getElementById('pku-btnParse');
    const btnToggleDebug = document.getElementById('pku-btnToggleDebug');
    const btnTambahSeksi = document.getElementById('pku-btnTambahSeksi');
    const btnSimpan = document.getElementById('pku-btnSimpan');
    if (!btnParse) return; // fragment belum ter-render

    pkuParsedRows = [];
    pkuRawLines = [];
    document.getElementById('pku-previewWrap').classList.add('hidden');
    document.getElementById('pku-seksiBox').classList.add('hidden');
    document.getElementById('pku-debugBox').classList.add('hidden');
    document.getElementById('pku-status').textContent = '';

    btnParse.onclick = pkuHandleParse;
    btnToggleDebug.onclick = () => document.getElementById('pku-debugBox').classList.toggle('hidden');
    btnTambahSeksi.onclick = pkuTambahSeksiBaru;
    btnSimpan.onclick = pkuSimpanKeServer;

    // Ambil daftar Seksi yang sudah pernah dipakai, buat pilihan checkbox.
    try {
        const result = await apiPost({ action: 'getDaftarSeksi' });
        pkuSeksiList = (result && result.status === 'success') ? (result.seksi || []) : [];
    } catch (e) {
        console.error('Gagal memuat daftar Seksi:', e);
        pkuSeksiList = [];
    }
    pkuRenderSeksiChecklist();
}

// ==========================================================
// 1) EKSTRAKSI TEKS DARI PDF (pdf.js) — lihat catatan di kepala file
// ==========================================================
async function pkuExtractLinesFromPdf(file) {
    const pdfjsLib = await simabLoadPdfJs(); // sudah tersedia global dari pdf-viewer.js
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const lines = [];

    for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const content = await page.getTextContent();

        // Kelompokkan text item jadi baris berdasarkan koordinat Y (toleransi kecil
        // krn variasi rendering font), lalu urutkan tiap baris berdasarkan X.
        const rows = [];
        content.items.forEach(it => {
            if (!it.str || !it.str.trim()) return;
            const x = it.transform[4];
            const y = Math.round(it.transform[5]);
            let row = rows.find(r => Math.abs(r.y - y) <= 2);
            if (!row) { row = { y, items: [] }; rows.push(row); }
            row.items.push({ str: it.str, x });
        });

        rows.sort((a, b) => b.y - a.y); // Y besar = lebih atas di halaman PDF
        rows.forEach(r => {
            r.items.sort((a, b) => a.x - b.x);
            const lineText = r.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
            if (lineText) lines.push(lineText);
        });
    }

    return lines;
}

// Cari pola "<kode penuh>||" di awal baris teks.
function pkuParseLine(line) {
    const m = line.match(/([0-9A-Za-z.]+)\|\|\s*(.*)$/);
    if (!m) return null;
    return { fullCode: m[1], rest: m[2] || '' };
}

// Pisahkan sisa teks (`rest`) jadi { uraian, jumlah }: ambil SEMUA token angka
// format Indonesia (mis. "1.234.567" atau "2,00"), anggap token angka
// TERAKHIR sebagai Jumlah (Pagu), sisanya (dgn angka2 dibuang) jadi Uraian.
function pkuSplitRestIntoFields(rest) {
    const numMatches = [...rest.matchAll(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?/g)];
    const jumlah = numMatches.length ? pkuParseAngka(numMatches[numMatches.length - 1][0]) : 0;

    let uraian = rest;
    numMatches.forEach(mm => { uraian = uraian.replace(mm[0], ' '); });
    uraian = uraian.replace(/\s{2,}/g, ' ').trim();

    return { uraian, jumlah };
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
// 2) TRANSFORMASI KODE — sesuai spesifikasi (bagian ini EXACT, tidak
//    tergantung kualitas ekstraksi PDF)
// ==========================================================
// Format kode penuh (14 segmen dipisah "."):
// [0]=satker [1]=BA [2]=EsI [3]=Prog [4]=Kegiatan [5]=RO [6]=(skip) [7]=(skip)
// [8]=Komponen [9]=SubKomponen [10]=Huruf [11]=Akun [12]=SD(A/D) [13]=NomorAsli(00001..)
//
// Kode pendek = [4].[5].[8].[9].[10].[11] + "." + <nomor urut ulang per Akun>
// SD: segmen[12] 'D' -> PNBP, 'A' -> RM
// BA/EsI/Prog diambil dari segmen[1],[2],[3]
//
// Hanya baris DETAIL (14 segmen, segmen[13] berupa 5 digit angka) yang jadi
// baris output. Baris di atasnya (Kegiatan/RO/Komponen/dst) tidak dikirim
// ke tabel, cuma bagian dari kode penuh baris detail itu sendiri.
const PKU_AKUN_MERGE_HEADER = ['524111']; // akun yg header+multi-item digabung jadi 1 baris

function pkuTransformLeafRows(leafInputs) {
    // leafInputs: [{ fullCode, uraian, jumlah, vol }], urut sesuai urutan terbit di PDF
    const seqCounters = {};
    const outputRows = [];
    let pendingHeader = null; // { text, jumlahSum, prefixKey, akun, sd, ba, esI, prog }

    function flushPendingHeader() {
        if (pendingHeader && PKU_AKUN_MERGE_HEADER.includes(pendingHeader.akun) && pendingHeader.itemCount > 0) {
            emitRow(pendingHeader.prefixKey, {
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

    function emitRow(prefixKey, f) {
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
            prog: f.prog
        });
    }

    leafInputs.forEach(input => {
        const s = String(input.fullCode).split('.');
        if (s.length < 14) return; // bukan baris detail yg valid, lewati

        const ba = s[1], esI = s[2], prog = s[3];
        const akun = s[11];
        const sdRaw = s[12];
        const sd = sdRaw === 'D' ? 'PNBP' : (sdRaw === 'A' ? 'RM' : '');
        const prefixKey = [s[4], s[5], s[8], s[9], s[10], s[11]].join('.');

        // Tutup grup header sebelumnya kalau pindah scope (akun/detail beda).
        if (pendingHeader && pendingHeader.prefixKey !== prefixKey) {
            flushPendingHeader();
        }

        const label = String(input.uraian || '').trim();
        const isHeader = label.startsWith('>');
        const isItem = label.startsWith('-');

        if (isHeader) {
            flushPendingHeader();
            pendingHeader = {
                text: label.replace(/^>\s*/, '').trim(),
                jumlahSum: 0,
                itemCount: 0,
                prefixKey, akun, sd, ba, esI, prog
            };
            return; // header sendiri tidak jadi baris
        }

        if (isItem) {
            const itemText = label.replace(/^-\s*/, '').trim();
            if (pendingHeader && pendingHeader.prefixKey === prefixKey) {
                pendingHeader.jumlahSum += (input.jumlah || 0);
                pendingHeader.itemCount += 1;
                if (PKU_AKUN_MERGE_HEADER.includes(akun)) {
                    return; // akumulasi dulu, di-emit saat flush (digabung 1 baris)
                }
                // akun lain: tiap item tetap jadi baris sendiri, pakai teks header
                emitRow(prefixKey, { uraian: pendingHeader.text, jumlah: input.jumlah, vol: input.vol, sd, ba, esI, prog });
                return;
            }
            // item tanpa header aktif di scope ini -> baris sendiri, pakai teks item sendiri
            emitRow(prefixKey, { uraian: itemText, jumlah: input.jumlah, vol: input.vol, sd, ba, esI, prog });
            return;
        }

        // Baris tanpa "-"/">" (jarang, tapi jaga2): perlakukan sbg item biasa.
        emitRow(prefixKey, { uraian: label, jumlah: input.jumlah, vol: input.vol, sd, ba, esI, prog });
    });

    flushPendingHeader();
    return outputRows;
}

// ==========================================================
// 3) ALUR UTAMA: parse file -> tampilkan preview
// ==========================================================
async function pkuHandleParse() {
    const fileInput = document.getElementById('pku-fileInput');
    const statusEl = document.getElementById('pku-status');
    const file = fileInput.files[0];

    if (!file) {
        alert('Pilih file PDF terlebih dahulu.');
        return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        alert('File harus berformat PDF.');
        return;
    }

    statusEl.textContent = 'Membaca & mengekstrak teks dari PDF...';
    statusEl.className = 'text-sm text-sky-600';

    try {
        pkuRawLines = await pkuExtractLinesFromPdf(file);
        document.getElementById('pku-debugText').value = pkuRawLines.join('\n');

        const leafInputs = [];
        pkuRawLines.forEach(line => {
            const parsed = pkuParseLine(line);
            if (!parsed) return;
            const segCount = parsed.fullCode.split('.').length;
            if (segCount < 14) return; // bukan baris detail (00001 dst), lewati
            const { uraian, jumlah } = pkuSplitRestIntoFields(parsed.rest);
            if (!uraian) return; // baris kode tanpa label -> lewati (kemungkinan noise ekstraksi)
            leafInputs.push({ fullCode: parsed.fullCode, uraian, jumlah, vol: '' });
        });

        pkuParsedRows = pkuTransformLeafRows(leafInputs);

        if (pkuParsedRows.length === 0) {
            statusEl.textContent = '⚠️ Tidak ada baris detail yang berhasil diparsing. Klik "Lihat Teks Mentah" untuk cek hasil ekstraksi PDF-nya.';
            statusEl.className = 'text-sm text-amber-600';
            document.getElementById('pku-debugBox').classList.remove('hidden');
            document.getElementById('pku-previewWrap').classList.add('hidden');
            document.getElementById('pku-seksiBox').classList.add('hidden');
            return;
        }

        statusEl.textContent = `✅ Berhasil parsing ${pkuParsedRows.length} baris detail. Cek & koreksi dulu di preview sebelum disimpan.`;
        statusEl.className = 'text-sm text-emerald-600';

        document.getElementById('pku-seksiBox').classList.remove('hidden');
        pkuRenderPreview();
        document.getElementById('pku-previewWrap').classList.remove('hidden');

    } catch (e) {
        console.error('Gagal parsing PDF:', e);
        statusEl.textContent = '❌ ' + (e.message || 'Gagal memproses PDF.');
        statusEl.className = 'text-sm text-red-500';
    }
}

// ==========================================================
// 4) PREVIEW (editable) & SEKSI CHECKLIST
// ==========================================================
function pkuEsc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pkuRenderPreview() {
    const tbody = document.getElementById('pku-previewBody');
    document.getElementById('pku-jumlahBaris').textContent = pkuParsedRows.length;

    tbody.innerHTML = pkuParsedRows.map((r, idx) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50" data-idx="${idx}">
            <td class="p-1.5"><input type="text" class="pku-f-kode w-36 px-1.5 py-1 border border-slate-200 rounded text-xs" value="${pkuEsc(r.kode)}"></td>
            <td class="p-1.5"><input type="text" class="pku-f-uraian w-full min-w-[260px] px-1.5 py-1 border border-slate-200 rounded text-xs" value="${pkuEsc(r.uraian)}"></td>
            <td class="p-1.5"><input type="text" class="pku-f-vol w-20 px-1.5 py-1 border border-slate-200 rounded text-xs" value="${pkuEsc(r.vol)}"></td>
            <td class="p-1.5"><input type="text" class="pku-f-pagu w-28 px-1.5 py-1 border border-slate-200 rounded text-xs text-right" value="${pkuEsc(r.pagu)}"></td>
            <td class="p-1.5">
                <select class="pku-f-sd w-20 px-1 py-1 border border-slate-200 rounded text-xs">
                    <option value="RM" ${r.sd === 'RM' ? 'selected' : ''}>RM</option>
                    <option value="PNBP" ${r.sd === 'PNBP' ? 'selected' : ''}>PNBP</option>
                </select>
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
}

// Baca ulang nilai dari input-input di preview (jaga2 kalau user sempat edit
// manual tapi belum di-render ulang) sebelum disimpan.
function pkuReadPreviewFromDom() {
    const rows = [];
    document.querySelectorAll('#pku-previewBody tr').forEach(tr => {
        rows.push({
            kode: tr.querySelector('.pku-f-kode').value.trim(),
            uraian: tr.querySelector('.pku-f-uraian').value.trim(),
            vol: tr.querySelector('.pku-f-vol').value.trim(),
            pagu: pkuParseAngka(tr.querySelector('.pku-f-pagu').value),
            sd: tr.querySelector('.pku-f-sd').value,
            ba: tr.querySelector('.pku-f-ba').value.trim(),
            esI: tr.querySelector('.pku-f-esi').value.trim(),
            prog: tr.querySelector('.pku-f-prog').value.trim()
        });
    });
    return rows;
}

function pkuRenderSeksiChecklist() {
    const box = document.getElementById('pku-seksiChecklist');
    box.innerHTML = pkuSeksiList.map(s => `
        <label class="flex items-center gap-1.5 text-sm cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <input type="checkbox" class="pku-seksi-check" value="${pkuEsc(s)}"> ${pkuEsc(s)}
        </label>
    `).join('') || '<span class="text-xs text-slate-400">Belum ada Seksi tersimpan, tambahkan lewat kotak di bawah.</span>';
}

function pkuTambahSeksiBaru() {
    const input = document.getElementById('pku-seksiBaruInput');
    const nama = input.value.trim();
    if (!nama) return;
    if (!pkuSeksiList.includes(nama)) {
        pkuSeksiList.push(nama);
        pkuRenderSeksiChecklist();
        // langsung centang seksi yg baru ditambahkan
        const cb = document.querySelector(`.pku-seksi-check[value="${nama.replace(/"/g, '\\"')}"]`);
        if (cb) cb.checked = true;
    }
    input.value = '';
}

// ==========================================================
// 5) SIMPAN KE SERVER
// ==========================================================
async function pkuSimpanKeServer() {
    const selectedSeksi = Array.from(document.querySelectorAll('.pku-seksi-check:checked')).map(cb => cb.value);
    if (selectedSeksi.length === 0) {
        alert('Pilih minimal 1 Seksi terlebih dahulu.');
        return;
    }

    const baseRows = pkuReadPreviewFromDom();
    if (baseRows.length === 0) {
        alert('Tidak ada baris untuk disimpan.');
        return;
    }

    // Duplikasi tiap baris per Seksi yang dipilih.
    const finalRows = [];
    selectedSeksi.forEach(seksi => {
        baseRows.forEach(r => finalRows.push({ ...r, seksi }));
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
            statusEl.textContent = `✅ ${result.jumlah} baris berhasil masuk ke sheet pok_upload. Silakan review manual di sheet sebelum disubmit ke pok_sumber_2026.`;
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

window.initPokUploadPage = initPokUploadPage;
