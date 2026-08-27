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
function kgGenerateRandomId(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < len; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
}
window.kgGenerateRandomId = kgGenerateRandomId;
