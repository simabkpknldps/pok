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

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Sama seperti Firebase (lihat firebase-config.js) — Supabase juga butuh waktu
// (async) buat "menghidupkan ulang" sesi login yang tersimpan tiap kali halaman
// dibuka/di-refresh. Kalau query ke tabel yg dibatasi RLS langsung ditembak
// sebelum ini selesai, request-nya dianggap belum login -> ditolak Rules
// (padahal user sebenarnya sudah login). Fungsi ini nunggu sampai Supabase
// Auth benar2 siap (auth state ready) dulu.
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
async function sbFetchAll(table, selectCols) {
    const PAGE_SIZE = 1000;
    let allRows = [];
    let from = 0;
    while (true) {
        const { data, error } = await sb.from(table).select(selectCols || '*').range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        allRows = allRows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return allRows;
}
window.sbFetchAll = sbFetchAll;
