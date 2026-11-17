// Jarwo — asisten AI SiMAB. Edge Function (Deno), tanpa dependensi.
// Secrets (Supabase > Edge Functions > Secrets), tiap key dipisah koma:
//   GEMINI_KEYS, GROQ_KEYS, OPENROUTER_KEYS, TAVILY_KEYS, SERPER_KEYS
// Opsional: GEMINI_MODEL, GROQ_MODEL, OPENROUTER_MODEL, OPENROUTER_VISION_MODEL
declare const Deno: any;

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const env = (k: string, d = "") => Deno.env.get(k) || d;
const keys = (k: string) => env(k).split(",").map((s) => s.trim()).filter(Boolean);
const GEMINI_MODEL = env("GEMINI_MODEL", "gemini-2.5-flash");
const GROQ_MODEL = env("GROQ_MODEL", "llama-3.3-70b-versatile");
const OR_MODEL = env("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free");
const OR_VISION = env("OPENROUTER_VISION_MODEL", "google/gemini-2.0-flash-001");

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
    try { return await fn(k); } catch (e) { last = e; }
  }
  throw last;
}
async function post(url: string, body: unknown, headers: Record<string, string>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

// ---------- akses data (JWT user -> RLS tetap berlaku) ----------
function rest(jwt: string) {
  return async (path: string) => {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) throw new Error(`db ${r.status}`);
    return await r.json();
  };
}
const q = (s: string) => encodeURIComponent(s.replace(/[(),*%]/g, " ").trim());

type Ctx = { kantor: string; tahun: number; db: (p: string) => Promise<any> };

const TOOLS = [
  { name: "cari_kegiatan", description: "Cari kegiatan/perjadin/pembayaran berdasarkan kata kunci (nama pelaksana, uraian, tujuan, MAK). Mengembalikan maks 15 baris.",
    parameters: { type: "object", properties: { kata: { type: "string" }, status: { type: "string", description: "Rekam Data/Terlaksana/LPT/Terbayar/Selesai" } }, required: ["kata"] } },
  { name: "ringkasan_anggaran", description: "Ringkasan pagu vs realisasi (jumlah kegiatan) per sumber dana RM/PNBP, opsional filter awalan kode akun/MAK.",
    parameters: { type: "object", properties: { awalan_kode: { type: "string" } } } },
  { name: "cek_pok", description: "Cari baris POK (kode, uraian, pagu, sumber dana) berdasarkan kata kunci.",
    parameters: { type: "object", properties: { kata: { type: "string" } }, required: ["kata"] } },
  { name: "cari_web", description: "Cari informasi terkini di web (aturan, tarif, berita).",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
];

async function runTool(name: string, a: any, c: Ctx): Promise<unknown> {
  const base = `kantor_id=eq.${q(c.kantor)}&tahun=eq.${c.tahun}`;
  if (name === "cari_kegiatan") {
    const k = q(a.kata || "");
    const st = a.status ? `&status=eq.${q(a.status)}` : "";
    return await c.db(`kegiatan?select=id,mak,uraian,pelaksana,tujuan,tgl_mulai,tgl_selesai,tgl_bayar,jumlah,status&${base}${st}` +
      `&or=(pelaksana.ilike.*${k}*,uraian.ilike.*${k}*,tujuan.ilike.*${k}*,mak.ilike.*${k}*)&order=tgl_mulai.desc&limit=15`);
  }
  if (name === "ringkasan_anggaran") {
    const aw = a.awalan_kode ? `&kode=like.${q(a.awalan_kode)}*` : "";
    const pok = await c.db(`pok?select=kode,pagu,sd&${base}${aw}&limit=5000`);
    const keg = await c.db(`kegiatan?select=mak,jumlah,sd&${base}&limit=5000`);
    const out: any = { RM: { pagu: 0, realisasi: 0 }, PNBP: { pagu: 0, realisasi: 0 } };
    for (const p of pok) if (out[p.sd]) out[p.sd].pagu += Number(p.pagu) || 0;
    for (const k of keg) {
      if (a.awalan_kode && !String(k.mak || "").includes(a.awalan_kode)) continue;
      if (out[k.sd]) out[k.sd].realisasi += Number(k.jumlah) || 0;
    }
    return out;
  }
  if (name === "cek_pok") {
    const k = q(a.kata || "");
    return await c.db(`pok?select=kode,uraian,pagu,sd&${base}&or=(kode.ilike.*${k}*,uraian.ilike.*${k}*)&limit=15`);
  }
  if (name === "cari_web") {
    try {
      const r = await withKeys("TAVILY_KEYS", (key) => post("https://api.tavily.com/search", { api_key: key, query: a.query, max_results: 4 }, {}));
      return (r.results || []).map((x: any) => ({ judul: x.title, url: x.url, isi: String(x.content || "").slice(0, 400) }));
    } catch {
      const r = await withKeys("SERPER_KEYS", (key) => post("https://google.serper.dev/search", { q: a.query, gl: "id", hl: "id", num: 4 }, { "X-API-KEY": key }));
      return (r.organic || []).map((x: any) => ({ judul: x.title, url: x.link, isi: x.snippet }));
    }
  }
  return { error: "tool tidak dikenal" };
}

// ---------- chat dengan tool ----------
const SYSTEM = (c: Ctx) =>
  `Kamu Jarwo, asisten AI aplikasi SiMAB (Sistem Monitoring Anggaran Belanja) KPKNL. Jawab Bahasa Indonesia, singkat, jelas, sopan.
Kantor aktif: ${c.kantor}, tahun anggaran ${c.tahun}. Data kegiatan/POK ambil lewat tool; jangan mengarang angka. Format rupiah: Rp 1.234.567.
MAK perjadin 524111/524113 melalui status Rekam Data → Terlaksana → LPT → Terbayar → Selesai; MAK lain tanpa LPT.
Kamu tidak menyimpan data sendiri; untuk merekam, minta pengguna mengunggah foto/PDF dokumen lewat tombol lampiran.`;

async function chatGemini(msgs: any[], c: Ctx) {
  const contents = msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));
  const decl = [{ functionDeclarations: TOOLS }];
  for (let step = 0; step < 5; step++) {
    const r = await withKeys("GEMINI_KEYS", (key) =>
      post(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        { systemInstruction: { parts: [{ text: SYSTEM(c) }] }, contents, tools: decl }, { "x-goog-api-key": key }));
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

async function chatOpenAI(url: string, keyName: string, model: string, msgs: any[], c: Ctx) {
  const m: any[] = [{ role: "system", content: SYSTEM(c) }, ...msgs.map((x) => ({ role: x.role, content: String(x.content) }))];
  const tools = TOOLS.map((t) => ({ type: "function", function: t }));
  for (let step = 0; step < 5; step++) {
    const r = await withKeys(keyName, (key) => post(url, { model, messages: m, tools }, { Authorization: `Bearer ${key}` }));
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
    ["groq", () => chatOpenAI("https://api.groq.com/openai/v1/chat/completions", "GROQ_KEYS", GROQ_MODEL, msgs, c)],
    ["openrouter", () => chatOpenAI("https://openrouter.ai/api/v1/chat/completions", "OPENROUTER_KEYS", OR_MODEL, msgs, c)],
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
 "nomor_dokumen": "", "tanggal_dokumen": "YYYY-MM-DD atau ''",
 "tujuan": "kota/lokasi tujuan (surat tugas)",
 "tgl_mulai": "YYYY-MM-DD", "tgl_selesai": "YYYY-MM-DD",
 "pelaksana": [{"nama":"", "nip":"", "jumlah": 0}],
 "penyedia": "nama toko/perusahaan/rekanan (kuitansi/invoice)",
 "jumlah_total": 0,
 "nomor_spm": "", "nomor_sp2d": "", "tgl_sp2d": "YYYY-MM-DD", "tgl_bayar": "YYYY-MM-DD",
 "mak_petunjuk": "kode akun 6 digit bila tertulis, mis. 524111",
 "catatan": "hal yang meragukan/tidak terbaca"
}
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
      const r = await withKeys("GEMINI_KEYS", (key) =>
        post(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
          { contents: [{ parts: [{ text }, { inlineData: { mimeType: file.mime, data: file.data } }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0 } }, { "x-goog-api-key": key }));
      return { data: parseJson(r.candidates?.[0]?.content?.parts?.[0]?.text || "{}"), provider: "gemini" };
    } catch (e) { errs.push("gemini: " + String(e).slice(0, 120)); }
  }
  if (file.mime.startsWith("image/") && keys("OPENROUTER_KEYS").length) {
    try {
      const r = await withKeys("OPENROUTER_KEYS", (key) =>
        post("https://openrouter.ai/api/v1/chat/completions", { model: OR_VISION, temperature: 0,
          messages: [{ role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: `data:${file.mime};base64,${file.data}` } }] }] },
          { Authorization: `Bearer ${key}` }));
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

async function enrich(d: any, c: Ctx) {
  const pegawai = await c.db(`pegawai?select=id,nama&kantor_id=eq.${q(c.kantor)}&limit=1000`);
  let rekanan: any[] = [];
  try { rekanan = await c.db(`rekanan?select=id,nama&kantor_id=eq.${q(c.kantor)}&limit=1000`); } catch { /* tabel opsional */ }
  d.pelaksana = (d.pelaksana || []).map((p: any) => {
    let best: any = null, bs = 0;
    for (const x of pegawai) { const s = p.nip && String(p.nip).replace(/\D/g, "") === x.id ? 1 : score(p.nama, x.nama); if (s > bs) { bs = s; best = x; } }
    return { ...p, cocok: bs >= 0.6 ? best.nama : null, cocok_skor: Math.round(bs * 100) / 100 };
  });
  if (d.penyedia) {
    let best: any = null, bs = 0;
    for (const x of rekanan) { const s = score(d.penyedia, x.nama); if (s > bs) { bs = s; best = x; } }
    d.rekanan_cocok = bs >= 0.6 ? best.nama : null;
  }
  const mak = String(d.mak_petunjuk || "").replace(/\D/g, "");
  const kata = String(d.uraian || "").split(" ").filter((w: string) => w.length > 3).slice(0, 3).join(" ");
  d.saran_mak = [];
  if (mak) {
    try { d.saran_mak = await c.db(`pok?select=kode,uraian,sd,pagu&kantor_id=eq.${q(c.kantor)}&tahun=eq.${c.tahun}&kode=like.*${mak}*&limit=8`); } catch { /* */ }
  }
  if (!d.saran_mak.length && kata) {
    try { d.saran_mak = await c.db(`pok?select=kode,uraian,sd,pagu&kantor_id=eq.${q(c.kantor)}&tahun=eq.${c.tahun}&uraian=ilike.*${q(kata.split(" ")[0])}*&limit=8`); } catch { /* */ }
  }
  return d;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${jwt}` } });
    if (!jwt || !u.ok) return json({ error: "Belum login" }, 401);
    const b = await req.json();
    const c: Ctx = { kantor: String(b.kantor || ""), tahun: Number(b.tahun) || new Date().getFullYear(), db: rest(jwt) };
    if (!c.kantor) return json({ error: "kantor kosong" }, 400);

    if (b.mode === "extract") {
      if (!b.file?.data || !b.file?.mime) return json({ error: "file kosong" }, 400);
      if (b.file.data.length > 14_000_000) return json({ error: "File terlalu besar (maks ±10 MB)" }, 413);
      const r = await extract(b.file, String(b.hint || ""));
      return json({ draft: await enrich(r.data, c), provider: r.provider });
    }
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-12);
    if (!msgs.length) return json({ error: "pesan kosong" }, 400);
    return json(await chat(msgs, c));
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
