/**
 * Halaman POK
 */

window.rawPokData = [];
window.expandedCodes = new Set();
window.searchResults = [];
window.searchIndex = -1;
window.selectedKode = "";
window.detilKegiatanData = [];

async function initPokPage() {
    window.expandedCodes = new Set();
    window.searchResults = [];
    window.selectedKode = "";
    await loadPokData();
}

async function loadPokData() {
    try {
        const data = await apiPost({ action: 'getPOKData' });
        window.rawPokData = data;
        renderPok();
    } catch (e) {
        console.error(e);
        const tbody = document.getElementById('pok-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-red-500 p-4 text-center">Gagal memuat data.</td></tr>`;
    }
}

function renderPok() {
    const tbody = document.getElementById('pok-tbody');
    if (!tbody || !window.rawPokData || window.rawPokData.length === 0) return;

    const uniqueMap = new Map();
    window.rawPokData.forEach(item => {
        uniqueMap.set(String(item.kode), item);
    });
    const uniqueData = Array.from(uniqueMap.values());

    const keyword = (document.getElementById("searchPok")?.value || "").toLowerCase().trim();
    const bidang = document.getElementById("filterBidang")?.value || "Semua";

    tbody.innerHTML = uniqueData.map(i => {
        const c = String(i.kode);
        const uraian = String(i.uraian || "").toLowerCase();

        if (bidang !== "Semua" && (i.bidang || "") !== bidang) return '';

        const isParent = c.length === 12;
        const isChildVisible = Array.from(window.expandedCodes).some(p => c.startsWith(p) && c !== p);

        if (!isParent && !isChildVisible) return '';

        const isMatch = keyword && (c.toLowerCase().includes(keyword) || uraian.includes(keyword));
        const matchClass = isMatch ? 'bg-yellow-200' : (c.length > 27 ? (i.sumber === 'PNBP' ? 'bg-pink-50' : 'bg-blue-50') : 'bg-white');

        const hasChildren = uniqueData.some(ch => String(ch.kode).startsWith(c) && String(ch.kode) !== c);

        return `<tr data-kode="${c}" class="border-b hover:bg-slate-100 ${matchClass} cursor-pointer" onclick="toggleExpand('${c}')">
            <td class="p-3 font-mono text-xs font-bold">${c}</td>
            <td class="p-3 font-medium">${i.uraian} ${hasChildren ? (window.expandedCodes.has(c) ? ' <i class="fa-solid fa-chevron-down text-[10px]"></i>' : ' <i class="fa-solid fa-chevron-right text-[10px]"></i>') : ''}</td>
            <td class="p-3 text-right">${Number(i.pagu || 0).toLocaleString()}</td>
            <td class="p-3 text-right">${Number(i.blokir || 0).toLocaleString()}</td>
            <td class="p-3 text-right">${Number(i.realisasi || 0).toLocaleString()}</td>
            <td class="p-3 text-right">${Number(i.sisa || 0).toLocaleString()}</td>
            <td class="p-3 text-center">
                ${c.length > 27 ? `
                    <button onclick="event.stopPropagation();openRekamModal(${window.rawPokData.indexOf(i)})"
                        class="bg-sky-600 text-white px-2 py-1 rounded text-[10px] hover:bg-sky-700 mr-1">Rekam</button>
                    <button onclick="event.stopPropagation();openDetilModal('${c}')" class="bg-slate-600 text-white px-2 py-1 rounded text-[10px] hover:bg-slate-700">Detil</button>
                ` : ''}
            </td>
        </tr>`;
    }).join('');
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

        const parentCode = String(window.selectedKode).substring(0, 12);
        window.expandedCodes.add(parentCode);

        renderPok();

        setTimeout(() => {
            const el = document.querySelector(`tr[data-kode="${window.selectedKode}"]`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    }
}

function gotoSearchResult() {
    const item = window.searchResults[window.searchIndex];
    if (!item) return;

    const kode = String(item.kode);
    window.selectedKode = kode;

    if (kode.length > 12) {
        window.expandedCodes.clear();
        window.expandedCodes.add(kode.substring(0, 12));
    }

    renderPok();

    setTimeout(() => {
        document.querySelector(`[data-kode="${kode}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
}

function toggleExpand(code) {
    if (String(code).length !== 12) return;

    if (window.expandedCodes.has(code)) {
        window.expandedCodes.clear();
    } else {
        window.expandedCodes.clear();
        window.expandedCodes.add(code);
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
        }
    } catch (e) {
        console.error("Gagal memuat data lokasi:", e);
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
    document.getElementById("detilTitle").innerText = "Detil MAK: " + mak;

    const tbody = document.getElementById("detil-tbody");
    tbody.innerHTML = `<div class="flex justify-center items-center p-4 w-full"><span class="text-gray-500">Memuat...</span></div>`;

    try {
        const result = await apiGet('getDetil', { mak });

        if (Array.isArray(result)) {
            window.detilKegiatanData = result;
            renderDetilTable(result);
        } else {
            console.error("Respon Error:", result);
            tbody.innerHTML = `<div class="p-4 text-center text-red-500">Error: ${result.message || 'Data tidak ditemukan'}</div>`;
        }
    } catch (e) {
        console.error("Fetch Error:", e);
        tbody.innerHTML = `<div class="p-4 text-center text-red-500">Gagal koneksi. Cek Console F12.</div>`;
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
                    ${(i.status === 'Rekam Data' || i.status === 'Terlaksana') ?
                        `<button onclick="openPelaksanaModal('${i.idKegiatan}')" class="text-sky-600"><i class="fa-solid fa-user-check"></i></button>` : ''}
                    ${i.status === 'Rekam Data' ?
                        `<button onclick="hapusKegiatan('${i.idKegiatan}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function filterDetil() {
    const keyword = document.getElementById("cariDetil").value.toLowerCase();
    renderDetilTable(window.detilKegiatanData.filter(i => (i.uraian || '').toLowerCase().includes(keyword)));
}

window.initPokPage = initPokPage;
window.loadPokData = loadPokData;
window.renderPok = renderPok;
window.searchPok = searchPok;
window.gotoSearchResult = gotoSearchResult;
window.toggleExpand = toggleExpand;
window.openRekamModal = openRekamModal;
window.closeRekamModal = closeRekamModal;
window.cekKecukupanDana = cekKecukupanDana;
window.simpanData = simpanData;
window.openDetilModal = openDetilModal;
window.filterDetil = filterDetil;
