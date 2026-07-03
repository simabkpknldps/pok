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
    const tbody = document.getElementById('pok-tbody');
    try {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>`;
        
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
        tbody.innerHTML = `<tr><td colspan="7" class="text-red-500 p-4 text-center">❌ ${errorMsg}</td></tr>`;
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

function toggleExpandAll() {
    const btn = document.getElementById("toggleExpandBtn");
    
    if (window.expandedCodes.size === 0) {
        // Expand all - tambah semua parent codes (12 digit)
        const uniqueMap = new Map();
        window.rawPokData.forEach(item => {
            uniqueMap.set(String(item.kode), item);
        });
        const uniqueData = Array.from(uniqueMap.values());
        
        uniqueData.forEach(item => {
            const code = String(item.kode);
            if (code.length === 12) {
                window.expandedCodes.add(code);
            }
        });
        
        btn.innerHTML = '<i class="fa-solid fa-compress"></i> Collapse All';
    } else {
        // Collapse all
        window.expandedCodes.clear();
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

window.initPokPage = initPokPage;
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
window.filterDetil = filterDetil;
window.openPelaksanaModal = openPelaksanaModal;
window.closePelaksanaModal = closePelaksanaModal;
window.loadRefPegawai = loadRefPegawai;
window.submitPelaksana = submitPelaksana;
window.updatePelaksanaField = updatePelaksanaField;
window.deletePelaksanaRow = deletePelaksanaRow;
window.simpanPelaksana = simpanPelaksana;
