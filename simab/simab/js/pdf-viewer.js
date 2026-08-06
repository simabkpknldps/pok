/**
 * pdf-viewer.js
 * -----------------------------------------------------------------------
 * Popup pembaca PDF, dipakai dari kegiatan.js (kuitansi & SPBy) dan
 * perbantuan.js. Dipanggil lewat window.simabOpenPdfViewer({ title, link,
 * searchText }).
 *
 * Cara kerja: file diambil sebagai base64 lewat backend (action
 * getDokumenFileBase64) — BUKAN di-fetch langsung dari Drive oleh browser
 * — supaya tidak kena masalah CORS. Hasilnya dijadikan Blob URL lalu
 * ditampilkan di <iframe>, memakai VIEWER PDF BAWAAN BROWSER (Chrome/Edge/
 * Firefox semuanya punya pembaca PDF sendiri di dalam iframe) sehingga
 * zoom in/out, print, download, dan cari teks (Ctrl+F) semuanya otomatis
 * tersedia tanpa perlu bikin PDF renderer sendiri.
 *
 * pdf.js (LIBRARY-nya saja, bukan UI viewer-nya) dimuat dari CDN cuma untuk
 * satu keperluan: mencari di halaman berapa sebuah teks berada (misalnya
 * nomor SPBy "0173/PB/"), supaya iframe-nya bisa langsung dibuka di
 * halaman yang tepat lewat "#page=N" pada Blob URL.
 *
 * PENTING: viewer ini HANYA untuk dokumen yang kita upload sendiri ke
 * folder Drive simab_doc (link mengandung 'drive.google.com'). Link yang
 * ditempel manual (mis. dari Nadine/Satu Kemenkeu) dibuka di tab baru
 * seperti biasa, karena itu bukan file PDF mentah yang bisa kita ambil
 * bytes-nya, melainkan halaman web yang butuh sesi login penggunanya
 * masing-masing.
 * -----------------------------------------------------------------------
 */

const SIMAB_PDFJS_VERSION = '3.11.174';
let simabPdfJsLoadPromise = null;

function simabLoadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (simabPdfJsLoadPromise) return simabPdfJsLoadPromise;
    simabPdfJsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${SIMAB_PDFJS_VERSION}/pdf.min.js`;
        script.onload = () => {
            try {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${SIMAB_PDFJS_VERSION}/pdf.worker.min.js`;
                resolve(window.pdfjsLib);
            } catch (e) {
                reject(e);
            }
        };
        script.onerror = () => reject(new Error('Gagal memuat pustaka pembaca PDF.'));
        document.head.appendChild(script);
    });
    return simabPdfJsLoadPromise;
}

// Cari halaman PERTAMA (1-indexed) yang mengandung teks tertentu (case-insensitive).
// Return null kalau tidak ketemu di halaman manapun.
async function simabFindPageWithText(pdfDoc, searchText) {
    const target = String(searchText).toLowerCase();
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(it => it.str).join(' ').toLowerCase();
        if (pageText.includes(target)) return i;
    }
    return null;
}

function simabBase64ToUint8Array(base64) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    return new Uint8Array(byteNumbers);
}

async function simabOpenPdfViewer(opts) {
    const { title, link, searchText } = opts || {};
    if (!link) {
        alert('Dokumen tidak ditemukan.');
        return;
    }

    // Link tempel eksternal (bukan file upload kita) -> buka tab baru saja.
    if (!link.includes('drive.google.com')) {
        window.open(link, '_blank');
        return;
    }

    const { overlay, popup } = kgOpenOverlay(`
        <div class="flex items-center justify-between mb-1 gap-3">
            <h3 class="text-base font-semibold text-sky-700 truncate"><i class="fa-solid fa-file-pdf mr-2"></i>${title || 'Dokumen'}</h3>
            <div class="flex items-center gap-3 shrink-0">
                <a id="simab-pdfDownload" href="#" class="hidden text-slate-400 hover:text-sky-600 text-sm"><i class="fa-solid fa-download mr-1"></i>Download</a>
                <button id="simab-pdfClose" class="text-slate-400 hover:text-slate-600 text-lg"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div id="simab-pdfNote" class="hidden text-xs text-amber-600"></div>
        <div id="simab-pdfBody" class="h-[75vh] flex items-center justify-center bg-slate-50 rounded-lg border border-slate-200">
            <div class="text-slate-400 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat dokumen...</div>
        </div>
    `, 'max-w-5xl');

    popup.querySelector('#simab-pdfClose').onclick = () => overlay.remove();

    const bodyEl = popup.querySelector('#simab-pdfBody');
    const downloadEl = popup.querySelector('#simab-pdfDownload');
    const noteEl = popup.querySelector('#simab-pdfNote');

    try {
        const result = await apiPost({ action: 'getDokumenFileBase64', link: link }, 60000);
        if (result.status !== 'success' || !result.base64) {
            throw new Error(result.message || 'Gagal memuat dokumen.');
        }

        const byteArray = simabBase64ToUint8Array(result.base64);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        downloadEl.href = blobUrl;
        downloadEl.setAttribute('download', result.fileName || 'dokumen.pdf');
        downloadEl.classList.remove('hidden');

        let page = null;
        if (searchText) {
            try {
                const pdfjsLib = await simabLoadPdfJs();
                const pdfDoc = await pdfjsLib.getDocument({ data: byteArray.slice() }).promise;
                page = await simabFindPageWithText(pdfDoc, searchText);
            } catch (e) {
                console.error('Gagal mencari teks di dokumen:', e);
            }
            if (!page) {
                noteEl.textContent = `Teks "${searchText}" tidak ditemukan di dokumen — menampilkan dari halaman 1.`;
                noteEl.classList.remove('hidden');
            }
        }

        const iframe = document.createElement('iframe');
        iframe.className = 'w-full h-full rounded-lg';
        iframe.title = title || 'Dokumen PDF';
        iframe.src = blobUrl + (page ? `#page=${page}` : '');
        bodyEl.innerHTML = '';
        bodyEl.appendChild(iframe);

    } catch (e) {
        bodyEl.innerHTML = `
            <div class="text-center text-red-500 text-sm px-4">
                <i class="fa-solid fa-triangle-exclamation mr-1"></i> ${e.message || 'Gagal memuat dokumen.'}<br>
                <a href="${link}" target="_blank" class="text-sky-600 underline mt-2 inline-block">Buka link asli di tab baru</a>
            </div>`;
    }
}

window.simabOpenPdfViewer = simabOpenPdfViewer;
