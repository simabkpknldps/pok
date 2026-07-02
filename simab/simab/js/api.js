/**
 * API helper — semua komunikasi ke backend GAS lewat sini.
 */

function getApiUrl() {
    const url = sessionStorage.getItem('realUrl');
    if (!url) {
        console.error('realUrl tidak ditemukan di sessionStorage. User belum login?');
    }
    return url;
}

// POST ke GAS dengan body JSON, contoh: apiPost({ action: 'getPOKData' })
async function apiPost(payload) {
    const url = getApiUrl();
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
    return res.json();
}

// GET ke GAS dengan query string, contoh: apiGet('getDetil', { mak: '123' })
async function apiGet(action, params = {}) {
    const url = getApiUrl();
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${url}?${qs}`);
    return res.json();
}

window.apiPost = apiPost;
window.apiGet = apiGet;
