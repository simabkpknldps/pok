/**
 * lpt.js
 * -----------------------------------------------------------------------
 * 1) Surat Tugas (ST) PDF -> Google Drive (aksi GAS 'uploadStKegiatan'),
 *    tautannya disimpan di kolom kegiatan.st_link, dibuka lewat viewer PDF.
 * 2) Konsep LPT (Laporan Pelaksanaan Tugas): editor + simpan (tabel
 *    lpt_konsep) + unduh .docx. Bisa disusun otomatis oleh Jarwo dari teks ST.
 *
 * Dipakai dari: kegiatan.js (tombol & klik uraian), dashboard.js (kartu
 * Perjalanan Dinas Saya), jarwo.js (unggah ST saat merekam).
 * Prasyarat SQL: supabase-st-lpt.sql. Prasyarat GAS: GAS_TAMBAHAN_UPLOAD_ST.gs.
 * -----------------------------------------------------------------------
 */
(function () {
    'use strict';

    const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function tglIndo(iso) {
        const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return '';
        return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`;
    }

    // "17 - 19 November 2026" / "17 November - 2 Desember 2026" / "17 November 2026"
    function rentangTugas(mulai, selesai) {
        const a = String(mulai || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        const b = String(selesai || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!a) return '';
        if (!b || (a[0] === b[0])) return tglIndo(mulai);
        if (a[1] === b[1] && a[2] === b[2]) return `${Number(a[3])} - ${Number(b[3])} ${BULAN[Number(a[2]) - 1]} ${a[1]}`;
        if (a[1] === b[1]) return `${Number(a[3])} ${BULAN[Number(a[2]) - 1]} - ${Number(b[3])} ${BULAN[Number(b[2]) - 1]} ${a[1]}`;
        return `${tglIndo(mulai)} - ${tglIndo(selesai)}`;
    }

    // Uraian kegiatan perjadin biasanya "(PNBP) ST-1574/KNL.1401/2026" -> nomor ST bersih.
    function nomorStBersih(uraian) {
        const s = String(uraian || '');
        const m = s.match(/ST-\d+\/[A-Za-z0-9.\-]+\/\d{4}/);
        return m ? m[0] : s.replace(/^\s*\((?:RM|PNBP)\)\s*/i, '').trim();
    }

    const isPerjadin = (mak) => /52411[13]/.test(String(mak || ''));
    const adaDrive = (l) => /drive\.google\.com|docs\.google\.com/i.test(String(l || ''));

    // ------------------------------------------------------------------
    // 1) ST -> Drive
    // ------------------------------------------------------------------
    function fileKeBase64(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result).split(',')[1]);
            r.onerror = () => reject(new Error('Gagal membaca file.'));
            r.readAsDataURL(file);
        });
    }

    async function stUploadFile(file, meta) {
        if (!file) throw new Error('File kosong.');
        if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran file maksimal 10MB.');
        const base64 = await fileKeBase64(file);
        const res = await apiPost({
            action: 'uploadStKegiatan',
            id: meta.id || '',
            fileData: base64,
            fileName: file.name || 'surat-tugas.pdf',
            uraian: meta.uraian || '',
            nomorST: nomorStBersih(meta.uraian || '')
        }, 90000);
        if (!res || res.status !== 'success' || !res.link) {
            throw new Error((res && res.message) || 'Unggah ST ke Drive gagal. Pastikan kode Apps Script terbaru (uploadStKegiatan) sudah dipasang.');
        }
        return res.link;
    }

    async function stSimpanLink(ids, link) {
        await waitSupabaseAuthReady();
        const { error } = await sb.from('kegiatan').update({ st_link: link }).in('id', ids);
        if (error) {
            if (/st_link/i.test(error.message || '')) throw new Error('Kolom st_link belum ada. Jalankan supabase-st-lpt.sql di Supabase terlebih dulu.');
            throw new Error(error.message);
        }
        // sinkronkan cache supaya tampilan langsung berubah
        (window.kegiatanRowsCache || []).forEach(r => { if (ids.includes(r.id)) r.st_link = link; });
        (window.kgAllRows || []).forEach(r => { if (ids.includes(r.A)) r.S = link; });
    }

    function stBuka(link, judul) {
        if (!link) return;
        if (adaDrive(link) && typeof window.simabOpenPdfViewer === 'function') {
            window.simabOpenPdfViewer({ title: judul || 'Surat Tugas', link: link, searchText: null });
        } else {
            window.open(link, '_blank', 'noopener');
        }
    }

    // ------------------------------------------------------------------
    // 2) Kumpulkan data kelompok ST (semua pelaksana dengan nomor ST yang sama)
    // ------------------------------------------------------------------
    async function kumpulkanGrup(idKegiatan) {
        await waitSupabaseAuthReady();
        const { data: dasar } = await sb.from('kegiatan').select('*').eq('id', idKegiatan).maybeSingle();
        if (!dasar) return null;
        const { data: baris } = await sb.from('kegiatan').select('*')
            .eq('uraian', dasar.uraian).eq('kantor_id', dasar.kantor_id).eq('tahun', dasar.tahun);
        const grup = (baris || []).filter(r => isPerjadin(r.mak));
        if (!grup.length) grup.push(dasar);
        const mulai = grup.map(r => r.tgl_mulai).filter(Boolean).sort()[0] || '';
        const selesai = grup.map(r => r.tgl_selesai || r.tgl_mulai).filter(Boolean).sort().slice(-1)[0] || '';
        const link = (grup.find(r => r.st_link) || {}).st_link || '';
        return {
            adaPerjadin: isPerjadin(dasar.mak), kantor_id: dasar.kantor_id, tahun: Number(dasar.tahun), uraian: String(dasar.uraian || '').trim(),
            nomor_st: nomorStBersih(dasar.uraian), ids: grup.map(r => r.id),
            pelaksana: [...new Set(grup.map(r => String(r.pelaksana || '').trim()).filter(Boolean))],
            tujuan: dasar.tujuan || '', tgl_st: dasar.tgl_st || '', tgl_mulai: mulai, tgl_selesai: selesai, st_link: link
        };
    }

    function konsepAwal(g) {
        return {
            nomor_lpt: '',
            nomor_nd: '', tgl_nd: '', seksi_nd: '',
            nomor_st: g.nomor_st, tgl_st: g.tgl_st || '', tgl_tugas: rentangTugas(g.tgl_mulai, g.tgl_selesai),
            hal: '',
            maksud: g.tujuan ? `Perjalanan dinas dalam rangka pelaksanaan tugas sesuai Surat Tugas, berlokasi di ${g.tujuan}.` : '',
            kegiatan: '',
            hasil: `Tugas yang dilaksanakan pada tanggal ${rentangTugas(g.tgl_mulai, g.tgl_selesai) || '...'} telah dilaksanakan dengan baik.`,
            simpulan: 'Kegiatan telah dilaksanakan dengan baik atas bantuan seluruh pihak yang kooperatif. Selanjutnya hasil dari kegiatan dapat digunakan sebagai dasar untuk proses lebih lanjut.',
            tempat: 'Denpasar', tgl_laporan: new Date().toISOString().slice(0, 10),
            mengetahui_jabatan: '', mengetahui_nama: '',
            pelaksana: g.pelaksana.join('\n'),
            catatan: ''
        };
    }

    // ------------------------------------------------------------------
    // 3) Pembuat .docx (dipisah supaya bisa diuji di Node)
    // ------------------------------------------------------------------
    function bangunDocx(D, k, namaKantor) {
        const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = D;
        const FONT = 'Arial';
        const SZ = 22; // 11pt
        const tr = (text, o) => new TextRun(Object.assign({ text: String(text), font: FONT, size: SZ }, o || {}));
        const p = (children, o) => new Paragraph(Object.assign({ children: Array.isArray(children) ? children : [children], spacing: { after: 100, line: 276 } }, o || {}));
        const tengah = (text, o) => p(tr(text, Object.assign({ bold: true }, o || {})), { alignment: AlignmentType.CENTER, spacing: { after: 0, line: 252 } });
        const isi = (text, indent) => p(tr(text), { alignment: AlignmentType.JUSTIFIED, indent: { left: indent || 0 } });
        const judul = (text) => p(tr(text, { bold: true }), { spacing: { before: 200, after: 100 }, keepNext: true });
        const baris = (s) => String(s || '').split(/\n\s*\n|\r?\n/).map(x => x.trim()).filter(Boolean);
        const tanpaBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        const noBorders = { top: tanpaBorder, bottom: tanpaBorder, left: tanpaBorder, right: tanpaBorder };
        const garis = { style: BorderStyle.SINGLE, size: 6, color: '000000' };

        const kantor = namaKantor || 'KANTOR PELAYANAN KEKAYAAN NEGARA DAN LELANG DENPASAR';
        const kantorSingkat = namaKantor ? namaKantor : 'KPKNL Denpasar';
        const kop = [
            tengah('KEMENTERIAN KEUANGAN REPUBLIK INDONESIA', { size: 22 }),
            tengah('DIREKTORAT JENDERAL KEKAYAAN NEGARA', { size: 22 }),
            tengah('KANTOR WILAYAH DIREKTORAT JENDERAL KEKAYAAN NEGARA', { size: 22 }),
            tengah('BALI DAN NUSA TENGGARA', { size: 22 }),
            tengah(String(kantor).toUpperCase(), { size: 22 }),
            new Paragraph({
                children: [tr('GEDUNG KEUANGAN NEGARA I, JALAN DR. KUSUMAATMAJA, DENPASAR, BALI 80235; TELEPON (0361) 229151, 234623; FAKSIMILE (0361) 229150; LAMAN www.djkn.kemenkeu.go.id', { size: 16 })],
                alignment: AlignmentType.CENTER, spacing: { after: 200 }, border: { bottom: garis }
            })
        ];

        const pel = baris(k.pelaksana.replace(/\r/g, '').split('\n').join('\n\n'));
        const wNo = 700, wNama = 8300;
        const sel = (text, w, o) => new TableCell({
            width: { size: w, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 100, right: 100 },
            children: [p(tr(text, o || {}), { spacing: { after: 0 } })]
        });
        const tabelPel = new Table({
            width: { size: wNo + wNama, type: WidthType.DXA }, columnWidths: [wNo, wNama],
            rows: [new TableRow({ children: [sel('No', wNo, { bold: true }), sel('Nama', wNama, { bold: true })] })]
                .concat(pel.map((n, i) => new TableRow({ children: [sel(String(i + 1), wNo), sel(n, wNama)] })))
        });

        const kalimatST = `Surat Tugas Nomor ${k.nomor_st}${k.tgl_st ? ' tanggal ' + tglIndo(k.tgl_st) : ''}${k.hal ? ' hal ' + k.hal : ''}${k.tgl_tugas ? ' tanggal penugasan ' + k.tgl_tugas : ''}`;
        const dasarND = k.nomor_nd
            ? `Berdasarkan Nota Dinas ${k.seksi_nd ? k.seksi_nd + ' ' : ''}Nomor ${k.nomor_nd}${k.tgl_nd ? ' tanggal ' + k.tgl_nd : ''}, Kepala ${kantorSingkat} menugaskan:`
            : `Kepala ${kantorSingkat} menugaskan:`;

        const hasil = baris(k.hasil);
        const body = [];
        body.push(tengah('LAPORAN'), tengah('TENTANG'), tengah('LAPORAN PELAKSANAAN TUGAS'),
            p(tr(`NOMOR ${k.nomor_lpt || 'LAP-.../KNL.1401.../' + (k.tgl_laporan || '').slice(0, 4)}`, { bold: true }), { alignment: AlignmentType.CENTER, spacing: { after: 240 } }));
        body.push(judul('A. Pendahuluan'));
        body.push(p(tr('1. Latar Belakang', { bold: false }), { spacing: { after: 60 }, keepNext: true }));
        body.push(isi(dasarND, 360), tabelPel, p(tr(''), { spacing: { after: 60 } }));
        body.push(isi(`Sesuai ${kalimatST}.`, 360));
        body.push(p(tr('2. Maksud dan Tujuan'), { spacing: { after: 60 }, keepNext: true }), ...baris(k.maksud).map(t => isi(t, 360)));
        body.push(p(tr('3. Dasar'), { spacing: { after: 60 }, keepNext: true }), isi(kalimatST + '.', 360));
        body.push(judul('B. Kegiatan yang Dilaksanakan'), ...baris(k.kegiatan).map(t => isi(t, 360)));
        body.push(judul('C. Hasil yang Dicapai'), ...hasil.map((t, i) => p([tr(`${i + 1}.  ${t}`)], { alignment: AlignmentType.JUSTIFIED, indent: { left: 720, hanging: 360 } })));
        body.push(judul('D. Simpulan dan Saran'), ...baris(k.simpulan).map(t => isi(t, 360)));
        body.push(judul('E. Penutup'), isi('Demikian laporan pelaksanaan tugas ini kami sampaikan dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.', 360));

        const kiri = [p(tr(''), { spacing: { after: 0 } })];
        if (k.mengetahui_jabatan) {
            kiri.length = 0;
            kiri.push(p(tr('Mengetahui,'), { spacing: { after: 0 } }), p(tr(k.mengetahui_jabatan), { spacing: { after: 900 } }), p(tr(k.mengetahui_nama || '', { bold: true }), { spacing: { after: 0 } }));
        }
        const kanan = [
            p(tr(`Dibuat di ${k.tempat || 'Denpasar'}`), { spacing: { after: 0 } }),
            p(tr(`pada tanggal ${tglIndo(k.tgl_laporan)}`), { spacing: { after: 0 } }),
            p(tr('Pembuat Laporan'), { spacing: { after: 700 } })
        ];
        pel.forEach(n => kanan.push(p(tr(n, { bold: true }), { spacing: { after: 500 } })));
        const ttd = new Table({
            width: { size: 9000, type: WidthType.DXA }, columnWidths: [4500, 4500],
            borders: { top: tanpaBorder, bottom: tanpaBorder, left: tanpaBorder, right: tanpaBorder, insideHorizontal: tanpaBorder, insideVertical: tanpaBorder },
            rows: [new TableRow({ cantSplit: true, children: [
                new TableCell({ width: { size: 4500, type: WidthType.DXA }, borders: noBorders, children: kiri }),
                new TableCell({ width: { size: 4500, type: WidthType.DXA }, borders: noBorders, children: kanan })
            ] })]
        });
        body.push(p(tr(''), { spacing: { after: 200 } }), ttd);

        return new Document({
            creator: 'SiMAB', title: 'Laporan Pelaksanaan Tugas ' + (k.nomor_st || ''),
            styles: { default: { document: { run: { font: FONT, size: SZ } } } },
            sections: [{
                properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 } } },
                children: kop.concat(body)
            }]
        });
    }

    let docxPromise = null;
    function muatDocx() {
        if (window.docx) return Promise.resolve(window.docx);
        if (docxPromise) return docxPromise;
        const sumber = [
            'https://cdn.jsdelivr.net/npm/docx@9.5.0/dist/index.iife.js',
            'https://unpkg.com/docx@9.5.0/dist/index.iife.js'
        ];
        docxPromise = (async () => {
            for (const src of sumber) {
                try {
                    await new Promise((res, rej) => {
                        const s = document.createElement('script');
                        s.src = src; s.onload = res; s.onerror = () => rej(new Error('gagal ' + src));
                        document.head.appendChild(s);
                    });
                    if (window.docx) return window.docx;
                } catch (e) { /* coba sumber berikutnya */ }
            }
            docxPromise = null;
            throw new Error('Gagal memuat pustaka pembuat Word (periksa koneksi internet).');
        })();
        return docxPromise;
    }

    // ------------------------------------------------------------------
    // 4) Teks ST dari PDF Drive (untuk bahan AI)
    // ------------------------------------------------------------------
    async function teksDariPdfDrive(link) {
        const r = await apiPost({ action: 'getDokumenFileBase64', link: link }, 60000);
        if (r.status !== 'success' || !r.base64) throw new Error(r.message || 'Gagal mengambil PDF ST.');
        const bin = atob(r.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (typeof window.simabLoadPdfJs !== 'function') throw new Error('Pustaka PDF belum dimuat.');
        const pdfjs = await window.simabLoadPdfJs();
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        let teks = '';
        for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
            const pg = await doc.getPage(i);
            const tc = await pg.getTextContent();
            teks += tc.items.map(x => x.str).join(' ') + '\n';
        }
        return teks.replace(/[ \t]+/g, ' ').trim();
    }

    // ------------------------------------------------------------------
    // 5) Editor Konsep LPT
    // ------------------------------------------------------------------
    async function bukaEditorLpt(idKegiatan) {
        let g;
        try { g = await kumpulkanGrup(idKegiatan); } catch (e) { alert('Gagal memuat data kegiatan: ' + (e.message || e)); return; }
        if (!g) { alert('Data kegiatan tidak ditemukan. Muat ulang halaman lalu coba lagi.'); return; }
        if (!g.adaPerjadin) { alert('Konsep LPT hanya untuk kegiatan perjalanan dinas (MAK 524111/524113).'); return; }

        let k = konsepAwal(g);
        let pernahTersimpan = false;
        try {
            await waitSupabaseAuthReady();
            const { data } = await sb.from('lpt_konsep').select('konten').eq('kantor_id', g.kantor_id).eq('tahun', g.tahun).eq('nomor_st', g.uraian).maybeSingle();
            if (data && data.konten) { k = Object.assign(k, data.konten); pernahTersimpan = true; }
        } catch (e) { /* tabel belum ada -> pakai konsep awal */ }

        const f = (id, label, nilai, tipe) => `<label class="text-xs font-semibold text-slate-600">${label}</label>
            <input id="lpt-${id}" type="${tipe || 'text'}" value="${esc(nilai)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">`;
        const ta = (id, label, nilai, baris) => `<label class="text-xs font-semibold text-slate-600">${label}</label>
            <textarea id="lpt-${id}" rows="${baris || 4}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">${esc(nilai)}</textarea>`;

        const { overlay, popup } = window.commonOpenOverlay(`
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h3 class="text-sky-700 font-semibold text-base">Konsep Laporan Pelaksanaan Tugas</h3>
                    <div class="text-xs text-slate-500">${esc(g.nomor_st)} &middot; ${esc(g.pelaksana.length)} pelaksana${pernahTersimpan ? ' &middot; konsep tersimpan dimuat' : ''}</div>
                </div>
                <button id="lpt-x" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            <div class="border border-sky-100 bg-sky-50 rounded-xl p-3 flex flex-col gap-2">
                <div class="text-xs font-semibold text-sky-800"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Susun otomatis dengan Jarwo</div>
                <textarea id="lpt-catatan" rows="2" placeholder="Catatan hasil (opsional): tulis poin singkat apa yang terjadi di lapangan, Jarwo akan merapikannya." class="w-full px-3 py-2 border border-sky-200 rounded-lg text-sm bg-white">${esc(k.catatan)}</textarea>
                <div class="flex flex-wrap items-center gap-2">
                    <button id="lpt-ai" class="px-3 py-1.5 bg-sky-700 text-white rounded-lg text-sm font-medium">Susun dengan AI</button>
                    <span id="lpt-stinfo" class="text-xs text-slate-500"></span>
                </div>
                <div id="lpt-status" class="text-xs min-h-[16px]"></div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                <div>${f('nomor_lpt', 'Nomor LPT', k.nomor_lpt)}</div>
                <div>${f('tgl_laporan', 'Tanggal laporan', k.tgl_laporan, 'date')}</div>
                <div>${f('nomor_nd', 'Nomor Nota Dinas', k.nomor_nd)}</div>
                <div>${f('tgl_nd', 'Tanggal Nota Dinas (mis. 9 November 2026)', k.tgl_nd)}</div>
                <div>${f('seksi_nd', 'Pembuat Nota Dinas (mis. Kepala Seksi Piutang Negara)', k.seksi_nd)}</div>
                <div>${f('tgl_tugas', 'Tanggal penugasan', k.tgl_tugas)}</div>
            </div>
            ${f('hal', 'Hal / perihal penugasan', k.hal)}
            ${ta('pelaksana', 'Pelaksana (satu nama per baris)', k.pelaksana, 3)}
            ${ta('maksud', 'A.2 Maksud dan Tujuan', k.maksud, 3)}
            ${ta('kegiatan', 'B. Kegiatan yang Dilaksanakan', k.kegiatan, 4)}
            ${ta('hasil', 'C. Hasil yang Dicapai (pisahkan tiap butir dengan baris kosong)', k.hasil, 6)}
            ${ta('simpulan', 'D. Simpulan dan Saran', k.simpulan, 3)}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                <div>${f('mengetahui_jabatan', 'Mengetahui — jabatan (kosongkan bila tidak ada)', k.mengetahui_jabatan)}</div>
                <div>${f('mengetahui_nama', 'Mengetahui — nama', k.mengetahui_nama)}</div>
            </div>
            <div id="lpt-msg" class="text-xs min-h-[16px]"></div>
            <div class="flex flex-wrap justify-end gap-2 mt-1">
                <button id="lpt-simpan" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Simpan konsep</button>
                <button id="lpt-docx" class="px-4 py-2 bg-sky-700 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-file-word mr-1"></i>Unduh .docx</button>
            </div>
        `, 'max-w-3xl');

        const $ = (id) => popup.querySelector('#lpt-' + id);
        const KOLOM = ['nomor_lpt', 'tgl_laporan', 'nomor_nd', 'tgl_nd', 'seksi_nd', 'tgl_tugas', 'hal', 'pelaksana', 'maksud', 'kegiatan', 'hasil', 'simpulan', 'mengetahui_jabatan', 'mengetahui_nama'];
        const ambil = () => {
            const o = Object.assign({}, k, { nomor_st: g.nomor_st, tgl_st: g.tgl_st || k.tgl_st, catatan: $('catatan').value });
            KOLOM.forEach(c => { o[c] = $(c).value; });
            return o;
        };
        const pesan = (el, teks, warna) => { el.textContent = teks; el.className = 'text-xs min-h-[16px] ' + (warna || 'text-slate-500'); };

        $('x').onclick = () => overlay.remove();

        // Info ST + unggah bila belum ada
        const stInfo = $('stinfo');
        const tampilStInfo = () => {
            if (g.st_link) {
                stInfo.innerHTML = `PDF ST tersimpan: <button type="button" id="lpt-lihatst" class="text-sky-700 underline">lihat</button>`;
                popup.querySelector('#lpt-lihatst').onclick = () => stBuka(g.st_link, 'Surat Tugas ' + g.nomor_st);
            } else {
                stInfo.innerHTML = `PDF ST belum diunggah. <label class="text-sky-700 underline cursor-pointer">Unggah PDF ST<input id="lpt-stfile" type="file" accept="application/pdf" class="hidden"></label>`;
                popup.querySelector('#lpt-stfile').onchange = async function () {
                    const file = this.files[0]; if (!file) return;
                    pesan($('status'), 'Mengunggah PDF ST ke Drive…', 'text-sky-700');
                    try {
                        const link = await stUploadFile(file, { id: g.ids[0], uraian: g.uraian });
                        await stSimpanLink(g.ids, link);
                        g.st_link = link;
                        pesan($('status'), 'PDF ST tersimpan di Drive.', 'text-green-700');
                        if (document.getElementById('kg-dataTableBody') && typeof window.kgLoadData === 'function') { try { window.kgLoadData(true); } catch (_) { /* abaikan */ } }
                        tampilStInfo();
                    } catch (e) { pesan($('status'), '❌ ' + (e.message || e), 'text-red-600'); }
                };
            }
        };
        tampilStInfo();

        // Susun dengan AI
        $('ai').onclick = async function () {
            if (typeof window.jarwoCall !== 'function') { pesan($('status'), 'Jarwo belum dimuat di halaman ini.', 'text-red-600'); return; }
            this.disabled = true;
            try {
                let stText = '';
                if (g.st_link && adaDrive(g.st_link)) {
                    pesan($('status'), 'Membaca PDF Surat Tugas…', 'text-sky-700');
                    try { stText = await teksDariPdfDrive(g.st_link); } catch (e) { pesan($('status'), 'PDF ST tidak terbaca (' + (e.message || e) + '), memakai data kegiatan saja…', 'text-amber-700'); }
                }
                pesan($('status'), 'Jarwo sedang menyusun konsep…', 'text-sky-700');
                const r = await window.jarwoCall({
                    mode: 'lpt', st_text: stText, catatan: $('catatan').value,
                    info: { nomor_st: g.nomor_st, tgl_st: tglIndo(g.tgl_st), tgl_tugas: $('tgl_tugas').value, tujuan: g.tujuan, pelaksana: g.pelaksana }
                });
                const d = r.draft || {};
                const isiBila = (id, v) => { if (v && String(v).trim()) $(id).value = Array.isArray(v) ? v.join('\n\n') : String(v); };
                isiBila('nomor_nd', d.nomor_nd); isiBila('tgl_nd', d.tgl_nd); isiBila('seksi_nd', d.seksi_nd); isiBila('hal', d.hal);
                isiBila('maksud', d.maksud); isiBila('kegiatan', d.kegiatan); isiBila('hasil', d.hasil); isiBila('simpulan', d.simpulan);
                pesan($('status'), '✅ Konsep tersusun. Periksa dan sesuaikan; bagian bertanda [lengkapi …] perlu Anda isi.', 'text-green-700');
            } catch (e) {
                pesan($('status'), '❌ ' + (e.message || e), 'text-red-600');
            } finally { this.disabled = false; }
        };

        // Simpan
        const simpan = async (diam) => {
            const o = ambil();
            try {
                await waitSupabaseAuthReady();
                const { error } = await sb.from('lpt_konsep').upsert({
                    kantor_id: g.kantor_id, tahun: g.tahun, nomor_st: g.uraian, konten: o,
                    diubah_oleh: localStorage.getItem('nama') || '', diubah_pada: new Date().toISOString()
                });
                if (error) throw new Error(/lpt_konsep/i.test(error.message || '') ? 'Tabel lpt_konsep belum ada. Jalankan supabase-st-lpt.sql di Supabase.' : error.message);
                k = o;
                if (!diam) pesan($('msg'), '✅ Konsep tersimpan.', 'text-green-700');
                return true;
            } catch (e) { pesan($('msg'), '❌ ' + (e.message || e), 'text-red-600'); return false; }
        };
        $('simpan').onclick = () => simpan(false);

        // Unduh .docx
        $('docx').onclick = async function () {
            this.disabled = true;
            try {
                pesan($('msg'), 'Menyiapkan berkas Word…', 'text-sky-700');
                const D = await muatDocx();
                const o = ambil();
                const doc = bangunDocx(D, o);
                const blob = await D.Packer.toBlob(doc);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'LPT ' + String(g.nomor_st).replace(/[\\/:*?"<>|]/g, '-') + '.docx';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                pesan($('msg'), '✅ Berkas diunduh.', 'text-green-700');
                simpan(true);
            } catch (e) { pesan($('msg'), '❌ ' + (e.message || e), 'text-red-600'); }
            finally { this.disabled = false; }
        };
    }

    window.stUploadFile = stUploadFile;
    window.stSimpanLink = stSimpanLink;
    window.stBuka = stBuka;
    window.lptBukaEditor = bukaEditorLpt;
    window.lptIsPerjadin = isPerjadin;
    window.lptInternal = { bangunDocx, tglIndo, rentangTugas, nomorStBersih };
    if (typeof module !== 'undefined') module.exports = window.lptInternal;
})();
