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

    // ------------------------------------------------------------------
    // 5) Pratinjau dokumen + Editor Konsep LPT
    // ------------------------------------------------------------------
    const pecahBaris = (s) => String(s || '').split(/\n\s*\n|\r?\n/).map(x => x.trim()).filter(Boolean);

    // Pratinjau di layar yang menyerupai berkas Word (kop, bagian A-E, tanda tangan).
    function htmlPratinjau(k, namaKantor) {
        const kantor = String(namaKantor || 'KANTOR PELAYANAN KEKAYAAN NEGARA DAN LELANG DENPASAR').toUpperCase();
        const kantorSingkat = namaKantor || 'KPKNL Denpasar';
        const kosong = '<span style="background:#fef3c7;color:#92400e;padding:0 4px;border-radius:3px">[belum diisi]</span>';
        const J = 'text-align:justify;margin:0 0 6px 18px';
        const para = (s) => pecahBaris(s).map(x => `<p style="${J}">${esc(x)}</p>`).join('') || `<p style="${J}">${kosong}</p>`;
        const head = (t) => `<p style="font-weight:700;margin:14px 0 6px">${t}</p>`;
        const pel = pecahBaris(String(k.pelaksana || '').replace(/\r/g, '').split('\n').join('\n\n'));
        const kalimatST = `Surat Tugas Nomor ${k.nomor_st}${k.tgl_st ? ' tanggal ' + tglIndo(k.tgl_st) : ''}${k.hal ? ' hal ' + k.hal : ''}${k.tgl_tugas ? ' tanggal penugasan ' + k.tgl_tugas : ''}`;
        const dasarND = k.nomor_nd
            ? `Berdasarkan Nota Dinas ${k.seksi_nd ? k.seksi_nd + ' ' : ''}Nomor ${k.nomor_nd}${k.tgl_nd ? ' tanggal ' + k.tgl_nd : ''}, Kepala ${kantorSingkat} menugaskan:`
            : `Kepala ${kantorSingkat} menugaskan:`;
        const hasil = pecahBaris(k.hasil);
        const c = 'text-align:center;font-weight:700;line-height:1.35';
        const tabel = `<table style="border-collapse:collapse;margin:4px 0 8px 18px;width:calc(100% - 18px)"><tr><td style="border:1px solid #333;padding:3px 8px;width:44px;font-weight:700">No</td><td style="border:1px solid #333;padding:3px 8px;font-weight:700">Nama</td></tr>`
            + pel.map((n, i) => `<tr><td style="border:1px solid #333;padding:3px 8px">${i + 1}</td><td style="border:1px solid #333;padding:3px 8px">${esc(n)}</td></tr>`).join('') + '</table>';
        const nomorLpt = k.nomor_lpt ? esc(k.nomor_lpt) : kosong;
        return `<div id="lpt-kertas" style="background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.5;padding:28px 34px;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
            <div style="${c};font-size:12px">KEMENTERIAN KEUANGAN REPUBLIK INDONESIA<br>DIREKTORAT JENDERAL KEKAYAAN NEGARA<br>KANTOR WILAYAH DIREKTORAT JENDERAL KEKAYAAN NEGARA<br>BALI DAN NUSA TENGGARA<br>${esc(kantor)}</div>
            <div style="text-align:center;font-size:9px;border-bottom:2px solid #000;padding:2px 0 8px;margin-bottom:14px">GEDUNG KEUANGAN NEGARA I, JALAN DR. KUSUMAATMAJA, DENPASAR, BALI 80235; TELEPON (0361) 229151, 234623; FAKSIMILE (0361) 229150; LAMAN www.djkn.kemenkeu.go.id</div>
            <div style="${c};margin-bottom:12px">LAPORAN<br>TENTANG<br>LAPORAN PELAKSANAAN TUGAS<br>NOMOR ${nomorLpt}</div>
            ${head('A. Pendahuluan')}
            <p style="margin:0 0 4px">1. Latar Belakang</p>
            <p style="${J}">${esc(dasarND)}</p>${tabel}
            <p style="${J}">Sesuai ${esc(kalimatST)}.</p>
            <p style="margin:0 0 4px">2. Maksud dan Tujuan</p>${para(k.maksud)}
            <p style="margin:0 0 4px">3. Dasar</p><p style="${J}">${esc(kalimatST)}.</p>
            ${head('B. Kegiatan yang Dilaksanakan')}${para(k.kegiatan)}
            ${head('C. Hasil yang Dicapai')}${hasil.length ? hasil.map((t, i) => `<p style="text-align:justify;margin:0 0 6px 36px;text-indent:-18px">${i + 1}.&nbsp; ${esc(t)}</p>`).join('') : `<p style="${J}">${kosong}</p>`}
            ${head('D. Simpulan dan Saran')}${para(k.simpulan)}
            ${head('E. Penutup')}<p style="${J}">Demikian laporan pelaksanaan tugas ini kami sampaikan dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.</p>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-top:22px">
                <div style="width:48%">${k.mengetahui_jabatan ? `Mengetahui,<br>${esc(k.mengetahui_jabatan)}<br><br><br><b>${esc(k.mengetahui_nama || '')}</b>` : ''}</div>
                <div style="width:48%">Dibuat di ${esc(k.tempat || 'Denpasar')}<br>pada tanggal ${esc(tglIndo(k.tgl_laporan))}<br>Pembuat Laporan<br><br>${pel.map(n => `<div style="font-weight:700;margin-top:26px">${esc(n)}</div>`).join('')}</div>
            </div>
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

        const unduh = async (btn, elPesan) => {
            bacaForm();
            btn.disabled = true;
            try {
                pesan(elPesan, 'Menyiapkan berkas Word…', 'text-sky-700');
                const D = await muatDocx();
                const doc = bangunDocx(D, Object.assign({}, k, { nomor_st: g.nomor_st, tgl_st: g.tgl_st || k.tgl_st }));
                const blob = await D.Packer.toBlob(doc);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'LPT ' + String(g.nomor_st).replace(/[\\/:*?"<>|]/g, '-') + '.docx';
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
            setStatus('Jarwo sedang menyusun konsep laporan…');
            let r;
            try {
                r = await window.jarwoCall({
                    mode: 'lpt', st_text: stText, catatan: k.catatan || '',
                    info: { nomor_st: g.nomor_st, tgl_st: tglIndo(g.tgl_st), tgl_tugas: k.tgl_tugas, tujuan: g.tujuan, pelaksana: g.pelaksana }
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
                    <button id="lpt-simpan" class="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Simpan</button>
                    <button id="lpt-docx" class="px-3 py-1.5 bg-sky-700 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-file-word mr-1"></i>Unduh .docx</button>
                    <span id="lpt-stinfo" class="text-xs text-slate-500"></span>
                </div>
                <div id="lpt-status" class="text-xs min-h-[16px]"></div>
                <div id="lpt-kertasWrap" style="max-height:62vh;overflow:auto;background:#f1f5f9;padding:10px;border-radius:8px">${htmlPratinjau(k)}</div>
                <div id="lpt-msg" class="text-xs min-h-[16px]"></div>`;
            if (info) pesan($('status'), info.teks, info.warna);
            tampilStInfo();
            $('edit').onclick = () => renderEdit();
            $('simpan').onclick = async () => { await simpan(false, $('msg')); };
            $('docx').onclick = function () { unduh(this, $('msg')); };
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
                <div id="lpt-msg" class="text-xs min-h-[16px]"></div>
                <div class="flex flex-wrap justify-end gap-2">
                    <button id="lpt-simpan" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Simpan konsep</button>
                    <button id="lpt-docx" class="px-4 py-2 bg-sky-700 text-white rounded-lg text-sm font-medium"><i class="fa-solid fa-file-word mr-1"></i>Unduh .docx</button>
                </div>`;
            popup.querySelectorAll('.lpt-ta').forEach(el => { autoTinggi(el); el.addEventListener('input', () => autoTinggi(el)); });
            tampilStInfo();
            $('kembali').onclick = () => { bacaForm(); renderPratinjau(); };
            $('simpan').onclick = async () => { bacaForm(); await simpan(false, $('msg')); };
            $('docx').onclick = function () { unduh(this, $('msg')); };
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
    window.lptInternal = { bangunDocx, tglIndo, rentangTugas, nomorStBersih, htmlPratinjau };
    if (typeof module !== 'undefined') module.exports = window.lptInternal;
})();
