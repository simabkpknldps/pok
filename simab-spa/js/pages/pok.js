// ============================================================
// pages/pok.js — Halaman POK (termasu modal Rekam Kegiatan & Detil)
//
// CATATAN REKONSTRUKSI:
// Di file aslinya, cabang navigate('pok') kosong (belum ada markup),
// padahal fungsi-fungsi di bawah ini sudah lengkap dan mengacu ke
// elemen seperti #pok-tbody, #searchPok, #filterBidang. Markup tabel
// & search bar di bawah aku bangun ulang berdasarkan kolom yang
// dipakai renderPok(): kode, uraian, pagu, blokir, realisasi, sisa, aksi.
// Sesuaikan lagi kalau tampilan aslinya beda.
// ============================================================

import { showToast, formatRibuan, generateIdUsulan } from '../app.js';

// --- State khusus halaman POK ---
let rawPokData = [];
let expandedCodes = new Set();
let searchResults = [];
let searchIndex = -1;
let selectedKode = "";
let detilKegiatanData = [];

export async function render(container) {
    container.innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div class="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div class="flex-1 flex gap-2">
                    <input id="searchPok" type="text" placeholder="Cari kode / uraian..."
                        oninput="searchPok()"
                        class="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition">
                    <select id="filterBidang" onchange="renderPok()"
                        class="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition">
                        <option value="Semua">Semua Bidang</option>
                    </select>
                </div>
                <button onclick="loadPokData()" class="text-sky-600 hover:text-sky-800 text-sm font-medium">
                    <i class="fa-solid fa-rotate mr-1"></i> Muat Ulang
                </button>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead id="pok-thead">
                        <tr class="bg-slate-100 text-left text-xs font-bold text-slate-600 uppercase">
                            <th class="p-3">Kode</th>
                            <th class="p-3">Uraian</th>
                            <th class="p-3 text-right">Pagu</th>
                            <th class="p-3 text-right">Blokir</th>
                            <th class="p-3 text-right">Realisasi</th>
                            <th class="p-3 text-right">Sisa</th>
                            <th class="p-3 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="pok-tbody"></tbody>
                </table>
            </div>
        </div>
    `;

    ensureModalsExist();
    await loadPokData();
}

// --- Suntik modal (rekam & detil) sekali saja ke body, dipakai ulang tiap kembali ke halaman POK ---
function ensureModalsExist() {
    if (!document.getElementById('rekamModal')) {
        document.body.insertAdjacentHTML('beforeend', rekamModalTemplate());
    }
    if (!document.getElementById('detilModal')) {
        document.body.insertAdjacentHTML('beforeend', detilModalTemplate());
    }
}

// --- LOGIKA POK ---
async function loadPokData() {
    try {
        const res = await fetch(sessionStorage.getItem('realUrl'), { method: 'POST', body: JSON.stringify({ action: 'getPOKData' }) });
        rawPokData = await res.json();
        populateBidangFilter();
        renderPok();
    } catch (e) {
        console.error("Gagal memuat data POK:", e);
        const tbody = document.getElementById('pok-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-red-500 p-4 text-center">Gagal memuat data.</td></tr>`;
    }
}

function populateBidangFilter() {
    const select = document.getElementById('filterBidang');
    if (!select) return;
    const current = select.value || 'Semua';
    const bidangSet = new Set(rawPokData.map(i => i.bidang).filter(Boolean));
    select.innerHTML = `<option value="Semua">Semua Bidang</option>` +
        Array.from(bidangSet).map(b => `<option value="${b}">${b}</option>`).join('');
    select.value = bidangSet.has(current) ? current : 'Semua';
}

function renderPok() {
    const tbody = document.getElementById('pok-tbody');
    if (!tbody) return;
    if (!rawPokData || rawPokData.length === 0) return;

    const uniqueMap = new Map();
    rawPokData.forEach(item => {
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
        const isChildVisible = Array.from(expandedCodes).some(p => c.startsWith(p) && c !== p);

        if (!isParent && !isChildVisible) return '';

        const isMatch = keyword && (c.toLowerCase().includes(keyword) || uraian.includes(keyword));
        const matchClass = isMatch ? 'bg-yellow-200' : (c.length > 27 ? (i.sumber === 'PNBP' ? 'bg-pink-50' : 'bg-blue-50') : 'bg-white');

        const hasChildren = uniqueData.some(ch => String(ch.kode).startsWith(c) && String(ch.kode) !== c);

        return `<tr data-kode="${c}" class="border-b hover:bg-slate-100 ${matchClass} cursor-pointer" onclick="toggleExpand('${c}')">
            <td class="p-3 font-mono text-xs font-bold">${c}</td>
            <td class="p-3 font-medium">${i.uraian} ${hasChildren ? (expandedCodes.has(c) ? ' <i class="fa-solid fa-chevron-down text-[10px]"></i>' : ' <i class="fa-solid fa-chevron-right text-[10px]"></i>') : ''}</td>
            <td class="p-3 text-right">${Number(i.pagu || 0).toLocaleString()}</td>
            <td class="p-3 text-right">${Number(i.blokir || 0).toLocaleString()}</td>
            <td class="p-3 text-right">${Number(i.realisasi || 0).toLocaleString()}</td>
            <td class="p-3 text-right">${Number(i.sisa || 0).toLocaleString()}</td>
            <td class="p-3 text-center">
                ${c.length > 27 ? `
                    <button onclick="event.stopPropagation();openRekamModal(${rawPokData.indexOf(i)})"
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
        searchResults = [];
        selectedKode = "";
        renderPok();
        return;
    }

    searchResults = rawPokData.filter(r =>
        String(r.kode).toLowerCase().includes(keyword) ||
        String(r.uraian).toLowerCase().includes(keyword)
    );

    if (searchResults.length > 0) {
        selectedKode = searchResults[0].kode;
        const parentCode = String(selectedKode).substring(0, 12);
        expandedCodes.add(parentCode);
        renderPok();

        setTimeout(() => {
            const el = document.querySelector(`tr[data-kode="${selectedKode}"]`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    }
}

function gotoSearchResult() {
    const item = searchResults[searchIndex];
    if (!item) return;

    const kode = String(item.kode);
    selectedKode = kode;

    if (kode.length > 12) {
        expandedCodes.clear();
        expandedCodes.add(kode.substring(0, 12));
    }

    renderPok();

    setTimeout(() => {
        document.querySelector(`[data-kode="${kode}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
}

function toggleExpand(code) {
    if (String(code).length !== 12) return;

    if (expandedCodes.has(code)) {
        expandedCodes.clear();
    } else {
        expandedCodes.clear();
        expandedCodes.add(code);
    }

    renderPok();
}

// --- MODAL: REKAM KEGIATAN ---
function openRekamModal(idx) {
    const data = rawPokData[idx];

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

    const baseUrl = sessionStorage.getItem('realUrl');
    if (!baseUrl) {
        console.error("URL tidak ditemukan di sessionStorage");
        return;
    }

    try {
        const response = await fetch(`${baseUrl}?action=loadLokasi`);
        const data = await response.json();

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
    const estimasiStr = document.getElementById("estimasiBiaya").value.replace(/,/g, '');

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
        const res = await fetch(sessionStorage.getItem('realUrl'), {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const result = await res.json();

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

// --- MODAL: DETIL KEGIATAN ---
async function openDetilModal(mak) {
    document.getElementById("detilModal").classList.replace("hidden", "flex");
    document.getElementById("detilTitle").innerText = "Detil MAK: " + mak;

    const url = sessionStorage.getItem('realUrl');
    const tbody = document.getElementById("detil-tbody");
    tbody.innerHTML = `
        <div class="flex justify-center items-center p-4 w-full">
            <span class="text-gray-500">Memuat...</span>
        </div>
    `;

    try {
        const res = await fetch(`${url}?action=getDetil&mak=${encodeURIComponent(mak)}`);
        const result = await res.json();

        if (Array.isArray(result)) {
            detilKegiatanData = result;
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
        tbody.innerHTML = `
            <div class="flex justify-center items-center p-4 w-full">
                <span class="text-red-500">Tidak ada data.</span>
            </div>
        `;
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
    renderDetilTable(detilKegiatanData.filter(i => (i.uraian || '').toLowerCase().includes(keyword)));
}

// --- Template HTML modal (disuntik sekali via ensureModalsExist) ---
function rekamModalTemplate() {
    return `
    <div id="rekamModal" class="fixed inset-0 hidden items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50">
        <div class="bg-white rounded-2xl shadow-2xl w-[980px] max-w-[96vw] overflow-hidden animate-[fade_.2s_ease]">
            <div class="bg-sky-600 text-white px-6 py-4 flex justify-between items-center">
                <div>
                    <h2 class="text-xl font-bold"><i class="fa-solid fa-pen-to-square mr-2"></i> Rekam Kegiatan</h2>
                </div>
                <button onclick="closeRekamModal()" class="w-9 h-9 rounded-full hover:bg-sky-700 transition">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>

            <div class="grid grid-cols-2 gap-8 p-6">
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">ID Usulan</label>
                        <input readonly id="idUsulan" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">No ST/ND / Uraian Kegiatan</label>
                        <input id="uraianKegiatan" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Tgl ST/ND</label>
                        <input type="date" id="tglSt" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Estimasi Biaya</label>
                        <input id="estimasiBiaya" oninput="cekKecukupanDana()" onkeyup="this.value = formatRibuan(this.value)"
                            class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:ring-2 focus:ring-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Status Kecukupan Dana</label>
                        <input readonly id="statusDana" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Tujuan</label>
                        <input list="listTujuan" id="inputTujuan" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 transition">
                        <datalist id="listTujuan"></datalist>
                    </div>
                </div>

                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">MAK</label>
                        <input readonly id="mak" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Uraian MAK</label>
                        <input readonly id="uraianMak" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Pagu</label>
                        <input readonly id="pagu" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Blokir</label>
                        <input readonly id="blokir" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Realisasi</label>
                        <input readonly id="realisasi" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Sisa</label>
                        <input readonly id="sisa" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                    </div>
                </div>
            </div>

            <div class="bg-slate-50 border-t px-6 py-4 flex justify-end gap-3">
                <button onclick="closeRekamModal()" class="px-6 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100">
                    <i class="fa-solid fa-right-from-bracket mr-2"></i> Batal
                </button>
                <button id="btnSimpan" onclick="simpanData()" class="bg-sky-600 hover:bg-sky-700 text-white px-6 py-2.5 rounded-xl shadow">
                    <i class="fa-solid fa-floppy-disk mr-2"></i> Simpan
                </button>
            </div>
        </div>
    </div>
    `;
}

function detilModalTemplate() {
    return `
    <div id="detilModal" class="fixed inset-0 hidden items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50">
        <div class="bg-white rounded-2xl shadow-2xl w-[980px] max-w-[96vw] overflow-hidden">
            <div class="bg-slate-700 text-white px-6 py-4 flex justify-between items-center">
                <h2 class="text-lg font-bold" id="detilTitle">Detil Kegiatan</h2>
                <button onclick="document.getElementById('detilModal').classList.replace('flex', 'hidden')" class="hover:text-red-300">
                    <i class="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>
            <div class="p-6">
                <input type="text" id="cariDetil" oninput="filterDetil()" placeholder="Cari uraian / nomor ST..." class="w-full border p-2 rounded-xl mb-4">
                <div class="w-full text-sm">
                    <div class="flex bg-slate-100 p-3 font-bold text-slate-700 border-b items-center text-xs">
                        <div class="w-[30%]">Uraian/ST</div>
                        <div class="w-[12%]">Pelaksana</div>
                        <div class="w-[18%]">Tujuan</div>
                        <div class="w-[10%]">Tgl</div>
                        <div class="w-[12%] text-right">Jumlah</div>
                        <div class="w-[10%] text-center">Status</div>
                        <div class="w-[8%] text-center">Aksi</div>
                    </div>
                    <div id="detil-tbody" class="max-h-[60vh] overflow-y-auto"></div>
                </div>
            </div>
        </div>
    </div>
    `;
}

// Fungsi yang dipanggil lewat onclick="..." di markup harus ditempel ke window
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
