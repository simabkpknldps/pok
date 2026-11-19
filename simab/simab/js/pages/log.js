/**
 * Halaman Log Aktivitas (hanya superadmin)
 * - Entry point: initLogPage()  (dipanggil router lewat PAGE_INIT.log)
 * - Data: tabel Supabase 'log_aktivitas' (RLS: hanya superadmin yang bisa membaca).
 * - NIP di tabel berupa tautan -> popup detil user (data pegawai + ringkasan log).
 */

const LG_PAGE_SIZE = 200;
let lgRows = [];
let lgHasMore = false;
let lgLoading = false;

function lgEsc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function lgIsSuperadmin() {
    return localStorage.getItem('superadmin') === '1';
}

function lgTgl(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function lgIsoLokal(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function initLogPage() {
    const root = document.getElementById('lg-body');
    if (!root) return;
    const title = document.getElementById('page-title');
    if (title) title.innerText = 'Log Aktivitas';

    if (!lgIsSuperadmin()) {
        document.getElementById('lg-root').innerHTML =
            '<div class="text-center mt-10" style="color: var(--label-secondary);">Halaman ini hanya untuk superadmin.</div>';
        return;
    }

    const hariIni = new Date();
    const awal = new Date(); awal.setDate(awal.getDate() - 6);
    document.getElementById('lg-dari').value = lgIsoLokal(awal);
    document.getElementById('lg-sampai').value = lgIsoLokal(hariIni);

    document.getElementById('lg-btnTerapkan').onclick = () => lgMuat(true);
    document.getElementById('lg-btnRefresh').onclick = () => lgMuat(true);
    document.getElementById('lg-btnMore').onclick = () => lgMuat(false);
    document.getElementById('lg-search').oninput = lgRender;
    document.getElementById('lg-search').onkeydown = (e) => { if (e.key === 'Enter') lgRender(); };
    document.querySelectorAll('input[name="lg-aksi"]').forEach(r => r.onchange = () => lgMuat(true));

    const modal = document.getElementById('lg-modal');
    modal.onclick = (e) => { if (e.target === modal) lgTutupModal(); };
    if (!window._lgEscBound) { window._lgEscBound = true; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lgTutupModal(); }); }

    await lgMuat(true);
    lgMuatKpi();
}

function lgAksiTerpilih() {
    const r = document.querySelector('input[name="lg-aksi"]:checked');
    return r ? r.value : 'ALL';
}

async function lgMuat(reset) {
    if (lgLoading) return;
    lgLoading = true;
    const body = document.getElementById('lg-body');
    const count = document.getElementById('lg-count');
    if (reset) { lgRows = []; body.innerHTML = '<tr><td colspan="7" class="text-center p-8" style="color: var(--label-secondary);"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>'; }
    try {
        await waitSupabaseAuthReady();
        const dari = document.getElementById('lg-dari').value;
        const sampai = document.getElementById('lg-sampai').value;
        const aksi = lgAksiTerpilih();
        let q = sb.from('log_aktivitas').select('*').order('waktu', { ascending: false });
        if (dari) q = q.gte('waktu', new Date(dari + 'T00:00:00').toISOString());
        if (sampai) q = q.lte('waktu', new Date(sampai + 'T23:59:59.999').toISOString());
        if (aksi !== 'ALL') q = q.eq('aksi', aksi);
        const dari_i = lgRows.length;
        q = q.range(dari_i, dari_i + LG_PAGE_SIZE - 1);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        lgRows = lgRows.concat(data || []);
        lgHasMore = (data || []).length === LG_PAGE_SIZE;
        lgRender();
    } catch (e) {
        body.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-red-500">Gagal memuat log: ${lgEsc(e.message)}<br><span class="text-xs" style="color: var(--label-secondary);">Pastikan file supabase-log-aktivitas.sql sudah dijalankan di Supabase.</span></td></tr>`;
        count.textContent = '';
    } finally {
        lgLoading = false;
    }
}

async function lgMuatKpi() {
    try {
        const awal = new Date(); awal.setHours(0, 0, 0, 0);
        const { data, error } = await sb.from('log_aktivitas').select('nip,aksi').gte('waktu', awal.toISOString()).limit(5000);
        if (error) throw error;
        const rows = data || [];
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('lg-kpiLogin', rows.filter(r => r.aksi === 'login').length);
        set('lg-kpiUbah', rows.filter(r => ['rekam', 'ubah', 'hapus', 'simpan', 'dokumen'].includes(r.aksi)).length);
        set('lg-kpiUser', new Set(rows.map(r => r.nip).filter(Boolean)).size);
    } catch (e) { /* kartu tetap "–" */ }
}

function lgFiltered() {
    const kw = (document.getElementById('lg-search')?.value || '').trim().toLowerCase();
    if (!kw) return lgRows;
    return lgRows.filter(r => [r.nama, r.nip, r.ringkas, r.tabel, r.lokasi, r.ip, r.perangkat].some(v => String(v || '').toLowerCase().includes(kw)));
}

function lgRender() {
    const body = document.getElementById('lg-body');
    if (!body) return;
    const rows = lgFiltered();
    const total = document.getElementById('lg-kpiTotal');
    if (total) total.textContent = lgRows.length + (lgHasMore ? '+' : '');
    document.getElementById('lg-count').textContent = `Menampilkan ${rows.length} dari ${lgRows.length} baris dimuat`;
    document.getElementById('lg-btnMore').classList.toggle('hidden', !lgHasMore);

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="7" class="text-center p-8" style="color: var(--label-secondary);">Belum ada aktivitas pada rentang ini.</td></tr>';
        return;
    }
    body.innerHTML = rows.map(r => `
        <tr>
            <td class="whitespace-nowrap">${lgEsc(lgTgl(r.waktu))}</td>
            <td>
                <div class="font-semibold">${lgEsc(r.nama || '-')}</div>
                <div class="flex items-center gap-2 mt-0.5">
                    ${r.nip ? `<button class="lg-nip" data-nip="${lgEsc(r.nip)}" title="Lihat detil user">${lgEsc(r.nip)}</button>` : '<span style="color: var(--label-secondary);">-</span>'}
                </div>
            </td>
            <td><span class="lg-pill a-${lgEsc(r.aksi)}">${lgEsc(r.aksi)}</span></td>
            <td><div class="lg-ket" title="${lgEsc(r.ringkas || '')}">${lgEsc(r.ringkas || '-')}</div>${r.tabel && r.tabel !== 'sesi' ? `<div class="text-[11px] mt-0.5" style="color: var(--label-secondary);">${lgEsc(r.tabel)}</div>` : ''}</td>
            <td style="color: var(--label-secondary);">${lgEsc(r.perangkat || '-')}</td>
            <td><div>${lgEsc(r.lokasi || '-')}</div><div class="text-[11px] font-mono" style="color: var(--label-secondary);">${lgEsc(r.ip || '')}</div></td>
            <td class="text-right"><button class="btn-ios-secondary px-2.5 text-xs lg-detail" data-id="${lgEsc(r.id)}" style="height:30px;">Detil</button></td>
        </tr>`).join('');

    body.querySelectorAll('.lg-nip').forEach(b => b.onclick = () => lgBukaUser(b.dataset.nip));
    body.querySelectorAll('.lg-detail').forEach(b => b.onclick = () => lgBukaDetail(b.dataset.id));
}

function lgBukaModal(html) {
    document.getElementById('lg-modalBox').innerHTML = html;
    document.getElementById('lg-modal').classList.add('is-open');
}
function lgTutupModal() {
    const m = document.getElementById('lg-modal');
    if (m) m.classList.remove('is-open');
}
window.lgTutupModal = lgTutupModal;

function lgBukaDetail(id) {
    const r = lgRows.find(x => String(x.id) === String(id));
    if (!r) return;
    let json = '';
    try { json = r.detail ? JSON.stringify(r.detail, null, 2) : '(tidak ada rincian)'; } catch (e) { json = String(r.detail); }
    lgBukaModal(`
        <div class="flex items-start justify-between gap-3 mb-4">
            <div><div class="text-lg font-bold">Detil aktivitas</div><div class="text-xs" style="color: var(--label-secondary);">${lgEsc(lgTgl(r.waktu))}</div></div>
            <button onclick="lgTutupModal()" class="btn-ios-secondary w-9 h-9" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <dl class="lg-kv mb-4">
            <dt>Pengguna</dt><dd>${lgEsc(r.nama || '-')} (${lgEsc(r.nip || '-')})</dd>
            <dt>Aksi</dt><dd><span class="lg-pill a-${lgEsc(r.aksi)}">${lgEsc(r.aksi)}</span> ${lgEsc(r.tabel || '')}</dd>
            <dt>Keterangan</dt><dd>${lgEsc(r.ringkas || '-')}</dd>
            <dt>Halaman</dt><dd>${lgEsc(r.halaman || '-')}</dd>
            <dt>Perangkat</dt><dd>${lgEsc(r.perangkat || '-')}</dd>
            <dt>IP · Lokasi</dt><dd>${lgEsc(r.ip || '-')} · ${lgEsc(r.lokasi || '-')}</dd>
        </dl>
        <div class="text-xs font-semibold mb-1.5" style="color: var(--label-secondary);">Rincian data</div>
        <pre class="lg-json">${lgEsc(json)}</pre>`);
}

async function lgBukaUser(nip) {
    lgBukaModal('<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-xl" style="color: var(--label-secondary);"></i></div>');
    try {
        await waitSupabaseAuthReady();
        // Data pegawai (tanpa data rekening) + nama kantor + ringkasan log milik NIP ini.
        const [pg, lg, jml, lgn] = await Promise.all([
            sb.from('pegawai').select('id,nama,jabatan,pangkat,kepeg,kantor_id,status,admin,akses_menu,superadmin').eq('id', nip).maybeSingle(),
            sb.from('log_aktivitas').select('*').eq('nip', nip).order('waktu', { ascending: false }).limit(8),
            sb.from('log_aktivitas').select('id', { count: 'exact', head: true }).eq('nip', nip),
            sb.from('log_aktivitas').select('waktu,perangkat,ip,lokasi').eq('nip', nip).eq('aksi', 'login').order('waktu', { ascending: false }).limit(1)
        ]);
        const p = pg.data || {};
        let kantorNama = p.kantor_id || '-';
        if (p.kantor_id) {
            try {
                const k = await sb.from('kantor').select('nama').eq('id', p.kantor_id).maybeSingle();
                if (k.data && k.data.nama) kantorNama = `${k.data.nama} (${p.kantor_id})`;
            } catch (e) { /* pakai kode saja */ }
        }
        const akses = p.superadmin === '1' ? 'Superadmin' : (p.admin === '1' ? 'Admin' : (p.akses_menu === '1' ? 'Akses menu penuh' : 'Pengguna biasa'));
        const aktif = String(p.status) === '1' ? 'Aktif' : (String(p.status) === '0' ? 'Nonaktif' : '-');
        const lastLogin = (lgn.data && lgn.data[0]) || null;
        const riwayat = (lg.data || []).map(r => `
            <div class="flex items-start gap-2.5 py-2" style="border-top: 1px solid #eef0f3;">
                <span class="lg-pill a-${lgEsc(r.aksi)} mt-0.5">${lgEsc(r.aksi)}</span>
                <div class="flex-1 min-w-0"><div class="text-[13px]">${lgEsc(r.ringkas || '-')}</div><div class="text-[11px]" style="color: var(--label-secondary);">${lgEsc(lgTgl(r.waktu))}</div></div>
            </div>`).join('') || '<div class="text-sm py-2" style="color: var(--label-secondary);">Belum ada aktivitas.</div>';

        lgBukaModal(`
            <div class="flex items-start justify-between gap-3 mb-4">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold shrink-0" style="background:#dbeafe;color:#1e40af;">${lgEsc(String(p.nama || nip).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
                    <div class="min-w-0"><div class="text-lg font-bold leading-tight">${lgEsc(p.nama || '(tidak ada di data pegawai)')}</div><div class="text-xs font-mono" style="color: var(--label-secondary);">NIP ${lgEsc(nip)}</div></div>
                </div>
                <button onclick="lgTutupModal()" class="btn-ios-secondary w-9 h-9 shrink-0" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <dl class="lg-kv mb-5">
                <dt>Jabatan</dt><dd>${lgEsc(p.jabatan || '-')}</dd>
                <dt>Pangkat/Gol.</dt><dd>${lgEsc(p.pangkat || '-')}</dd>
                <dt>Status kepegawaian</dt><dd>${lgEsc(p.kepeg || '-')}</dd>
                <dt>Kantor</dt><dd>${lgEsc(kantorNama)}</dd>
                <dt>Status akun</dt><dd>${lgEsc(aktif)}</dd>
                <dt>Hak akses</dt><dd>${lgEsc(akses)}</dd>
                <dt>Total aktivitas</dt><dd>${lgEsc(jml.count ?? '-')}</dd>
                <dt>Login terakhir</dt><dd>${lastLogin ? lgEsc(lgTgl(lastLogin.waktu)) : '-'}</dd>
                <dt>Perangkat terakhir</dt><dd>${lastLogin ? lgEsc(lastLogin.perangkat || '-') : '-'}</dd>
                <dt>Lokasi terakhir</dt><dd>${lastLogin ? lgEsc((lastLogin.lokasi || '-') + (lastLogin.ip ? ' · ' + lastLogin.ip : '')) : '-'}</dd>
            </dl>
            <div class="text-xs font-semibold mb-1" style="color: var(--label-secondary);">Aktivitas terbaru</div>
            ${riwayat}`);
    } catch (e) {
        lgBukaModal(`<div class="text-center py-8 text-red-500">Gagal memuat detil user: ${lgEsc(e.message)}</div><div class="text-center"><button onclick="lgTutupModal()" class="btn-ios-secondary px-4 py-2 text-sm">Tutup</button></div>`);
    }
}

window.initLogPage = initLogPage;
