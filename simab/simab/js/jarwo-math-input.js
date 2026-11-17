/* =====================================================================
 * Kotak isian bisa hitung rumus (seperti Excel)
 * Contoh: =190000*3   →  570000
 *         =150000+40000-5000, =(2*150000)+75000, =570000/3
 *         Boleh pakai x atau × untuk kali, : atau ÷ untuk bagi.
 * Rumus dihitung saat tekan Enter / Tab / pindah kolom.
 *
 * Cara pasang: muat file ini sekali (setelah supabase-config.js), mis.
 *   <script src="js/jarwo-math-input.js"></script>
 * Berlaku otomatis untuk SEMUA kotak isian yang cocok dengan MATH_SELECTOR,
 * termasuk yang dibuat belakangan oleh chat Jarwo.
 * ===================================================================== */
(function () {
  // Kotak mana saja yang diberi fitur rumus.
  // Default: semua input angka. Kalau mau khusus Jarwo, ganti misalnya:
  //   '#jarwo-panel input[type=number], input[data-math]'
  const MATH_SELECTOR = 'input[type=number], input[data-math]';

  // ---------- Parser aman (tanpa eval) ----------
  function hitung(expr) {
    const s = String(expr)
      .replace(/^=/, '')
      .replace(/\s+/g, '')
      .replace(/[x×X]/g, '*')
      .replace(/[:÷]/g, '/')
      // 1.500.000 → 1500000 (titik ribuan gaya Indonesia)
      .replace(/\d{1,3}(?:\.\d{3})+(?![\d.])/g, (m) => m.replace(/\./g, ''))
      // koma desimal → titik
      .replace(/(\d),(\d)/g, '$1.$2');

    if (!/^[0-9+\-*/().%]+$/.test(s)) throw new Error('Karakter tidak dikenal');
    let i = 0;
    const peek = () => s[i];
    const eat = (c) => (s[i] === c ? (i++, true) : false);

    function angka() {
      const m = /^\d*\.?\d+/.exec(s.slice(i));
      if (!m) throw new Error('Angka diharapkan');
      i += m[0].length;
      let v = parseFloat(m[0]);
      if (eat('%')) v /= 100;
      return v;
    }
    function faktor() {
      if (eat('-')) return -faktor();
      if (eat('+')) return faktor();
      if (eat('(')) {
        const v = tambah();
        if (!eat(')')) throw new Error('Kurung tidak ditutup');
        return v;
      }
      return angka();
    }
    function kali() {
      let v = faktor();
      while (peek() === '*' || peek() === '/') {
        const op = s[i++];
        const r = faktor();
        if (op === '/' && r === 0) throw new Error('Dibagi nol');
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function tambah() {
      let v = kali();
      while (peek() === '+' || peek() === '-') {
        const op = s[i++];
        const r = kali();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    const hasil = tambah();
    if (i !== s.length || !isFinite(hasil)) throw new Error('Rumus tidak valid');
    return Math.round(hasil * 100) / 100; // 2 desimal maksimal
  }
  window.hitungRumus = hitung; // bisa dipakai di tempat lain juga

  // ---------- Siapkan kotak isian ----------
  // input type=number menolak karakter "=", "*" dll, jadi diubah ke text
  // dengan keyboard angka di HP.
  function siapkan(inp) {
    if (inp.dataset.mathReady) return;
    inp.dataset.mathReady = '1';
    if (inp.type === 'number') {
      inp.type = 'text';
      inp.inputMode = 'decimal';
    }
    if (!inp.title) inp.title = 'Bisa pakai rumus, mis. =190000*3';
  }

  function proses(inp) {
    const v = inp.value.trim();
    // Hitung hanya jika diawali "=" atau berisi operator di antara angka
    if (!v || !(/^=/.test(v) || /\d\s*[-+*/x×:÷]\s*[\d(]/.test(v))) return;
    try {
      const hasil = hitung(v);
      inp.value = hasil;
      inp.style.outline = '';
      inp.title = `${v} = ${hasil.toLocaleString('id-ID')}`;
      // beri tahu kode lain (total otomatis, validasi, dsb.)
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      inp.style.outline = '2px solid #dc2626';
      inp.title = 'Rumus salah: ' + e.message;
    }
  }

  const cocok = (t) => t && t.matches && t.matches(MATH_SELECTOR) || (t && t.dataset && t.dataset.mathReady);

  document.addEventListener('focusin', (e) => { if (cocok(e.target)) siapkan(e.target); }, true);
  document.addEventListener('blur', (e) => { if (cocok(e.target)) proses(e.target); }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && cocok(e.target) && /[-+*/x×:÷=]/.test(e.target.value)) {
      e.preventDefault(); // jangan langsung submit form sebelum dihitung
      proses(e.target);
    }
  }, true);

  // Siapkan juga kotak yang sudah ada / dibuat dinamis (form Jarwo)
  const scan = (root) => root.querySelectorAll && root.querySelectorAll(MATH_SELECTOR).forEach(siapkan);
  scan(document);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches(MATH_SELECTOR)) siapkan(n);
    scan(n);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();
