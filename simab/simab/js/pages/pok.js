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

async function loadPokData() {
    const tbody = document.getElementById('pok-tbody');
    try {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;
        
        const data = await apiPost({ action: 'getPOKData' });
        
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
                        class="bg-sky-600 text-white px-2 py-1 rounded text-[10px] hover:bg-sky-700 mr-1">Rekam</button>
                    <button onclick="event.stopPropagation();openDetilModal('${c}')" class="bg-slate-600 text-white px-2 py-1 rounded text-[10px] hover:bg-slate-700">Detil</button>
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

    fetchLokasiData();
}

function closeRekamModal() {
    document.getElementById("rekamModal").classList.replace("flex", "hidden");

    document.getElementById("uraianKegiatan").value = "";
    document.getElementById("estimasiBiaya").value = "";
    document.getElementById("inputTujuan").value = "";

    const statusEl = document.getElementById("statusDana");
    statusEl.value = "Dana Tersedia";
    statusEl.className = "w-full rounded-xl border border-slate-300 px-4 py-2.5 transition";
}

async function fetchLokasiData() {
    const datalist = document.getElementById('listTujuan');
    if (datalist && datalist.children.length > 0) return;

    try {
        const data = await apiGet('loadLokasi');
        if (data.error) {
            console.error("Error dari API:", data.error);
            return;
        }
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
    const namaUser = sessionStorage.getItem('nama') || "Guest";
    const scrollPos = document.querySelector('.overflow-y-auto')?.scrollTop;

    const payload = {
        action: 'simpanKegiatan',
        idKegiatan: document.getElementById("idUsulan").value,
        mak: document.getElementById("mak").value,
        uraian: document.getElementById("uraianKegiatan").value,
        tujuan: document.getElementById("inputTujuan").value,
        tglSt: document.getElementById("tglSt").value,
        estimasi: document.getElementById("estimasiBiaya").value.replace(/\./g, ''),
        userLogin: namaUser,
        tglRekam: new Date().toISOString().split('T')[0]
    };

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...';

    try {
        const result = await apiPost(payload);

        if (result.status === "success") {
            closeRekamModal();
            showToast("Simpan kegiatan berhasil!");
            await loadPokData();
            setTimeout(() => {
                const scrollEl = document.querySelector('.overflow-y-auto');
                if (scrollEl) scrollEl.scrollTop = scrollPos;
            }, 100);
        } else {
            alert("Gagal: " + result.message);
        }
    } catch (e) {
        console.error(e);
        alert("Error koneksi ke server.");
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
        const result = await apiGet('getDetil', { mak });

        if (Array.isArray(result)) {
            window.detilKegiatanData = result;
            renderDetilTable(result);
        } else {
            console.error("Respon Error:", result);
            tbody.innerHTML = `<div class="p-4 text-center text-red-500">❌ ${result.message || 'Data tidak ditemukan'}</div>`;
        }
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
    document.getElementById("pelaksanaUser").value = data.userLogin || sessionStorage.getItem('nama') || '';
    document.getElementById("pelaksanaTglSt").value = data.tglSt ? new Date(data.tglSt).toISOString().split('T')[0] : '';

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

        const data = await apiGet('loadRefPegawai');

        if (Array.isArray(data)) {
            datalist.innerHTML = data.map(item => `<option value="${item}">`).join('');
            console.log("Ref pegawai dimuat:", data.length, "orang");
        } else if (data.error) {
            console.error("API Error:", data.error);
        }
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

        const payload = {
            action: 'updatePelaksanaKegiatan',
            idKegiatanLama: window.pelaksanaCurrentData.idKegiatan,
            mak: window.pelaksanaCurrentData.mak,
            uraian: window.pelaksanaCurrentData.uraian,
            tujuan: window.pelaksanaCurrentData.tujuan,
            tglSt: window.pelaksanaCurrentData.tglSt,
            userLogin: sessionStorage.getItem('nama') || "Guest",
            pelaksanaData: window.pelaksanaTableData
        };

        const result = await apiPost(payload);

        if (result.status === "success") {
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
        } else {
            alert("Gagal: " + result.message);
        }
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
            styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
            headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: 'bold' },
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
