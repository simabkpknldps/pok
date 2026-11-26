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

    // Alamat Apps Script KHUSUS unggah/baca PDF ST (GAS_UPLOAD_ST_MANDIRI.gs).
    // Isi dengan alamat deployment "/exec" skrip itu. Bila kosong, dipakai Apps Script utama SiMAB.
    const ST_GAS_URL = 'https://script.google.com/macros/s/AKfycbzKLTQtH5SXUomuuhPWk3-JCEMufUMVWAVTBLv9bsjgqO2_xkYFPN8yAO-wd1MdliBPOg/exec';

    async function stPost(payload, timeout) {
        let url = ST_GAS_URL;
        try { url = localStorage.getItem('stGasUrl') || url; } catch (_) { /* abaikan */ }
        if (!url) return apiPost(payload, timeout);
        const ctl = new AbortController();
        const tid = setTimeout(() => ctl.abort(), timeout || 60000);
        try {
            const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload), signal: ctl.signal });
            if (!res.ok) throw new Error('Server error: ' + res.status);
            return await res.json();
        } finally { clearTimeout(tid); }
    }

    // Logo Kementerian Keuangan (PNG 200x186) untuk kop LPT.
    const LOGO_B64 = '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';
    const LOGO_RASIO = 186 / 200;
    function logoBytes() {
        const bin = atob(LOGO_B64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return u;
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
        const res = await stPost({
            action: 'uploadStKegiatan',
            id: meta.id || '',
            fileData: base64,
            fileName: file.name || 'surat-tugas.pdf',
            uraian: meta.uraian || '',
            nomorST: nomorStBersih(meta.uraian || '')
        }, 90000);
        if (!res || res.status !== 'success' || !res.link) {
            throw new Error((res && res.message) || 'Unggah ST ke Drive gagal. Pastikan Apps Script unggah ST (GAS_UPLOAD_ST_MANDIRI.gs) sudah di-deploy dan alamatnya terpasang.');
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
    // Foto dokumentasi: dikecilkan di browser (maks 1280 px, JPEG) lalu disimpan di konsep.
    // ------------------------------------------------------------------
    const MAKS_FOTO = 12;
    function dataUrlKeBytes(d) {
        const b = atob(String(d).split(',')[1] || ''); const u = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        return u;
    }
    function kompresFoto(file) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file); const im = new Image();
            im.onload = () => {
                const M = 1280; let w = im.naturalWidth, h = im.naturalHeight;
                const sk = Math.min(1, M / Math.max(w, h)); w = Math.max(1, Math.round(w * sk)); h = Math.max(1, Math.round(h * sk));
                const c = document.createElement('canvas'); c.width = w; c.height = h;
                const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
                URL.revokeObjectURL(url);
                res({ d: c.toDataURL('image/jpeg', 0.8), w, h, ket: '' });
            };
            im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Foto tidak bisa dibaca: ' + (file.name || ''))); };
            im.src = url;
        });
    }
    const fotoAda = (k) => (Array.isArray(k.foto) ? k.foto.filter(f => f && f.d) : []);

    // ------------------------------------------------------------------
    // 3) Pembuat .docx (dipisah supaya bisa diuji di Node)
    // ------------------------------------------------------------------
    function bangunDocx(D, k, namaKantor, logoBytes) {
        const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ImageRun, VerticalAlign, Tab } = D;
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
        const teksKop = [
            tengah('KEMENTERIAN KEUANGAN REPUBLIK INDONESIA', { size: 22 }),
            tengah('DIREKTORAT JENDERAL KEKAYAAN NEGARA', { size: 22 }),
            tengah('KANTOR WILAYAH DIREKTORAT JENDERAL KEKAYAAN NEGARA', { size: 22 }),
            tengah('BALI DAN NUSA TENGGARA', { size: 22 }),
            tengah(String(kantor).toUpperCase(), { size: 22 }),
            new Paragraph({
                children: [tr('GEDUNG KEUANGAN NEGARA I, JALAN DR. KUSUMAATMAJA, DENPASAR, BALI 80235; TELEPON (0361) 229151, 234623; FAKSIMILE (0361) 229150; LAMAN www.djkn.kemenkeu.go.id', { size: 16 })],
                alignment: AlignmentType.CENTER, spacing: { before: 40, after: 0 }
            })
        ];
        const wLogo = 1500, wTeks = 7855;
        const logoPx = 94;
        const selLogo = new TableCell({
            width: { size: wLogo, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ spacing: { after: 0 }, children: logoBytes ? [new ImageRun({ type: 'png', data: logoBytes, transformation: { width: logoPx, height: Math.round(logoPx * 186 / 200) } })] : [] })]
        });
        const selTeks = new TableCell({ width: { size: wTeks, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER, children: teksKop });
        const kop = [
            new Table({
                width: { size: wLogo + wTeks, type: WidthType.DXA }, columnWidths: [wLogo, wTeks],
                borders: { top: tanpaBorder, bottom: tanpaBorder, left: tanpaBorder, right: tanpaBorder, insideHorizontal: tanpaBorder, insideVertical: tanpaBorder },
                rows: [new TableRow({ children: [selLogo, selTeks] })]
            }),
            new Paragraph({ children: [tr('', { size: 4 })], spacing: { before: 0, after: 200, line: 100 }, border: { bottom: garis } })
        ];

        const pel = baris(k.pelaksana.replace(/\r/g, '').split('\n').join('\n\n'));
        const wNo = 700, wNama = 7935, geser = 720; // tabel sejajar dengan isi paragraf (geser 720 = 1,27 cm)
        const sel = (text, w, o) => new TableCell({
            width: { size: w, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 100, right: 100 },
            children: [p(tr(text, o || {}), { spacing: { after: 0 } })]
        });
        const tabelPel = new Table({
            indent: { size: geser, type: WidthType.DXA },
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
        // Butir bernomor: angka di 360, teks di 720 (tabulasi), isi paragraf juga di 720.
        const butir = (no, text, o) => new Paragraph(Object.assign({
            children: [new TextRun({ children: [no, new Tab(), text], font: FONT, size: SZ })],
            spacing: { after: 100, line: 276 }, indent: { left: 720, hanging: 360 }
        }, o || {}));
        body.push(butir('1.', 'Latar Belakang', { spacing: { after: 60 }, keepNext: true }));
        body.push(isi(dasarND, 720), tabelPel, p(tr(''), { spacing: { after: 60 } }));
        body.push(isi(`Sesuai ${kalimatST}.`, 720));
        body.push(butir('2.', 'Maksud dan Tujuan', { spacing: { after: 60 }, keepNext: true }), ...baris(k.maksud).map(t => isi(t, 720)));
        body.push(butir('3.', 'Dasar', { spacing: { after: 60 }, keepNext: true }), isi(kalimatST + '.', 720));
        body.push(judul('B. Kegiatan yang Dilaksanakan'), ...baris(k.kegiatan).map(t => isi(t, 720)));
        body.push(judul('C. Hasil yang Dicapai'), ...hasil.map((t, i) => butir(`${i + 1}.`, t, { alignment: AlignmentType.JUSTIFIED })));
        body.push(judul('D. Simpulan dan Saran'), ...baris(k.simpulan).map(t => isi(t, 720)));
        body.push(judul('E. Penutup'), isi('Demikian laporan pelaksanaan tugas ini kami sampaikan dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.', 720));

        // Tulisan abu-abu di atas tiap nama + ruang kosong untuk QR TTE (sekitar 2,8 cm, termasuk selisih aman).
        const labelTte = () => p(tr('Ditandatangani secara elektronik', { color: 'BFBFBF', size: 22 }), { spacing: { before: 1560, after: 0 }, keepNext: true });
        const kiri = [p(tr(''), { spacing: { after: 0 } })];
        if (k.mengetahui_jabatan) {
            kiri.length = 0;
            // dua baris kosong supaya "Mengetahui," sejajar dengan "Pembuat Laporan"
            kiri.push(p(tr(''), { spacing: { after: 0 } }), p(tr(''), { spacing: { after: 0 } }), p(tr(''), { spacing: { after: 0 } }), p(tr('Mengetahui,'), { spacing: { after: 0 } }), p(tr(k.mengetahui_jabatan), { spacing: { after: 0 } }), labelTte(), p(tr(k.mengetahui_nama || ''), { spacing: { after: 0 } }));
        }
        const kanan = [
            p(tr(`Dibuat di ${k.tempat || 'Denpasar'}`), { spacing: { after: 0 } }),
            p(tr(`pada tanggal ${tglIndo(k.tgl_laporan)}`), { spacing: { after: 0 } }),
            p(tr(''), { spacing: { after: 0 } }),
            p(tr('Pembuat Laporan'), { spacing: { after: 0 } }),
            p(tr(''), { spacing: { after: 0 } })
        ];
        pel.forEach(n => kanan.push(labelTte(), p(tr(n), { spacing: { after: 200 } })));
        const ttd = new Table({
            width: { size: 9000, type: WidthType.DXA }, columnWidths: [4500, 4500],
            borders: { top: tanpaBorder, bottom: tanpaBorder, left: tanpaBorder, right: tanpaBorder, insideHorizontal: tanpaBorder, insideVertical: tanpaBorder },
            rows: [new TableRow({ cantSplit: true, children: [
                new TableCell({ width: { size: 4500, type: WidthType.DXA }, borders: noBorders, children: kiri }),
                new TableCell({ width: { size: 4500, type: WidthType.DXA }, borders: noBorders, children: kanan })
            ] })]
        });
        body.push(p(tr(''), { spacing: { after: 200 } }), ttd);

        // Halaman dokumentasi: hanya dibuat bila ada foto.
        const foto = fotoAda(k);
        const halaman = { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 } } };
        const sections = [{ properties: halaman, children: kop.concat(body) }];
        if (foto.length) {
            const wSel = 4677, maxW = 290, maxH = 230;
            const sel = (f) => new TableCell({
                width: { size: wSel, type: WidthType.DXA }, borders: noBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 },
                children: f ? [
                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new ImageRun({ type: 'jpg', data: dataUrlKeBytes(f.d), transformation: (() => { const sk = Math.min(maxW / f.w, maxH / f.h); return { width: Math.round(f.w * sk), height: Math.round(f.h * sk) }; })() })] }),
                    p(tr(f.ket || '', { size: 18 }), { alignment: AlignmentType.CENTER, spacing: { after: 120 } })
                ] : [p(tr(''), { spacing: { after: 0 } })]
            });
            const baris2 = [];
            for (let i = 0; i < foto.length; i += 2) baris2.push(new TableRow({ cantSplit: true, children: [sel(foto[i]), sel(foto[i + 1])] }));
            sections.push({
                properties: halaman,
                children: [
                    tengah('DOKUMENTASI KEGIATAN'),
                    p(tr('Surat Tugas Nomor ' + (k.nomor_st || '')), { alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
                    new Table({
                        width: { size: wSel * 2, type: WidthType.DXA }, columnWidths: [wSel, wSel],
                        borders: { top: tanpaBorder, bottom: tanpaBorder, left: tanpaBorder, right: tanpaBorder, insideHorizontal: tanpaBorder, insideVertical: tanpaBorder },
                        rows: baris2
                    })
                ]
            });
        }

        return new Document({
            creator: 'SiMAB', title: 'Laporan Pelaksanaan Tugas ' + (k.nomor_st || ''),
            styles: { default: { document: { run: { font: FONT, size: SZ } } } },
            sections: sections
        });
    }

    // ------------------------------------------------------------------
    // 3b) Pembuat PDF (vektor, teks bisa dipilih; ukuran A4 untuk TTE)
    // ------------------------------------------------------------------
    function bangunPdf(JS, k, namaKantor) {
        const doc = new JS.jsPDF({ unit: 'pt', format: 'a4', compress: true });
        const PW = 595.28, PH = 841.89, ML = 70.85, MR = 56.7, MT = 56.7, MB = 56.7;
        const W = PW - ML - MR, BOT = PH - MB, LH = 14.4;
        let y = MT;
        const font = (size, bold, color) => {
            doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
            const c = color || [0, 0, 0]; doc.setTextColor(c[0], c[1], c[2]);
        };
        const ensure = (h) => { if (y + h > BOT) { doc.addPage(); y = MT; } };
        const baris = (str) => String(str || '').split(/\n\s*\n|\r?\n/).map(x => x.trim()).filter(Boolean);

        // Satu paragraf; mengembalikan tinggi yang terpakai. o: size,bold,color,indent,align,justify,after,keepNext
        const para = (text, o) => {
            o = o || {};
            const size = o.size || 11, lh = LH * size / 11, indent = o.indent || 0, w = W - indent;
            font(size, o.bold, o.color);
            const lines = doc.splitTextToSize(String(text), w);
            if (o.keepNext) ensure(lh * (lines.length + 2));
            const y0 = y;
            lines.forEach((ln, i) => {
                ensure(lh);
                const base = y + size * 0.85;
                if (o.align === 'center') doc.text(ln, ML + W / 2, base, { align: 'center' });
                else if (o.justify && i < lines.length - 1) {
                    // rata kiri-kanan: sisa lebar dibagi rata ke sela kata
                    const kata = ln.split(/\s+/).filter(Boolean);
                    if (kata.length < 2) doc.text(ln, ML + indent, base);
                    else {
                        const lebar = kata.reduce((a2, kt) => a2 + doc.getTextWidth(kt), 0);
                        const celah = (w - lebar) / (kata.length - 1);
                        let xx = ML + indent;
                        kata.forEach(kt => { doc.text(kt, xx, base); xx += doc.getTextWidth(kt) + celah; });
                    }
                }
                else doc.text(ln, ML + indent, base);
                y += lh;
            });
            y += o.after || 0;
            return y - y0;
        };
        const judul = (t) => { y += 10; para(t, { bold: true, after: 5, keepNext: true }); };

        const kantor = String(namaKantor || 'KANTOR PELAYANAN KEKAYAAN NEGARA DAN LELANG DENPASAR').toUpperCase();
        const kantorSingkat = namaKantor || 'KPKNL Denpasar';

        // ---- Kop ----
        const logoW = 75, teksW = W - logoW, cx = ML + logoW + teksW / 2;
        const kopTeks = ['KEMENTERIAN KEUANGAN REPUBLIK INDONESIA', 'DIREKTORAT JENDERAL KEKAYAAN NEGARA', 'KANTOR WILAYAH DIREKTORAT JENDERAL KEKAYAAN NEGARA', 'BALI DAN NUSA TENGGARA', kantor];
        font(8, false); const alamat = doc.splitTextToSize('GEDUNG KEUANGAN NEGARA I, JALAN DR. KUSUMAATMAJA, DENPASAR, BALI 80235; TELEPON (0361) 229151, 234623; FAKSIMILE (0361) 229150; LAMAN www.djkn.kemenkeu.go.id', teksW);
        const hTeks = kopTeks.length * 13 + alamat.length * 10 + 2;
        const hLogo = 70.5 * 186 / 200;
        const hKop = Math.max(hTeks, hLogo);
        try { doc.addImage('data:image/png;base64,' + LOGO_B64, 'PNG', ML + 2, y + (hKop - hLogo) / 2, 70.5, hLogo); } catch (_) { /* tanpa logo */ }
        let ty = y + (hKop - hTeks) / 2;
        font(11, true); kopTeks.forEach(t => { doc.text(t, cx, ty + 9.3, { align: 'center' }); ty += 13; });
        font(8, false); ty += 2; alamat.forEach(t => { doc.text(t, cx, ty + 7, { align: 'center' }); ty += 10; });
        y += hKop + 4;
        doc.setLineWidth(0.8); doc.setDrawColor(0); doc.line(ML, y, ML + W, y);
        y += 14;

        // ---- Judul ----
        ['LAPORAN', 'TENTANG', 'LAPORAN PELAKSANAAN TUGAS'].forEach(t => para(t, { bold: true, align: 'center' }));
        para('NOMOR ' + (k.nomor_lpt || 'LAP-.../KNL.1401.../' + (k.tgl_laporan || '').slice(0, 4)), { bold: true, align: 'center', after: 12 });

        const pel = baris(String(k.pelaksana || '').replace(/\r/g, '').split('\n').join('\n\n'));
        const kalimatST = `Surat Tugas Nomor ${k.nomor_st}${k.tgl_st ? ' tanggal ' + tglIndo(k.tgl_st) : ''}${k.hal ? ' hal ' + k.hal : ''}${k.tgl_tugas ? ' tanggal penugasan ' + k.tgl_tugas : ''}`;
        const dasarND = k.nomor_nd
            ? `Berdasarkan Nota Dinas ${k.seksi_nd ? k.seksi_nd + ' ' : ''}Nomor ${k.nomor_nd}${k.tgl_nd ? ' tanggal ' + k.tgl_nd : ''}, Kepala ${kantorSingkat} menugaskan:`
            : `Kepala ${kantorSingkat} menugaskan:`;

        judul('A. Pendahuluan');
        // Butir bernomor: angka di 18 pt, teks dan isi paragraf di 36 pt (sejajar dengan tabel).
        const butir = (no, text, o) => { ensure(LH * 3); font(11, false); doc.text(no, ML + 18, y + 9.35); para(text, Object.assign({ indent: 36 }, o || {})); };
        butir('1.', 'Latar Belakang', { after: 3 });
        para(dasarND, { indent: 36, justify: true, after: 5 });

        // tabel pelaksana
        const tX = ML + 36, tW = W - 36, cNo = 35;
        const barisTabel = (a, b, tebal) => {
            font(11, tebal);
            const ls = doc.splitTextToSize(String(b), tW - cNo - 10);
            const h = ls.length * LH + 6;
            ensure(h);
            doc.setLineWidth(0.5); doc.setDrawColor(0);
            doc.rect(tX, y, cNo, h); doc.rect(tX + cNo, y, tW - cNo, h);
            font(11, tebal);
            doc.text(String(a), tX + 5, y + 3 + 9.3);
            ls.forEach((ln, i) => doc.text(ln, tX + cNo + 5, y + 3 + 9.3 + i * LH));
            y += h;
        };
        barisTabel('No', 'Nama', true);
        pel.forEach((n, i) => barisTabel(String(i + 1), n, false));
        y += 8;

        para('Sesuai ' + kalimatST + '.', { indent: 36, justify: true, after: 5 });
        butir('2.', 'Maksud dan Tujuan', { after: 3, keepNext: true });
        baris(k.maksud).forEach(t => para(t, { indent: 36, justify: true, after: 5 }));
        butir('3.', 'Dasar', { after: 3, keepNext: true });
        para(kalimatST + '.', { indent: 36, justify: true, after: 5 });
        judul('B. Kegiatan yang Dilaksanakan');
        baris(k.kegiatan).forEach(t => para(t, { indent: 36, justify: true, after: 5 }));
        judul('C. Hasil yang Dicapai');
        baris(k.hasil).forEach((t, i) => {
            ensure(LH);
            font(11, false); doc.text(`${i + 1}.`, ML + 18, y + 9.35);
            para(t, { indent: 36, justify: true, after: 5 });
        });
        judul('D. Simpulan dan Saran');
        baris(k.simpulan).forEach(t => para(t, { indent: 36, justify: true, after: 5 }));
        judul('E. Penutup');
        para('Demikian laporan pelaksanaan tugas ini kami sampaikan dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.', { indent: 36, justify: true, after: 5 });

        // ---- Tanda tangan (ruang QR TTE di atas label abu-abu) ----
        const QR = 78, kolB = ML + 225, abu = [191, 191, 191];
        const kiri = [], kanan = [];
        let tambahKanan = 0;
        if (k.mengetahui_jabatan) {
            font(11, false);
            const jab = doc.splitTextToSize(String(k.mengetahui_jabatan), 215);
            kiri.push({ t: '' }, { t: '' }, { t: '' }, { t: 'Mengetahui,' });
            jab.forEach(j => kiri.push({ t: j }));
            kiri.push({ t: 'Ditandatangani secara elektronik', c: abu, g: QR }, { t: k.mengetahui_nama || '' });
            tambahKanan = Math.max(0, jab.length - 1); // jabatan panjang: kolom kanan ikut turun agar label sebaris
        }
        kanan.push({ t: 'Dibuat di ' + (k.tempat || 'Denpasar') }, { t: 'pada tanggal ' + tglIndo(k.tgl_laporan) }, { t: '' }, { t: 'Pembuat Laporan' }, { t: '' });
        for (let i = 0; i < tambahKanan; i++) kanan.push({ t: '' });
        pel.forEach(n => { kanan.push({ t: 'Ditandatangani secara elektronik', c: abu, g: QR }, { t: n, a: 10 }); });
        const tinggi = (a) => a.reduce((s2, it) => s2 + (it.g || 0) + LH + (it.a || 0), 0);
        y += 14;
        ensure(Math.max(tinggi(kiri), tinggi(kanan)));
        const gambar = (arr, x) => {
            let yy = y;
            arr.forEach(it => { yy += it.g || 0; font(11, false, it.c); if (it.t) doc.text(it.t, x, yy + 9.35); yy += LH + (it.a || 0); });
            return yy;
        };
        gambar(kiri, ML);
        y = gambar(kanan, kolB);

        // ---- Dokumentasi (hanya bila ada foto) ----
        const foto = fotoAda(k);
        if (foto.length) {
            doc.addPage(); y = MT;
            para('DOKUMENTASI KEGIATAN', { bold: true, align: 'center' });
            para('Surat Tugas Nomor ' + (k.nomor_st || ''), { align: 'center', after: 12 });
            const cw = 225, maxW = 212, maxH = 175, baris2h = maxH + 34;
            for (let i = 0; i < foto.length; i += 2) {
                ensure(baris2h);
                [foto[i], foto[i + 1]].forEach((f, j) => {
                    if (!f) return;
                    const sk = Math.min(maxW / f.w, maxH / f.h), w = f.w * sk, h = f.h * sk;
                    const x0 = ML + j * cw + (cw - w) / 2;
                    try { doc.addImage(f.d, 'JPEG', x0, y + (maxH - h) / 2, w, h); } catch (_) { /* lewati foto rusak */ }
                    if (f.ket) { font(9, false); doc.text(doc.splitTextToSize(f.ket, cw - 10), ML + j * cw + cw / 2, y + maxH + 13, { align: 'center' }); }
                });
                y += baris2h;
            }
        }
        return doc;
    }

    let jspdfPromise = null;
    function muatJsPdf() {
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf);
        if (jspdfPromise) return jspdfPromise;
        const sumber = ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'];
        jspdfPromise = (async () => {
            for (const src of sumber) {
                try {
                    await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('gagal ' + src)); document.head.appendChild(sc); });
                    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf;
                } catch (e) { /* coba sumber berikutnya */ }
            }
            jspdfPromise = null;
            throw new Error('Gagal memuat pustaka pembuat PDF (periksa koneksi internet).');
        })();
        return jspdfPromise;
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
        const r = await stPost({ action: 'getDokumenFileBase64', link: link }, 60000);
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

    // Urutkan nama pelaksana sesuai urutan kemunculannya di teks Surat Tugas.
    // Nama di ST biasanya huruf biasa dan bisa sedikit beda ejaan, jadi dicocokkan bertahap.
    function urutkanSesuaiTeks(daftar, teks) {
        const T = String(teks || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
        if (!T.trim()) return daftar.slice();
        const posisi = (nama) => {
            const w = String(nama).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
            const kandidat = [w.join(' '), w.slice(0, 2).join(' '), w.slice(-2).join(' '), w[0], w[w.length - 1]];
            for (const c of kandidat) {
                if (!c || c.length < 4) continue;
                const i = T.indexOf(c);
                if (i >= 0) return i;
            }
            return -1;
        };
        return daftar.map((n, i) => ({ n, i, p: posisi(n) }))
            .sort((a, b) => (a.p < 0 ? 1e9 : a.p) - (b.p < 0 ? 1e9 : b.p) || a.i - b.i)
            .map(x => x.n);
    }

    // ------------------------------------------------------------------
    // 5) Pratinjau dokumen + Editor Konsep LPT
    // ------------------------------------------------------------------
    const pecahBaris = (s) => String(s || '').split(/\n\s*\n|\r?\n/).map(x => x.trim()).filter(Boolean);

    // Pratinjau di layar yang menyerupai berkas Word (kop, bagian A-E, tanda tangan).
    function htmlPratinjau(k, namaKantor) {
        const kantor = String(namaKantor || 'KANTOR PELAYANAN KEKAYAAN NEGARA DAN LELANG DENPASAR').toUpperCase();
        const kantorSingkat = namaKantor || 'KPKNL Denpasar';
        const kosong = '<span style="background:#fef3c7;color:#92400e;padding:0 4px;border-radius:3px">[belum diisi]</span>';
        const J = 'text-align:justify;margin:0 0 6px 36px';
        const para = (s) => pecahBaris(s).map(x => `<p style="${J}">${esc(x)}</p>`).join('') || `<p style="${J}">${kosong}</p>`;
        const head = (t) => `<p style="font-weight:700;margin:14px 0 6px">${t}</p>`;
        const pel = pecahBaris(String(k.pelaksana || '').replace(/\r/g, '').split('\n').join('\n\n'));
        const kalimatST = `Surat Tugas Nomor ${k.nomor_st}${k.tgl_st ? ' tanggal ' + tglIndo(k.tgl_st) : ''}${k.hal ? ' hal ' + k.hal : ''}${k.tgl_tugas ? ' tanggal penugasan ' + k.tgl_tugas : ''}`;
        const dasarND = k.nomor_nd
            ? `Berdasarkan Nota Dinas ${k.seksi_nd ? k.seksi_nd + ' ' : ''}Nomor ${k.nomor_nd}${k.tgl_nd ? ' tanggal ' + k.tgl_nd : ''}, Kepala ${kantorSingkat} menugaskan:`
            : `Kepala ${kantorSingkat} menugaskan:`;
        const hasil = pecahBaris(k.hasil);
        const c = 'text-align:center;font-weight:700;line-height:1.35';
        const tabel = `<table style="font-size:inherit;border-collapse:collapse;margin:4px 0 8px 36px;width:calc(100% - 36px)"><tr><td style="border:1px solid #333;padding:3px 8px;width:44px;font-weight:700">No</td><td style="border:1px solid #333;padding:3px 8px;font-weight:700">Nama</td></tr>`
            + pel.map((n, i) => `<tr><td style="border:1px solid #333;padding:3px 8px">${i + 1}</td><td style="border:1px solid #333;padding:3px 8px">${esc(n)}</td></tr>`).join('') + '</table>';
        const tte = '<div style="color:#bfbfbf;margin-top:92px">Ditandatangani secara elektronik</div>';
        const nomorLpt = k.nomor_lpt ? esc(k.nomor_lpt) : kosong;
        return `<div id="lpt-kertas" style="background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.5;padding:28px 34px;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
            <div style="display:flex;align-items:center;gap:10px"><img src="data:image/png;base64,${LOGO_B64}" alt="" style="width:92px;height:${Math.round(92 * LOGO_RASIO)}px;flex:none"><div style="flex:1"><div style="${c};font-size:12px">KEMENTERIAN KEUANGAN REPUBLIK INDONESIA<br>DIREKTORAT JENDERAL KEKAYAAN NEGARA<br>KANTOR WILAYAH DIREKTORAT JENDERAL KEKAYAAN NEGARA<br>BALI DAN NUSA TENGGARA<br>${esc(kantor)}</div><div style="text-align:center;font-size:9px;margin-top:2px">GEDUNG KEUANGAN NEGARA I, JALAN DR. KUSUMAATMAJA, DENPASAR, BALI 80235; TELEPON (0361) 229151, 234623; FAKSIMILE (0361) 229150; LAMAN www.djkn.kemenkeu.go.id</div></div></div>
            <div style="border-bottom:2px solid #000;margin:6px 0 14px"></div>
            <div style="${c};margin-bottom:12px">LAPORAN<br>TENTANG<br>LAPORAN PELAKSANAAN TUGAS<br>NOMOR ${nomorLpt}</div>
            ${head('A. Pendahuluan')}
            <p style="margin:0 0 4px 36px;text-indent:-18px">1.&nbsp;&nbsp;Latar Belakang</p>
            <p style="${J}">${esc(dasarND)}</p>${tabel}
            <p style="${J}">Sesuai ${esc(kalimatST)}.</p>
            <p style="margin:0 0 4px 36px;text-indent:-18px">2.&nbsp;&nbsp;Maksud dan Tujuan</p>${para(k.maksud)}
            <p style="margin:0 0 4px 36px;text-indent:-18px">3.&nbsp;&nbsp;Dasar</p><p style="${J}">${esc(kalimatST)}.</p>
            ${head('B. Kegiatan yang Dilaksanakan')}${para(k.kegiatan)}
            ${head('C. Hasil yang Dicapai')}${hasil.length ? hasil.map((t, i) => `<p style="text-align:justify;margin:0 0 6px 36px;text-indent:-18px">${i + 1}.&nbsp; ${esc(t)}</p>`).join('') : `<p style="${J}">${kosong}</p>`}
            ${head('D. Simpulan dan Saran')}${para(k.simpulan)}
            ${head('E. Penutup')}<p style="${J}">Demikian laporan pelaksanaan tugas ini kami sampaikan dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.</p>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-top:22px">
                <div style="width:48%">${k.mengetahui_jabatan ? `<br><br><br>Mengetahui,<br>${esc(k.mengetahui_jabatan)}${tte}${esc(k.mengetahui_nama || '')}` : ''}</div>
                <div style="width:48%">Dibuat di ${esc(k.tempat || 'Denpasar')}<br>pada tanggal ${esc(tglIndo(k.tgl_laporan))}<br><br>Pembuat Laporan<br>&nbsp;${pel.map(n => `${tte}${esc(n)}`).join('<div style="height:10px"></div>')}</div>
            </div>
            ${fotoAda(k).length ? `<div style="border-top:2px dashed #cbd5e1;margin:26px -34px 0;padding:18px 34px 0"><div style="${c}">DOKUMENTASI KEGIATAN</div><div style="text-align:center;margin:4px 0 12px">Surat Tugas Nomor ${esc(k.nomor_st || '')}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">${fotoAda(k).map(f => `<div style="text-align:center"><img src="${f.d}" alt="" style="max-width:100%;max-height:190px;object-fit:contain"><div style="font-size:11px;margin-top:3px">${esc(f.ket || '')}</div></div>`).join('')}</div></div>` : ''}
        </div>`;
    }

    function autoTinggi(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.max(el.scrollHeight + 2, 56) + 'px';
    }

    function pesanGalatJarwo(e) {
        const m = String((e && e.message) || e || '');
        if (/pesan kosong/i.test(m)) return 'Edge Function Jarwo di Supabase belum versi terbaru (belum mengenal mode LPT). Tempel ulang supabase/functions/jarwo/index.ts lalu Deploy.';
        return m;
    }

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

        const { overlay, popup } = window.commonOpenOverlay(`
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h3 class="text-sky-700 font-semibold text-base">Konsep Laporan Pelaksanaan Tugas</h3>
                    <div class="text-xs text-slate-500">${esc(g.nomor_st)} &middot; ${esc(g.pelaksana.length)} pelaksana</div>
                </div>
                <button id="lpt-x" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <div id="lpt-body" class="flex flex-col gap-3"></div>
        `, 'max-w-3xl');

        const $ = (id) => popup.querySelector('#lpt-' + id);
        const pesan = (el, teks, warna) => { if (el) { el.innerHTML = teks; el.className = 'text-xs min-h-[16px] ' + (warna || 'text-slate-500'); } };
        $('x').onclick = () => overlay.remove();

        let mode = 'pratinjau';
        let sibuk = false;
        const KOLOM = ['nomor_lpt', 'tgl_laporan', 'nomor_nd', 'tgl_nd', 'seksi_nd', 'tgl_tugas', 'hal', 'pelaksana', 'maksud', 'kegiatan', 'hasil', 'simpulan', 'mengetahui_jabatan', 'mengetahui_nama'];

        const bacaForm = () => {
            if (mode !== 'edit') return;
            KOLOM.forEach(c => { const el = $(c); if (el) k[c] = el.value; });
            const cat = $('catatan'); if (cat) k.catatan = cat.value;
            popup.querySelectorAll('.lpt-fotoket').forEach(el => { const f = (k.foto || [])[Number(el.dataset.i)]; if (f) f.ket = el.value; });
        };

        // Tambah foto dari berkas gambar; hasil kompres disimpan ke konsep.
        const tambahFoto = async (files) => {
            const daftar = Array.from(files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name || ''));
            if (!daftar.length) { pesan($('status'), 'Pilih berkas gambar (JPG/PNG).', 'text-red-600'); return; }
            bacaForm();
            k.foto = Array.isArray(k.foto) ? k.foto : [];
            const sisa = MAKS_FOTO - k.foto.length;
            if (sisa <= 0) { pesan($('status'), 'Maksimal ' + MAKS_FOTO + ' foto.', 'text-red-600'); return; }
            pesan($('status'), '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Memproses foto…', 'text-sky-700');
            let gagal = 0;
            for (const f of daftar.slice(0, sisa)) { try { k.foto.push(await kompresFoto(f)); } catch (_) { gagal++; } }
            const ok = await simpan(true);
            const info = { teks: (gagal ? gagal + ' foto gagal dibaca. ' : '') + (daftar.length > sisa ? 'Hanya ' + sisa + ' foto yang muat (maks ' + MAKS_FOTO + '). ' : '') + '✅ Foto ditambahkan' + (ok ? '.' : ' (belum tersimpan ke server).'), warna: gagal || daftar.length > sisa ? 'text-amber-700' : 'text-green-700' };
            if (mode === 'edit') { renderEdit(); pesan($('status'), info.teks, info.warna); } else renderPratinjau(info);
        };

        const simpan = async (diam, elPesan) => {
            k.nomor_st = g.nomor_st; k.tgl_st = g.tgl_st || k.tgl_st;
            try {
                await waitSupabaseAuthReady();
                const { error } = await sb.from('lpt_konsep').upsert({
                    kantor_id: g.kantor_id, tahun: g.tahun, nomor_st: g.uraian, konten: k,
                    diubah_oleh: localStorage.getItem('nama') || '', diubah_pada: new Date().toISOString()
                });
                if (error) throw new Error(/lpt_konsep/i.test(error.message || '') ? 'Tabel lpt_konsep belum ada. Jalankan supabase-st-lpt.sql di Supabase.' : error.message);
                pernahTersimpan = true;
                if (!diam) pesan(elPesan, '✅ Konsep tersimpan.', 'text-green-700');
                return true;
            } catch (e) { if (!diam) pesan(elPesan, '❌ ' + (e.message || e), 'text-red-600'); return false; }
        };

        const unduh = async (btn, elPesan, format) => {
            bacaForm();
            btn.disabled = true;
            try {
                const isi = Object.assign({}, k, { nomor_st: g.nomor_st, tgl_st: g.tgl_st || k.tgl_st });
                let blob;
                if (format === 'pdf') {
                    pesan(elPesan, 'Menyiapkan PDF…', 'text-sky-700');
                    const JS = await muatJsPdf();
                    blob = bangunPdf(JS, isi).output('blob');
                } else {
                    pesan(elPesan, 'Menyiapkan berkas Word…', 'text-sky-700');
                    const D = await muatDocx();
                    blob = await D.Packer.toBlob(bangunDocx(D, isi, null, logoBytes()));
                }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'LPT ' + String(g.nomor_st).replace(/[\\/:*?"<>|]/g, '-') + (format === 'pdf' ? '.pdf' : '.docx');
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                pesan(elPesan, '✅ Berkas diunduh.', 'text-green-700');
                simpan(true);
            } catch (e) { pesan(elPesan, '❌ ' + (e.message || e), 'text-red-600'); }
            finally { btn.disabled = false; }
        };

        // Jarwo membaca PDF ST lalu menyusun draf; hasilnya langsung dipakai.
        const susunAI = async (setStatus) => {
            if (typeof window.jarwoCall !== 'function') throw new Error('Jarwo belum dimuat di halaman ini.');
            let stText = '';
            if (g.st_link && adaDrive(g.st_link)) {
                setStatus('Membaca PDF Surat Tugas…');
                try { stText = await teksDariPdfDrive(g.st_link); } catch (e) { setStatus('PDF ST tidak terbaca (' + (e.message || e) + '), memakai data kegiatan saja…'); }
            }
            if (stText) {
                const daftar = String(k.pelaksana || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
                if (daftar.length > 1) k.pelaksana = urutkanSesuaiTeks(daftar, stText).join('\n');
            }
            setStatus('Jarwo sedang menyusun konsep laporan…');
            let r;
            try {
                r = await window.jarwoCall({
                    mode: 'lpt', st_text: stText, catatan: k.catatan || '',
                    info: { nomor_st: g.nomor_st, tgl_st: tglIndo(g.tgl_st), tgl_tugas: k.tgl_tugas, tujuan: g.tujuan, pelaksana: String(k.pelaksana || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean) }
                });
            } catch (e) { throw new Error(pesanGalatJarwo(e)); }
            const d = (r && r.draft) || {};
            const isi = (c, v) => { if (v && String(v).trim()) k[c] = Array.isArray(v) ? v.join('\n\n') : String(v); };
            ['nomor_nd', 'tgl_nd', 'seksi_nd', 'hal', 'maksud', 'kegiatan', 'hasil', 'simpulan'].forEach(c => isi(c, d[c]));
            await simpan(true);
        };

        // ---------------- tampilan: pratinjau ----------------
        function renderPratinjau(info) {
            mode = 'pratinjau';
            $('body').innerHTML = `
                <div class="flex flex-wrap items-center gap-2">
                    <button id="lpt-edit" class="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"><i class="fa-solid fa-pen mr-1"></i>Edit</button>
                    <button id="lpt-ai" class="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Susun ulang</button>
                    <label class="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium cursor-pointer"><i class="fa-solid fa-images mr-1"></i>Foto${fotoAda(k).length ? ' (' + fotoAda(k).length + ')' : ''}<input id="lpt-fotofile" type="file" accept="image/*" multiple class="hidden"></label>
                    <button id="lpt-simpan" class="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Simpan</button>
                    <button id="lpt-docx" class="px-3 py-1.5 bg-sky-700 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-file-word mr-1"></i>Unduh .docx</button>
                    <button id="lpt-pdf" class="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-file-pdf mr-1"></i>Unduh PDF</button>
                    <span id="lpt-stinfo" class="text-xs text-slate-500"></span>
                </div>
                <div id="lpt-status" class="text-xs min-h-[16px]"></div>
                <div id="lpt-kertasWrap" style="max-height:62vh;overflow:auto;background:#f1f5f9;padding:10px;border-radius:8px">${htmlPratinjau(k)}</div>
                <div id="lpt-msg" class="text-xs min-h-[16px]"></div>`;
            if (info) pesan($('status'), info.teks, info.warna);
            tampilStInfo();
            $('edit').onclick = () => renderEdit();
            $('fotofile').onchange = function () { tambahFoto(this.files); };
            $('simpan').onclick = async () => { await simpan(false, $('msg')); };
            $('docx').onclick = function () { unduh(this, $('msg')); };
            $('pdf').onclick = function () { unduh(this, $('msg'), 'pdf'); };
            $('ai').onclick = () => jalankanAI();
        }

        // ---------------- tampilan: form edit ----------------
        function renderEdit() {
            mode = 'edit';
            const f = (id, label, nilai, tipe) => `<label class="text-xs font-semibold text-slate-600">${label}</label>
                <input id="lpt-${id}" type="${tipe || 'text'}" value="${esc(nilai)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">`;
            const ta = (id, label, nilai) => `<label class="text-xs font-semibold text-slate-600">${label}</label>
                <textarea id="lpt-${id}" rows="2" style="min-height:56px;resize:vertical;overflow:hidden;line-height:1.5" class="lpt-ta w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">${esc(nilai)}</textarea>`;
            $('body').innerHTML = `
                <div class="flex flex-wrap items-center gap-2">
                    <button id="lpt-kembali" class="px-3 py-1.5 bg-sky-700 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-eye mr-1"></i>Lihat pratinjau</button>
                    <span class="text-xs text-slate-500">Mengedit konsep. Perubahan tampil di pratinjau.</span>
                </div>
                <div class="border border-sky-100 bg-sky-50 rounded-xl p-3 flex flex-col gap-2">
                    <div class="text-xs font-semibold text-sky-800"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Susun ulang dengan Jarwo</div>
                    <textarea id="lpt-catatan" rows="2" style="min-height:56px;resize:vertical;overflow:hidden" placeholder="Catatan hasil (opsional): poin singkat yang terjadi di lapangan, Jarwo akan merapikannya." class="lpt-ta w-full px-3 py-2 border border-sky-200 rounded-lg text-sm bg-white">${esc(k.catatan)}</textarea>
                    <div class="flex flex-wrap items-center gap-2">
                        <button id="lpt-ai" class="px-3 py-1.5 bg-sky-700 text-white rounded-lg text-sm font-medium">Susun dengan AI</button>
                        <span id="lpt-stinfo" class="text-xs text-slate-500"></span>
                    </div>
                    <div id="lpt-status" class="text-xs min-h-[16px]"></div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                    <div>${f('nomor_lpt', 'Nomor LPT', k.nomor_lpt)}</div>
                    <div>${f('tgl_laporan', 'Tanggal laporan', k.tgl_laporan, 'date')}</div>
                    <div>${f('nomor_nd', 'Nomor Nota Dinas', k.nomor_nd)}</div>
                    <div>${f('tgl_nd', 'Tanggal Nota Dinas (mis. 9 November 2026)', k.tgl_nd)}</div>
                    <div>${f('seksi_nd', 'Pembuat Nota Dinas (mis. Kepala Seksi Piutang Negara)', k.seksi_nd)}</div>
                    <div>${f('tgl_tugas', 'Tanggal penugasan', k.tgl_tugas)}</div>
                </div>
                <div>${f('hal', 'Hal / perihal penugasan', k.hal)}</div>
                <div>${ta('pelaksana', 'Pelaksana (satu nama per baris)', k.pelaksana)}</div>
                <div>${ta('maksud', 'A.2 Maksud dan Tujuan', k.maksud)}</div>
                <div>${ta('kegiatan', 'B. Kegiatan yang Dilaksanakan', k.kegiatan)}</div>
                <div>${ta('hasil', 'C. Hasil yang Dicapai (pisahkan tiap butir dengan baris kosong)', k.hasil)}</div>
                <div>${ta('simpulan', 'D. Simpulan dan Saran', k.simpulan)}</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                    <div>${f('mengetahui_jabatan', 'Mengetahui — jabatan (kosongkan bila tidak ada)', k.mengetahui_jabatan)}</div>
                    <div>${f('mengetahui_nama', 'Mengetahui — nama', k.mengetahui_nama)}</div>
                </div>
                <div>
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs font-semibold text-slate-600">Foto dokumentasi (halaman tersendiri di akhir dokumen; tanpa foto = tanpa halaman)</span>
                        <label class="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"><i class="fa-solid fa-plus mr-1"></i>Tambah foto<input id="lpt-fotofile" type="file" accept="image/*" multiple class="hidden"></label>
                    </div>
                    <div id="lpt-fotolist" class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">${fotoAda(k).map((f, i) => `<div class="flex items-center gap-2 border border-slate-200 rounded-lg p-2"><img src="${f.d}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:4px;flex:none"><input class="lpt-fotoket flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs" data-i="${i}" placeholder="Keterangan foto (opsional)" value="${esc(f.ket || '')}"><button type="button" class="lpt-fotodel text-red-500 text-lg leading-none px-1" data-i="${i}" title="Hapus foto">&times;</button></div>`).join('')}</div>
                </div>
                <div id="lpt-msg" class="text-xs min-h-[16px]"></div>
                <div class="flex flex-wrap justify-end gap-2">
                    <button id="lpt-simpan" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Simpan konsep</button>
                    <button id="lpt-docx" class="px-4 py-2 bg-sky-700 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-file-word mr-1"></i>Unduh .docx</button>
                    <button id="lpt-pdf" class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-file-pdf mr-1"></i>Unduh PDF</button>
                </div>`;
            popup.querySelectorAll('.lpt-ta').forEach(el => { autoTinggi(el); el.addEventListener('input', () => autoTinggi(el)); });
            tampilStInfo();
            $('kembali').onclick = () => { bacaForm(); renderPratinjau(); };
            $('fotofile').onchange = function () { tambahFoto(this.files); };
            popup.querySelectorAll('.lpt-fotodel').forEach(b => { b.onclick = () => { bacaForm(); k.foto.splice(Number(b.dataset.i), 1); renderEdit(); }; });
            $('simpan').onclick = async () => { bacaForm(); await simpan(false, $('msg')); };
            $('docx').onclick = function () { unduh(this, $('msg')); };
            $('pdf').onclick = function () { unduh(this, $('msg'), 'pdf'); };
            $('ai').onclick = () => jalankanAI();
        }

        // ---------------- info ST + unggah ----------------
        function tampilStInfo() {
            const stInfo = $('stinfo'); if (!stInfo) return;
            if (g.st_link) {
                stInfo.innerHTML = `PDF ST: <button type="button" id="lpt-lihatst" class="text-sky-700 underline">lihat</button>`;
                $('lihatst').onclick = () => stBuka(g.st_link, 'Surat Tugas ' + g.nomor_st);
            } else {
                stInfo.innerHTML = `PDF ST belum diunggah. <label class="text-sky-700 underline cursor-pointer">Unggah PDF ST agar Jarwo bisa menyusun otomatis<input id="lpt-stfile" type="file" accept="application/pdf" class="hidden"></label>`;
                $('stfile').onchange = async function () {
                    const file = this.files[0]; if (!file) return;
                    pesan($('status'), 'Mengunggah PDF ST ke Drive…', 'text-sky-700');
                    try {
                        const link = await stUploadFile(file, { id: g.ids[0], uraian: g.uraian });
                        await stSimpanLink(g.ids, link);
                        g.st_link = link;
                        if (document.getElementById('kg-dataTableBody') && typeof window.kgLoadData === 'function') { try { window.kgLoadData(true); } catch (_) { /* abaikan */ } }
                        bacaForm();
                        await jalankanAI();
                    } catch (e) { pesan($('status'), '❌ ' + (e.message || e), 'text-red-600'); }
                };
            }
        }

        async function jalankanAI() {
            if (sibuk) return;
            sibuk = true;
            bacaForm();
            const tombol = $('ai'); if (tombol) tombol.disabled = true;
            const setStatus = (t) => pesan($('status'), '<i class="fa-solid fa-spinner fa-spin mr-1"></i>' + esc(t), 'text-sky-700');
            try {
                await susunAI(setStatus);
                if (mode === 'edit') { renderEdit(); pesan($('status'), '✅ Konsep tersusun ulang. Periksa lalu klik Lihat pratinjau.', 'text-green-700'); }
                else renderPratinjau({ teks: '✅ Konsep disusun Jarwo dari Surat Tugas. Periksa, klik Edit bila perlu, lalu Unduh .docx. Bagian [belum diisi] perlu Anda lengkapi.', warna: 'text-green-700' });
            } catch (e) {
                pesan($('status'), '❌ ' + esc(e.message || e), 'text-red-600');
            } finally { sibuk = false; const t2 = $('ai'); if (t2) t2.disabled = false; }
        }

        // Awal: tampilkan pratinjau; bila belum pernah disusun dan ST sudah ada, Jarwo langsung menyusun.
        const otomatis = !pernahTersimpan && !!g.st_link;
        renderPratinjau(otomatis ? { teks: '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Jarwo membaca Surat Tugas dan menyusun konsep…', warna: 'text-sky-700' } : (pernahTersimpan ? { teks: 'Konsep tersimpan dimuat.', warna: 'text-slate-500' } : null));
        if (otomatis) jalankanAI();
    }

    window.stUploadFile = stUploadFile;
    window.stSimpanLink = stSimpanLink;
    window.stBuka = stBuka;
    window.lptBukaEditor = bukaEditorLpt;
    window.lptIsPerjadin = isPerjadin;
    window.lptInternal = { bangunDocx, tglIndo, rentangTugas, nomorStBersih, htmlPratinjau, logoBytes, urutkanSesuaiTeks, bangunPdf };
    if (typeof module !== 'undefined') module.exports = window.lptInternal;
})();
