/**
 * Halaman POK
 */


window.rawPokData = [];
window.expandedCodes = new Set();
window.expandedSeksi = new Set(); // Seksi (grup) yang sedang dibuka
window.searchResults = [];
window.searchIndex = -1;
window.selectedKode = "";
window.detilKegiatanData = [];
window.refCoaData = null; // cache B1 & B2 sheet ref_coa (kodeSatker, kodeUnit)

// Warna badge per Seksi (kolom I sheet pok_sumber_2026)
const POK_SEKSI_COLORS = {
    'PN': 'bg-sky-100 text-sky-700',
    'HI': 'bg-purple-100 text-purple-700',
    'KI': 'bg-amber-100 text-amber-700',
    'Lelang': 'bg-rose-100 text-rose-700',
    'Penilaian': 'bg-emerald-100 text-emerald-700',
    'PKN': 'bg-indigo-100 text-indigo-700',
    'Umum': 'bg-slate-200 text-slate-700'
};

function pokSeksiBadgeClass(seksi) {
    return POK_SEKSI_COLORS[seksi] || 'bg-slate-100 text-slate-600';
}

function toggleSeksiGroup(seksi) {
    if (window.expandedSeksi.has(seksi)) {
        window.expandedSeksi.delete(seksi);
    } else {
        window.expandedSeksi.add(seksi);
    }
    renderPok();
}

async function initPokPage() {
    window.expandedCodes = new Set();
    window.expandedSeksi = new Set();
    window.searchResults = [];
    window.selectedKode = "";
    await loadPokData();
}

// Firebase Auth butuh waktu (async) buat "menghidupkan ulang" sesi login yang
// tersimpan tiap kali halaman dibuka/di-refresh. Kalau query Firestore langsung
// ditembak sebelum ini selesai, request.auth masih kosong -> ditolak Rules
// ("insufficient permissions") walau sebenarnya user sudah login. Fungsi ini
// nunggu sampai Firebase Auth benar2 siap (auth state ready) dulu.

async function loadPokData() {
    const tbody = document.getElementById('pok-tbody');
    try {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;

        // Pastikan Supabase Auth sudah selesai memuat ulang sesi login sebelum
        // query ke database (lihat komentar waitSupabaseAuthReady di supabase-config.js).
        await waitSupabaseAuthReady();

        // Ambil pok, kegiatan, & blokir BARENGAN — kegiatan dipakai utk hitung
        // Realisasi LIVE, blokir dipakai utk hitung Blokir LIVE — sekaligus kegiatan
        // di-cache global (window.kegiatanRowsCache) supaya fetchLokasiData/
        // loadRefPegawai tidak perlu baca ulang tabel kegiatan dari nol lagi.
        const [pokRes, kegiatanRes, blokirRes] = await Promise.all([
            sb.from('pok').select('*'),
            sb.from('kegiatan').select('*'),
            sb.from('blokir').select('*')
        ]);
        if (pokRes.error) throw new Error(pokRes.error.message);
        if (kegiatanRes.error) throw new Error(kegiatanRes.error.message);
        if (blokirRes.error) throw new Error(blokirRes.error.message);

        window.kegiatanRowsCache = kegiatanRes.data || [];

        // Realisasi = jumlah semua kegiatan yang MAK-nya sama dengan Kode POK ini.
        const realisasiByMak = {};
        window.kegiatanRowsCache.forEach(d => {
            const mak = String(d.mak || '').trim();
            if (!mak) return;
            realisasiByMak[mak] = (realisasiByMak[mak] || 0) + (Number(d.jumlah) || 0);
        });

        // Blokir = kolom 'nilai' dari baris blokir dengan id yang sama dgn Kode.
        window.blokirRowsCache = (blokirRes.data || []).map(d => ({ id: d.id, nilai: Number(d.nilai) || 0 }));
        const blokirByKode = {};
        window.blokirRowsCache.forEach(d => { blokirByKode[d.id] = d.nilai; });

        // Nama kolom di Supabase pakai snake_case & beda dikit dari yang dipakai di
        // seluruh file ini (sd->sumber, seksi->bidang, es_i->es1), jadi dipetakan
        // ulang di sini SAJA supaya sisa kode di bawah (render, export, dll) tidak
        // perlu diubah apapun. 'kode' field eksplisit (BUKAN id baris lagi -- id
        // baris sekarang komposit Kode+Seksi). 'docId' = id baris Supabase, dipakai
        // fitur Ubah POK.
        const data = (pokRes.data || []).map(d => {
            const kode = d.kode || d.id; // fallback ke id kalau data lama blm ada kolom kode
            const pagu = d.pagu || 0;
            const blokir = blokirByKode[kode] || 0; // LIVE, dikunci per Kode
            const realisasi = realisasiByMak[kode] || 0; // LIVE, dikunci per Kode
            const sisa = pagu - blokir - realisasi;
            return {
                docId: d.id,
                kode,
                uraian: d.uraian || '',
                pagu, blokir, realisasi, sisa,
                sumber: d.sd || '',
                bidang: d.seksi || '',
                ba: d.ba || '',
                es1: d.es_i || '',
                prog: d.prog || '',
                satker: d.satker || '',
                kppn: d.kppn || ''
            };
        });

        if (!data || !Array.isArray(data)) {
            throw new Error('Format data tidak valid');
        }

        window.rawPokData = data;
        renderPok();
    } catch (e) {
        console.error('Error loading POK data:', e);
        const errorMsg = e.name === 'AbortError'
            ? 'Timeout: Server tidak merespons (>30 detik)'
            : e.message || 'Gagal memuat data';
        tbody.innerHTML = `<tr><td colspan="8" class="text-red-500 p-4 text-center">❌ ${errorMsg}</td></tr>`;
    }
}

// ========================================
// REF COA (kode satker & kode unit statis dari sheet ref_coa, B1 & B2)
// ========================================

async function fetchRefCoaData() {
    if (window.refCoaData) return window.refCoaData;
    try {
        // Kode Satker/Unit itu cuma 2 nilai statis yang jarang berubah — disimpan
        // di 1 baris kecil tabel config (id='refCoa', kolom data jsonb berisi
        // {kodeSatker, kodeUnit}). CATATAN: sekarang buildKodeSalin() default
        // pakai field satker/kppn dari baris POK-nya sendiri (lebih akurat), jadi
        // fungsi ini praktis cuma fallback & jarang dipanggil.
        await waitSupabaseAuthReady();
        const { data, error } = await sb.from('config').select('data').eq('id', 'refCoa').single();
        if (!error && data) {
            window.refCoaData = data.data;
        } else {
            console.error('Baris config/refCoa belum ada di Supabase.', error);
        }
    } catch (e) {
        console.error('Gagal memuat data ref_coa:', e);
    }
    return window.refCoaData;
}

// Susun string kode salin sesuai format:
// {kodeSatker}.{kodeUnit}.{kodeAkun}.{BA}{Es1}{Prog}.{gabungan4digit+seksi}.{prefix}000000001.00000.2.2251.2.000000.000000
// Nilai fallback KALAU baris POK belum punya field satker/kppn (mis. data lama
// yang belum sempat di-migrasi ulang dari sheet yang sudah ada kolom Satker/KPPN).
const POK_KODE_SATKER_FALLBACK = '538065';
const POK_KODE_KPPN_FALLBACK = '037';

function buildKodeSalin(item) {
    const c = String(item.kode || '');
    const parts = c.split('.');
    // Kode akun = segmen kedua dari belakang, contoh: 4798.FAE.007.100.A.524111.01 -> 524111
    const kodeAkun = parts.length >= 2 ? parts[parts.length - 2] : '';
    // Gabungan 2 segmen pertama, contoh: 4798.FAE... -> 4798FAE
    const gabungan = parts.length >= 2 ? (parts[0] + parts[1]) : '';

    const pad = (val, len) => {
        const s = String(val ?? '').trim();
        return (/^\d+$/.test(s) && s.length < len) ? s.padStart(len, '0') : s;
    };
    const ba = pad(item.ba, 3);   // ikut data baris (kolom I)
    const es1 = pad(item.es1, 2); // ikut data baris (kolom J)
    const prog = String(item.prog || '').trim(); // ikut data baris (kolom K)
    const kodeSatker = String(item.satker || '').trim() || POK_KODE_SATKER_FALLBACK; // kolom L
    const kodeKppn = String(item.kppn || '').trim() || POK_KODE_KPPN_FALLBACK;       // kolom M

    // RM -> A, PNBP -> D
    const prefix = String(item.sumber || '').toUpperCase() === 'PNBP' ? 'D' : 'A';

    return [
        kodeSatker,
        kodeKppn,
        kodeAkun,
        ba + es1 + prog,
        gabungan,
        prefix + '000000001',
        '00000',
        '2',
        '2251',
        '2',
        '000000',
        '000000'
    ].join('.');
}

async function copyKodeAkun(idx) {
    const item = window.rawPokData[idx];
    if (!item) return;

    const kode = buildKodeSalin(item);
    await copyTextToClipboard(kode);
}

async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            showToast('Kode berhasil disalin!');
            return;
        }
        throw new Error('Clipboard API tidak tersedia');
    } catch (e) {
        // Fallback untuk browser/lingkungan yang tidak mendukung navigator.clipboard
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Kode berhasil disalin!');
        } catch (err) {
            console.error('Gagal menyalin kode:', err);
            alert('Gagal menyalin kode. Kode: ' + text);
        }
    }
}

function openEditPokModal(idx) {
    const item = window.rawPokData[idx];
    if (!item) { alert('Data tidak ditemukan.'); return; }

    const uraianEsc = String(item.uraian || '').replace(/"/g, '&quot;');

    const { overlay, popup } = commonOpenOverlay(`
        <h3 class="text-base font-semibold text-sky-700 mb-1"><i class="fa-solid fa-pen mr-2"></i>Ubah POK</h3>
        <p class="text-xs text-slate-400 mb-3 font-mono">${item.kode} <span class="text-slate-300">(${item.bidang || '-'})</span></p>
        <div class="space-y-3">
            <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Uraian</label>
                <input id="pok-editUraian" type="text" value="${uraianEsc}" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500">
            </div>
            <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Pagu</label>
                <input id="pok-editPagu" type="text" value="${Number(item.pagu || 0).toLocaleString('id-ID')}"
                    oninput="this.value = formatRibuan(this.value)"
                    class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 text-right">
            </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button id="pok-editCancel" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Batal</button>
            <button id="pok-editSave" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Simpan
            </button>
        </div>
    `, 'max-w-md');

    popup.querySelector('#pok-editCancel').onclick = () => overlay.remove();
    popup.querySelector('#pok-editSave').onclick = async function () {
        const btn = this;
        const uraianBaru = popup.querySelector('#pok-editUraian').value.trim();
        const paguBaru = Number(popup.querySelector('#pok-editPagu').value.replace(/\./g, '')) || 0;

        if (!uraianBaru) { alert('Uraian tidak boleh kosong.'); return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyimpan...';
        try {
            await waitSupabaseAuthReady();
            // Target update pakai docId (id baris Supabase = Kode+Seksi), BUKAN
            // 'kode' murni lagi -- soalnya 1 Kode bisa punya beberapa baris kalau
            // Seksi-nya beda.
            const { error } = await sb.from('pok').update({ uraian: uraianBaru, pagu: paguBaru }).eq('id', item.docId);
            if (error) throw new Error(error.message);
            overlay.remove();
            showToast('POK berhasil diubah');
            await loadPokData();
        } catch (e) {
            alert('Gagal menyimpan: ' + (e.message || e));
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Simpan';
        }
    };
}
window.openEditPokModal = openEditPokModal;

function renderPok() {
    const tbody = document.getElementById('pok-tbody');
    if (!tbody || !window.rawPokData || window.rawPokData.length === 0) return;

    const uniqueMap = new Map();
    window.rawPokData.forEach(item => {
        uniqueMap.set(String(item.kode) + '|' + (item.bidang || ''), item);
    });
    const uniqueData = Array.from(uniqueMap.values());

    const keyword = (document.getElementById("searchPok")?.value || "").toLowerCase().trim();

    // Kelompokkan berdasarkan Seksi (kolom I), urutan sesuai kemunculan pertama di data
    const groups = new Map(); // seksi -> array item
    uniqueData.forEach(item => {
        const seksi = item.bidang || 'Lainnya';
        if (!groups.has(seksi)) groups.set(seksi, []);
        groups.get(seksi).push(item);
    });

    const pokRenderRow = (i, seksi, groupItems) => {
        const c = String(i.kode);
        const uraian = String(i.uraian || "").toLowerCase();

        const isParent = c.length === 12;
        const isLeaf = c.length > 27;
        const isChildVisible = Array.from(window.expandedCodes).some(k => {
            if (!k.startsWith(seksi + '::')) return false;
            const p = k.slice((seksi + '::').length);
            return c.startsWith(p) && c !== p;
        });

        if (!isParent && !isChildVisible) return '';

        const isMatch = keyword && (c.toLowerCase().includes(keyword) || uraian.includes(keyword));

        // Level hierarki berdasarkan jumlah segmen kode (dipisah titik), untuk indentasi visual
        const depth = c.split('.').length;
        const indentPx = Math.min(depth - 1, 5) * 18;

        let rowBg = 'bg-white hover:bg-slate-100';
        if (isMatch) {
            rowBg = 'bg-yellow-200 hover:bg-yellow-300';
        } else if (isLeaf) {
            rowBg = i.sumber === 'PNBP' ? 'bg-pink-200 hover:bg-pink-300' : 'bg-blue-200 hover:bg-blue-300';
        } else if (isParent) {
            rowBg = 'bg-sky-50 hover:bg-sky-100'; // penanda visual: baris ini bisa diklik untuk expand/collapse
        } else if (depth <= 2) {
            rowBg = 'bg-slate-50 hover:bg-slate-100';
        }

        const textWeight = depth <= 2 ? 'font-bold text-slate-700' : (isLeaf ? 'font-normal text-slate-600' : 'font-semibold text-slate-700');

        const hasChildren = groupItems.some(ch => String(ch.kode).startsWith(c) && String(ch.kode) !== c);
        const expandKey = seksi + '::' + c;

        const pagu = Number(i.pagu || 0);
        const blokir = Number(i.blokir || 0);
        const realisasi = Number(i.realisasi || 0);
        const sisa = Number(i.sisa || 0);
        const paguEfektif = pagu - blokir;
        const persenRealisasi = paguEfektif > 0 ? Math.min((realisasi / paguEfektif) * 100, 100) : 0;
        const barColor = persenRealisasi >= 90 ? 'bg-green-500' : (persenRealisasi >= 50 ? 'bg-sky-500' : 'bg-amber-400');
        const sisaClass = sisa < 0 ? 'text-red-600 font-semibold' : 'text-slate-700';

        return `<tr data-kode="${c}" data-seksi="${seksi}" class="border-b transition ${rowBg} cursor-pointer" onclick="toggleExpand('${c}', '${seksi}')">
            <td class="p-3 font-mono text-xs ${isLeaf ? 'font-bold text-slate-700' : 'text-slate-500'} whitespace-nowrap">${c}</td>
            <td class="p-3 ${textWeight}" style="padding-left:${12 + indentPx}px">
                <span class="whitespace-normal break-words">${i.uraian}</span>
                ${hasChildren ? (window.expandedCodes.has(expandKey) ? ' <i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i>' : ' <i class="fa-solid fa-chevron-right text-[10px] text-slate-400"></i>') : ''}
            </td>
            <td class="p-3 text-right whitespace-nowrap">${pagu.toLocaleString('id-ID')}</td>
            <td class="p-3 text-right whitespace-nowrap">${Number(i.blokir || 0).toLocaleString('id-ID')}</td>
            <td class="p-3 text-right whitespace-nowrap">
                <div>${realisasi.toLocaleString('id-ID')}</div>
                ${paguEfektif > 0 ? `
                    <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                        <div class="h-full ${barColor} rounded-full" style="width:${persenRealisasi}%"></div>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-0.5">${persenRealisasi.toFixed(1)}%</div>
                ` : ''}
            </td>
            <td class="p-3 text-right whitespace-nowrap ${sisaClass}">${sisa.toLocaleString('id-ID')}</td>
            <td class="p-3 text-center whitespace-nowrap text-slate-500">${i.sumber || '-'}</td>
            <td class="p-3 text-center whitespace-nowrap">
                ${isLeaf ? `
                    <button onclick="event.stopPropagation();openRekamModal(${window.rawPokData.indexOf(i)})"
                        class="bg-sky-600 text-white w-6 h-6 inline-flex items-center justify-center rounded hover:bg-sky-700 mr-1" title="Rekam">
                        <i class="fa-solid fa-plus text-[11px] leading-none w-[11px] text-center"></i>
                    </button>
                    <button onclick="event.stopPropagation();openDetilModal('${c}')" class="bg-slate-600 text-white w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-700 mr-1" title="Detil">
                        <i class="fa-solid fa-exclamation text-[11px] leading-none w-[11px] text-center"></i>
                    </button>
                    <button onclick="event.stopPropagation();copyKodeAkun(${window.rawPokData.indexOf(i)})"
                        class="bg-amber-600 text-white w-6 h-6 inline-flex items-center justify-center rounded hover:bg-amber-700 mr-1" title="Salin kode akun lengkap">
                        <i class="fa-solid fa-copy text-[11px] leading-none w-[11px] text-center"></i>
                    </button>
                    <button onclick="event.stopPropagation();openEditPokModal(${window.rawPokData.indexOf(i)})"
                        class="bg-slate-500 text-white w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-600" title="Ubah Uraian/Pagu">
                        <i class="fa-solid fa-pen text-[11px] leading-none w-[11px] text-center"></i>
                    </button>
                ` : ''}
            </td>
        </tr>`;
    };

    const groupHeaderRow = (seksi, count, isOpen) => `
        <tr class="select-none">
            <td colspan="8" class="p-3 font-bold text-sm ${pokSeksiBadgeClass(seksi)}">
                <div class="flex items-center gap-3 flex-wrap">
                    <div class="cursor-pointer flex items-center" onclick="toggleSeksiGroup('${seksi}')">
                        <i class="fa-solid ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'} text-xs mr-2"></i>
                        ${seksi}
                        <span class="ml-2 font-normal text-xs opacity-70">(${count} item)</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button onclick="event.stopPropagation();downloadSeksiPDF('${seksi}')"
                            class="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 shadow-sm">
                            <i class="fa-solid fa-file-pdf"></i> PDF
                        </button>
                        <button onclick="event.stopPropagation();downloadSeksiExcel('${seksi}')"
                            class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 shadow-sm">
                            <i class="fa-solid fa-file-excel"></i> Excel
                        </button>
                    </div>
                </div>
            </td>
        </tr>`;

    const columnSubHeaderRow = () => `
        <tr class="text-slate-500 text-[11px] uppercase">
            <td class="p-2 text-left bg-slate-50 font-semibold">Kode</td>
            <td class="p-2 text-left bg-slate-50 font-semibold">Uraian</td>
            <td class="p-2 text-right bg-slate-50 font-semibold">Pagu</td>
            <td class="p-2 text-right bg-slate-50 font-semibold">Blokir</td>
            <td class="p-2 text-right bg-slate-50 font-semibold">Realisasi</td>
            <td class="p-2 text-right bg-slate-50 font-semibold">Sisa</td>
            <td class="p-2 text-center bg-slate-50 font-semibold">SD</td>
            <td class="p-2 text-center bg-slate-50 font-semibold">Aksi</td>
        </tr>`;

    let html = '';
    groups.forEach((items, seksi) => {
        const isOpen = window.expandedSeksi.has(seksi);
        html += groupHeaderRow(seksi, items.length, isOpen);

        if (isOpen) {
            html += columnSubHeaderRow();
            html += items.map(i => pokRenderRow(i, seksi, items)).join('');
        }
    });

    tbody.innerHTML = html;
}

function searchPok() {
    const keyword = document.getElementById("searchPok").value.trim().toLowerCase();

    if (keyword === "") {
        window.searchResults = [];
        window.selectedKode = "";
        renderPok();
        return;
    }

    window.searchResults = window.rawPokData.filter(r =>
        String(r.kode).toLowerCase().includes(keyword) ||
        String(r.uraian).toLowerCase().includes(keyword)
    );

    if (window.searchResults.length > 0) {
        window.selectedKode = window.searchResults[0].kode;
        const seksi = window.searchResults[0].bidang || 'Lainnya';

        const parentCode = String(window.selectedKode).substring(0, 12);
        window.expandedCodes.add(seksi + '::' + parentCode);
        window.expandedSeksi.add(seksi); // buka grup Seksi terkait

        renderPok();

        setTimeout(() => {
            const el = document.querySelector(`tr[data-kode="${window.selectedKode}"][data-seksi="${seksi}"]`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    }
}

function gotoSearchResult() {
    const item = window.searchResults[window.searchIndex];
    if (!item) return;

    const kode = String(item.kode);
    const seksi = item.bidang || 'Lainnya';
    window.selectedKode = kode;

    if (kode.length > 12) {
        window.expandedCodes.clear();
        window.expandedCodes.add(seksi + '::' + kode.substring(0, 12));
    }
    window.expandedSeksi.add(seksi); // buka grup Seksi terkait

    renderPok();

    setTimeout(() => {
        document.querySelector(`[data-kode="${kode}"][data-seksi="${seksi}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
}

function toggleExpand(code, seksi) {
    if (String(code).length !== 12) return;

    const key = seksi + '::' + code;
    const wasOpen = window.expandedCodes.has(key);

    // Accordion per Seksi: tutup dulu semua kode yang sedang terbuka di Seksi yang sama,
    // supaya expand di satu Seksi tidak ikut membuka kode yang sama di Seksi lain.
    Array.from(window.expandedCodes).forEach(k => {
        if (k.startsWith(seksi + '::')) window.expandedCodes.delete(k);
    });

    if (!wasOpen) {
        window.expandedCodes.add(key);
    }

    renderPok();
}

function toggleExpandAll() {
    const btn = document.getElementById("toggleExpandBtn");
    
    if (window.expandedCodes.size === 0) {
        // Expand all - tambah semua parent codes (12 digit) & buka semua grup Seksi
        const uniqueMap = new Map();
        window.rawPokData.forEach(item => {
            uniqueMap.set(String(item.kode) + '|' + (item.bidang || ''), item);
        });
        const uniqueData = Array.from(uniqueMap.values());
        
        uniqueData.forEach(item => {
            const code = String(item.kode);
            const seksi = item.bidang || 'Lainnya';
            if (code.length === 12) {
                window.expandedCodes.add(seksi + '::' + code);
            }
            window.expandedSeksi.add(seksi);
        });
        
        btn.innerHTML = '<i class="fa-solid fa-compress"></i> Collapse All';
    } else {
        // Collapse all
        window.expandedCodes.clear();
        window.expandedSeksi.clear();
        btn.innerHTML = '<i class="fa-solid fa-expand"></i> Expand All';
    }
    
    renderPok();
}

// Menyisipkan toggle "Perbantuan" di sebelah kanan field ID Usulan, dalam
// row yang sama. Dibuat lewat JS (bukan HTML statis) supaya tidak perlu
// mengubah markup halaman POK secara manual. Idempotent: hanya disisipkan
// sekali walau openRekamModal dipanggil berkali-kali.
//
// Catatan: toggle sengaja tidak pakai class Tailwind "peer-checked:..." karena
// class itu bisa hilang saat CSS Tailwind di-build/purge (tidak ke-detect
// karena disisipkan lewat JS, bukan ada di markup HTML asli) sehingga
// animasinya tidak jalan. Sebagai gantinya, warna & posisi knob diatur
// langsung lewat JS supaya selalu bergerak.
function ensurePerbantuanToggle() {
    if (document.getElementById('perbantuanToggle')) return;

    const idUsulanInput = document.getElementById('idUsulan');
    if (!idUsulanInput) return;

    const idUsulanContainer = idUsulanInput.closest('div') || idUsulanInput.parentElement;
    if (!idUsulanContainer || !idUsulanContainer.parentElement) return;

    // Bungkus container ID Usulan bersama toggle baru dalam satu row (grid 2 kolom).
    // items-start supaya label "Perbantuan" sejajar tingginya dengan label "ID Usulan".
    const rowWrapper = document.createElement('div');
    rowWrapper.className = 'grid grid-cols-2 gap-3 items-start';

    idUsulanContainer.parentElement.insertBefore(rowWrapper, idUsulanContainer);
    rowWrapper.appendChild(idUsulanContainer);

    const toggleContainer = document.createElement('div');
    toggleContainer.innerHTML = `
        <label class="block text-sm font-medium text-slate-600 mb-1">Perbantuan</label>
        <button type="button" id="perbantuanToggle" data-on="0" aria-pressed="false"
            class="relative w-11 h-6 rounded-full bg-slate-300" style="transition: background-color .2s ease;">
            <span id="perbantuanToggleKnob"
                class="absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full shadow"
                style="transition: transform .2s ease; transform: translateX(0);"></span>
        </button>
    `;
    rowWrapper.appendChild(toggleContainer);

    toggleContainer.querySelector('#perbantuanToggle').addEventListener('click', function () {
        setPerbantuanToggle(this.dataset.on !== '1');
    });
}

function setPerbantuanToggle(on) {
    const btn = document.getElementById('perbantuanToggle');
    const knob = document.getElementById('perbantuanToggleKnob');
    if (!btn || !knob) return;

    btn.dataset.on = on ? '1' : '0';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');

    if (on) {
        btn.classList.remove('bg-slate-300');
        btn.classList.add('bg-sky-600');
        knob.style.transform = 'translateX(20px)';
    } else {
        btn.classList.remove('bg-sky-600');
        btn.classList.add('bg-slate-300');
        knob.style.transform = 'translateX(0)';
    }
}

function resetPerbantuanToggle() {
    if (!document.getElementById('perbantuanToggle')) return;
    setPerbantuanToggle(false); // default off (0)
}

function openRekamModal(idx) {
    const data = window.rawPokData[idx];

    document.getElementById("rekamModal").classList.remove("hidden");
    document.getElementById("rekamModal").classList.add("flex");

    document.getElementById("idUsulan").value = generateIdUsulan();
    document.getElementById("mak").value = data.kode;
    document.getElementById("uraianMak").value = data.uraian;
    document.getElementById("pagu").value = Number(data.pagu).toLocaleString();
    document.getElementById("blokir").value = Number(data.blokir).toLocaleString();
    document.getElementById("realisasi").value = Number(data.realisasi).toLocaleString();
    document.getElementById("sisa").value = Number(data.sisa).toLocaleString();

    document.getElementById("estimasiBiaya").value = "";
    document.getElementById("statusDana").value = "Dana Tersedia";
    document.getElementById("statusDana").className = "w-full rounded-xl border border-slate-300 px-4 py-2.5 transition";

    ensurePerbantuanToggle();
    resetPerbantuanToggle();

    fetchLokasiData();
}

function closeRekamModal() {
    document.getElementById("rekamModal").classList.replace("flex", "hidden");

    document.getElementById("uraianKegiatan").value = "";
    document.getElementById("estimasiBiaya").value = "";
    document.getElementById("inputTujuan").value = "";
    resetPerbantuanToggle();

    const statusEl = document.getElementById("statusDana");
    statusEl.value = "Dana Tersedia";
    statusEl.className = "w-full rounded-xl border border-slate-300 px-4 py-2.5 transition";
}

async function fetchLokasiData() {
    const datalist = document.getElementById('listTujuan');
    if (datalist && datalist.children.length > 0) return;

    try {
        // Pakai cache dari loadPokData kalau sudah ada (dimuat sekali pas halaman
        // POK dibuka) — hindari baca ulang tabel kegiatan dari nol.
        await waitSupabaseAuthReady();
        let rows = window.kegiatanRowsCache;
        if (!rows) {
            const { data: kegiatanData, error } = await sb.from('kegiatan').select('*');
            if (error) throw new Error(error.message);
            rows = kegiatanData || [];
            window.kegiatanRowsCache = rows;
        }

        const set = new Set();
        rows.forEach(d => {
            const t = String(d.tujuan || '').trim();
            if (t) set.add(t);
        });
        const data = Array.from(set).sort();

        if (datalist) {
            datalist.innerHTML = data.map(item => `<option value="${item}">`).join('');
            console.log("Data lokasi berhasil dimuat:", data.length, "item");
        }
    } catch (e) {
        console.error("Gagal memuat data lokasi:", e);
        const errorMsg = e.name === 'AbortError' 
            ? 'Timeout saat load lokasi (>30 detik)'
            : e.message || 'Gagal memuat data lokasi';
        console.warn(`⚠️ ${errorMsg}`);
    }
}

function cekKecukupanDana() {
    const sisaStr = document.getElementById("sisa").value.replace(/,/g, '');
    const estimasiStr = document.getElementById("estimasiBiaya").value.replace(/\./g, '');

    const sisa = parseFloat(sisaStr) || 0;
    const estimasi = parseFloat(estimasiStr) || 0;
    const statusEl = document.getElementById("statusDana");

    if (estimasi > sisa) {
        statusEl.value = "Dana Tidak Cukup";
        statusEl.className = "w-full rounded-xl border border-red-300 bg-red-50 text-red-700 px-4 py-2.5 font-bold transition";
    } else if (estimasi === 0) {
        statusEl.value = "Dana Tersedia";
        statusEl.className = "w-full rounded-xl border border-slate-300 px-4 py-2.5 transition";
    } else {
        statusEl.value = "Dana Tersedia";
        statusEl.className = "w-full rounded-xl border border-green-300 bg-green-50 text-green-700 px-4 py-2.5 font-bold transition";
    }
}

async function simpanData() {
    const btn = document.getElementById("btnSimpan");
    const namaUser = localStorage.getItem('nama') || "Guest";
    const scrollPos = document.querySelector('.overflow-y-auto')?.scrollTop;

    const idKegiatan = document.getElementById("idUsulan").value;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...';

    try {
        // Tulis LANGSUNG ke Supabase (tabel 'kegiatan') — bukan lagi lewat GAS.
        // Struktur field mengikuti pola simpanKegiatan yg lama (kolom D/G-L kosong,
        // status selalu "Rekam Data" utk kegiatan baru).
        await waitSupabaseAuthReady();
        const { error } = await sb.from('kegiatan').insert({
            id: idKegiatan,
            mak: document.getElementById("mak").value,
            uraian: document.getElementById("uraianKegiatan").value,
            pelaksana: '',
            tujuan: document.getElementById("inputTujuan").value,
            tgl_st: normDate(document.getElementById("tglSt").value),
            tgl_mulai: null,
            tgl_selesai: null,
            tgl_lpt: null,
            tgl_bayar: null,
            jumlah: Number(document.getElementById("estimasiBiaya").value.replace(/\./g, '')) || 0,
            user: namaUser,
            status: 'Rekam Data',
            tgl_sp2d: null,
            nomor_spm: '',
            dokumen_link: '',
            spby_link: '',
            tgl_rekam: normDate(new Date().toISOString().split('T')[0]),
            perbantuan: document.getElementById("perbantuanToggle")?.dataset.on === '1'
        });
        if (error) throw new Error(error.message);

        closeRekamModal();
        showToast("Simpan kegiatan berhasil!");
        await loadPokData();
        setTimeout(() => {
            const scrollEl = document.querySelector('.overflow-y-auto');
            if (scrollEl) scrollEl.scrollTop = scrollPos;
        }, 100);
    } catch (e) {
        console.error(e);
        alert("Error koneksi ke server: " + (e.message || e));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-2"></i> Simpan';
    }
}

async function openDetilModal(mak) {
    document.getElementById("detilModal").classList.replace("hidden", "flex");
    document.getElementById("detilTitle").innerHTML = `<i class="fa-solid fa-list-check"></i> Detil MAK: ${mak}`;

    const tbody = document.getElementById("detil-tbody");
    tbody.innerHTML = `<div class="flex justify-center items-center p-4 w-full"><i class="fa-solid fa-spinner fa-spin mr-2 text-sky-600"></i><span class="text-slate-500">Memuat...</span></div>`;

    try {
        // Filter dari cache kalau sudah ada (dimuat pas loadPokData), kalau belum
        // baru query Supabase.
        await waitSupabaseAuthReady();
        let rows = window.kegiatanRowsCache;
        if (!rows) {
            const { data: kegiatanData, error } = await sb.from('kegiatan').select('*');
            if (error) throw new Error(error.message);
            rows = kegiatanData || [];
            window.kegiatanRowsCache = rows;
        }

        const result = rows
            .filter(d => String(d.mak || '').trim() === String(mak || '').trim())
            .map(d => ({
                idKegiatan: d.id,
                mak: d.mak || '',
                uraian: d.uraian || '',
                pelaksana_kegiatan: d.pelaksana || '',
                tujuan: d.tujuan || '',
                tglSt: d.tgl_st || '',
                estimasi: d.jumlah || 0,
                userLogin: d.user || '',
                status: d.status || '',
                nomorSPM: d.nomor_spm || '',
                perbantuan: d.perbantuan || false
            }));

        window.detilKegiatanData = result;
        renderDetilTable(result);
    } catch (e) {
        console.error("Fetch Error:", e);
        const errorMsg = e.name === 'AbortError' 
            ? 'Timeout: Server tidak merespons (>30 detik)'
            : e.message || 'Gagal koneksi ke server';
        tbody.innerHTML = `<div class="p-4 text-center text-red-500">❌ ${errorMsg}</div>`;
    }
}

function renderDetilTable(data) {
    const tbody = document.getElementById("detil-tbody");

    if (!Array.isArray(data) || data.length === 0) {
        tbody.innerHTML = `<div class="flex justify-center items-center p-4 w-full"><span class="text-red-500">Tidak ada data.</span></div>`;
        return;
    }

    tbody.innerHTML = data.map(i => {
        const sClass = i.status === 'Rekam Data' ? 'bg-pink-100 text-pink-700' :
            i.status === 'Terlaksana' ? 'bg-slate-200 text-slate-700' :
            i.status === 'LPT' ? 'bg-yellow-100 text-yellow-700' :
            i.status === 'Terbayar' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';

        return `
            <div class="flex p-3 border-b items-center hover:bg-slate-50 text-xs">
                <div class="w-[30%] pr-2 whitespace-normal break-words">${i.uraian || '-'}</div>
                <div class="w-[12%] truncate pr-2 whitespace-normal break-words">${i.pelaksana_kegiatan || 'Belum Ada'}</div>
                <div class="w-[18%] truncate pr-2">${i.tujuan || '-'}</div>
                <div class="w-[10%]">${i.tglSt ? new Date(i.tglSt).toISOString().split('T')[0] : '-'}</div>
                <div class="w-[12%] text-right pr-2">${Number(i.estimasi || 0).toLocaleString()}</div>
                <div class="w-[10%] flex justify-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${sClass}">${i.status || '-'}</span>
                </div>
                <div class="w-[8%] flex justify-center gap-2">
                    <button onclick="showDetilKegiatanInfo('${i.idKegiatan}')" class="text-slate-600 hover:text-slate-800" title="Detil">
                        <i class="fa-solid fa-circle-info"></i>
                    </button>
                    ${i.status === 'Rekam Data' ? `
                        <button onclick="openPelaksanaModal('${i.idKegiatan}')" class="text-sky-600 hover:text-sky-800 font-bold" title="Update Pelaksana">
                            <i class="fa-solid fa-users"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function pokOpenOverlay(innerHtml, widthClass) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4';

    const popup = document.createElement('div');
    popup.className = `bg-white rounded-2xl shadow-xl w-full ${widthClass || 'max-w-md'} p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto`;
    popup.innerHTML = innerHtml;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    return { overlay, popup };
}

function showDetilKegiatanInfo(idKegiatan) {
    const data = window.detilKegiatanData.find(d => d.idKegiatan === idKegiatan);
    if (!data) {
        alert('Data detil tidak ditemukan.');
        return;
    }

    const formatDate = (v) => {
        if (!v) return '-';
        const d = new Date(v);
        if (isNaN(d.getTime())) return String(v);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const baris = (label, value) => `
        <div class="flex justify-between items-start gap-4 py-2 border-b border-slate-100 text-sm">
            <span class="text-slate-500 whitespace-nowrap">${label}</span>
            <span class="font-medium text-slate-800 text-right break-words">${(value === undefined || value === null || value === '') ? '-' : value}</span>
        </div>`;

    const { overlay, popup } = pokOpenOverlay(`
        <h3 class="text-center text-sky-700 font-semibold text-base mb-1">Detil Kegiatan #${data.idKegiatan ?? ''}</h3>
        <div class="flex flex-col">
            ${baris('ID Kegiatan', data.idKegiatan)}
            ${baris('MAK', data.mak)}
            ${baris('Uraian / No ST', data.uraian)}
            ${baris('Pelaksana Tugas', data.pelaksana_kegiatan)}
            ${baris('Tujuan', data.tujuan)}
            ${baris('Tgl ST', formatDate(data.tglSt))}
            ${baris('Jumlah', 'Rp ' + Number(data.estimasi || 0).toLocaleString('id-ID'))}
            ${baris('User', data.userLogin)}
            ${baris('Status', data.status)}
            ${baris('Nomor SPM', data.nomorSPM)}
        </div>
        <div class="flex justify-end mt-2">
            <button id="pok-detilInfoClose" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Tutup</button>
        </div>
    `, 'max-w-md');

    popup.querySelector('#pok-detilInfoClose').onclick = () => overlay.remove();
}

function filterDetil() {
    const keyword = document.getElementById("cariDetil").value.toLowerCase();
    renderDetilTable(window.detilKegiatanData.filter(i => (i.uraian || '').toLowerCase().includes(keyword)));
}

// ========================================
// PELAKSANA KEGIATAN MODAL FUNCTIONS
// ========================================

window.pelaksanaTableData = []; // Store tabel pelaksana
window.pelaksanaCurrentData = {}; // Store data kegiatan yang dibuka

// Menyisipkan indikator toggle "Perbantuan" (disabled/read-only) di samping
// field Tgl ST/ND pada popup Pelaksana Kegiatan. Nilainya mengikuti kolom S
// sheet Data_Kegiatan_2026 (1=on, 0=off) dan TIDAK bisa diklik/diubah user —
// hanya menampilkan status apa adanya, lalu dikirim balik utuh saat Simpan.
function ensurePelaksanaPerbantuanIndicator() {
    if (document.getElementById('pelaksanaPerbantuanToggle')) return;

    const tglStInput = document.getElementById('pelaksanaTglSt');
    if (!tglStInput) return;

    const tglStContainer = tglStInput.closest('div') || tglStInput.parentElement;
    if (!tglStContainer || !tglStContainer.parentElement) return;

    const rowWrapper = document.createElement('div');
    rowWrapper.className = 'grid grid-cols-2 gap-3 items-start';

    tglStContainer.parentElement.insertBefore(rowWrapper, tglStContainer);
    rowWrapper.appendChild(tglStContainer);

    const toggleContainer = document.createElement('div');
    toggleContainer.innerHTML = `
        <label class="block text-sm font-medium text-slate-600 mb-1">Perbantuan</label>
        <button type="button" id="pelaksanaPerbantuanToggle" data-on="0" disabled aria-pressed="false"
            class="relative w-11 h-6 rounded-full bg-slate-300 opacity-60 cursor-not-allowed" style="transition: background-color .2s ease;">
            <span id="pelaksanaPerbantuanToggleKnob"
                class="absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full shadow"
                style="transition: transform .2s ease; transform: translateX(0);"></span>
        </button>
    `;
    rowWrapper.appendChild(toggleContainer);
}

function setPelaksanaPerbantuanIndicator(on) {
    const btn = document.getElementById('pelaksanaPerbantuanToggle');
    const knob = document.getElementById('pelaksanaPerbantuanToggleKnob');
    if (!btn || !knob) return;

    btn.dataset.on = on ? '1' : '0';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');

    if (on) {
        btn.classList.remove('bg-slate-300');
        btn.classList.add('bg-sky-600');
        knob.style.transform = 'translateX(20px)';
    } else {
        btn.classList.remove('bg-sky-600');
        btn.classList.add('bg-slate-300');
        knob.style.transform = 'translateX(0)';
    }
}

async function openPelaksanaModal(idKegiatan) {
    // Cari data di detilKegiatanData berdasarkan idKegiatan
    const data = window.detilKegiatanData.find(d => d.idKegiatan === idKegiatan);
    if (!data) {
        alert("Data kegiatan tidak ditemukan");
        return;
    }

    // Simpan data saat ini
    window.pelaksanaCurrentData = data;
    window.pelaksanaTableData = []; // Reset tabel

    // Tampilkan modal
    document.getElementById("pelaksanaModal").classList.replace("hidden", "flex");

    // Populate form fields (readonly)
    document.getElementById("pelaksanaKodeKegiatan").innerText = data.idKegiatan;
    document.getElementById("pelaksanaMak").value = data.mak || '';
    document.getElementById("pelaksanaUraian").value = data.uraian || '';
    document.getElementById("pelaksanaTujuan").value = data.tujuan || '';
    document.getElementById("pelaksanaUser").value = data.userLogin || localStorage.getItem('nama') || '';
    document.getElementById("pelaksanaTglSt").value = data.tglSt ? new Date(data.tglSt).toISOString().split('T')[0] : '';

    ensurePelaksanaPerbantuanIndicator();
    setPelaksanaPerbantuanIndicator(String(data.perbantuan) === '1');

    // Clear input & render tabel
    document.getElementById("inputPelaksana").value = '';
    renderPelaksanaTable();

    // Load ref pegawai untuk datalist
    await loadRefPegawai();
}

function closePelaksanaModal() {
    document.getElementById("pelaksanaModal").classList.replace("flex", "hidden");
    window.pelaksanaTableData = [];
    window.pelaksanaCurrentData = {};
}

async function loadRefPegawai() {
    try {
        const datalist = document.getElementById('listPelaksana');
        if (!datalist) return;

        // Sama seperti fetchLokasiData: pakai cache kalau sudah ada.
        await waitSupabaseAuthReady();
        let rows = window.kegiatanRowsCache;
        if (!rows) {
            const { data: kegiatanData, error } = await sb.from('kegiatan').select('*');
            if (error) throw new Error(error.message);
            rows = kegiatanData || [];
            window.kegiatanRowsCache = rows;
        }

        const set = new Set();
        rows.forEach(d => {
            const p = String(d.pelaksana || '').trim();
            if (p) set.add(p);
        });
        const data = Array.from(set).sort();

        datalist.innerHTML = data.map(item => `<option value="${item}">`).join('');
        console.log("Ref pegawai dimuat:", data.length, "orang");
    } catch (e) {
        console.error("Gagal load ref pegawai:", e);
    }
}

function submitPelaksana() {
    const input = document.getElementById("inputPelaksana");
    const nama = input.value.trim();

    if (!nama) {
        alert("Nama pelaksana harus diisi");
        return;
    }

    // Tambah ke tabel data
    window.pelaksanaTableData.push({
        nama: nama,
        tglMulai: '',
        tglSelesai: '',
        jumlah: ''
    });

    // Clear input & render
    input.value = '';
    renderPelaksanaTable();
}

function renderPelaksanaTable() {
    const tbody = document.getElementById("pelaksanaTableBody");

    if (window.pelaksanaTableData.length === 0) {
        tbody.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">Belum ada data pelaksana</div>`;
        return;
    }

    tbody.innerHTML = window.pelaksanaTableData.map((row, idx) => `
        <div class="flex p-3 border-b items-center hover:bg-slate-50 text-xs">
            <div class="w-[30%] font-medium">${row.nama}</div>
            <div class="w-[20%]">
                <input type="date" value="${row.tglMulai}" 
                       onchange="updatePelaksanaField(${idx}, 'tglMulai', this.value)"
                       class="w-full border border-slate-300 rounded px-2 py-1 text-xs">
            </div>
            <div class="w-[20%]">
                <input type="date" value="${row.tglSelesai}" 
                       onchange="updatePelaksanaField(${idx}, 'tglSelesai', this.value)"
                       class="w-full border border-slate-300 rounded px-2 py-1 text-xs">
            </div>
            <div class="w-[15%]">
                <input type="number" value="${row.jumlah}" placeholder="0"
                       onchange="updatePelaksanaField(${idx}, 'jumlah', this.value)"
                       class="w-full border border-slate-300 rounded px-2 py-1 text-xs">
            </div>
            <div class="w-[15%] text-center">
                <button onclick="deletePelaksanaRow(${idx})" class="text-red-600 hover:text-red-800">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function updatePelaksanaField(idx, field, value) {
    if (window.pelaksanaTableData[idx]) {
        window.pelaksanaTableData[idx][field] = value;
    }
}

function deletePelaksanaRow(idx) {
    window.pelaksanaTableData.splice(idx, 1);
    renderPelaksanaTable();
}

async function simpanPelaksana() {
    if (window.pelaksanaTableData.length === 0) {
        alert("Tambahkan minimal 1 pelaksana");
        return;
    }

    const btn = document.getElementById("btnSimpanPelaksana");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...';

    try {
        // Simpan scroll position POK
        const appContainer = document.getElementById('app');
        const scrollPos = appContainer ? appContainer.scrollTop : 0;

        const idLama = window.pelaksanaCurrentData.idKegiatan;
        const mak = window.pelaksanaCurrentData.mak;
        const uraian = window.pelaksanaCurrentData.uraian;
        const tujuan = window.pelaksanaCurrentData.tujuan;
        const tglSt = window.pelaksanaCurrentData.tglSt;
        const namaUser = localStorage.getItem('nama') || "Guest";
        const todayStr = new Date().toISOString().split('T')[0];
        const isPerbantuan = document.getElementById('pelaksanaPerbantuanToggle')?.dataset.on === '1';

        // Tulis LANGSUNG ke Supabase: hapus baris kegiatan lama, buat 1 baris
        // baru per pelaksana (sama persis pola yg dipakai kegiatan.js).
        // kgGenerateRandomId & kgComputeStatus masih dari firebase-config.js
        // (helper generik, tidak spesifik-Firebase, tetap dipakai bersama).
        await waitSupabaseAuthReady();

        const { error: delError } = await sb.from('kegiatan').delete().eq('id', idLama);
        if (delError) throw new Error(delError.message);

        const rowsBaru = window.pelaksanaTableData.map(p => {
            const status = kgComputeStatus(p.tglMulai, '', '', '');
            return {
                id: kgGenerateRandomId(10),
                mak, uraian, pelaksana: p.nama, tujuan,
                tgl_st: normDate(tglSt), tgl_mulai: normDate(p.tglMulai), tgl_selesai: normDate(p.tglSelesai),
                tgl_lpt: null, tgl_bayar: null, jumlah: Number(p.jumlah) || 0,
                user: namaUser, status, tgl_sp2d: null, nomor_spm: '',
                dokumen_link: '', spby_link: '', tgl_rekam: normDate(todayStr),
                perbantuan: isPerbantuan
            };
        });

        const { error: insError } = await sb.from('kegiatan').insert(rowsBaru);
        if (insError) throw new Error(insError.message);

        // Close modals (silent, no toast)
        closePelaksanaModal();
        document.getElementById("detilModal").classList.replace("flex", "hidden");

        // Refresh POK data & restore scroll position
        await loadPokData();

        // Restore scroll position
        setTimeout(() => {
            if (appContainer) {
                appContainer.scrollTop = scrollPos;
            }
        }, 50);
    } catch (e) {
        console.error("Save Error:", e);
        alert("Error koneksi: " + (e.message || "Tidak diketahui"));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-2"></i> Simpan';
    }
}

// ==========================================================================
// EXPORT PDF & EXCEL PER SEKSI
// ==========================================================================

function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.dataset.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Gagal memuat library: ' + src));
        document.head.appendChild(script);
    });
}

async function ensureExcelLib() {
    if (window.XLSX) return;
    await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
}

async function ensurePdfLibs() {
    if (!(window.jspdf && window.jspdf.jsPDF)) {
        await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    // autoTable perlu jsPDF sudah tersedia lebih dulu
    const hasAutoTable = window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable;
    if (!hasAutoTable) {
        await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    }
}

// Ambil data unik (sudah dedup kode+bidang) untuk 1 seksi tertentu
function getSeksiExportData(seksi) {
    const uniqueMap = new Map();
    (window.rawPokData || []).forEach(item => {
        uniqueMap.set(String(item.kode) + '|' + (item.bidang || ''), item);
    });
    const uniqueData = Array.from(uniqueMap.values());
    return uniqueData
        .filter(item => (item.bidang || 'Lainnya') === seksi)
        .sort((a, b) => String(a.kode).localeCompare(String(b.kode)));
}

function toggleDownloadBtnLoading(btnEl, loading, originalHtml) {
    if (!btnEl) return;
    if (loading) {
        btnEl.dataset.originalHtml = originalHtml;
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    } else {
        btnEl.disabled = false;
        btnEl.innerHTML = btnEl.dataset.originalHtml || originalHtml;
    }
}

async function downloadSeksiExcel(seksi) {
    const btn = event ? event.currentTarget : null;
    const originalHtml = '<i class="fa-solid fa-file-excel"></i> Excel';
    try {
        toggleDownloadBtnLoading(btn, true, originalHtml);
        await ensureExcelLib();

        const items = getSeksiExportData(seksi);
        if (items.length === 0) {
            alert('Tidak ada data untuk seksi ' + seksi);
            return;
        }

        const rows = items.map(i => ({
            'Kode': i.kode,
            'Uraian': i.uraian,
            'Pagu': Number(i.pagu || 0),
            'Blokir': Number(i.blokir || 0),
            'Realisasi': Number(i.realisasi || 0),
            'Sisa': Number(i.sisa || 0),
            'Sumber Dana': i.sumber || '-'
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            { wch: 32 }, { wch: 55 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 12 }
        ];

        const wb = XLSX.utils.book_new();
        const sheetName = String(seksi).replace(/[\\/?*[\]:]/g, '').substring(0, 31) || 'POK';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const tanggal = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `POK_${seksi}_${tanggal}.xlsx`);
    } catch (e) {
        console.error('Gagal export Excel:', e);
        alert('Gagal membuat file Excel: ' + (e.message || 'Terjadi kesalahan'));
    } finally {
        toggleDownloadBtnLoading(btn, false, originalHtml);
    }
}

async function downloadSeksiPDF(seksi) {
    const btn = event ? event.currentTarget : null;
    const originalHtml = '<i class="fa-solid fa-file-pdf"></i> PDF';
    try {
        toggleDownloadBtnLoading(btn, true, originalHtml);
        await ensurePdfLibs();

        const items = getSeksiExportData(seksi);
        if (items.length === 0) {
            alert('Tidak ada data untuk seksi ' + seksi);
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

        doc.setFontSize(13);
        doc.text(`POK - Seksi ${seksi}`, 40, 32);
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID')}`, 40, 46);
        doc.setTextColor(0);

        const body = items.map(i => {
            const pagu = Number(i.pagu || 0);
            const blokir = Number(i.blokir || 0);
            const realisasi = Number(i.realisasi || 0);
            const sisa = Number(i.sisa || 0);
            return [
                String(i.kode),
                String(i.uraian || ''),
                pagu.toLocaleString('id-ID'),
                blokir.toLocaleString('id-ID'),
                realisasi.toLocaleString('id-ID'),
                sisa.toLocaleString('id-ID'),
                i.sumber || '-'
            ];
        });

        doc.autoTable({
            startY: 58,
            head: [['Kode', 'Uraian', 'Pagu', 'Blokir', 'Realisasi', 'Sisa', 'SD']],
            body,
            styles: {
                fontSize: 7,
                cellPadding: 3,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [2, 132, 199],
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: 130, overflow: 'visible' },
                1: { cellWidth: 230 },
                2: { cellWidth: 80, halign: 'right' },
                3: { cellWidth: 70, halign: 'right' },
                4: { cellWidth: 80, halign: 'right' },
                5: { cellWidth: 70, halign: 'right' },
                6: { cellWidth: 40, halign: 'center' }
            },
            margin: { left: 40, right: 40 },
            didParseCell: (data) => {
                if (data.section !== 'body') return;
                const rowItem = items[data.row.index];
                if (rowItem && String(rowItem.kode).length > 27) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = [37, 99, 235];
                }
            }
        });

        const tanggal = new Date().toISOString().split('T')[0];
        doc.save(`POK_${seksi}_${tanggal}.pdf`);
    } catch (e) {
        console.error('Gagal export PDF:', e);
        alert('Gagal membuat file PDF: ' + (e.message || 'Terjadi kesalahan'));
    } finally {
        toggleDownloadBtnLoading(btn, false, originalHtml);
    }
}

window.initPokPage = initPokPage;
window.toggleSeksiGroup = toggleSeksiGroup;
window.loadPokData = loadPokData;
window.renderPok = renderPok;
window.searchPok = searchPok;
window.gotoSearchResult = gotoSearchResult;
window.toggleExpand = toggleExpand;
window.toggleExpandAll = toggleExpandAll;
window.openRekamModal = openRekamModal;
window.closeRekamModal = closeRekamModal;
window.cekKecukupanDana = cekKecukupanDana;
window.simpanData = simpanData;
window.openDetilModal = openDetilModal;
window.showDetilKegiatanInfo = showDetilKegiatanInfo;
window.filterDetil = filterDetil;
window.openPelaksanaModal = openPelaksanaModal;
window.closePelaksanaModal = closePelaksanaModal;
window.loadRefPegawai = loadRefPegawai;
window.submitPelaksana = submitPelaksana;
window.updatePelaksanaField = updatePelaksanaField;
window.deletePelaksanaRow = deletePelaksanaRow;
window.simpanPelaksana = simpanPelaksana;
window.downloadSeksiExcel = downloadSeksiExcel;
window.downloadSeksiPDF = downloadSeksiPDF;
window.fetchRefCoaData = fetchRefCoaData;
window.copyKodeAkun = copyKodeAkun;
