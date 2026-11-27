/**
 * Halaman Monitoring User (admin kantor & superadmin)
 * - Entry point: initMonitoringPage()  (PAGE_INIT.monitoring)
 * - Data: tabel 'sesi_user' (heartbeat dari js/monitoring-heartbeat.js) + 'pegawai'.
 * - Online = aktif_terakhir < 2,5 menit lalu dan belum menandai keluar.
 */
const MN_BATAS_ONLINE_MS = 150000;
let mnData = [];
let mnTimer = null;
let mnMuatSeq = 0;

function mnEsc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function mnTgl(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '-';
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function mnLalu(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    return Math.floor(s / 86400) + ' hari lalu';
}
function mnStatus(r) {
    if (!r.aktif_terakhir) return 'never';
    const umur = Date.now() - new Date(r.aktif_terakhir).getTime();
    return (!r.keluar_pada && umur < MN_BATAS_ONLINE_MS) ? 'on' : 'off';
}

async function mnMuat(manual) {
    const seq = ++mnMuatSeq;
    const kantor = (window.getKantorAktif && window.getKantorAktif()) || '';
    try {
        await (window.waitSupabaseAuthReady ? window.waitSupabaseAuthReady() : Promise.resolve());
        const [pg, ss] = await Promise.all([
            sb.from('pegawai').select('id,nama,jabatan,status').eq('kantor_id', kantor).order('nama').limit(2000),
            sb.from('sesi_user').select('*').eq('kantor_id', kantor).limit(2000)
        ]);
        if (seq !== mnMuatSeq || !document.getElementById('mn-body')) return;
        if (ss.error) {
            document.getElementById('mn-body').innerHTML = `<tr><td colspan="6" class="text-center py-8" style="color:#b91c1c">Tabel belum siap. Jalankan <b>supabase-monitoring-user.sql</b> di Supabase SQL Editor.<br><span style="color:#6e6e73;font-size:12px">${mnEsc(ss.error.message)}</span></td></tr>`;
            document.getElementById('mn-sub').textContent = 'Tabel sesi_user belum tersedia';
            return;
        }
        const peta = new Map((ss.data || []).map(r => [String(r.nip), r]));
        const gabung = [];
        (pg.data || []).forEach(p => {
            if (p.status && /nonaktif|tidak aktif|pensiun|pindah/i.test(p.status)) { if (!peta.has(String(p.id))) return; }
            const s = peta.get(String(p.id)) || {};
            gabung.push({ nip: String(p.id), nama: p.nama || s.nama, jabatan: p.jabatan || s.jabatan, ...s });
            peta.delete(String(p.id));
        });
        peta.forEach(s => gabung.push({ ...s }));      // sesi tanpa baris pegawai (mis. superadmin)
        mnData = gabung;
        document.getElementById('mn-sub').textContent = `Diperbarui ${new Date().toLocaleTimeString('id-ID')} · otomatis tiap 30 detik`;
        mnRender();
    } catch (e) {
        console.error(e);
        const b = document.getElementById('mn-body');
        if (b) b.innerHTML = `<tr><td colspan="6" class="text-center py-8" style="color:#b91c1c">Gagal memuat data.</td></tr>`;
    }
}

function mnRender() {
    const body = document.getElementById('mn-body');
    if (!body) return;
    const q = (document.getElementById('mn-cari').value || '').trim().toLowerCase();
    const f = document.getElementById('mn-filter').value;
    const dua4 = Date.now() - 86400000;
    let on = 0, h24 = 0, belum = 0;
    mnData.forEach(r => {
        const st = mnStatus(r);
        if (st === 'on') on++;
        if (r.aktif_terakhir && new Date(r.aktif_terakhir).getTime() >= dua4) h24++;
        if (st === 'never') belum++;
    });
    document.getElementById('mn-k-on').textContent = on;
    document.getElementById('mn-k-24').textContent = h24;
    document.getElementById('mn-k-belum').textContent = belum;

    const urut = { on: 0, off: 1, never: 2 };
    const rows = mnData.filter(r => {
        const st = mnStatus(r);
        if (f === 'online' && st !== 'on') return false;
        if (f === '24j' && !(r.aktif_terakhir && new Date(r.aktif_terakhir).getTime() >= dua4)) return false;
        if (f === 'belum' && st !== 'never') return false;
        return !q || (String(r.nama || '').toLowerCase().includes(q) || String(r.nip).includes(q));
    }).sort((a, b) => urut[mnStatus(a)] - urut[mnStatus(b)] || String(b.aktif_terakhir || '').localeCompare(String(a.aktif_terakhir || '')) || String(a.nama || '').localeCompare(String(b.nama || '')));

    if (!rows.length) { body.innerHTML = `<tr><td colspan="6" class="text-center py-8" style="color:#6e6e73">Tidak ada pegawai yang cocok. Ubah saringan ke "Semua pegawai" untuk melihat yang lain.</td></tr>`; return; }
    const label = { on: 'Online', off: 'Offline', never: 'Belum pernah login' };
    body.innerHTML = rows.map(r => {
        const st = mnStatus(r);
        return `<tr>
            <td><div style="font-weight:600">${mnEsc(r.nama || '-')}</div><div style="font-size:11.5px;color:#6e6e73"><span style="font-family:ui-monospace,Menlo,monospace">${mnEsc(r.nip)}</span>${r.jabatan ? ' · ' + mnEsc(r.jabatan) : ''}</div></td>
            <td><span class="mn-pill ${st}">${st === 'on' ? '<span class="mn-dot"></span>' : ''}${label[st]}</span></td>
            <td>${st === 'on' ? mnEsc(r.halaman || '-') : '<span style="color:#9ca3af">-</span>'}</td>
            <td>${r.login_terakhir ? mnEsc(mnTgl(r.login_terakhir)) : '-'}</td>
            <td>${r.aktif_terakhir ? mnEsc(mnTgl(r.aktif_terakhir)) + '<div style="font-size:11.5px;color:#6e6e73">' + mnLalu(r.aktif_terakhir) + '</div>' : '-'}</td>
            <td style="font-size:12px;color:#6e6e73">${mnEsc(r.perangkat || '-')}</td>
        </tr>`;
    }).join('');
}

function initMonitoringPage() {
    const boleh = localStorage.getItem('superadmin') === '1' || localStorage.getItem('admin') === '1';
    if (!boleh) {
        const app = document.getElementById('app');
        if (app) app.innerHTML = '<div class="text-center mt-10" style="color:#b91c1c">Halaman ini hanya untuk admin kantor dan superadmin.</div>';
        return;
    }
    if (mnTimer) clearInterval(mnTimer);
    mnMuat();
    mnTimer = setInterval(() => {
        if (!document.getElementById('mn-body')) { clearInterval(mnTimer); mnTimer = null; return; }
        if (document.visibilityState === 'visible') mnMuat();
    }, 30000);
}

window.initMonitoringPage = initMonitoringPage;
window.mnMuat = mnMuat;
window.mnRender = mnRender;
