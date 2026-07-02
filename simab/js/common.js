/**
 * Fungsi umum yang dipakai di banyak halaman.
 */

function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

function showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = "bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center animate-in slide-in-from-right-10";
    toast.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatRibuan(angka) {
    let v = String(angka).replace(/\D/g, "");
    return v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function generateIdUsulan() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 10; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

window.logout = logout;
window.showToast = showToast;
window.formatRibuan = formatRibuan;
window.generateIdUsulan = generateIdUsulan;
