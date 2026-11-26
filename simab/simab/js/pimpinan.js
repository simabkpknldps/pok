/**
 * Dashboard Pimpinan
 * -----------------------------------------------------------------------
 * Tampilan layar penuh (overlay) berisi rekapitulasi global anggaran, dipakai
 * di dua tempat:
 *   1. index.html  : otomatis muncul SETELAH login kalau jabatan = Kepala
 *                    Kantor. URL tetap index.html (tidak punya link sendiri).
 *                    Tombol "Dashboard SiMAB" -> dashboard.html.
 *   2. dashboard.html : menu sidebar "Dashboard Pimpinan", hanya muncul untuk
 *                    superadmin. Tombol "Dashboard SiMAB" -> menutup overlay.
 * Tombol "Tutup" di kedua tempat = logout.
 *
 * Halaman ini TIDAK bisa dibuka langsung lewat link: ia hanya sebuah overlay
 * yang dibuat lewat bukaDashboardPimpinan(), dan datanya butuh sesi login.
 *
 * Syarat: supabase-config.js sudah dimuat (window.sb, sbFetchAll,
 * getTahunAktif, kgSumberDana).
 * -----------------------------------------------------------------------
 */
(function () {
    const ID = 'pimpinan-overlay';

    const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
    function ringkas(n) {
        n = Number(n) || 0;
        const a = Math.abs(n), s = n < 0 ? '-' : '';
        if (a >= 1e9) return s + 'Rp' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
        if (a >= 1e6) return s + 'Rp' + Math.round(a / 1e6).toLocaleString('id-ID') + ' jt';
        return s + 'Rp' + Math.round(a).toLocaleString('id-ID');
    }
    const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
    const pctTxt = v => v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const STATUS_WARNA = {
        'Rekam Data': ['#fee2e2', '#991b1b', '#ef4444'],
        'Terlaksana': ['#fef3c7', '#92400e', '#f59e0b'],
        'LPT': ['#dbeafe', '#1e40af', '#3b82f6'],
        'Terbayar': ['#dcfce7', '#166534', '#22c55e'],
        'Selesai': ['#e5e7eb', '#374151', '#9ca3af']
    };

    function bulanDari(tgl) {
        const d = new Date(tgl);
        return isNaN(d.getTime()) ? -1 : d.getMonth();
    }

    // ---------- Hitung semua angka dari data mentah ----------
    function hitung(pokRows, kegRows, blkRows, rpdRows) {
        const now = new Date();
        const bulanIni = now.getMonth();
        const hariIni = now.toISOString().split('T')[0];

        // Realisasi & blokir dikunci per Kode (sama seperti halaman POK).
        const realByKode = {};
        kegRows.forEach(k => {
            const mak = String(k.mak || '').trim();
            if (mak) realByKode[mak] = (realByKode[mak] || 0) + (Number(k.jumlah) || 0);
        });
        const blokirByKode = {};
        blkRows.forEach(b => { blokirByKode[b.id] = Number(b.nilai) || 0; });

        const tot = { pagu: 0, blokir: 0, real: 0 };
        const sd = { RM: { pagu: 0, blokir: 0, real: 0 }, PNBP: { pagu: 0, blokir: 0, real: 0 } };
        const jenis = { barang: { pagu: 0, blokir: 0, real: 0 }, modal: { pagu: 0, blokir: 0, real: 0 } };
        const seksi = {};
        const akun = []; // satu entri per Kode unik
        const sudah = new Set();

        pokRows.forEach(p => {
            const kode = p.kode || p.id;
            const pagu = Number(p.pagu) || 0;
            const unik = !sudah.has(kode);
            sudah.add(kode);
            const blokir = unik ? (blokirByKode[kode] || 0) : 0;
            const real = unik ? (realByKode[kode] || 0) : 0;
            const sumber = String(p.sd || '').toUpperCase();
            const nSeksi = p.seksi || 'Lainnya';
            const segAkun = (String(kode).split('.').find(s => /^\d{6}$/.test(s))) || '';

            tot.pagu += pagu; tot.blokir += blokir; tot.real += real;
            if (sd[sumber]) { sd[sumber].pagu += pagu; sd[sumber].blokir += blokir; sd[sumber].real += real; }
            if (segAkun.startsWith('52')) { jenis.barang.pagu += pagu; jenis.barang.blokir += blokir; jenis.barang.real += real; }
            else if (segAkun.startsWith('53')) { jenis.modal.pagu += pagu; jenis.modal.blokir += blokir; jenis.modal.real += real; }
            seksi[nSeksi] = seksi[nSeksi] || { pagu: 0, blokir: 0, real: 0 };
            seksi[nSeksi].pagu += pagu; seksi[nSeksi].blokir += blokir; seksi[nSeksi].real += real;

            if (unik) akun.push({ kode, uraian: p.uraian || '', pagu, blokir, real });
            else akun.find(a => a.kode === kode).pagu += pagu;
        });

        // Tren kumulatif: RPD (nilai per bulan) vs realisasi (kegiatan per bulan).
        const rpdBulan = Array(12).fill(0);
        rpdRows.forEach(r => {
            const b = Number(r.bulan_ke);
            if (b >= 1 && b <= 12) rpdBulan[b - 1] += Number(r.nilai) || 0;
        });
        const realBulan = Array(12).fill(0);
        kegRows.forEach(k => {
            const j = Number(k.jumlah) || 0;
            let b = bulanDari(k.tgl_sp2d || k.tgl_bayar || k.tgl_mulai);
            if (b < 0) b = bulanIni; // belum ada tanggal -> masuk bulan berjalan
            realBulan[b] += j;
        });
        const rpdKum = [], realKum = [];
        rpdBulan.reduce((a, v, i) => (rpdKum[i] = a + v), 0);
        realBulan.reduce((a, v, i) => (realKum[i] = a + v), 0);

        // Status kegiatan
        const status = {};
        Object.keys(STATUS_WARNA).forEach(s => { status[s] = 0; });
        kegRows.forEach(k => { if (k.status in status) status[k.status] += 1; });

        // SPM & perjalanan dinas
        const spmBelum = new Set(), spmBulan = new Set();
        let perjadinBulan = 0;
        const bertugas = new Set();
        kegRows.forEach(k => {
            const spm = String(k.nomor_spm || '').trim();
            if (spm) {
                if (!k.tgl_sp2d) spmBelum.add(spm);
                else if (bulanDari(k.tgl_sp2d) === bulanIni && new Date(k.tgl_sp2d).getFullYear() === now.getFullYear()) spmBulan.add(spm);
            }
            const mak = String(k.mak || '');
            if (mak.includes('524111') || mak.includes('524113')) {
                if (bulanDari(k.tgl_mulai) === bulanIni && new Date(k.tgl_mulai).getFullYear() === now.getFullYear()) perjadinBulan++;
                if (k.tgl_mulai && k.tgl_mulai <= hariIni && (k.tgl_selesai || k.tgl_mulai) >= hariIni) {
                    const n = String(k.pelaksana || '').trim();
                    if (n) bertugas.add(n);
                }
            }
        });

        // Perlu perhatian
        const perhatian = [];
        akun.forEach(a => {
            const sisa = a.pagu - a.blokir - a.real;
            const serap = pct(a.real, a.pagu - a.blokir); // terhadap pagu netto
            if (a.pagu <= 0) return;
            if (sisa < 0) perhatian.push({ p: 0, label: 'Melebihi pagu', warna: ['#fee2e2', '#991b1b'], a, kanan: 'Lebih ' + ringkas(-sisa), ket: 'serapan ' + pctTxt(serap) });
            else if (serap >= 90 && sisa < a.pagu * 0.1) perhatian.push({ p: 1, label: 'Sisa menipis', warna: ['#fee2e2', '#991b1b'], a, kanan: 'Sisa ' + ringkas(sisa), ket: 'serapan ' + pctTxt(serap) });
            else if (a.blokir > 0) perhatian.push({ p: 2, label: 'Diblokir', warna: ['#dbeafe', '#1e40af'], a, kanan: 'Blokir ' + ringkas(a.blokir), ket: 'sisa ' + ringkas(sisa) });
            else if (bulanIni >= 6 && serap < 25 && sisa >= 5e6) perhatian.push({ p: 3, label: 'Serapan rendah', warna: ['#fef3c7', '#92400e'], a, kanan: 'Sisa ' + ringkas(sisa), ket: 'serapan ' + pctTxt(serap) });
        });
        perhatian.sort((x, y) => x.p - y.p || (y.a.blokir + y.a.pagu) - (x.a.blokir + x.a.pagu));

        const seksiList = Object.entries(seksi).map(([nama, v]) => ({ nama, ...v })).sort((a, b) => b.pagu - a.pagu);

        return {
            tot, sd, jenis, seksiList, status, perhatian: perhatian.slice(0, 6),
            rpdKum, realKum, bulanIni, jumlahKegiatan: kegRows.length, jumlahAkun: akun.length,
            spm: { belum: spmBelum.size, bulan: spmBulan.size, perjadinBulan, bertugas: bertugas.size }
        };
    }

    // ---------- Bangun HTML ----------
    function bar(persen, warna, tinggi) {
        const w = Math.max(0, Math.min(100, persen));
        return `<div style="height:${tinggi || 8}px;border-radius:99px;background:#eef0f3;overflow:hidden"><div style="width:${w}%;height:100%;background:${warna}"></div></div>`;
    }

    function chartSvg(d) {
        const maxV = Math.max(1, ...d.rpdKum, ...d.realKum, d.tot.pagu);
        const X = i => 50 + i * 52, Y = v => 210 - (v / maxV) * 190;
        const rpdPts = d.rpdKum.map((v, i) => `${X(i)},${Y(v).toFixed(1)}`).join(' ');
        const realPts = d.realKum.slice(0, d.bulanIni + 1).map((v, i) => `${X(i)},${Y(v).toFixed(1)}`).join(' ');
        const last = d.realKum[d.bulanIni];
        const grid = [0, 1, 2, 3].map(i => {
            const y = 20 + i * (190 / 3);
            const v = maxV * (1 - i / 3);
            return `<line x1="50" y1="${y}" x2="640" y2="${y}" stroke="#e5e5ea"/><text x="42" y="${y + 4}" font-size="11" fill="#6e6e73" text-anchor="end">${ringkas(v).replace('Rp', '')}</text>`;
        }).join('');
        const bln = NAMA_BULAN.map((b, i) => `<text x="${X(i)}" y="232" font-size="11" fill="#6e6e73" text-anchor="middle">${b}</text>`).join('');
        return `<svg viewBox="0 0 660 250" style="width:100%;height:auto;margin-top:8px" role="img" aria-label="Grafik kumulatif realisasi terhadap RPD. Realisasi ${ringkas(last)}, RPD s.d. bulan ini ${ringkas(d.rpdKum[d.bulanIni])}.">
            ${grid}
            <polyline fill="none" stroke="#8e8e93" stroke-width="2" stroke-dasharray="5 4" points="${rpdPts}"/>
            <polyline fill="none" stroke="#0071e3" stroke-width="3" stroke-linejoin="round" points="${realPts}"/>
            <circle cx="${X(d.bulanIni)}" cy="${Y(last).toFixed(1)}" r="5" fill="#0071e3" stroke="#fff" stroke-width="2"/>
            <g font-family="inherit">${bln}</g></svg>`;
    }

    function kartu(isi, flex) {
        return `<div style="${flex || ''}background:#fff;border-radius:16px;padding:20px;border:1px solid #e5e5ea;box-sizing:border-box;min-width:0">${isi}</div>`;
    }

    function buildHtml(d, ctx) {
        const sisa = d.tot.pagu - d.tot.blokir - d.tot.real;
        const serap = pct(d.tot.real, d.tot.pagu - d.tot.blokir); // terhadap pagu netto (pagu - blokir)
        const rpdSdBulan = d.rpdKum[d.bulanIni];
        const selisihRpd = rpdSdBulan - d.realKum[d.bulanIni];
        const jam = new Date().toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const kpi = (jdl, nilai, ket, warna) => kartu(`<div style="font-size:13px;color:#6e6e73;font-weight:500">${jdl}</div><div style="font-size:26px;font-weight:700;margin-top:6px;letter-spacing:-.01em;${warna ? 'color:' + warna : ''}">${ringkas(nilai)}</div><div style="font-size:12px;color:#6e6e73;margin-top:4px">${ket}</div>`);

        const sdBlok = (nama, warna, v) => `<div>
            <div style="display:flex;justify-content:space-between;font-size:13px"><span style="font-weight:600;display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:3px;background:${warna}"></span>${nama}</span><span style="color:#6e6e73">${pctTxt(pct(v.real, v.pagu - v.blokir))} serapan</span></div>
            <div style="margin-top:8px">${bar(pct(v.real, v.pagu - v.blokir), warna, 10)}</div>
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px;font-size:12px;color:#6e6e73;margin-top:6px"><span>Pagu ${ringkas(v.pagu)}</span><span>Realisasi ${ringkas(v.real)}</span><span>Blokir ${ringkas(v.blokir)}</span></div></div>`;

        const jenisBaris = (nama, v) => `<div style="display:flex;justify-content:space-between;font-size:13px"><span>${nama}</span><span style="color:#6e6e73">${pctTxt(pct(v.real, v.pagu - v.blokir))}</span></div><div style="margin:6px 0 12px">${bar(pct(v.real, v.pagu - v.blokir), '#1d1d1f')}</div>`;

        const seksiRows = d.seksiList.map(s => `<tr style="border-top:1px solid #eef0f3"><td style="padding:12px 8px 12px 0;font-weight:600">${esc(s.nama)}</td><td style="padding:12px 8px;text-align:right">${ringkas(s.pagu)}</td><td style="padding:12px 8px;text-align:right">${ringkas(s.real)}</td><td style="padding:12px 8px;min-width:150px"><div style="display:flex;align-items:center;gap:10px"><div style="flex:1">${bar(pct(s.real, s.pagu - s.blokir), '#0071e3')}</div><span style="width:48px;text-align:right">${pctTxt(pct(s.real, s.pagu - s.blokir))}</span></div></td></tr>`).join('');

        const totalStatus = Object.values(d.status).reduce((a, b) => a + b, 0) || 1;
        const statusBaris = Object.entries(d.status).map(([s, n]) => `<div style="display:flex;align-items:center;gap:10px"><span style="flex:1;color:#6e6e73">${s}</span><span style="font-weight:700;font-size:16px">${n}</span><span style="padding:2px 10px;border-radius:99px;background:${STATUS_WARNA[s][0]};color:${STATUS_WARNA[s][1]};font-size:11px;font-weight:600">${pctTxt(pct(n, totalStatus))}</span></div>`).join('');
        const statusBar = Object.entries(d.status).map(([s, n]) => `<div style="width:${pct(n, totalStatus)}%;background:${STATUS_WARNA[s][2]}"></div>`).join('');

        const perhatianHtml = d.perhatian.length ? d.perhatian.map(x => `<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 0;border-top:1px solid #eef0f3">
            <span style="padding:3px 10px;border-radius:99px;background:${x.warna[0]};color:${x.warna[1]};font-size:11px;font-weight:600;flex:none">${x.label}</span>
            <div style="flex:1 1 260px;min-width:0"><div style="font-size:13px;font-weight:600">${esc(x.a.uraian)}</div><div style="font-size:12px;color:#6e6e73;font-family:ui-monospace,Menlo,monospace;word-break:break-all">${esc(x.a.kode)}</div></div>
            <div style="text-align:right;flex:none"><div style="font-size:13px;font-weight:600">${x.kanan}</div><div style="font-size:12px;color:#6e6e73">${x.ket}</div></div></div>`).join('')
            : '<div style="padding:12px 0;border-top:1px solid #eef0f3;font-size:13px;color:#6e6e73">Tidak ada akun yang perlu perhatian khusus saat ini.</div>';

        const mini = (jdl, n) => `<div style="background:#f5f5f7;border-radius:12px;padding:14px"><div style="font-size:12px;color:#6e6e73">${jdl}</div><div style="font-size:24px;font-weight:700;margin-top:4px">${n}</div></div>`;

        const btnTutup = `<button type="button" id="pmp-tutup" style="height:44px;padding:0 18px;border:1px solid #fecaca;border-radius:12px;background:#fff;color:#b91c1c;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit"><i class="fa-solid fa-right-from-bracket"></i> Tutup</button>`;
        const btnDash = `<button type="button" id="pmp-dash" style="height:44px;padding:0 18px;border:0;border-radius:12px;background:#0071e3;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit"><i class="fa-solid fa-table-columns"></i> Dashboard SiMAB</button>`;

        return `
        <header style="position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #e5e5ea">
          <div style="max-width:1320px;margin:0 auto;padding:16px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;box-sizing:border-box">
            <div style="display:flex;align-items:center;gap:12px;flex:1 1 300px;min-width:0">
              <img src="icons/logo-simab.svg" alt="SiMAB" width="40" height="40" style="border-radius:12px;flex:none">
              <div style="min-width:0">
                <div style="font-size:12px;font-weight:600;color:#6e6e73;letter-spacing:.04em;text-transform:uppercase">SiMAB · Dashboard Pimpinan</div>
                <div style="font-size:20px;font-weight:700;line-height:1.25">${esc(ctx.namaKantor)} · Tahun Anggaran ${ctx.tahun}</div>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:14px;font-weight:600">${esc(ctx.namaUser)}</div>
              <div style="font-size:12px;color:#6e6e73">${esc(ctx.jabatan)} · data per ${jam}</div>
            </div>
            <div style="display:flex;gap:10px;flex:none">${btnDash}${btnTutup}</div>
          </div>
        </header>
        <main style="max-width:1320px;margin:0 auto;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;gap:20px">
          <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
            ${kpi('Pagu', d.tot.pagu, rp(d.tot.pagu) + ' · ' + d.jumlahAkun + ' kode')}
            ${kpi('Realisasi', d.tot.real, rp(d.tot.real) + ' · ' + d.jumlahKegiatan + ' kegiatan')}
            ${kpi('Blokir', d.tot.blokir, rp(d.tot.blokir) + ' · ' + pctTxt(pct(d.tot.blokir, d.tot.pagu)) + ' dari pagu', '#b45309')}
            ${kpi('Sisa pagu', sisa, 'Pagu − blokir − realisasi', sisa < 0 ? '#b91c1c' : '')}
            <div style="background:#0071e3;color:#fff;border-radius:16px;padding:20px">
              <div style="font-size:13px;font-weight:500;opacity:.9">Serapan</div>
              <div style="font-size:26px;font-weight:700;margin-top:6px;letter-spacing:-.01em">${pctTxt(serap)}</div>
              <div style="height:8px;border-radius:99px;background:rgba(255,255,255,.3);margin-top:10px;overflow:hidden"><div style="width:${Math.min(100, serap)}%;height:100%;background:#fff"></div></div>
              <div style="font-size:11px;margin-top:6px;opacity:.85">Realisasi ÷ pagu netto (pagu − blokir)</div>
            </div>
          </section>

          <section style="display:flex;flex-wrap:wrap;gap:16px">
            ${kartu(`<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline"><h2 style="margin:0;font-size:16px;font-weight:600">Realisasi vs RPD (kumulatif)</h2>
              <div style="display:flex;gap:16px;font-size:12px;color:#6e6e73"><span style="display:flex;align-items:center;gap:6px"><span style="width:18px;height:3px;background:#0071e3;border-radius:2px"></span>Realisasi</span><span style="display:flex;align-items:center;gap:6px"><span style="width:18px;height:0;border-top:2px dashed #8e8e93"></span>RPD</span></div></div>
              ${chartSvg(d)}
              <div style="font-size:12px;color:#6e6e73;margin-top:4px">${selisihRpd > 0 ? 'Realisasi tertinggal ' + ringkas(selisihRpd) + ' dari RPD bulan berjalan.' : 'Realisasi sudah melampaui RPD bulan berjalan sebesar ' + ringkas(-selisihRpd) + '.'}</div>`, 'flex:2 1 640px;')}
            ${kartu(`<div style="display:flex;flex-direction:column;gap:18px"><h2 style="margin:0;font-size:16px;font-weight:600">Per sumber dana</h2>
              ${sdBlok('RM', '#0071e3', d.sd.RM)}${sdBlok('PNBP', '#d97706', d.sd.PNBP)}
              <div style="border-top:1px solid #e5e5ea;padding-top:14px"><div style="font-size:13px;font-weight:600;margin-bottom:10px">Per jenis belanja</div>
              ${jenisBaris('Belanja Barang (52)', d.jenis.barang)}${jenisBaris('Belanja Modal (53)', d.jenis.modal)}</div></div>`, 'flex:1 1 320px;')}
          </section>

          <section style="display:flex;flex-wrap:wrap;gap:16px">
            ${kartu(`<h2 style="margin:0 0 14px;font-size:16px;font-weight:600">Serapan per seksi</h2><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px"><thead><tr style="color:#6e6e73;text-align:left"><th scope="col" style="padding:8px 8px 8px 0;font-weight:500">Seksi</th><th scope="col" style="padding:8px;font-weight:500;text-align:right">Pagu</th><th scope="col" style="padding:8px;font-weight:500;text-align:right">Realisasi</th><th scope="col" style="padding:8px;font-weight:500">Serapan</th></tr></thead><tbody>${seksiRows}</tbody></table></div>`, 'flex:3 1 560px;')}
            ${kartu(`<h2 style="margin:0 0 14px;font-size:16px;font-weight:600">Status kegiatan</h2><div style="display:flex;flex-direction:column;gap:10px;font-size:13px">${statusBaris}</div><div style="height:12px;border-radius:99px;overflow:hidden;display:flex;margin-top:16px" aria-hidden="true">${statusBar}</div><div style="font-size:12px;color:#6e6e73;margin-top:8px">${d.jumlahKegiatan} kegiatan tercatat tahun ini.</div>`, 'flex:2 1 360px;')}
          </section>

          <section style="display:flex;flex-wrap:wrap;gap:16px">
            ${kartu(`<h2 style="margin:0 0 4px;font-size:16px;font-weight:600">Perlu perhatian</h2><div style="font-size:12px;color:#6e6e73;margin-bottom:12px">Akun yang melebihi pagu, sisanya menipis, diblokir, atau serapannya rendah.</div>${perhatianHtml}`, 'flex:3 1 560px;')}
            ${kartu(`<h2 style="margin:0 0 14px;font-size:16px;font-weight:600">SPM &amp; perjalanan dinas</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${mini('SPM menunggu SP2D', d.spm.belum)}${mini('SP2D bulan ini', d.spm.bulan)}${mini('Perjalanan dinas bulan ini', d.spm.perjadinBulan)}${mini('Sedang bertugas hari ini', d.spm.bertugas)}</div><div style="font-size:12px;color:#6e6e73;margin-top:14px;line-height:1.5">Hanya ringkasan global. Rincian per kegiatan dan per pegawai ada di Dashboard SiMAB.</div>`, 'flex:2 1 360px;')}
          </section>
        </main>`;
    }

    // ---------- Logout & buka ----------
    function keluar() {
        const keys = ['nama', 'nip', 'realUrl', 'admin', 'jabatan', 'pangkat', 'kepeg', 'kantor', 'aksesMenu', 'superadmin', 'superadminMode', 'tahunAktif', 'lastActivity', 'postLoginRedirect'];
        const selesai = () => {
            keys.forEach(k => localStorage.removeItem(k));
            window.location.href = 'index.html?reason=logout';
        };
        try {
            Promise.resolve(window.sb && sb.auth && sb.auth.signOut()).then(selesai, selesai);
        } catch (e) { selesai(); }
    }

    function tutupOverlay() {
        const el = document.getElementById(ID);
        if (el) el.remove();
        document.body.style.overflow = '';
    }

    /**
     * opsi.dariLogin : true di index.html (tombol "Dashboard SiMAB" ke dashboard.html)
     */
    // Fitur "Dashboard Pimpinan" bisa dimatikan per kantor (Pengaturan Fitur).
    async function pimpinanDiizinkan() {
        try {
            if (typeof waitSupabaseAuthReady === 'function') await waitSupabaseAuthReady();
            const { data, error } = await window.sb.from('fitur_kantor').select('aktif')
                .eq('kantor_id', localStorage.getItem('kantor') || '').eq('fitur', 'dashboard_pimpinan').maybeSingle();
            if (error) return true;
            return !(data && data.aktif === false);
        } catch (e) { return true; }
    }

    async function bukaDashboardPimpinan(opsi) {
        opsi = opsi || {};
        if (!(await pimpinanDiizinkan())) {
            if (opsi.dariLogin) { window.location.href = 'dashboard.html'; }
            else if (typeof showToast === 'function') showToast('Dashboard Pimpinan dinonaktifkan untuk kantor ini.');
            return;
        }
        tutupOverlay();
        const el = document.createElement('div');
        el.id = ID;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Dashboard Pimpinan');
        el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#f5f5f7;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;color:#1d1d1f';
        el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#6e6e73"><i class="fa-solid fa-spinner fa-spin" style="font-size:28px;color:#0071e3"></i><div style="font-size:14px">Memuat Dashboard Pimpinan…</div></div>';
        document.body.appendChild(el);
        document.body.style.overflow = 'hidden';

        const pasangTombol = () => {
            const t = el.querySelector('#pmp-tutup'); if (t) t.onclick = keluar;
            const d = el.querySelector('#pmp-dash');
            if (d) d.onclick = () => { if (opsi.dariLogin) window.location.href = 'dashboard.html'; else tutupOverlay(); };
        };

        try {
            if (typeof waitSupabaseAuthReady === 'function') await waitSupabaseAuthReady();
            const kantor = localStorage.getItem('kantor') || '';
            const tahun = await getTahunAktif();
            // Selalu sesuai kantor yang dipilih saat login (termasuk superadmin),
            // bukan gabungan semua kantor.
            const scope = { kantor_id: kantor, tahun };

            const [pokRows, kegAll, blkRows, rpdRows] = await Promise.all([
                sbFetchAll('pok', '*', scope),
                sbFetchAll('kegiatan', '*', scope),
                sbFetchAll('blokir', '*', scope),
                sbFetchAll('rpd', '*', scope)
            ]);
            const kegRows = kegAll.filter(k => Number(k.tahun) === Number(tahun) && k.kantor_id === kantor);

            let namaKantor = 'KPKNL Denpasar';
            try {
                const { data } = await sb.from('kantor').select('nama').eq('id', kantor).maybeSingle();
                if (data && data.nama) namaKantor = data.nama;
            } catch (e) { /* pakai default */ }

            const d = hitung(pokRows, kegRows, blkRows, rpdRows);
            el.innerHTML = buildHtml(d, {
                namaKantor, tahun,
                namaUser: localStorage.getItem('nama') || '',
                jabatan: localStorage.getItem('jabatan') || ''
            });
            el.scrollTop = 0;
            pasangTombol();
        } catch (e) {
            console.error('Dashboard Pimpinan error:', e);
            el.innerHTML = `<div style="max-width:480px;margin:80px auto;padding:24px;text-align:center"><div style="color:#b91c1c;font-weight:600;margin-bottom:8px">Gagal memuat Dashboard Pimpinan</div><div style="font-size:13px;color:#6e6e73;margin-bottom:16px">${esc(e.message || e)}</div><div style="display:flex;gap:10px;justify-content:center"><button type="button" id="pmp-dash" style="height:44px;padding:0 18px;border:0;border-radius:12px;background:#0071e3;color:#fff;font-weight:600;cursor:pointer">Dashboard SiMAB</button><button type="button" id="pmp-tutup" style="height:44px;padding:0 18px;border:1px solid #fecaca;border-radius:12px;background:#fff;color:#b91c1c;font-weight:600;cursor:pointer">Tutup</button></div></div>`;
            pasangTombol();
        }
    }

    window.bukaDashboardPimpinan = bukaDashboardPimpinan;
    window.isKepalaKantor = function (jabatan) {
        return /\bkepala\b/i.test(String(jabatan || ''));
    };
})();

// Tombol sidebar "Log Aktivitas" hanya muncul untuk superadmin
(function () {
    const tampil = () => {
        const b = document.getElementById('nav-log');
        if (b && localStorage.getItem('superadmin') === '1') b.classList.remove('hidden');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tampil); else tampil();
})();

// Tombol sidebar "Dashboard Pimpinan": superadmin, admin kantor, dan pejabat berjabatan Kepala
(function () {
    const tampil = () => {
        const b = document.getElementById('nav-pimpinan');
        if (b && (localStorage.getItem('superadmin') === '1' || localStorage.getItem('admin') === '1' || window.isKepalaKantor(localStorage.getItem('jabatan')))) b.classList.remove('hidden');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tampil); else tampil();
})();
