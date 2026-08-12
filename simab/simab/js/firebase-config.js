/**
 * firebase-config.js
 * -----------------------------------------------------------------------
 * Inisialisasi koneksi ke Firebase (project: v4simab).
 *
 * Dipakai versi "compat" (bukan modular ES import) supaya cocok dengan gaya
 * kode SiMAB yang sekarang (script biasa, fungsi global, bukan ES module) —
 * jadi tidak perlu ubah semua file JS lain jadi type="module".
 *
 * WAJIB dimuat lewat <script> SETELAH 3 script CDN Firebase ini (taruh di
 * <head> atau paling atas <body>, SEBELUM script ini):
 *
 *   <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>
 *   <script src="js/firebase-config.js"></script>
 *
 * Setelah file ini jalan, tersedia 1 variabel global baru: `window.db`
 * (objek Firestore), dipakai oleh file lain nanti buat baca/tulis data,
 * mis: db.collection('kegiatan').get()
 * -----------------------------------------------------------------------
 */

const firebaseConfig = {
    apiKey: "AIzaSyDxNYS3ffqz1dxf0_KnEjXfuaB_tHMmO8Y",
    authDomain: "v4simab.firebaseapp.com",
    projectId: "v4simab",
    storageBucket: "v4simab.firebasestorage.app",
    messagingSenderId: "354390274071",
    appId: "1:354390274071:web:3acf7a5d6ff2be874c2c52"
};

firebase.initializeApp(firebaseConfig);
window.db = firebase.firestore();
