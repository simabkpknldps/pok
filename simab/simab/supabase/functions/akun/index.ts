// Akun — verifikasi nomor WA, lupa password (kode lewat WhatsApp). Edge Function (Deno).
// Deploy TANPA verifikasi JWT (aksi lupa password dipanggil sebelum login):
//   supabase functions deploy akun --no-verify-jwt
// Secrets opsional: OTP_PEPPER (acak panjang, memperkuat hash kode)
// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY tersedia otomatis.
declare const Deno: any;

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PEPPER = Deno.env.get("OTP_PEPPER") || "simab-otp";
const EMAIL_DOMAIN = "@simab.local";
const BERLAKU_MENIT = 10;
const MAKS_PERCOBAAN = 5;
const MAKS_KIRIM_PER_JAM_NIP = 3;
const MAKS_KIRIM_PER_JAM_IP = 12;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
class Galat extends Error { constructor(public pesan: string, public status = 400) { super(pesan); } }

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H, Prefer: "return=representation", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : [];
}
const q = (s: string) => encodeURIComponent(s);

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const hashKode = (nip: string, tujuan: string, kode: string) => sha256(`${PEPPER}|${nip}|${tujuan}|${kode}`);
function kodeAcak() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

function normalisasiWa(v: string): string {
  let n = String(v || "").replace(/[^0-9]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  else if (n.startsWith("8")) n = "62" + n;
  if (!/^628\d{7,12}$/.test(n)) throw new Galat("Nomor WA tidak valid. Contoh: 0812xxxxxxx");
  return n;
}
function validasiPassword(pw: string, nip: string) {
  if (String(pw).length < 8) throw new Galat("Password minimal 8 karakter.");
  if (pw === nip) throw new Galat("Password tidak boleh sama dengan NIP.");
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new Galat("Password harus mengandung huruf dan angka.");
}

async function nipDariJwt(req: Request): Promise<string> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Galat("Belum login", 401);
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) throw new Galat("Belum login", 401);
  const u = await r.json();
  const email = String(u?.email || "");
  if (!email.endsWith(EMAIL_DOMAIN)) throw new Galat("Akun tidak dikenali", 401);
  return email.slice(0, -EMAIL_DOMAIN.length);
}

async function batasKirim(nip: string, ipHash: string) {
  const sejam = new Date(Date.now() - 3600_000).toISOString();
  const a = await rest(`akun_otp?select=id&nip=eq.${q(nip)}&dibuat_pada=gte.${q(sejam)}`);
  if (a.length >= MAKS_KIRIM_PER_JAM_NIP) throw new Galat("Terlalu sering meminta kode. Coba lagi dalam 1 jam.", 429);
  const b = await rest(`akun_otp?select=id&ip_hash=eq.${ipHash}&dibuat_pada=gte.${q(sejam)}`);
  if (b.length >= MAKS_KIRIM_PER_JAM_IP) throw new Galat("Terlalu banyak permintaan dari jaringan ini. Coba lagi nanti.", 429);
}

async function buatKode(nip: string, tujuan: string, noWa: string, ipHash: string, pesanFn: (kode: string) => string) {
  await batasKirim(nip, ipHash);
  // kode lama untuk tujuan yang sama dibatalkan
  await rest(`akun_otp?nip=eq.${q(nip)}&tujuan=eq.${tujuan}&dipakai=eq.false`, { method: "PATCH", body: JSON.stringify({ dipakai: true }) });
  const kode = kodeAcak();
  await rest("akun_otp", { method: "POST", body: JSON.stringify({
    nip, tujuan, no_wa: noWa, kode_hash: await hashKode(nip, tujuan, kode), ip_hash: ipHash,
    kadaluarsa: new Date(Date.now() + BERLAKU_MENIT * 60_000).toISOString(),
  }) });
  await rest("wa_outbox", { method: "POST", body: JSON.stringify({ no_wa: noWa, pesan: pesanFn(kode) }) });
}

// Memeriksa kode; mengembalikan baris OTP yang valid dan menandainya terpakai.
async function periksaKode(nip: string, tujuan: string, kode: string) {
  const baris = (await rest(`akun_otp?select=*&nip=eq.${q(nip)}&tujuan=eq.${tujuan}&dipakai=eq.false&order=id.desc&limit=1`))[0];
  if (!baris || new Date(baris.kadaluarsa).getTime() < Date.now()) throw new Galat("Kode tidak berlaku atau sudah kedaluwarsa. Minta kode baru.");
  if (baris.percobaan >= MAKS_PERCOBAAN) throw new Galat("Terlalu banyak percobaan salah. Minta kode baru.", 429);
  const cocok = (await hashKode(nip, tujuan, String(kode || "").trim())) === baris.kode_hash;
  if (!cocok) {
    await rest(`akun_otp?id=eq.${baris.id}`, { method: "PATCH", body: JSON.stringify({ percobaan: baris.percobaan + 1 }) });
    throw new Galat("Kode salah.");
  }
  await rest(`akun_otp?id=eq.${baris.id}`, { method: "PATCH", body: JSON.stringify({ dipakai: true }) });
  return baris;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json();
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
    const ipHash = (await sha256(PEPPER + "|ip|" + ip)).slice(0, 32);

    // ---- daftarkan / ubah nomor WA (sudah login) ----
    if (b.aksi === "wa_kirim") {
      const nip = await nipDariJwt(req);
      const noWa = normalisasiWa(b.no_wa);
      await buatKode(nip, "verifikasi_wa", noWa, ipHash,
        (k) => `*SiMAB* – kode verifikasi nomor WA Anda: *${k}*\nBerlaku ${BERLAKU_MENIT} menit. Jangan berikan kode ini kepada siapa pun.`);
      return json({ ok: true, menit: BERLAKU_MENIT });
    }
    if (b.aksi === "wa_verifikasi") {
      const nip = await nipDariJwt(req);
      const baris = await periksaKode(nip, "verifikasi_wa", b.kode);
      await rest("pegawai_kontak?on_conflict=nip", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ nip, no_wa: baris.no_wa, terverifikasi_pada: new Date().toISOString(), diubah_pada: new Date().toISOString() }) });
      return json({ ok: true });
    }

    // ---- lupa password (belum login) ----
    if (b.aksi === "lupa_kirim") {
      const nip = String(b.nip || "").trim();
      if (!/^\d{6,25}$/.test(nip)) throw new Galat("NIP tidak valid.");
      const k = (await rest(`pegawai_kontak?select=no_wa,terverifikasi_pada&nip=eq.${q(nip)}`))[0];
      if (k && k.terverifikasi_pada) {
        await buatKode(nip, "reset_password", k.no_wa, ipHash,
          (c) => `*SiMAB* – kode reset password: *${c}*\nBerlaku ${BERLAKU_MENIT} menit. Jika Anda tidak memintanya, abaikan pesan ini dan jangan berikan kode kepada siapa pun.`);
      }
      // Jawaban sama baik NIP terdaftar maupun tidak, agar NIP tidak bisa ditebak.
      return json({ ok: true, menit: BERLAKU_MENIT });
    }
    if (b.aksi === "lupa_reset") {
      const nip = String(b.nip || "").trim();
      if (!/^\d{6,25}$/.test(nip)) throw new Galat("NIP tidak valid.");
      validasiPassword(String(b.password_baru || ""), nip);
      await periksaKode(nip, "reset_password", b.kode);
      const uid = await (async () => {
        const r = await fetch(`${SB_URL}/rest/v1/rpc/fn_auth_uid`, { method: "POST", headers: H, body: JSON.stringify({ p_email: nip + EMAIL_DOMAIN }) });
        const t = await r.json();
        return typeof t === "string" ? t : null;
      })();
      if (!uid) throw new Galat("Akun tidak ditemukan.", 404);
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${uid}`, { method: "PUT", headers: H, body: JSON.stringify({ password: String(b.password_baru) }) });
      if (!r.ok) throw new Error("Gagal mengubah password: " + (await r.text()).slice(0, 160));
      return json({ ok: true });
    }

    throw new Galat("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof Galat) return json({ error: e.pesan }, e.status);
    console.error(e);
    return json({ error: "Terjadi kesalahan di server. Coba lagi sebentar." }, 500);
  }
});
