/**
 * Pengirim antrean WA SiMAB untuk bot Ayyubi (Baileys).
 * Mengambil pesan dari tabel Supabase `wa_outbox` (status 'menunggu') lalu mengirimnya.
 * Dipakai untuk kode verifikasi nomor WA dan kode reset password.
 * Tanpa dependensi tambahan (memakai fetch bawaan Node 18+). Hub tidak perlu dibuka ke internet.
 *
 * .env bot:
 *   SIMAB_SUPABASE_URL=https://iqedxrjcosorjwsawowk.supabase.co
 *   SIMAB_SERVICE_KEY=<service_role key proyek SiMAB>   (RAHASIA, jangan dibagikan)
 *
 * Pemasangan (setelah koneksi Baileys siap, sock = hasil makeWASocket):
 *   const { mulaiOutboxSimab } = require('./wa-outbox-worker');
 *   mulaiOutboxSimab(sock);
 * Bila `sock` diganti saat sambung ulang, panggil mulaiOutboxSimab(sockBaru) lagi (pekerja lama berhenti otomatis).
 */
const URL_ = process.env.SIMAB_SUPABASE_URL;
const KEY = process.env.SIMAB_SERVICE_KEY;
const JEDA_MS = 4000;
const MAKS_COBA = 3;

let pekerjaAktif = 0;

const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
async function rest(path, init = {}) {
    const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H(), Prefer: 'return=representation', ...(init.headers || {}) } });
    const t = await r.text();
    if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 160)}`);
    return t ? JSON.parse(t) : [];
}

async function kerjakan(sock) {
    // klaim atomik: hanya satu pekerja yang berhasil mengubah menunggu -> proses
    const daftar = await rest('wa_outbox?select=id&status=eq.menunggu&order=id.asc&limit=5');
    for (const { id } of daftar) {
        const klaim = await rest(`wa_outbox?id=eq.${id}&status=eq.menunggu`, { method: 'PATCH', body: JSON.stringify({ status: 'proses' }) });
        if (!klaim.length) continue;
        const m = klaim[0];
        try {
            const jid = String(m.no_wa).replace(/\D/g, '') + '@s.whatsapp.net';
            const cek = await sock.onWhatsApp(jid).catch(() => null);
            if (cek && cek[0] && cek[0].exists === false) throw new Error('nomor tidak terdaftar di WhatsApp');
            await sock.sendMessage((cek && cek[0] && cek[0].jid) || jid, { text: m.pesan });
            // kode tidak disimpan setelah terkirim
            await rest(`wa_outbox?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'terkirim', pesan: '[terkirim]', dikirim_pada: new Date().toISOString() }) });
        } catch (e) {
            const coba = (m.percobaan || 0) + 1;
            const habis = coba >= MAKS_COBA || /tidak terdaftar/.test(String(e.message));
            await rest(`wa_outbox?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: habis ? 'gagal' : 'menunggu', percobaan: coba, error: String(e.message).slice(0, 200), ...(habis ? { pesan: '[gagal]' } : {}) }) }).catch(() => { });
        }
    }
}

function mulaiOutboxSimab(sock) {
    if (!URL_ || !KEY) { console.warn('[outbox-simab] SIMAB_SUPABASE_URL / SIMAB_SERVICE_KEY belum diisi, pengirim tidak aktif.'); return; }
    const saya = ++pekerjaAktif;
    let sibuk = false;
    const tick = async () => {
        if (saya !== pekerjaAktif) return clearInterval(timer);
        if (sibuk) return;
        sibuk = true;
        try { await kerjakan(sock); } catch (e) { console.warn('[outbox-simab]', e.message); } finally { sibuk = false; }
    };
    const timer = setInterval(tick, JEDA_MS);
    console.log('[outbox-simab] pengirim antrean WA SiMAB aktif');
}

module.exports = { mulaiOutboxSimab };
