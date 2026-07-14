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
        return await res.json();
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
