/**
 * API helper — semua komunikasi ke backend GAS lewat sini.
 */

function getApiUrl() {
    const url = localStorage.getItem('realUrl');
    if (!url) {
        console.error('realUrl tidak ditemukan di localStorage. User belum login?');
    }
    return url;
}

// POST ke GAS dengan body JSON, contoh: apiPost({ action: 'getPOKData' })
async function apiPost(payload, timeout = 30000) {
    const url = getApiUrl();
    if (!url) throw new Error('API URL tidak ditemukan. Silakan login kembali.');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const res = await fetch(url, { 
            method: 'POST', 
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const hasil = await res.json();
        // Log aktivitas: upload/hapus dokumen (Kuitansi/SPBy/SPM dll) di Google Drive.
        try {
            const act = payload && payload.action;
            if (window.logAktivitas && (act === 'uploadDokumenKegiatan' || act === 'hapusDokumenKegiatan') && !(hasil && hasil.success === false)) {
                window.logAktivitas('dokumen', 'dokumen',
                    (act === 'uploadDokumenKegiatan' ? 'Upload dokumen: ' : 'Hapus dokumen: ') + String(payload.uraian || payload.id || '').slice(0, 100),
                    { aksi: act, id: payload.id, jenis: payload.jenis || payload.tipe });
            }
        } catch (e) { /* abaikan */ }
        return hasil;
    } finally {
        clearTimeout(timeoutId);
    }
}

// GET ke GAS dengan query string, contoh: apiGet('getDetil', { mak: '123' })
async function apiGet(action, params = {}, timeout = 30000) {
    const url = getApiUrl();
    if (!url) throw new Error('API URL tidak ditemukan. Silakan login kembali.');
    
    const qs = new URLSearchParams({ action, ...params }).toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const res = await fetch(`${url}?${qs}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

window.apiPost = apiPost;
window.apiGet = apiGet;
