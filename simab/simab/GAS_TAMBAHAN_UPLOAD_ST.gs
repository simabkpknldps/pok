// =====================================================================
// TAMBAHAN Google Apps Script: unggah PDF Surat Tugas (ST) ke Drive
// ---------------------------------------------------------------------
// 1) Tempel fungsi di bawah ini ke proyek Apps Script SiMAB Anda.
// 2) Di doPost, tambahkan satu baris pada switch(data.action):
//      case 'uploadStKegiatan': return uploadStKegiatan(data);
//    (sesuaikan gaya pemanggilan dengan action upload lain yang sudah ada,
//     mis. uploadDokumenKegiatan).
// 3) Deploy > Kelola deployment > Edit > Versi baru > Deploy.
//
// Hasil: file tersimpan di folder "simab_doc" > "ST" (dibuat otomatis bila
// belum ada), dengan nama "<nomor ST> - <nama file asli>".
// Balasan: { status: 'success', link: '<url file>', fileId: '...' }
// =====================================================================
function uploadStKegiatan(data) {
  try {
    if (!data.fileData) throw new Error('fileData kosong');
    var induk = ambilFolderST_('simab_doc');
    var sub = ambilFolderST_('ST', induk);
    var nama = String(data.nomorST || data.uraian || data.id || 'ST').replace(/[\\\/:*?"<>|]/g, '-').trim();
    var asli = String(data.fileName || 'surat-tugas.pdf').replace(/[\\\/:*?"<>|]/g, '-');
    var blob = Utilities.newBlob(Utilities.base64Decode(data.fileData), 'application/pdf', nama + ' - ' + asli);
    var file = sub.createFile(blob);
    // Samakan dengan dokumen lain yang sudah ada: dapat dilihat lewat tautan.
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success', link: file.getUrl(), fileId: file.getId()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error', message: String(err && err.message || err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function ambilFolderST_(nama, induk) {
  var it = induk ? induk.getFoldersByName(nama) : DriveApp.getFoldersByName(nama);
  if (it.hasNext()) return it.next();
  return induk ? induk.createFolder(nama) : DriveApp.createFolder(nama);
}
