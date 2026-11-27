/**
 * supabase-config.js
 * -----------------------------------------------------------------------
 * Inisialisasi koneksi ke Supabase (project: simab-db).
 *
 * WAJIB dimuat lewat <script> SETELAH script CDN Supabase ini (taruh di
 * <head> atau paling atas <body>, SEBELUM script ini):
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *   <script src="js/supabase-config.js"></script>
 *
 * Setelah file ini jalan, tersedia 1 variabel global baru: `window.sb`
 * (client Supabase), dipakai oleh file lain nanti buat baca/tulis data,
 * mis: sb.from('kegiatan').select('*')
 * -----------------------------------------------------------------------
 */

const SUPABASE_URL = "https://iqedxrjcosorjwsawowk.supabase.co";
const SUPABASE_KEY = "sb_publishable_GrguFKOgL0M3uFDoVKLHYw_1dYG19O2";

// { cache: 'no-store' } WAJIB ada -- tanpa ini, browser (terutama Safari/
// iOS, termasuk mode PWA "Add to Home Screen") kadang nge-cache hasil
// fetch() ke Supabase, jadi data yang tampil bisa basi walau sudah nembak
// query baru (gejalanya: tombol Refresh kelihatan jalan tapi datanya sama
// terus, baru berubah kalau logout+login/reload halaman total). Query
// Supabase HARUS selalu ambil data terbaru dari server, tidak pernah dari
// cache browser.
//
// CATATAN: sengaja TIDAK menambah parameter unik di URL (mis. "_cb=...")
// sebagai cara lain cegah cache -- itu BERISIKO, karena PostgREST (API
// yang dipakai Supabase) bisa salah mengartikan parameter yg tidak
// dikenali sebagai nama kolom buat filter, dan gagal kalau kolom itu
// tidak ada di tabel yang sedang di-query. Itu bisa mematahkan SEMUA
// query di seluruh aplikasi.
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' })
    }
});

// Supabase butuh waktu (async) buat "menghidupkan ulang" sesi login yang
// tersimpan tiap kali halaman dibuka/di-refresh. Kalau query ke tabel yg
// dibatasi RLS langsung ditembak sebelum ini selesai, request-nya dianggap
// belum login -> ditolak Rules (padahal user sebenarnya sudah login).
// Fungsi ini nunggu sampai Supabase Auth benar2 siap (auth state ready) dulu.
let _supabaseAuthReadyPromise = null;
function waitSupabaseAuthReady() {
    if (!_supabaseAuthReadyPromise) {
        _supabaseAuthReadyPromise = new Promise(resolve => {
            const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
                subscription.unsubscribe();
                resolve(session);
            });
        });
    }
    return _supabaseAuthReadyPromise;
}
window.waitSupabaseAuthReady = waitSupabaseAuthReady;

// Kolom Postgres bertipe 'date' MENOLAK string kosong ('') — harus null.
// Dipakai tiap kali nulis tanggal (dari input type="date" yg bisa kosong)
// ke tabel manapun. Dipakai bersama oleh semua file halaman.
function normDate(v) {
    const s = String(v || '').trim();
    return s ? s : null;
}
window.normDate = normDate;

// Supabase/PostgREST DIAM-DIAM membatasi select('*') polos ke MAKSIMAL 1000
// BARIS per request (tanpa error!) — kalau tabel (mis. kegiatan, pok) lebih
// dari itu, sisanya "hilang" begitu saja. Helper ini ambil SEMUA baris,
// per-1000, digabung otomatis. WAJIB dipakai (bukan sb.from().select('*')
// polos) utk tabel yang berpotensi >1000 baris.
// 'filters' opsional: object {kolom: nilai} -> di-AND-kan sbg .eq(), dipakai
// terutama utk filter tahun (lihat getTahunAktif di bawah).
async function sbFetchAll(table, selectCols, filters) {
    const PAGE_SIZE = 1000;
    let allRows = [];
    let from = 0;
    while (true) {
        let query = sb.from(table).select(selectCols || '*');
        if (filters) {
            Object.entries(filters).forEach(([k, v]) => { query = query.eq(k, v); });
        }
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        allRows = allRows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return allRows;
}
window.sbFetchAll = sbFetchAll;

// "Tahun aktif" — SEKARANG per-sesi (dipilih user lewat popup switcher di
// sebelah tombol Logout), BUKAN satu nilai tunggal global lagi. Disimpan di
// localStorage 'tahunAktif', dipakai SEMUA halaman utk filter data tahun
// anggaran (kegiatan, pok, blokir, rpd, rpd_berjalan, mp_pnbp).
//
// Urutan penentuan nilai default (saat localStorage 'tahunAktif' belum ada,
// mis. baru saja login): tabel config (id='tahun_aktif') sbg default sistem
// -> kalau itu juga tidak ada, tahun kalender berjalan.
//
// Di-cache di memori (per sesi/reload halaman) spy tidak baca ulang config
// berkali-kali dalam 1 kunjungan -- TAPI cache ini WAJIB direset (lihat
// setTahunAktif di bawah) begitu user ganti tahun lewat popup, supaya
// halaman lain yg baru dibuka setelahnya langsung ikut tahun yang baru.
let _tahunAktifCache = null;
async function getTahunAktif() {
    if (_tahunAktifCache !== null) return _tahunAktifCache;

    const dariSesi = localStorage.getItem('tahunAktif');
    if (dariSesi) {
        _tahunAktifCache = Number(dariSesi);
        return _tahunAktifCache;
    }

    try {
        const { data, error } = await sb.from('config').select('data').eq('id', 'tahun_aktif').maybeSingle();
        if (error) throw error;
        _tahunAktifCache = (data && data.data && data.data.tahun) ? Number(data.data.tahun) : new Date().getFullYear();
    } catch (e) {
        console.error('Gagal baca tahun aktif, fallback ke tahun sistem:', e);
        _tahunAktifCache = new Date().getFullYear();
    }
    localStorage.setItem('tahunAktif', String(_tahunAktifCache));
    return _tahunAktifCache;
}
window.getTahunAktif = getTahunAktif;

// Dipanggil oleh popup switcher tahun anggaran (dashboard.html) saat user
// pilih tahun baru. Reset cache in-memory supaya getTahunAktif() berikutnya
// (di halaman manapun) langsung baca nilai baru, bukan nilai lama yg
// ke-cache dari sebelum ganti.
function setTahunAktif(tahun) {
    localStorage.setItem('tahunAktif', String(tahun));
    _tahunAktifCache = Number(tahun);
}
window.setTahunAktif = setTahunAktif;

// Daftar tahun yang BENERAN ada datanya di database utk kantor yang sedang
// aktif -- dipakai isi pilihan di popup switcher, supaya user tidak bisa
// pilih tahun yang datanya belum pernah disiapkan sama sekali. Sumbernya
// tabel 'pok' (SATU-SATUNYA tabel yg jumlah barisnya kecil & PASTI dibuat
// duluan tiap kali tahun anggaran baru mulai, sebelum ada kegiatan apapun).
async function getTahunTersediaList(kantorId) {
    try {
        const rows = await sbFetchAll('pok', 'tahun', { kantor_id: kantorId });
        const tahunUnik = [...new Set(rows.map(r => Number(r.tahun)).filter(t => !isNaN(t)))];
        tahunUnik.sort((a, b) => b - a); // terbaru dulu
        if (tahunUnik.length > 0) return tahunUnik;
    } catch (e) {
        console.error('Gagal ambil daftar tahun tersedia:', e);
    }
    // Fallback kalau tabel pok utk kantor ini masih kosong total (mis. kantor
    // baru banget) -- minimal tawarkan tahun sistem berjalan.
    return [new Date().getFullYear()];
}
window.getTahunTersediaList = getTahunTersediaList;

// Status kegiatan dihitung ulang di client tiap kali salah satu field tanggal
// terkait (tgl_mulai/tgl_lpt/tgl_bayar/tgl_sp2d) berubah, lalu disimpan
// sebagai field biasa (Postgres tidak punya formula hidup spt Sheet dulu).
// Dipakai bersama oleh kegiatan.js, pok.js, & perbantuan.js (semuanya sama-
// sama punya fitur Pelaksana Kegiatan / Tambah Usulan).
function kgComputeStatus(tglMulai, tglLPT, tglBayar, tglSP2D) {
    if (tglSP2D) return 'Selesai';
    if (tglBayar) return 'Terbayar';
    if (tglLPT) return 'LPT';
    if (tglMulai) {
        const mulai = new Date(tglMulai);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        mulai.setHours(0, 0, 0, 0);
        if (!isNaN(mulai.getTime()) && mulai.getTime() > today.getTime()) return 'Rekam Data';
    }
    return 'Terlaksana';
}
window.kgComputeStatus = kgComputeStatus;

// ID baris kegiatan baru (dipakai fitur Pelaksana Kegiatan / Tambah Usulan
// yg generate baris baru per pelaksana). Dipakai bersama oleh kegiatan.js,
// pok.js, & perbantuan.js.
// Daftar nama REKANAN (supplier/penyedia jasa/narasumber) kantor aktif, utk
// pilihan Pelaksana. Cache di window.rekananNamesCache; set null utk refresh.
// Aman kalau tabel belum dibuat / gagal baca -> kembalikan [].
async function fetchRekananNames(force) {
    if (!force && Array.isArray(window.rekananNamesCache)) return window.rekananNamesCache;
    try {
        await waitSupabaseAuthReady();
        const kantor = (typeof getKantorAktif === 'function') ? getKantorAktif() : '';
        if (!kantor) return [];
        const rows = await sbFetchAll('rekanan', 'nama,status', { kantor_id: kantor });
        window.rekananNamesCache = rows
            .filter(r => String(r.status) !== '0')
            .map(r => String(r.nama || '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'id'));
    } catch (e) {
        console.warn('Gagal memuat daftar rekanan:', e);
        window.rekananNamesCache = [];
    }
    return window.rekananNamesCache;
}
window.fetchRekananNames = fetchRekananNames;

// Sumber Dana kegiatan: 'RM' / 'PNBP' / ''. Utama = kolom `sd` (terisi otomatis dari
// POK oleh trigger database). Cadangan utk data lama yg kolom sd-nya masih kosong:
// penanda "(PNBP)" / "(RM)" di uraian.
function kgSumberDana(k) {
    const sd = String((k && (k.sd ?? k.SD)) || '').trim().toUpperCase();
    if (sd === 'PNBP' || sd === 'RM') return sd;
    const u = String((k && (k.uraian ?? k.C)) || '');
    if (u.includes('(PNBP)')) return 'PNBP';
    if (u.includes('(RM)')) return 'RM';
    return '';
}
window.kgSumberDana = kgSumberDana;

function kgGenerateRandomId(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < len; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
}
window.kgGenerateRandomId = kgGenerateRandomId;

// =====================================================================
// LOG AKTIVITAS (hanya bisa dilihat superadmin; tabel: log_aktivitas)
// ---------------------------------------------------------------------
// Mencatat login/logout dan SEMUA rekam/ubah/hapus ke tabel database
// (lewat sb.from(tabel).insert/update/delete/upsert). Pencatatan dipasang
// SEKALI di sini dengan "membungkus" sb.from, jadi semua halaman otomatis
// tercatat tanpa mengubah kode masing-masing. Gagal mencatat TIDAK PERNAH
// mengganggu proses utama (semua dibungkus try/catch dan tidak ditunggu).
// =====================================================================
(function () {
    const LOG_TABEL = 'log_aktivitas';
    const SKIP_TABEL = new Set([LOG_TABEL, 'jarwo_log', 'notifikasi', 'sesi_user']);
    const SENSITIF = /(rekening|password|passwd|token|secret|api_?key)/i;

    const NAMA_TABEL = {
        kegiatan: 'Kegiatan', pok: 'POK', blokir: 'Blokir', rpd: 'RPD', rpd_berjalan: 'RPD Berjalan',
        pegawai: 'Pegawai', kantor: 'Kantor', sbm: 'SBM', config: 'Pengaturan', pejabat: 'Pejabat',
        mp_pnbp: 'MP PNBP', perbantuan: 'Perbantuan'
    };

    function ua() {
        const u = navigator.userAgent || '';
        let os = 'Tidak dikenal';
        if (/Windows/i.test(u)) os = 'Windows';
        else if (/Android/i.test(u)) os = 'Android';
        else if (/iPhone|iPad|iPod/i.test(u)) os = 'iOS';
        else if (/Mac OS X|Macintosh/i.test(u)) os = 'macOS';
        else if (/CrOS/i.test(u)) os = 'ChromeOS';
        else if (/Linux/i.test(u)) os = 'Linux';
        let br = 'Browser';
        if (/Edg\//i.test(u)) br = 'Edge';
        else if (/OPR\/|Opera/i.test(u)) br = 'Opera';
        else if (/SamsungBrowser/i.test(u)) br = 'Samsung Internet';
        else if (/Firefox|FxiOS/i.test(u)) br = 'Firefox';
        else if (/Chrome|CriOS/i.test(u)) br = 'Chrome';
        else if (/Safari/i.test(u)) br = 'Safari';
        const tablet = /iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u));
        const ponsel = /iPhone|iPod|Mobile/i.test(u);
        const jenis = tablet ? 'Tablet' : (ponsel ? 'Ponsel' : 'Komputer');
        let pwa = false;
        try { pwa = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { }
        return `${jenis} · ${os} · ${br}${pwa ? ' (PWA)' : ''}`;
    }

    // IP + perkiraan lokasi, diambil sekali per sesi tab dan di-cache.
    let ipPromise = null;
    function ambilIp() {
        if (ipPromise) return ipPromise;
        try {
            const c = sessionStorage.getItem('simabIpInfo');
            if (c) { ipPromise = Promise.resolve(JSON.parse(c)); return ipPromise; }
        } catch (e) { }
        const dengan = (url, peta) => {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 3000);
            return fetch(url, { signal: ctl.signal, cache: 'no-store' })
                .then(r => r.json()).then(peta).finally(() => clearTimeout(t));
        };
        ipPromise = dengan('https://ipwho.is/', j => {
            if (!j || j.success === false || !j.ip) throw new Error('x');
            return { ip: j.ip, lokasi: [j.city, j.region, j.country].filter(Boolean).join(', ') };
        }).catch(() => dengan('https://ipapi.co/json/', j => {
            if (!j || !j.ip) throw new Error('x');
            return { ip: j.ip, lokasi: [j.city, j.region, j.country_name].filter(Boolean).join(', ') };
        })).catch(() => ({ ip: null, lokasi: null })).then(v => {
            try { if (v.ip) sessionStorage.setItem('simabIpInfo', JSON.stringify(v)); } catch (e) { }
            return v;
        });
        return ipPromise;
    }

    function samarkan(v, depth) {
        depth = depth || 0;
        if (v === null || v === undefined) return v;
        if (Array.isArray(v)) return v.slice(0, 3).map(x => samarkan(x, depth + 1));
        if (typeof v === 'object' && depth < 3) {
            const o = {};
            Object.keys(v).forEach(k => { o[k] = SENSITIF.test(k) ? '***' : samarkan(v[k], depth + 1); });
            return o;
        }
        if (typeof v === 'string' && v.length > 300) return v.slice(0, 300) + '…';
        return v;
    }

    function ringkasBaris(tabel, rows) {
        const r = rows[0] || {};
        const ket = r.uraian || r.nama || r.nomor_spm || r.kode || r.mak || r.id || '';
        const lbl = NAMA_TABEL[tabel] || tabel;
        const n = rows.length;
        return n > 1 ? `${lbl}: ${n} baris` + (ket ? ` (mis. ${String(ket).slice(0, 80)})` : '') : `${lbl}${ket ? ': ' + String(ket).slice(0, 100) : ''}`;
    }

    async function tulis(aksi, tabel, ringkas, detail) {
        try {
            if (!window.sb) return;
            const ls = (k) => { try { return localStorage.getItem(k) || null; } catch (e) { return null; } };
            const nip = ls('nip');
            if (!nip) return;                       // belum login -> tidak dicatat
            const info = await ambilIp();
            await window.sb.from(LOG_TABEL).insert({
                nip, nama: ls('nama'), jabatan: ls('jabatan'), kantor_id: ls('kantor'),
                aksi, tabel: tabel || null, ringkas: ringkas || null,
                detail: detail ? samarkan(detail) : null,
                perangkat: ua(), ip: info.ip, lokasi: info.lokasi,
                halaman: (location.pathname.split('/').pop() || 'index.html') + (window.location.hash || '')
            });
        } catch (e) { /* pencatatan tidak boleh mengganggu */ }
    }
    // Dipakai manual: logAktivitas('login', 'sesi', 'Login berhasil', {...}) -> Promise
    window.logAktivitas = tulis;

    // ---- Bungkus sb.from supaya rekam/ubah/hapus tercatat otomatis ----
    const asalFrom = window.sb.from.bind(window.sb);
    const PETA = { insert: 'rekam', upsert: 'simpan', update: 'ubah', delete: 'hapus' };
    window.sb.from = function (tabel) {
        const qb = asalFrom(tabel);
        if (SKIP_TABEL.has(tabel)) return qb;
        Object.keys(PETA).forEach(m => {
            const asli = qb[m];
            if (typeof asli !== 'function') return;
            qb[m] = function () {
                const args = arguments;
                const fb = asli.apply(qb, args);
                try {
                    const asliThen = fb.then;
                    let sudah = false;
                    fb.then = function (onOk, onErr) {
                        return asliThen.call(fb, function (res) {
                            try {
                                if (!sudah && res && !res.error) {
                                    sudah = true;
                                    const payload = args[0];
                                    const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
                                    let filter = '';
                                    try { filter = decodeURIComponent(fb.url.search || '').replace(/^\?/, ''); } catch (e) { }
                                    const rk = m === 'delete'
                                        ? `${NAMA_TABEL[tabel] || tabel}${filter ? ' (' + filter.slice(0, 100) + ')' : ''}`
                                        : (m === 'update' ? `${NAMA_TABEL[tabel] || tabel}${filter ? ' (' + filter.slice(0, 80) + ')' : ''} · ubah: ${Object.keys(rows[0] || {}).slice(0, 8).join(', ')}` : ringkasBaris(tabel, rows));
                                    tulis(PETA[m], tabel, rk, { jumlah_baris: rows.length || undefined, filter: filter || undefined, data: rows.length ? rows : undefined });
                                }
                            } catch (e) { }
                            return onOk ? onOk(res) : res;
                        }, onErr);
                    };
                } catch (e) { }
                return fb;
            };
        });
        return qb;
    };
})();
