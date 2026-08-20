/**
 * dashboard-search.js
 * -----------------------------------------------------------------------
 * Popup "Pencarian Kegiatan" untuk search bar global di paling atas
 * Dashboard (lihat dashboard.js -> bindGlobalSearchBar()).
 *
 * Popup ini SENGAJA dibuat pakai markup & id yang PERSIS SAMA dengan
 * pages/kegiatan.html (kg-searchBox, kg-statusFilter, kg-dataTableBody,
 * dst). Dengan begitu, semua logic yang sudah ada di kegiatan.js —
 * kgLoadData, bindKegiatanEvents, kgRenderTable, kgDownloadExcel,
 * kgOpenNominatifPopup, dan semua popup aksi (Ubah/Hapus/Bayar/SP2D/LPT/
 * Detil/Dokumen/Pelaksana) berikut aturan admin-nya (localStorage.admin
 * === '1') — otomatis jalan apa adanya di sini, TANPA DUPLIKASI KODE.
 * Jadi popup ini selalu konsisten dengan halaman Kegiatan yang asli.
 *
 * Bedanya dengan halaman Kegiatan biasa:
 * - Filter status awal langsung "Semua" (bukan "Dalam Proses"), karena ini
 *   pencarian global, bukan daftar kerja harian.
 * - Pencarian dibatasi ke kolom: C (Uraian/No ST), D (Pelaksana Tugas),
 *   E (Tujuan), G (Tgl Pelaksanaan), P (Status), R (No. SPM) — lewat
 *   kgQuery.searchCols, difilter di client (lihat kegiatan.js kgApplyFilterAndRender).
 * - Tanpa paging (bar paging tetap disembunyikan — kegiatan.js memang sudah
 *   tidak pakai paginasi lagi sama sekali, semua data langsung tampil).
 * - Search bebas, tombol Refresh, dan filter status SEKARANG ditampilkan lagi
 *   (sempat disembunyikan, lalu dibuka kembali) — jadi popup ini bisa dipakai
 *   kombinasi cari kata kunci + pilih status, tidak cuma hasil dari search
 *   bar global di dashboard. Ada baris Total Jumlah tambahan di footer tabel
 *   (selain badge "Jumlah (Data Terfilter)" yang sudah ada di kegiatan.js).
 *
 * PENTING: karena pakai id yang sama dengan kegiatan.html, popup ini
 * hanya boleh dibuka dari halaman Dashboard (bukan sambil halaman
 * Kegiatan sedang terbuka), supaya tidak ada id yang bentrok. Search bar
 * globalnya sendiri memang cuma ada di Dashboard.
 * -----------------------------------------------------------------------
 */

const DASH_GS_SEARCH_COLS = ['C', 'D', 'E', 'G', 'P', 'R'];

function dashGsBuildPopupHtml() {
    return `
        <div class="flex flex-col gap-4">
            <!-- Filter bar (identik dgn kegiatan.html) -->
            <div class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center gap-3">
                    <!-- Search bebas, Refresh, & filter status kembali ditampilkan
                         (sebelumnya sempat disembunyikan) — supaya popup ini bisa dipakai
                         cari kombinasi kata kunci + status, bukan cuma dari search bar
                         global di dashboard saja. -->
                    <div class="flex-1 min-w-[200px] flex items-center gap-2">
                        <input id="kg-searchBox" type="text" placeholder="Cari data... (tekan Enter atau klik Cari)"
                            class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                        <button id="kg-btnSearch"
                            class="flex items-center gap-1 px-3 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium rounded-lg transition whitespace-nowrap">
                            <i class="fa-solid fa-magnifying-glass"></i> Cari
                        </button>
                    </div>
                    <div class="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                        <span class="text-xs font-semibold text-slate-600 whitespace-nowrap">Cari SPM</span>
                        <input id="kg-spmSearchBox" type="text" maxlength="10"
                            class="w-20 text-center px-2 py-1 border border-slate-300 rounded-md text-sm">
                        <button id="kg-btnSearchSPM"
                            class="flex items-center gap-1 px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-medium rounded-md transition">
                            <i class="fa-solid fa-magnifying-glass"></i> Cari
                        </button>
                    </div>

                    <div class="text-sm font-semibold text-sky-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg whitespace-nowrap">
                        Jumlah (Data Terfilter): <span id="kg-totalJumlahLabel">0</span>
                    </div>

                    <button id="kg-btnRefreshData" class="flex items-center gap-2 px-3 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium rounded-lg transition">
                        <i class="fa-solid fa-arrow-rotate-right"></i> Refresh
                    </button>
                    <button id="kg-btnDownloadExcel"
                        class="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition">
                        <i class="fa-solid fa-file-excel"></i> Download Excel
                    </button>
                    <button id="kg-btnOpenNominatif"
                        class="flex items-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition">
                        <i class="fa-solid fa-print"></i> Cetak Daftar Nominatif
                    </button>
                    <button id="kg-btnTambahKegiatan"
                        class="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition">
                        <i class="fa-solid fa-plus"></i> Tambah Kegiatan
                    </button>
                </div>

                <div class="flex items-center gap-4 flex-wrap text-sm text-slate-600">
                    <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="kg-statusFilter" value="Dalam Proses"> Dalam Proses</label>
                    <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="kg-statusFilter" value="LPT"> LPT</label>
                    <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="kg-statusFilter" value="Terbayar"> Terbayar</label>
                    <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="kg-statusFilter" value="Selesai"> Selesai</label>
                    <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="kg-statusFilter" value="Semua" checked> Semua</label>
                </div>
            </div>

            <!-- Tabel -->
            <div class="w-full overflow-x-auto border border-slate-200 rounded-xl">
                <div class="min-w-[1320px] max-h-[55vh] overflow-y-auto">
                    <table id="kg-mainDataTable" class="w-full border-collapse text-[13px]">
                        <thead class="bg-slate-100 sticky top-0 z-10">
                            <tr>
                                <th class="p-2.5 text-left font-semibold">MAK</th>
                                <th class="p-2.5 text-left font-semibold">Uraian / No ST</th>
                                <th class="p-2.5 text-left font-semibold">Pelaksana Tugas</th>
                                <th class="p-2.5 text-left font-semibold">Tujuan</th>
                                <th class="p-2.5 text-left font-semibold whitespace-nowrap">Tgl ST/ND</th>
                                <th class="p-2.5 text-left font-semibold whitespace-nowrap">Tgl Mulai</th>
                                <th class="p-2.5 text-right font-semibold">Jumlah</th>
                                <th class="p-2.5 text-left font-semibold">User</th>
                                <th class="p-2.5 text-center font-semibold">Status</th>
                                <th class="p-2.5 text-center font-semibold sticky right-0 bg-slate-100">Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="kg-dataTableBody"></tbody>
                        <tfoot>
                            <tr class="bg-slate-50 font-semibold border-t-2 border-slate-200">
                                <td colspan="6" class="p-2.5 text-right">Total Jumlah (Data Terfilter)</td>
                                <td class="p-2.5 text-right" id="dash-gsFooterTotal">0</td>
                                <td colspan="3"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- Bar Pagination (disembunyikan — popup ini tanpa paging, tapi elemen
                 tetap ada di DOM supaya kode kegiatan.js yg mengaksesnya tidak error) -->
            <div class="hidden flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 pt-1">
                <div class="flex items-center gap-2">
                    <label for="kg-pageSizeSelect" class="whitespace-nowrap">Tampilkan:</label>
                    <select id="kg-pageSizeSelect" class="px-2 py-1.5 border border-slate-300 rounded-lg text-sm">
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="all" selected>Semua</option>
                    </select>
                    <span>/ halaman &middot; Total: <span id="kg-totalRowsLabel" class="font-semibold text-slate-700">0</span> data</span>
                </div>
                <div class="flex items-center gap-2">
                    <button id="kg-btnPrevPage" class="px-3 py-1.5 border border-slate-300 rounded-lg" disabled>
                        <i class="fa-solid fa-chevron-left"></i> Sebelumnya
                    </button>
                    <span class="whitespace-nowrap">Halaman <span id="kg-pageInfo">1 dari 1</span></span>
                    <button id="kg-btnNextPage" class="px-3 py-1.5 border border-slate-300 rounded-lg" disabled>
                        Berikutnya <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        </div>
        <datalist id="kg-listPegawai"></datalist>
        <datalist id="kg-listLokasi"></datalist>
    `;
}

function bukaPencarianKegiatanGlobal(term, viaSpm) {
    const { overlay, popup } = kgOpenOverlay(`
        <div class="flex items-center justify-between mb-1">
            <h3 class="text-base font-semibold text-sky-700"><i class="fa-solid fa-magnifying-glass mr-2"></i>Pencarian Kegiatan</h3>
            <button id="dash-gsClose" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        ${dashGsBuildPopupHtml()}
    `, 'max-w-6xl');
    popup.classList.add('bg-slate-100');

    popup.querySelector('#dash-gsClose').onclick = () => overlay.remove();

    // Mode "Cari SPM" (dipicu dr tombol Aksi Rekapitulasi SPM di Dashboard):
    // isi kotak "Cari SPM" (BUKAN kotak pencarian bebas), pakai filter
    // kgQuery.spm yang matching-nya pakai parseInt (otomatis nggak peduli
    // ada 0 di depan atau nggak, mis. "102" tetap cocok dgn "0102").
    if (viaSpm) {
        popup.querySelector('#kg-spmSearchBox').value = term;
        popup.querySelector('#kg-searchBox').value = '';
    } else {
        popup.querySelector('#kg-searchBox').value = term;
    }

    // Sinkronkan badge "Jumlah (Data Terfilter)" ke baris Total di footer tabel,
    // tanpa perlu mengubah kgLoadData/kgRenderPaginationInfo di kegiatan.js.
    const totalLabel = popup.querySelector('#kg-totalJumlahLabel');
    const footerTotal = popup.querySelector('#dash-gsFooterTotal');
    if (totalLabel && footerTotal) {
        const syncFooterTotal = () => { footerTotal.textContent = totalLabel.textContent; };
        syncFooterTotal();
        new MutationObserver(syncFooterTotal).observe(totalLabel, { childList: true, characterData: true, subtree: true });
    }

    // Reset state modul Kegiatan (variabel global dari kegiatan.js) supaya
    // konsisten dengan pencarian yang baru dibuka ini.
    kgCurrentTableRowsData = [];
    kgFirstLoad = true;
    kgQuery = {
        statusFilter: 'Semua',
        search: viaSpm ? '' : term,
        spm: viaSpm ? term : '',
        page: 1,
        pageSize: 'all',
        searchCols: DASH_GS_SEARCH_COLS
    };

    bindKegiatanEvents();
    // false = pakai cache kgAllRows dulu kalau sudah ada (dari kunjungan halaman
    // Kegiatan/Dashboard sebelumnya) — hindari baca ulang Firestore tiap buka
    // popup ini. Tombol "Refresh" (sekarang ditampilkan lagi) tetap manggil
    // kgLoadData(true) sendiri kalau user memang mau data paling baru.
    kgLoadData(false);
}

window.bukaPencarianKegiatanGlobal = bukaPencarianKegiatanGlobal;
