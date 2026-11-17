// Jarwo — asisten AI SiMAB (tombol mengambang + panel chat + rekam dari foto/PDF).
// Semua penyimpanan dilakukan di sini (browser) dengan sesi user, setelah user menekan Simpan.
(function () {
  if (window.__jarwoLoaded) return; window.__jarwoLoaded = true;
  const FN = SUPABASE_URL + '/functions/v1/jarwo';
  const hist = [];
  let panel, list, input, busy = false;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = n => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

  async function call(body) {
    await waitSupabaseAuthReady();
    const { data } = await sb.auth.getSession();
    const jwt = data?.session?.access_token;
    if (!jwt) throw new Error('Sesi login habis, silakan login ulang.');
    const r = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt, apikey: SUPABASE_KEY },
      body: JSON.stringify({ ...body, kantor: getKantorAktif(), tahun: await getTahunAktif() }),
      signal: AbortSignal.timeout(130000)
    }).catch(e => { throw new Error(e.name === 'TimeoutError' ? 'Jarwo terlalu lama menjawab, coba lagi sebentar.' : e.message); });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
    return j;
  }

  // markdown ringan -> HTML aman (tebal, miring, daftar, tabel sederhana jadi teks)
  function md(t) {
    const inl = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,]|$)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const out = []; let ul = false;
    const close = () => { if (ul) { out.push('</ul>'); ul = false; } };
    String(t || '').split(/\n/).forEach(line => {
      const m = line.match(/^\s*(?:[*\-•]|\d+[.)])\s+(.*)$/);
      if (m) { if (!ul) { out.push('<ul class="jw-ul">'); ul = true; } out.push('<li>' + inl(m[1]) + '</li>'); return; }
      close();
      if (!line.trim()) { out.push('<div style="height:6px"></div>'); return; }
      const h = line.match(/^#{1,4}\s+(.*)$/);
      out.push(h ? '<div><b>' + inl(h[1]) + '</b></div>' : '<div>' + inl(line) + '</div>');
    });
    close(); return out.join('');
  }

  function bubble(html, who) {
    const d = document.createElement('div');
    d.className = 'jw-b ' + who;
    d.innerHTML = html;
    list.appendChild(d); list.scrollTop = list.scrollHeight;
    return d;
  }

  function build() {
    const st = document.createElement('style');
    st.textContent = `
#jw-fab{position:fixed;right:16px;bottom:16px;z-index:9000;width:56px;height:56px;border-radius:50%;border:0;background:#007aff;color:#fff;font-size:22px;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer}
#jw-panel{position:fixed;right:16px;bottom:84px;z-index:9001;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 110px));background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;font-size:14px}
#jw-panel.open{display:flex}
#jw-head{padding:10px 14px;background:#007aff;color:#fff;font-weight:600;display:flex;justify-content:space-between;align-items:center}
#jw-list{flex:1;overflow:auto;padding:10px;background:#f2f2f7}
.jw-b{max-width:92%;margin:6px 0;padding:8px 11px;border-radius:12px;white-space:pre-wrap;word-break:break-word}
.jw-b.u{background:#007aff;color:#fff;margin-left:auto}
.jw-b.a{background:#fff;color:#111}
.jw-b.card{background:#fff;border:1px solid #c7c7cc;max-width:100%;width:100%;white-space:normal}
.jw-b.card label{display:block;font-size:11px;color:#666;margin-top:6px}
.jw-b.card input,.jw-b.card select{width:100%;border:1px solid #d1d1d6;border-radius:8px;padding:4px 6px;font-size:13px}
.jw-b.card .row{display:flex;gap:6px}.jw-b.card .row>*{flex:1}
.jw-ul{margin:4px 0;padding-left:18px;list-style:disc}.jw-ul li{margin:2px 0}.jw-b code{background:#f2f2f7;padding:0 4px;border-radius:4px}
.jw-b.card button{margin-top:8px;padding:6px 12px;border-radius:8px;border:0;cursor:pointer;font-size:13px}
.jw-ok{background:#34c759;color:#fff}.jw-no{background:#e5e5ea}
#jw-foot{display:flex;gap:6px;padding:8px;border-top:1px solid #e5e5ea}
#jw-foot input[type=text]{flex:1;border:1px solid #d1d1d6;border-radius:18px;padding:7px 12px;font-size:14px}
#jw-foot button{border:0;background:none;font-size:18px;cursor:pointer;color:#007aff}`;
    document.head.appendChild(st);
    const fab = document.createElement('button');
    fab.id = 'jw-fab'; fab.title = 'Jarwo'; fab.innerHTML = '<i class="fa-solid fa-robot"></i>';
    panel = document.createElement('div'); panel.id = 'jw-panel';
    panel.innerHTML = `<div id="jw-head"><span>Jarwo · Asisten SiMAB</span><span id="jw-x" style="cursor:pointer">✕</span></div>
      <div id="jw-list"></div>
      <div id="jw-foot"><button id="jw-att" title="Unggah foto/PDF"><i class="fa-solid fa-paperclip"></i></button>
      <input type="text" id="jw-in" placeholder="Tanya Jarwo atau unggah dokumen..."><button id="jw-send"><i class="fa-solid fa-paper-plane"></i></button>
      <input type="file" id="jw-file" accept="image/*,application/pdf" style="display:none"></div>`;
    document.body.append(fab, panel);
    list = panel.querySelector('#jw-list'); input = panel.querySelector('#jw-in');
    const toggle = () => { panel.classList.toggle('open'); if (panel.classList.contains('open') && !list.children.length) bubble('Halo, saya Jarwo 👋 Tanya apa saja soal anggaran/kegiatan, atau unggah foto/PDF (surat tugas, kuitansi, SPBy/SPM/SP2D) lewat ikon klip untuk direkam.', 'a'); };
    window.toggleJarwo = toggle;
    fab.onclick = toggle;
    panel.querySelector('#jw-x').onclick = () => panel.classList.remove('open');
    panel.querySelector('#jw-send').onclick = send;
    input.onkeydown = e => { if (e.key === 'Enter') send(); };
    const f = panel.querySelector('#jw-file');
    panel.querySelector('#jw-att').onclick = () => f.click();
    f.onchange = () => { if (f.files[0]) upload(f.files[0]); f.value = ''; };
  }

  async function send() {
    const t = input.value.trim(); if (!t || busy) return;
    input.value = ''; bubble(esc(t), 'u'); hist.push({ role: 'user', content: t });
    busy = true; const w = bubble('…', 'a');
    try {
      const r = await call({ mode: 'chat', messages: hist });
      w.innerHTML = md(r.reply || '(kosong)'); hist.push({ role: 'assistant', content: r.reply });
      (r.lampiran || []).forEach(addFileCard);
    }
    catch (e) { w.textContent = 'Maaf: ' + e.message; }
    busy = false;
  }

  // ---------- unduh Excel / PDF dari tabel hasil Jarwo ----------
  const slug = t => String(t || 'laporan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'laporan';
  function addFileCard(t) {
    const c = bubble(`<b>📄 ${esc(t.judul)}</b><div style="font-size:12px;color:#555">${esc(t.meta || '')} · ${t.baris.length} baris</div>
      <div style="margin-top:6px"><button class="jw-ok" data-f="xlsx">⬇ Excel</button> <button class="jw-ok" data-f="pdf" style="background:#007aff">⬇ PDF</button></div>`, 'card');
    c.querySelector('[data-f=xlsx]').onclick = () => unduhExcel(t);
    c.querySelector('[data-f=pdf]').onclick = e => unduhPdf(t, e.target);
  }
  function unduhExcel(t) {
    if (!window.XLSX) { alert('Library Excel belum termuat.'); return; }
    const aoa = [[t.judul], [t.meta || ''], [], t.kolom, ...t.baris];
    if (t.total) aoa.push(t.total);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = t.kolom.map((k, i) => ({ wch: Math.min(60, Math.max(String(k).length + 2, ...t.baris.slice(0, 200).map(r => String(r[i] ?? '').length + 2))) }));
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, t.kolom.length - 1) } }];
    const rng = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 4; R <= rng.e.r; R++) for (let C = 0; C <= rng.e.c; C++) { const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]; if (cell && cell.t === 'n') cell.z = '#,##0'; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
    XLSX.writeFile(wb, slug(t.judul) + '.xlsx');
  }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src)); document.head.appendChild(s); }); }
  async function unduhPdf(t, btn) {
    const old = btn.textContent; btn.textContent = '…'; btn.disabled = true;
    try {
      if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      if (!(window.jspdf && window.jspdf.jsPDF.API.autoTable)) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
      const doc = new window.jspdf.jsPDF({ orientation: t.kolom.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
      doc.setFontSize(13); doc.text(String(t.judul), 40, 38);
      doc.setFontSize(9); doc.text(String(t.meta || '') + ' · dicetak ' + new Date().toLocaleDateString('id-ID'), 40, 54);
      const fmt = v => typeof v === 'number' ? v.toLocaleString('id-ID') : String(v ?? '');
      const numCols = {}; t.kolom.forEach((k, i) => { if (t.baris.some(r => typeof r[i] === 'number')) numCols[i] = { halign: 'right' }; });
      doc.autoTable({ startY: 66, head: [t.kolom], body: t.baris.map(r => r.map(fmt)), foot: t.total ? [t.total.map(fmt)] : undefined,
        styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [0, 122, 255] }, footStyles: { fillColor: [235, 235, 240], textColor: 20, fontStyle: 'bold' }, columnStyles: numCols,
        didDrawPage: () => { doc.setFontSize(8); doc.text('Halaman ' + doc.internal.getNumberOfPages(), doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20); } });
      doc.save(slug(t.judul) + '.pdf');
    } catch (e) { alert('Gagal membuat PDF: ' + e.message); }
    btn.textContent = old; btn.disabled = false;
  }

  function toB64(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
  }
  // kecilkan foto agar upload ringan
  async function shrink(file) {
    if (!file.type.startsWith('image/')) return file;
    const bmp = await createImageBitmap(file); const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = bmp.width * s; c.height = bmp.height * s;
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(new File([b], 'foto.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.85));
  }

  async function upload(file) {
    if (busy) return;
    if (file.size > 10 * 1024 * 1024) { bubble('File terlalu besar (maks 10 MB).', 'a'); return; }
    bubble('📎 ' + esc(file.name), 'u'); busy = true; const w = bubble('Membaca dokumen…', 'a');
    try {
      const f = await shrink(file);
      const r = await call({ mode: 'extract', file: { mime: f.type, data: await toB64(f) }, hint: input.value.trim() });
      w.remove(); drafCard(r.draft);
    } catch (e) { w.textContent = 'Gagal membaca dokumen: ' + e.message; }
    busy = false;
  }

  const field = (l, id, v, type) => `<label>${l}</label><input id="${id}" type="${type || 'text'}" value="${esc(v)}">`;

  function drafCard(d) {
    const jenis = d.jenis || 'lainnya';
    const c = bubble('', 'card'); const id = 'jw' + Date.now();
    const makOpts = (d.saran_mak || []).map(m => `<option value="${esc(m.kode)}">${esc(m.kode)} — ${esc(m.uraian || '')} (${esc(m.sd || '')})</option>`).join('');
    const makField = () => `<label>MAK</label>${makOpts ? `<select id="${id}mk">${makOpts}</select>` : ''}` +
      `<input id="${id}mk2" list="${id}dl" placeholder="${makOpts ? 'Ganti MAK (opsional): ketik kode/uraian' : 'Kode MAK, mis. 4798.ABA.002.005.B.524111'}" style="margin-top:4px"><datalist id="${id}dl"></datalist>`;
    const head = `<b>Draft: ${{ surat_tugas: 'Surat Tugas / ND', kuitansi: 'Kuitansi / Nota', spby_spm_sp2d: 'SPBy / SPM / SP2D', lainnya: 'Dokumen lain' }[jenis] || jenis}</b><div style="font-size:12px;color:#555">${esc(d.ringkasan || '')}</div>`;
    const warn = d.catatan ? `<div style="font-size:12px;color:#b45309;margin-top:4px">⚠ ${esc(d.catatan)}</div>` : '';
    if (jenis === 'lainnya') { c.innerHTML = head + warn + '<div style="margin-top:6px;font-size:12px">Jenis dokumen ini belum bisa direkam otomatis. Silakan bertanya soal isinya lewat chat.</div>'; return; }

    let body = '';
    if (jenis === 'surat_tugas') {
      body = field('Uraian (No. ST)', id + 'ur', d.nomor_dokumen || d.uraian) + field('Tujuan (kabupaten/kota)', id + 'tj', String(d.tujuan || '').split(',')[0].replace(/^\s*(kabupaten|kab\.?|kota)\s+/i, '').trim()) + field('Tgl ST', id + 'st', d.tanggal_dokumen, 'date') +
        `<div class="row"><div>${field('Mulai', id + 'm', d.tgl_mulai, 'date')}</div><div>${field('Selesai', id + 's', d.tgl_selesai, 'date')}</div></div>` +
        makField() +
        '<label>Pelaksana</label>' + (d.pelaksana || []).map((p, i) =>
          `<div class="row"><input data-p="${i}" data-f="nama" value="${esc(p.cocok || p.nama)}" title="${p.cocok ? 'cocok dengan pegawai' : 'tidak cocok dgn pegawai'}"><input data-p="${i}" data-f="jumlah" type="number" value="${p.jumlah || 0}">${p.cocok ? '' : '<span title="Tidak ditemukan di daftar pegawai">⚠</span>'}</div>`).join('');
    } else if (jenis === 'kuitansi') {
      body = field('Uraian', id + 'ur', d.uraian) + field('Penyedia / Rekanan', id + 'pv', d.rekanan_cocok || d.penyedia) +
        (d.penyedia && !d.rekanan_cocok ? '<div style="font-size:11px;color:#b45309">⚠ Belum ada di Referensi › Rekanan (nama dicatat apa adanya)</div>' : '') +
        field('Jumlah', id + 'jm', d.jumlah_total, 'number') + field('Tanggal bayar/nota', id + 'tb', d.tgl_bayar || d.tanggal_dokumen, 'date') +
        makField();
    } else {
      body = field('No. SPM', id + 'spm', d.nomor_spm) + field('Tgl SP2D', id + 'sp', d.tgl_sp2d, 'date') + field('Tgl Bayar', id + 'tb', d.tgl_bayar || d.tgl_sp2d, 'date') +
        field('Cari kegiatan (nama/uraian)', id + 'q', (d.pelaksana?.[0]?.nama) || d.uraian || '') + '<button class="jw-no" id="' + id + 'cari">Cari</button><div id="' + id + 'hasil" style="font-size:12px"></div>';
    }
    c.innerHTML = head + warn + body + `<div><button class="jw-ok" id="${id}ok">Simpan</button> <button class="jw-no" id="${id}no">Batal</button></div>`;
    c.querySelector('#' + id + 'no').onclick = () => c.remove();
    const v = k => k === 'mk' ? ((c.querySelector('#' + id + 'mk2')?.value || '').trim().split(/\s+—\s+/)[0] || c.querySelector('#' + id + 'mk')?.value || '') : (c.querySelector('#' + id + k)?.value ?? '');
    const dl = c.querySelector('#' + id + 'dl');
    if (dl) (async () => { try { await waitSupabaseAuthReady();
      const { data } = await sb.from('pok').select('kode,uraian').eq('kantor_id', getKantorAktif()).eq('tahun', await getTahunAktif()).limit(1000);
      dl.innerHTML = (data || []).map(r => `<option value="${esc(r.kode)}">${esc((r.uraian || '').slice(0, 60))}</option>`).join(''); } catch (_) {} })();
    if (jenis === 'spby_spm_sp2d') c.querySelector('#' + id + 'cari').onclick = async () => {
      const k = v('q').trim(); const box = c.querySelector('#' + id + 'hasil');
      const { data } = await sb.from('kegiatan').select('id,mak,uraian,pelaksana,jumlah,status').eq('kantor_id', getKantorAktif()).eq('tahun', await getTahunAktif())
        .or(`pelaksana.ilike.%${k}%,uraian.ilike.%${k}%`).limit(10);
      box.innerHTML = (data || []).map(r => `<label style="display:block"><input type="radio" name="${id}t" value="${r.id}"> ${esc(r.pelaksana)} — ${esc((r.uraian || '').slice(0, 50))} (${rp(r.jumlah)}, ${esc(r.status)})</label>`).join('') || 'Tidak ada yang cocok.';
    };
    c.querySelector('#' + id + 'ok').onclick = async function () {
      this.disabled = true;
      try { await simpan(jenis, c, id, v, d); c.innerHTML = '<b>✅ Tersimpan.</b>'; if (window.kgLoadData) try { kgLoadData(true); } catch (_) {} }
      catch (e) { alert('Gagal menyimpan: ' + e.message); this.disabled = false; }
    };
  }

  async function simpan(jenis, c, id, v, d) {
    await waitSupabaseAuthReady();
    const kantor = getKantorAktif(), tahun = await getTahunAktif();
    const user = localStorage.getItem('nama') || '';
    const today = new Date().toISOString().split('T')[0];
    if (jenis === 'surat_tugas') {
      const mak = v('mk').trim(); if (!mak) throw new Error('MAK wajib diisi');
      const rows = [...c.querySelectorAll('[data-f="nama"]')].map(el => ({ nama: el.value.trim(), jumlah: Number(c.querySelector(`[data-p="${el.dataset.p}"][data-f="jumlah"]`).value) || 0 })).filter(p => p.nama);
      if (!rows.length) throw new Error('Pelaksana kosong');
      const lpt = /52411[13]/.test(mak);
      const ins = rows.map(p => ({
        id: kgGenerateRandomId(10), mak, uraian: v('ur'), pelaksana: p.nama, tujuan: v('tj'),
        tgl_st: normDate(v('st')), tgl_mulai: normDate(v('m')), tgl_selesai: normDate(v('s')), tgl_lpt: null, tgl_bayar: null,
        jumlah: p.jumlah, user, status: kgComputeStatus(v('m'), '', '', ''), tgl_sp2d: null, nomor_spm: '', dokumen_link: '', spby_link: '',
        tgl_rekam: normDate(today), perbantuan: false, kantor_id: kantor, tahun
      }));
      const { error } = await sb.from('kegiatan').insert(ins); if (error) throw new Error(error.message);
      void lpt;
    } else if (jenis === 'kuitansi') {
      const mak = v('mk').trim(); if (!mak) throw new Error('MAK wajib diisi');
      if (/52411[13]/.test(mak)) throw new Error('MAK perjadin (524111/524113) direkam lewat Surat Tugas.');
      const tb = v('tb') || today;
      const { error } = await sb.from('kegiatan').insert({
        id: kgGenerateRandomId(10), mak, uraian: v('ur'), pelaksana: v('pv'), tujuan: '', tgl_st: null, tgl_mulai: normDate(tb), tgl_selesai: normDate(tb),
        tgl_lpt: null, tgl_bayar: normDate(tb), jumlah: Number(v('jm')) || 0, user, status: kgComputeStatus(tb, '', tb, ''), tgl_sp2d: null,
        nomor_spm: '', dokumen_link: '', spby_link: '', tgl_rekam: normDate(today), perbantuan: false, kantor_id: kantor, tahun
      });
      if (error) throw new Error(error.message);
    } else {
      const t = c.querySelector(`input[name="${id}t"]:checked`)?.value; if (!t) throw new Error('Pilih kegiatan yang dituju (klik Cari).');
      const { data: row } = await sb.from('kegiatan').select('tgl_mulai,tgl_lpt').eq('id', t).single();
      const sp = v('sp'), tb = v('tb');
      const { error } = await sb.from('kegiatan').update({
        nomor_spm: v('spm'), tgl_sp2d: normDate(sp) || null, tgl_bayar: normDate(tb) || null,
        status: kgComputeStatus(row?.tgl_mulai, row?.tgl_lpt, tb, sp)
      }).eq('id', t);
      if (error) throw new Error(error.message);
    }
    try { await sb.from('jarwo_log').insert({ kantor_id: kantor, aksi: 'simpan', keterangan: jenis }); } catch (_) {}
  }

  function init() { if (!localStorage.getItem('nip') && !localStorage.getItem('nama')) return; build(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
