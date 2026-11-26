// =====================================================================
// Apps Script MANDIRI SiMAB: hanya untuk unggah & baca PDF Surat Tugas (ST)
// ---------------------------------------------------------------------
// Cara pasang (sekali saja):
// 1) script.google.com > Proyek baru > hapus isi Code.gs > tempel SELURUH berkas ini.
// 2) Simpan. Klik Jalankan (fungsi: uji) sekali dan setujui izin Drive.
// 3) Deploy > Deployment baru > jenis "Aplikasi web":
//      Jalankan sebagai : Saya
//      Yang memiliki akses : Siapa saja
//    Klik Deploy, salin alamat yang berakhiran /exec, lalu kirim ke Claude.
//
// Berkas disimpan di folder "simab_doc" (dibuat bila belum ada) pada Drive
// pemilik skrip, dengan nama "ST_<nomor ST>.pdf" (ST yang sama = menimpa).
// =====================================================================
const NAMA_FOLDER = "simab_doc";

function folderDoc_() {
  const it = DriveApp.getFoldersByName(NAMA_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(NAMA_FOLDER);
}

function balas_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return balas_({ status: "success", message: "SiMAB ST siap." });
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    switch (data.action) {
      case "uploadStKegiatan": return uploadStKegiatan(data);
      case "getDokumenFileBase64": return getDokumenFileBase64(data);
      default: return balas_({ status: "error", message: "Action tidak ditemukan: " + data.action });
    }
  } catch (err) {
    return balas_({ status: "error", message: err.toString() });
  }
}

function uploadStKegiatan(data) {
  try {
    if (!data.fileData) return balas_({ status: "error", message: "File ST tidak ditemukan" });
    const nomor = String(data.nomorST || data.uraian || data.id || "ST").replace(/[\\\/:*?"<>|]/g, "-").trim();
    const fileName = "ST_" + nomor + ".pdf";
    const folder = folderDoc_();
    const lama = folder.getFilesByName(fileName);
    while (lama.hasNext()) lama.next().setTrashed(true); // timpa
    const blob = Utilities.newBlob(Utilities.base64Decode(data.fileData), "application/pdf", fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return balas_({ status: "success", link: "https://drive.google.com/file/d/" + file.getId() + "/view", fileName: fileName });
  } catch (err) {
    return balas_({ status: "error", message: err.toString() });
  }
}

function getDokumenFileBase64(data) {
  try {
    const m = String(data.link || "").match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) return balas_({ status: "error", message: "Link dokumen tidak valid." });
    const file = DriveApp.getFileById(m[1]);
    const blob = file.getBlob();
    return balas_({ status: "success", base64: Utilities.base64Encode(blob.getBytes()), fileName: file.getName(), mimeType: blob.getContentType() });
  } catch (err) {
    return balas_({ status: "error", message: "Gagal membuka dokumen: " + err.toString() });
  }
}

// Jalankan sekali dari editor agar Google meminta izin Drive.
function uji() {
  folderDoc_();
  Logger.log("Izin Drive OK, folder: " + NAMA_FOLDER);
}
