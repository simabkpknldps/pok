// Jarwo — asisten AI SiMAB. Edge Function (Deno), tanpa dependensi.
// Secrets (Supabase > Edge Functions > Secrets), tiap key dipisah koma:
//   GEMINI_KEYS, GROQ_KEYS, OPENROUTER_KEYS, TAVILY_KEYS, SERPER_KEYS
// Opsional: GEMINI_MODEL, GROQ_MODEL, OPENROUTER_MODEL, OPENROUTER_VISION_MODEL
declare const Deno: any;

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const env = (k: string, d = "") => Deno.env.get(k) || d;
const keys = (k: string) => env(k).split(",").map((s) => s.trim()).filter(Boolean);
// Model boleh lebih dari satu, dipisah koma; dicoba berurutan sampai ada yang berhasil.
const models = (k: string, d: string) => env(k, d).split(",").map((s) => s.trim()).filter(Boolean);
const GEMINI_EXTRACT_MODELS = models("GEMINI_EXTRACT_MODEL", "gemini-3.5-flash-lite,gemini-3.8-flash");
const CF_IMAGE_MODELS = models("CLOUDFLARE_IMAGE_MODEL", "@cf/black-forest-labs/flux-1-schnell,@cf/stabilityai/stable-diffusion-xl-base-1.0");
const GEMINI_MODELS = models("GEMINI_MODEL", "gemini-3.5-flash-lite,gemini-3.8-flash");
const GROQ_MODELS = models("GROQ_MODEL", "openai/gpt-oss-120b");
const OR_MODELS = models("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free");
const OR_VISION_MODELS = models("OPENROUTER_VISION_MODEL", "google/gemini-2.0-flash-001");
async function withModels<T>(list: string[], fn: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const m of list) { overtime(); try { return await fn(m); } catch (e) { last = e; } }
  throw last;
}

let deadline = Infinity;
const overtime = () => { if (Date.now() > deadline) throw new Error("waktu habis (terlalu lama menunggu penyedia AI)"); };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- rotasi key ----------
const cursor: Record<string, number> = {};
async function withKeys<T>(name: string, fn: (key: string) => Promise<T>): Promise<T> {
  const list = keys(name);
  if (!list.length) throw new Error(`${name} kosong`);
  let last: unknown;
  const start = (cursor[name] = ((cursor[name] ?? -1) + 1) % list.length);
  for (let i = 0; i < list.length; i++) {
    const k = list[(start + i) % list.length];
    overtime();
    try { return await fn(k); } catch (e) { last = e; }
  }
  throw last;
}
async function post(url: string, body: unknown, headers: Record<string, string>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

// ---------- akses data (JWT user -> RLS tetap berlaku) ----------
function rest(jwt: string) {
  return async (path: string, all = false) => {
    const get = async (from: number, to: number) => {
      const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${jwt}`, Range: `${from}-${to}`, "Range-Unit": "items" } });
      if (!r.ok && r.status !== 206) throw new Error(`db ${r.status}`);
      return await r.json();
    };
    if (!all) return await get(0, 999);
    const out: any[] = [];   // PostgREST membatasi 1000 baris/permintaan -> ambil bertahap
    for (let i = 0; i < 50; i++) { const part = await get(i * 1000, i * 1000 + 999); out.push(...part); if (part.length < 1000) break; }
    return out;
  };
}
const q = (s: string) => encodeURIComponent(s.replace(/[(),*%]/g, " ").trim());

type Ctx = { kantor: string; tahun: number; db: (p: string, all?: boolean) => Promise<any>; lampiran: any[]; gambar: any[]; draf: any[] };

const SEL = { type: "string" };
const TOOLS = [
  { name: "siapkan_form_rekam", description: "Menampilkan FORM REKAM interaktif (sama seperti hasil unggah dokumen) berisi draf yang sudah terisi, lalu pengguna cek dan Simpan sendiri. WAJIB dipakai bila pengguna meminta merekam/mencatat/menginput kegiatan, kuitansi, nota, belanja, atau surat tugas lewat teks (mis. 'rekam kuitansi BBM 9 juta', 'catat belanja toner'). Jangan menulis langkah-langkah manual; panggil tool ini. jenis: 'kuitansi' (belanja/pembayaran ke penyedia) atau 'surat_tugas' (perjalanan dinas). Isi hanya yang disebut pengguna; kosongkan sisanya, jangan menebak. uraian = uraian kegiatan; jumlah_total = rupiah angka tanpa titik; penyedia = toko/penerima; tujuan = kabupaten/kota; provinsi_tujuan; tgl_mulai/tgl_selesai/tgl_bayar = YYYY-MM-DD; nomor_dokumen = nomor ST; mak_petunjuk = kode MAK atau akun 6 digit (toner/ATK = 521811); pelaksana = daftar nama.",
    parameters: { type: "object", properties: { jenis: { type: "string", enum: ["kuitansi", "surat_tugas"] }, uraian: SEL, jumlah_total: { type: "number" }, penyedia: SEL, tujuan: SEL, provinsi_tujuan: SEL, tgl_mulai: SEL, tgl_selesai: SEL, tgl_bayar: SEL, nomor_dokumen: SEL, mak_petunjuk: SEL, pelaksana: { type: "array", items: SEL } }, required: ["jenis"] } },
  { name: "buat_gambar", description: "Membuat/menghasilkan gambar (ilustrasi, poster, foto, logo, desain) dari deskripsi. Pakai bila pengguna meminta dibuatkan/digenerate gambar. prompt = deskripsi visual rinci DALAM BAHASA INGGRIS (subjek, suasana, gaya, warna, komposisi); terjemahkan permintaan pengguna. Gambar muncul otomatis di chat.",
    parameters: { type: "object", properties: { prompt: SEL }, required: ["prompt"] } },
  { name: "cari_kegiatan", description: "Cari/daftar kegiatan dengan filter bebas (semua opsional): kata (nama pelaksana/uraian/tujuan), akun (awalan kode akun mis. 524111, 5241, 52), seksi (nama seksi pemilik POK mis. Umum), status, sd (RM/PNBP), dari & sampai (tanggal mulai YYYY-MM-DD). Mengembalikan maks 25 baris + total jumlah & banyaknya.",
    parameters: { type: "object", properties: { kata: SEL, akun: SEL, seksi: SEL, status: SEL, sd: SEL, dari: SEL, sampai: SEL } } },
  { name: "buat_laporan", description: "Menyiapkan tabel yang bisa diunduh pengguna sebagai Excel/PDF (tombol muncul otomatis di chat). Pakai bila pengguna minta file/Excel/PDF/rekap/laporan/unduh. jenis: 'pok' = rincian per baris POK (pagu, realisasi, sisa), 'kegiatan' = daftar kegiatan, 'pelaksana' = peringkat pelaksana. Filter opsional sama seperti tool lain: kata, akun, seksi, sd, status, dari, sampai. judul = judul laporan. Untuk laporan peringkat (mis. '10 MAK dengan sisa terbanyak') isi urut ('sisa'|'pagu'|'realisasi'|'blokir') dan limit (N); tanpa itu semua baris dimuat urut kode.",
    parameters: { type: "object", properties: { jenis: SEL, judul: SEL, kata: SEL, akun: SEL, seksi: SEL, sd: SEL, status: SEL, dari: SEL, sampai: SEL, urut: SEL, limit: { type: "number" } }, required: ["jenis"] } },
  { name: "ringkasan_anggaran", description: "Pagu vs realisasi vs sisa. Untuk peringkat/'N MAK dengan sisa terbanyak/terkecil' isi urut ('sisa'|'pagu'|'realisasi'|'blokir') dan limit (N); hasil berupa rincian per baris POK yang SUDAH terurut dari terbesar (tambah arah='naik' untuk terkecil) — jawab langsung di chat dengan daftar tersebut. Filter opsional: kata (kata kunci uraian/kode POK, mis. 'printer', 'pemeliharaan', 'ATK' -> menyertakan rincian per baris POK dengan sisa masing-masing), akun (awalan kode akun, mis. 524111 untuk perjadin biasa, 524113 perjadin paket meeting, 5241 semua perjadin, 52 belanja barang, 53 modal), seksi, sd (RM/PNBP). Selalu menyertakan rincian per sumber dana dan per seksi.",
    parameters: { type: "object", properties: { kata: SEL, akun: SEL, seksi: SEL, sd: SEL, urut: SEL, arah: SEL, limit: { type: "number" } } } },
  { name: "peringkat_pelaksana", description: "Peringkat pegawai/pelaksana berdasarkan jumlah kegiatan dan total rupiah (mis. perjadin terbanyak). Filter opsional: akun, seksi, sd, dari, sampai.",
    parameters: { type: "object", properties: { akun: SEL, seksi: SEL, sd: SEL, dari: SEL, sampai: SEL } } },
  { name: "cek_sbm", description: "Cari Standar Biaya Masukan (SBM) dari PMK per tahun: uang harian perjalanan dinas, penginapan, tiket pesawat, transport, honorarium, konsumsi, uang makan, sewa kendaraan, dll. kata = kata kunci uraian/wilayah (mis. 'Bali', 'Denpasar', 'penginapan', 'Surabaya'); topik = kata kunci judul satuan biaya (mis. 'uang harian', 'penginapan', 'tiket pesawat'); tahun default tahun anggaran aktif. Hasil menyertakan judul tabel dan header kolom; urutan angka 'nilai' mengikuti header.",
    parameters: { type: "object", properties: { kata: SEL, topik: SEL, tahun: SEL } } },
  { name: "cek_pok", description: "Cari baris POK (kode, uraian, pagu, sumber dana, seksi) berdasarkan kata kunci; opsional filter seksi.",
    parameters: { type: "object", properties: { kata: SEL, seksi: SEL } } },
  { name: "baca_url", description: "Membaca isi halaman web/PDF dari sebuah URL (mis. peraturan, berita, hasil cari_web) dan mengembalikan teksnya. Pakai bila pengguna memberi tautan atau perlu isi lengkap sebuah halaman.",
    parameters: { type: "object", properties: { url: SEL }, required: ["url"] } },
  { name: "cari_web", description: "Cari informasi terkini di web (aturan, tarif, berita).",
    parameters: { type: "object", properties: { query: SEL }, required: ["query"] } },
];

const akunOf = (m: string) => (String(m || "").split(".").find((x) => /^\d{6}$/.test(x)) || "");
const nrm = (x: string) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Muat POK + kegiatan sekali per permintaan, tambahkan seksi & sumber dana ke tiap kegiatan.
async function loadAll(c: Ctx) {
  const base = `kantor_id=eq.${q(c.kantor)}&tahun=eq.${c.tahun}`;
  const pok = await c.db(`pok?select=kode,uraian,pagu,sd,seksi&${base}`, true);
  const keg = await c.db(`kegiatan?select=id,mak,uraian,pelaksana,tujuan,tgl_mulai,tgl_selesai,tgl_bayar,jumlah,sd,status&${base}`, true);
  const sdPok: Record<string, Set<string>> = {}, sksPok: Record<string, Set<string>> = {};
  for (const p of pok) {
    if (p.sd) (sdPok[p.kode] ||= new Set()).add(p.sd);
    if (p.seksi) (sksPok[p.kode] ||= new Set()).add(p.seksi);
  }
  const one = (st?: Set<string>) => (st && st.size === 1 ? [...st][0] : "");
  for (const k of keg) {
    k._akun = akunOf(k.mak);
    k._sd = k.sd || one(sdPok[k.mak]) || (/\(PNBP\)/i.test(k.uraian || "") ? "PNBP" : /\(RM\)/i.test(k.uraian || "") ? "RM" : "tidak_diketahui");
    k._seksi = one(sksPok[k.mak]) || "tidak_diketahui";
  }
  // Blokir per kode POK (tabel blokir: id = kode POK, nilai) — mengurangi sisa pagu
  const blk: Record<string, number> = {};
  try { for (const b of await c.db(`blokir?select=id,nilai&${base}`, true)) blk[b.id] = Number(b.nilai) || 0; } catch { /* tabel opsional */ }
  return { pok, keg, blk };
}
const okSeksi = (v: string, f?: string) => !f || nrm(v).includes(nrm(f));
const okAkun = (v: string, f?: string) => !f || String(v).startsWith(String(f).replace(/\D/g, ""));

// Rincian per baris POK: pagu, realisasi (kegiatan ber-MAK = kode POK), sisa.
async function rincianPok(c: Ctx, a: any) {
  const { pok, keg, blk } = await loadAll(c);
  const kata = nrm(a.kata || ""), sdF = a.sd ? String(a.sd).toUpperCase() : "";
  const real: Record<string, { total: number; byr: number; n: number }> = {};
  for (const k of keg) { const o = (real[k.mak] ||= { total: 0, byr: 0, n: 0 }); const j = Number(k.jumlah) || 0; o.total += j; o.n++; if (k.status === "Terbayar" || k.status === "Selesai") o.byr += j; }
  const rows = pok.filter((p: any) => okAkun(akunOf(p.kode), a.akun) && okSeksi(p.seksi || "", a.seksi) && (!sdF || p.sd === sdF) &&
    (!kata || nrm(`${p.kode} ${p.uraian}`).includes(kata)) && (Number(p.pagu) || 0) > 0)
    .map((p: any) => { const r = real[p.kode] || { total: 0, byr: 0, n: 0 }; const pagu = Number(p.pagu) || 0; const blokir = blk[p.kode] || 0;
      return { kode: p.kode, uraian: p.uraian, seksi: p.seksi || "", sd: p.sd || "", pagu, blokir, realisasi_total: r.total, realisasi_terbayar_selesai: r.byr, sisa_pagu: pagu - blokir - r.total, jumlah_kegiatan: r.n }; });
  const kolom: Record<string, string> = { sisa: "sisa_pagu", pagu: "pagu", realisasi: "realisasi_total", blokir: "blokir" };
  const uk = kolom[String(a.urut || "").toLowerCase()];
  if (uk) { const dir = String(a.arah || "").toLowerCase() === "naik" ? 1 : -1; rows.sort((x: any, y: any) => dir * (x[uk] - y[uk]) || String(x.kode).localeCompare(String(y.kode))); }
  else rows.sort((x: any, y: any) => String(x.kode).localeCompare(String(y.kode)));
  const lim = Math.floor(Number(a.limit) || 0);
  if (lim > 0) rows.splice(lim);
  const tot = rows.reduce((t: any, r: any) => ({ pagu: t.pagu + r.pagu, blokir: t.blokir + r.blokir, realisasi_total: t.realisasi_total + r.realisasi_total, realisasi_terbayar_selesai: t.realisasi_terbayar_selesai + r.realisasi_terbayar_selesai, sisa_pagu: t.sisa_pagu + r.sisa_pagu }), { pagu: 0, blokir: 0, realisasi_total: 0, realisasi_terbayar_selesai: 0, sisa_pagu: 0 });
  return { rows, tot };
}

async function cfImage(prompt: string) {
  const acc = env("CLOUDFLARE_ACCOUNT_ID");
  const errs: string[] = [];
  return await withModels(CF_IMAGE_MODELS, (model) => withKeys("CLOUDFLARE_KEYS", async (raw) => {
    // kunci boleh "TOKEN" (dengan CLOUDFLARE_ACCOUNT_ID) atau "ACCOUNT_ID:TOKEN"
    const [a1, a2] = raw.includes(":") ? raw.split(":") : [acc, raw];
    if (!a1) throw new Error("CLOUDFLARE_ACCOUNT_ID kosong");
    const body: Record<string, unknown> = { prompt };
    if (model.includes("flux")) body.steps = 4;
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${a1}/ai/run/${model}`, {
      method: "POST", headers: { Authorization: `Bearer ${a2}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok) throw new Error(`cloudflare ${r.status} ${(await r.text()).slice(0, 160)}`);
    if (ct.startsWith("image/")) {
      const buf = new Uint8Array(await r.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { mime: ct.split(";")[0], data: btoa(bin) };
    }
    const j = await r.json(); const img = j?.result?.image;
    if (!img) { errs.push(JSON.stringify(j).slice(0, 120)); throw new Error("respons tanpa gambar " + errs.join()); }
    return { mime: img.startsWith("/9j/") ? "image/jpeg" : "image/png", data: img };
  }));
}

async function runTool(name: string, a: any, c: Ctx): Promise<unknown> {
  if (name === "siapkan_form_rekam") {
    const jenis = a.jenis === "surat_tugas" ? "surat_tugas" : "kuitansi";
    const jml = Number(a.jumlah_total) || 0;
    const d: any = {
      jenis, ringkasan: "Dibuat dari permintaan Anda di chat. Periksa dan lengkapi sebelum menyimpan.",
      uraian: String(a.uraian || ""), penyedia: String(a.penyedia || ""), tujuan: String(a.tujuan || ""), provinsi_tujuan: String(a.provinsi_tujuan || ""),
      tgl_mulai: String(a.tgl_mulai || a.tgl_bayar || ""), tgl_selesai: String(a.tgl_selesai || a.tgl_mulai || a.tgl_bayar || ""), tgl_bayar: String(a.tgl_bayar || ""),
      nomor_dokumen: String(a.nomor_dokumen || ""), mak_petunjuk: String(a.mak_petunjuk || ""), jumlah_total: jml,
      pelaksana: (Array.isArray(a.pelaksana) ? a.pelaksana : []).map((n: string) => ({ nama: String(n), nip: "", jumlah: jenis === "kuitansi" ? jml : 0 })),
      catatan: "",
    };
    c.draf.push(await enrich(d, c));
    return { siap: true, catatan: "Form rekam sudah tampil untuk pengguna. Cukup satu kalimat singkat (minta cek isian lalu Simpan, sebut apa yang masih perlu dilengkapi). Jangan menulis ulang isi form atau langkah manual." };
  }
  if (name === "buat_gambar") {
    const prompt = String(a.prompt || "").trim().slice(0, 1500);
    if (!prompt) return { error: "prompt kosong" };
    try {
      const g = await cfImage(prompt);
      c.gambar.push({ ...g, prompt });
      return { siap: true, catatan: "Gambar sudah tampil untuk pengguna. Jangan menulis ulang prompt panjang; cukup satu-dua kalimat dan tawarkan revisi." };
    } catch (e) { return { error: "Gagal membuat gambar: " + String(e).slice(0, 200) }; }
  }
  if (name === "buat_laporan") {
    const judul = String(a.judul || "Laporan SiMAB");
    const meta = `Kantor ${c.kantor} · TA ${c.tahun}`;
    if (a.jenis === "pok") {
      const { rows, tot } = await rincianPok(c, a);
      c.lampiran.push({ judul, meta, kolom: ["Kode", "Uraian", "Seksi", "SD", "Pagu", "Blokir", "Realisasi Total", "Terbayar/Selesai", "Sisa Pagu"],
        baris: rows.map((r: any) => [r.kode, r.uraian, r.seksi, r.sd, r.pagu, r.blokir, r.realisasi_total, r.realisasi_terbayar_selesai, r.sisa_pagu]),
        total: ["", "TOTAL", "", "", tot.pagu, tot.blokir, tot.realisasi_total, tot.realisasi_terbayar_selesai, tot.sisa_pagu] });
      return { siap: true, baris: rows.length, total: tot, catatan: "Tabel siap; tombol unduh Excel/PDF muncul untuk pengguna. Jangan menulis ulang seluruh tabel di jawaban, cukup ringkasan." };
    }
    const { keg } = await loadAll(c);
    const kata = nrm(a.kata || "");
    const rows = keg.filter((k: any) => okAkun(k._akun, a.akun) && okSeksi(k._seksi, a.seksi) && (!a.sd || k._sd === String(a.sd).toUpperCase()) &&
      (!a.status || nrm(k.status) === nrm(a.status)) && (!a.dari || String(k.tgl_mulai || "") >= a.dari) && (!a.sampai || String(k.tgl_mulai || "") <= a.sampai) &&
      (!kata || nrm([k.pelaksana, k.uraian, k.tujuan, k.mak].join(" ")).includes(kata)));
    if (a.jenis === "pelaksana") {
      const m: Record<string, any> = {};
      for (const k of rows) { const n = String(k.pelaksana || "").trim() || "(kosong)"; const o = (m[n] ||= [n, 0, 0]); o[1]++; o[2] += Number(k.jumlah) || 0; }
      const baris = Object.values(m).sort((x: any, y: any) => y[1] - x[1] || y[2] - x[2]);
      c.lampiran.push({ judul, meta, kolom: ["Pelaksana", "Jumlah Kegiatan", "Total (Rp)"], baris, total: ["TOTAL", baris.reduce((t: number, r: any) => t + r[1], 0), baris.reduce((t: number, r: any) => t + r[2], 0)] });
      return { siap: true, baris: baris.length };
    }
    rows.sort((x: any, y: any) => String(x.tgl_mulai || "").localeCompare(String(y.tgl_mulai || "")));
    c.lampiran.push({ judul, meta, kolom: ["Tgl Mulai", "Tgl Selesai", "MAK", "Uraian", "Pelaksana", "Tujuan", "Jumlah", "Status", "SD", "Seksi"],
      baris: rows.map((k: any) => [k.tgl_mulai || "", k.tgl_selesai || "", k.mak, k.uraian, k.pelaksana, k.tujuan || "", Number(k.jumlah) || 0, k.status, k._sd, k._seksi]),
      total: ["", "", "", "", "", "TOTAL", rows.reduce((t: number, k: any) => t + (Number(k.jumlah) || 0), 0), "", "", ""] });
    return { siap: true, baris: rows.length, catatan: "Tabel siap; tombol unduh muncul untuk pengguna." };
  }
  const base = `kantor_id=eq.${q(c.kantor)}&tahun=eq.${c.tahun}`;
  if (name === "cari_kegiatan" || name === "peringkat_pelaksana") {
    const { keg } = await loadAll(c);
    const kata = nrm(a.kata || "");
    const rows = keg.filter((k: any) =>
      okAkun(k._akun, a.akun) && okSeksi(k._seksi, a.seksi) && (!a.sd || k._sd === String(a.sd).toUpperCase()) &&
      (!a.status || nrm(k.status) === nrm(a.status)) && (!a.dari || String(k.tgl_mulai || "") >= a.dari) && (!a.sampai || String(k.tgl_mulai || "") <= a.sampai) &&
      (!kata || nrm([k.pelaksana, k.uraian, k.tujuan, k.mak].join(" ")).includes(kata)));
    const total = rows.reduce((t: number, k: any) => t + (Number(k.jumlah) || 0), 0);
    if (name === "peringkat_pelaksana") {
      const m: Record<string, { pelaksana: string; kegiatan: number; total_rp: number }> = {};
      for (const k of rows) { const n = String(k.pelaksana || "").trim() || "(kosong)"; const o = (m[n] ||= { pelaksana: n, kegiatan: 0, total_rp: 0 }); o.kegiatan++; o.total_rp += Number(k.jumlah) || 0; }
      return { jumlah_kegiatan: rows.length, total_rp: total, peringkat: Object.values(m).sort((x, y) => y.kegiatan - x.kegiatan || y.total_rp - x.total_rp).slice(0, 15) };
    }
    rows.sort((x: any, y: any) => String(y.tgl_mulai || "").localeCompare(String(x.tgl_mulai || "")));
    return { jumlah_kegiatan: rows.length, total_rp: total, contoh: rows.slice(0, 25).map((k: any) => ({ mak: k.mak, uraian: k.uraian, pelaksana: k.pelaksana, tujuan: k.tujuan, mulai: k.tgl_mulai, jumlah: k.jumlah, status: k.status, sd: k._sd, seksi: k._seksi })) };
  }
  if (name === "ringkasan_anggaran" && (a.kata || a.urut || a.limit)) {
    const { rows, tot } = await rincianPok(c, a);
    return { filter: { kata: a.kata || "", urut: a.urut || "", limit: a.limit || "", akun: a.akun || "semua", seksi: a.seksi || "semua", sd: a.sd || "semua" }, jumlah_baris_pok: rows.length, total: tot,
      rincian: rows.slice(0, 25), catatan: rows.length > 25 ? "Hanya 25 baris pertama; tawarkan file Excel/PDF (buat_laporan jenis pok)." : "Realisasi per baris POK dihitung dari kegiatan ber-MAK sama dengan kode POK; realisasi_total = semua status; sisa_pagu = pagu - blokir - realisasi_total." };
  }
  if (name === "ringkasan_anggaran") {
    const { pok, keg, blk } = await loadAll(c);
    const sdF = a.sd ? String(a.sd).toUpperCase() : "";
    const mk = () => ({ pagu: 0, blokir: 0, realisasi_total: 0, realisasi_terbayar_selesai: 0, sisa_pagu: 0, jumlah_kegiatan: 0 });
    const tot = mk(), perSd: any = {}, perSeksi: any = {};
    const add = (o: any, pagu: number, real: number, byr: number, n: number, blokir = 0) => { o.pagu += pagu; o.blokir += blokir; o.realisasi_total += real; o.realisasi_terbayar_selesai += byr; o.jumlah_kegiatan += n; o.sisa_pagu = o.pagu - o.blokir - o.realisasi_total; };
    for (const p of pok) {
      if (!okAkun(akunOf(p.kode), a.akun) || !okSeksi(p.seksi || "", a.seksi) || (sdF && p.sd !== sdF)) continue;
      const g = Number(p.pagu) || 0;
      const bl = blk[p.kode] || 0;
      add(tot, g, 0, 0, 0, bl); add(perSd[p.sd || "tidak_diketahui"] ||= mk(), g, 0, 0, 0, bl); add(perSeksi[p.seksi || "tidak_diketahui"] ||= mk(), g, 0, 0, 0, bl);
    }
    for (const k of keg) {
      if (!okAkun(k._akun, a.akun) || !okSeksi(k._seksi, a.seksi) || (sdF && k._sd !== sdF)) continue;
      const j = Number(k.jumlah) || 0, b = k.status === "Terbayar" || k.status === "Selesai" ? j : 0;
      add(tot, 0, j, b, 1); add(perSd[k._sd] ||= mk(), 0, j, b, 1); add(perSeksi[k._seksi] ||= mk(), 0, j, b, 1);
    }
    return { filter: { akun: a.akun || "semua", seksi: a.seksi || "semua", sd: sdF || "semua" }, total: tot, per_sumber_dana: perSd, per_seksi: perSeksi,
      catatan: "sisa_pagu = pagu - blokir - realisasi_total. realisasi_total = jumlah semua kegiatan terekam (semua status), seperti di Dashboard; realisasi_terbayar_selesai hanya status Terbayar/Selesai. Kegiatan dikaitkan ke seksi lewat kode MAK = kode POK." };
  }
  if (name === "cek_sbm") {
    const th = Number(a.tahun) || c.tahun;
    const k = q(a.kata || ""), tp = q(a.topik || "");
    let tabs: any[] = await c.db(`sbm_tabel?select=lampiran,bab_no,sub_no,bab,sub,header,mata_uang&tahun=eq.${th}${tp ? `&or=(bab.ilike.*${tp}*,sub.ilike.*${tp}*)` : ""}&limit=60`);
    if (!tabs.length && tp) return { jumlah: 0, catatan: `Tidak ada satuan biaya bertopik "${a.topik}" untuk tahun ${th}.` };
    let flt = `tahun=eq.${th}`;
    if (tp) flt += `&or=(${tabs.map((t) => `and(lampiran.eq.${t.lampiran},bab_no.eq.${t.bab_no})`).join(",")})`;
    if (k) flt += `&or=(uraian.ilike.*${k}*,uraian2.ilike.*${k}*,kelompok.ilike.*${k}*)`;
    if (!k && !tp) return { catatan: "Beri kata kunci (kata) atau topik.", daftar_topik: (await c.db(`sbm_tabel?select=lampiran,bab_no,bab&tahun=eq.${th}&sub_no=eq.&order=lampiran,bab_no&limit=80`)).map((t: any) => `${t.lampiran}.${t.bab_no} ${t.bab}`) };
    const rows = await c.db(`sbm_baris?select=lampiran,bab_no,sub_no,kelompok,no,uraian,uraian2,satuan,nilai,mata_uang&${flt}&order=urut&limit=40`);
    const need = new Set(rows.map((r: any) => `${r.lampiran}|${r.bab_no}`));
    if (!tabs.length || !tp) tabs = await c.db(`sbm_tabel?select=lampiran,bab_no,sub_no,bab,sub,header,mata_uang&tahun=eq.${th}&limit=300`);
    const info = tabs.filter((t: any) => need.has(`${t.lampiran}|${t.bab_no}`)).map((t: any) => ({ tabel: `${t.lampiran}.${t.bab_no}${t.sub_no ? " (" + t.sub_no + ")" : ""}`, judul: t.bab + (t.sub ? " — " + t.sub : ""), header_kolom: t.header, mata_uang: t.mata_uang }));
    return { tahun: th, jumlah: rows.length, tabel: info, baris: rows.map((r: any) => ({ tabel: `${r.lampiran}.${r.bab_no}${r.sub_no ? "/" + r.sub_no : ""}`, kelompok: r.kelompok, uraian: r.uraian, uraian2: r.uraian2, satuan: r.satuan, nilai: r.nilai, mata_uang: r.mata_uang })),
      catatan: "Nilai mengikuti urutan kolom pada header_kolom tabelnya. Rupiah kecuali mata_uang=USD. Jika baris terpotong 40, minta pengguna mempersempit kata kunci." };
  }
  if (name === "cek_pok") {
    const k = q(a.kata || "");
    return await c.db(`pok?select=kode,uraian,pagu,sd,seksi&${base}&or=(kode.ilike.*${k}*,uraian.ilike.*${k}*)&limit=15`);
  }
  if (name === "baca_url") {
    const u = String(a.url || "").trim();
    if (!/^https?:\/\//i.test(u)) return { error: "URL harus diawali http:// atau https://" };
    try {
      const t = await withKeys("JINA_KEYS", async (key) => {
        const r = await fetch("https://r.jina.ai/" + u, { headers: { Authorization: `Bearer ${key}`, Accept: "text/plain", "X-Return-Format": "markdown" }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`jina ${r.status} ${(await r.text()).slice(0, 120)}`);
        return await r.text();
      });
      return { url: u, isi: t.slice(0, 7000), terpotong: t.length > 7000 };
    } catch (e) { return { error: "Gagal membaca halaman: " + String(e).slice(0, 200) }; }
  }
  if (name === "cari_web") {
    try {
      const r = await withKeys("TAVILY_KEYS", (key) => post("https://api.tavily.com/search", { api_key: key, query: a.query, max_results: 4 }, {}));
      return (r.results || []).map((x: any) => ({ judul: x.title, url: x.url, isi: String(x.content || "").slice(0, 400) }));
    } catch { /* lanjut ke penyedia berikutnya */ }
    try {
      const r = await withKeys("SERPER_KEYS", (key) => post("https://google.serper.dev/search", { q: a.query, gl: "id", hl: "id", num: 4 }, { "X-API-KEY": key }));
      return (r.organic || []).map((x: any) => ({ judul: x.title, url: x.link, isi: x.snippet }));
    } catch { /* lanjut */ }
    try {
      return await withKeys("JINA_KEYS", async (key) => {
        const r = await fetch("https://s.jina.ai/?q=" + encodeURIComponent(String(a.query || "")), { headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "X-Respond-With": "no-content" }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`jina ${r.status}`);
        const j = await r.json();
        return (j.data || []).slice(0, 4).map((x: any) => ({ judul: x.title, url: x.url, isi: String(x.description || x.content || "").slice(0, 400) }));
      });
    } catch (e) { return { error: "Pencarian web gagal: " + String(e).slice(0, 160) }; }
  }
  return { error: "tool tidak dikenal" };
}

// ---------- chat dengan tool ----------
const SYSTEM = (c: Ctx) =>
  `Kamu Jarwo, asisten AI aplikasi SiMAB (Sistem Monitoring Anggaran Belanja) KPKNL. Jawab Bahasa Indonesia, singkat, jelas, sopan.
Kantor aktif: ${c.kantor}, tahun anggaran ${c.tahun}. Data kegiatan/POK ambil lewat tool; jangan mengarang angka. Format rupiah: Rp 1.234.567.
Perjadin = akun 524111/524113 (pakai akun="perjadin"). Seksi (mis. Umum) ada di POK; gunakan filter seksi pada ringkasan_anggaran. Jika sebuah filter tidak menemukan data, coba lagi tanpa filter atau lihat seksi_tersedia sebelum menyimpulkan data tidak ada.\nPerjadin = akun 524111 (biasa) dan 524113 (paket meeting); akun 5241 mencakup keduanya. "Seksi" adalah pemilik baris POK (mis. Umum). Bila diminta file/Excel/PDF/rekap/laporan, panggil buat_laporan (tombol unduh muncul otomatis; jangan menulis ulang tabel panjang). Gunakan filter tool (akun, seksi, sd, tanggal) alih-alih meminta pengguna mengunggah dokumen untuk pertanyaan data; bila tool mengembalikan kosong, sebutkan filter yang dipakai dan tawarkan alternatif. Untuk pertanyaan SBM/tarif (uang harian, penginapan, tiket, transport, honor, konsumsi, dll.) gunakan tool cek_sbm (data PMK SBM per tahun di SiMAB), jangan cari_web; sebutkan tahun & kolom yang dipakai. MAK perjadin 524111/524113 melalui status Rekam Data → Terlaksana → LPT → Terbayar → Selesai; MAK lain tanpa LPT.
Jangan menyebut nama model/penyedia AI yang kamu pakai (kamu tidak tahu pasti); jika ditanya, jawab bahwa kamu Jarwo, asisten AI SiMAB, dan modelnya dapat berganti-ganti. Untuk pertanyaan angka anggaran, sebutkan definisi (pagu, realisasi total vs terbayar/selesai) dan bila ada bagian "tidak_diketahui" sampaikan apa adanya.\nBila pengguna memberi tautan/URL atau butuh isi lengkap suatu halaman, gunakan baca_url. Bila diminta membuat/menggenerate gambar, panggil buat_gambar dengan prompt bahasa Inggris yang rinci. Jangan membuat gambar tokoh/karakter berhak cipta atau orang nyata tertentu.\nTulis rumus/perhitungan dengan teks biasa (mis. "Energi (kWh) = Daya (kW) × Waktu (jam)"), JANGAN memakai LaTeX atau tanda $ / \\( \\).\nKamu tidak menyimpan data sendiri. Bila pengguna meminta merekam/mencatat/menginput kuitansi, belanja, atau surat tugas lewat teks, panggil siapkan_form_rekam (form interaktif muncul, pengguna yang menekan Simpan); jangan menjelaskan langkah manual. Untuk dokumen berupa foto/PDF, pengguna bisa mengunggah lewat tombol lampiran.`;

async function chatGemini(msgs: any[], c: Ctx) {
  const contents = msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));
  const decl = [{ functionDeclarations: TOOLS }];
  for (let step = 0; step < 8; step++) {
    const r = await withModels(GEMINI_MODELS, (mdl) => withKeys("GEMINI_KEYS", (key) =>
      post(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent`,
        { systemInstruction: { parts: [{ text: SYSTEM(c) }] }, contents, tools: decl }, { "x-goog-api-key": key })));
    const parts = r.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((p: any) => p.functionCall);
    if (!calls.length) return parts.map((p: any) => p.text || "").join("").trim();
    contents.push({ role: "model", parts });
    const resp = [];
    for (const p of calls) {
      let out: unknown; try { out = await runTool(p.functionCall.name, p.functionCall.args || {}, c); } catch (e) { out = { error: String(e) }; }
      resp.push({ functionResponse: { name: p.functionCall.name, response: { result: out } } });
    }
    contents.push({ role: "user", parts: resp });
  }
  return "Maaf, saya belum bisa menyelesaikan pencarian itu.";
}

async function chatOpenAI(url: string, keyName: string, modelList: string[], msgs: any[], c: Ctx) {
  const m: any[] = [{ role: "system", content: SYSTEM(c) }, ...msgs.map((x) => ({ role: x.role, content: String(x.content) }))];
  const tools = TOOLS.map((t) => ({ type: "function", function: t }));
  for (let step = 0; step < 8; step++) {
    const r = await withModels(modelList, (model) => withKeys(keyName, (key) => post(url, { model, messages: m, tools }, { Authorization: `Bearer ${key}` })));
    const msg = r.choices?.[0]?.message;
    if (!msg?.tool_calls?.length) return String(msg?.content || "").trim();
    m.push(msg);
    for (const tc of msg.tool_calls) {
      let out: unknown;
      try { out = await runTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"), c); } catch (e) { out = { error: String(e) }; }
      m.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 6000) });
    }
  }
  return "Maaf, saya belum bisa menyelesaikan pencarian itu.";
}

async function chat(msgs: any[], c: Ctx) {
  const errs: string[] = [];
  const tries: [string, () => Promise<string>][] = [
    ["gemini", () => chatGemini(msgs, c)],
    ["groq", () => chatOpenAI("https://api.groq.com/openai/v1/chat/completions", "GROQ_KEYS", GROQ_MODELS, msgs, c)],
    ["openrouter", () => chatOpenAI("https://openrouter.ai/api/v1/chat/completions", "OPENROUTER_KEYS", OR_MODELS, msgs, c)],
  ];
  for (const [n, f] of tries) {
    if (!keys(n.toUpperCase() + "_KEYS").length) continue;
    try { return { reply: await f(), provider: n }; } catch (e) { errs.push(`${n}: ${String(e).slice(0, 120)}`); }
  }
  throw new Error("Semua penyedia AI gagal. " + errs.join(" | "));
}

// ---------- ekstraksi dokumen ----------
const EXTRACT_PROMPT = `Kamu membaca dokumen administrasi keuangan pemerintah Indonesia (foto/scan/PDF). Balas HANYA JSON valid tanpa markdown:
{
 "jenis": "surat_tugas" | "kuitansi" | "spby_spm_sp2d" | "lainnya",
 "ringkasan": "1 kalimat",
 "uraian": "uraian kegiatan/pekerjaan",
 "nomor_dokumen": "nomor surat lengkap persis seperti tertulis, mis. ST-1533/KNL.1401/2026", "tanggal_dokumen": "YYYY-MM-DD atau ''",
 "provinsi_tujuan": "provinsi tempat tujuan (surat tugas), mis. Bali",
 "jenis_perjalanan": "luar_kota (bawaan) | dalam_kota (bila tertulis perjalanan dinas dalam kota) | diklat (bila untuk pendidikan/pelatihan)",
 "tujuan": "HANYA nama kabupaten/kota tujuan, tanpa kata Kab./Kota/Kabupaten dan tanpa provinsi, mis. Badung (surat tugas)",
 "tgl_mulai": "YYYY-MM-DD", "tgl_selesai": "YYYY-MM-DD",
 "pelaksana": [{"nama":"", "nip":"", "jumlah": 0}],
 "penyedia": "nama toko/perusahaan/rekanan (kuitansi/invoice)",
 "jumlah_total": 0,
 "nomor_spm": "", "nomor_sp2d": "", "tgl_sp2d": "YYYY-MM-DD", "tgl_bayar": "YYYY-MM-DD",
 "mak_petunjuk": "kode MAK selengkap yang tertulis di dokumen (mis. 4798.ABA.002.005.B.524111); bila hanya akun, 6 digit (524111)",
 "catatan": "hal yang meragukan/tidak terbaca"
}
Panduan jenis: "kuitansi" mencakup kuitansi, nota, invoice, struk, faktur, DAN bukti pembayaran/transfer/QRIS/m-banking/e-wallet (isi penyedia = nama merchant/penerima, jumlah_total = nominal, tgl_bayar = tanggal transaksi, uraian = barang/jasa yang dibeli bila terlihat, jika tidak ada isi "Pembayaran kepada <merchant>"). Pakai "lainnya" hanya bila benar-benar bukan dokumen keuangan. Bila MAK tidak tertulis, isi mak_petunjuk dengan akun 6 digit yang paling mungkin: toner/tinta/kertas/ATK/alat tulis/bahan komputer dan printer = 521811; makanan/minuman/kudapan boleh dikosongkan (pengguna memilih).
Jumlah dalam rupiah angka tanpa titik. Kosongkan field yang tidak ada; jangan menebak.`;

function parseJson(t: string) {
  const s = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  return JSON.parse(s.slice(i, j + 1));
}

async function extract(file: { mime: string; data: string }, hint: string) {
  const errs: string[] = [];
  const text = EXTRACT_PROMPT + (hint ? `\nPetunjuk pengguna: ${hint}` : "");
  if (keys("GEMINI_KEYS").length) {
    try {
      const r = await withModels(GEMINI_EXTRACT_MODELS, (mdl) => withKeys("GEMINI_KEYS", (key) =>
        post(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent`,
          { contents: [{ parts: [{ text }, { inlineData: { mimeType: file.mime, data: file.data } }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0 } }, { "x-goog-api-key": key })));
      return { data: parseJson(r.candidates?.[0]?.content?.parts?.[0]?.text || "{}"), provider: "gemini" };
    } catch (e) { errs.push("gemini: " + String(e).slice(0, 120)); }
  }
  if (file.mime.startsWith("image/") && keys("OPENROUTER_KEYS").length) {
    try {
      const r = await withModels(OR_VISION_MODELS, (model) => withKeys("OPENROUTER_KEYS", (key) =>
        post("https://openrouter.ai/api/v1/chat/completions", { model, temperature: 0,
          messages: [{ role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: `data:${file.mime};base64,${file.data}` } }] }] },
          { Authorization: `Bearer ${key}` })));
      return { data: parseJson(r.choices?.[0]?.message?.content || "{}"), provider: "openrouter" };
    } catch (e) { errs.push("openrouter: " + String(e).slice(0, 120)); }
  }
  throw new Error("Gagal membaca dokumen. " + errs.join(" | "));
}

// ---------- pencocokan ----------
const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(dr|ir|drs|dra|s|se|sh|st|mm|msi|mh|m|si|ak|ca|sp|kom|sos)\b/g, " ").replace(/\s+/g, " ").trim();
function score(a: string, b: string) {
  const A = new Set(norm(a).split(" ").filter(Boolean)), B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((w) => B.has(w) && n++);
  return n / Math.max(A.size, B.size);
}


// Uang harian otomatis: tarif SBM provinsi tujuan x jumlah hari; PNS 100%, PPNPN 50%.
async function hitungUangHarian(d: any, c: Ctx) {
  const t1 = Date.parse(d.tgl_mulai), t2 = Date.parse(d.tgl_selesai);
  if (!isFinite(t1) || !isFinite(t2) || t2 < t1) throw new Error("tanggal tugas tidak terbaca");
  const hari = Math.round((t2 - t1) / 86400000) + 1;
  const jenis = d.jenis_perjalanan === "dalam_kota" ? 1 : d.jenis_perjalanan === "diklat" ? 2 : 0;
  const prov = String(d.provinsi_tujuan || "").trim();
  if (!prov) throw new Error("provinsi tujuan tidak terbaca");
  // sumber utama: tabel SBM per tahun (Lampiran I, 28.1); cadangan: tabel sbm lama
  let rows: { nama: string; nilai: number[] }[] = [];
  try {
    for (const th of [c.tahun, c.tahun - 1]) {
      const r = await c.db(`sbm_baris?select=uraian,nilai&tahun=eq.${th}&lampiran=eq.I&bab_no=eq.28&sub_no=eq.28.1&limit=100`);
      if (r.length) { rows = r.map((x: any) => ({ nama: x.uraian, nilai: x.nilai })); d.sbm_tahun = th; break; }
    }
  } catch { /* tabel belum ada */ }
  if (!rows.length) {
    const r = await c.db(`sbm?select=id,luar_kota,dalam_kota,diklat&limit=100`);
    rows = r.map((x: any) => ({ nama: x.id, nilai: [Number(x.luar_kota), Number(x.dalam_kota), Number(x.diklat)] }));
    d.sbm_tahun = "tabel sbm";
  }
  const key = (x: string) => nrm(String(x).replace(/provinsi/gi, "").replace(/daerah istimewa/gi, "di").replace(/sumatera/gi, "sumatra").replace(/d\.?k\.?i\.?/gi, "dki").replace(/d\.?i\.?\s/gi, "di "));
  const pk = key(prov);
  let cand = rows.filter((r) => key(r.nama) === pk);
  if (!cand.length) cand = rows.filter((r) => key(r.nama).includes(pk) || pk.includes(key(r.nama)));
  if (!cand.length) throw new Error("provinsi '" + prov + "' tidak ada di tabel SBM");
  // kecocokan persis boleh berulang (data ganda): ambil yang pertama; kecocokan sebagian harus tunggal
  if (cand.length > 1 && key(cand[0].nama) !== pk) throw new Error("provinsi '" + prov + "' cocok dengan beberapa baris SBM: " + cand.slice(0, 4).map((r) => r.nama).join(", "));
  const best = cand[0];
  const tarif = Number(best.nilai?.[jenis]); if (!tarif) throw new Error("tarif kosong");
  d.uang_harian = { provinsi: best.nama, tarif, hari, jenis: ["luar kota", "dalam kota (>8 jam)", "diklat"][jenis], sumber: d.sbm_tahun };
  d.pelaksana = (d.pelaksana || []).map((p: any) => {
    const ppnpn = p.kepeg === "0";
    const persen = ppnpn ? 0.5 : 1;
    return { ...p, jumlah_dokumen: p.jumlah || 0, jumlah: Math.round(tarif * hari * persen),
      hitung: `${tarif.toLocaleString("id-ID")} × ${hari} hari × ${persen * 100}% (${p.kepeg === "1" ? "PNS" : ppnpn ? "PPNPN" : "status tidak diketahui, dihitung penuh"})` };
  });
}

async function enrich(d: any, c: Ctx) {
  const pegawai = await c.db(`pegawai?select=id,nama,kepeg&kantor_id=eq.${q(c.kantor)}&limit=1000`);
  let rekanan: any[] = [];
  try { rekanan = await c.db(`rekanan?select=id,nama&kantor_id=eq.${q(c.kantor)}&limit=1000`); } catch { /* tabel opsional */ }
  d.pelaksana = (d.pelaksana || []).map((p: any) => {
    let best: any = null, bs = 0;
    for (const x of pegawai) { const s = p.nip && String(p.nip).replace(/\D/g, "") === x.id ? 1 : score(p.nama, x.nama); if (s > bs) { bs = s; best = x; } }
    return { ...p, cocok: bs >= 0.6 ? best.nama : null, cocok_skor: Math.round(bs * 100) / 100, kepeg: bs >= 0.6 ? String(best.kepeg ?? "") : "" };
  });
  if (d.jenis === "surat_tugas") { try { await hitungUangHarian(d, c); } catch (e) { d.catatan = ((d.catatan || "") + " Uang harian tidak dihitung otomatis: " + String(e).slice(0, 120)).trim(); } }
  if (d.penyedia) {
    let best: any = null, bs = 0;
    for (const x of rekanan) { const s = score(d.penyedia, x.nama); if (s > bs) { bs = s; best = x; } }
    d.rekanan_cocok = bs >= 0.6 ? best.nama : null;
  }
  const makRaw = String(d.mak_petunjuk || "").trim();
  const mak = /\d+\.[A-Za-z]/.test(makRaw) ? makRaw.replace(/[^A-Za-z0-9.]/g, "") : makRaw.replace(/\D/g, "");
  const kata = String(d.uraian || "").split(" ").filter((w: string) => w.length > 3).slice(0, 3).join(" ");
  d.saran_mak = [];
  if (mak) {
    try { d.saran_mak = await c.db(`pok?select=kode,uraian,sd,pagu&kantor_id=eq.${q(c.kantor)}&tahun=eq.${c.tahun}&kode=like.*${mak}*&limit=8`); } catch { /* */ }
    if (!d.saran_mak.length && mak.includes(".")) {
      const akun = mak.split(".").pop() || "";
      try { d.saran_mak = await c.db(`pok?select=kode,uraian,sd,pagu&kantor_id=eq.${q(c.kantor)}&tahun=eq.${c.tahun}&kode=like.*${akun}*&limit=8`); } catch { /* */ }
    }
  }
  if (!d.saran_mak.length && kata) {
    try { d.saran_mak = await c.db(`pok?select=kode,uraian,sd,pagu&kantor_id=eq.${q(c.kantor)}&tahun=eq.${c.tahun}&uraian=ilike.*${q(kata.split(" ")[0])}*&limit=8`); } catch { /* */ }
  }
  return d;
}

Deno.serve(async (req: Request) => {
  deadline = Date.now() + 100_000;
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${jwt}` } });
    if (!jwt || !u.ok) return json({ error: "Belum login" }, 401);
    const b = await req.json();
    const c: Ctx = { kantor: String(b.kantor || ""), tahun: Number(b.tahun) || new Date().getFullYear(), db: rest(jwt), lampiran: [], gambar: [], draf: [] };
    if (!c.kantor) return json({ error: "kantor kosong" }, 400);

    if (b.mode === "extract") {
      if (!b.file?.data || !b.file?.mime) return json({ error: "file kosong" }, 400);
      if (b.file.data.length > 14_000_000) return json({ error: "File terlalu besar (maks ±10 MB)" }, 413);
      const r = await extract(b.file, String(b.hint || ""));
      return json({ draft: await enrich(r.data, c), provider: r.provider });
    }
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-12);
    if (!msgs.length) return json({ error: "pesan kosong" }, 400);
    const rr = await chat(msgs, c);
    return json({ ...rr, lampiran: c.lampiran, gambar: c.gambar, draf: c.draf });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
