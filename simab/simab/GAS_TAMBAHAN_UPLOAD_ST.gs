// =====================================================================
// TAMBAHAN Google Apps Script: unggah PDF Surat Tugas (ST) ke Drive
// ---------------------------------------------------------------------
// Dipasang pada proyek Apps Script SiMAB versi "v3_supabase".
//
// 1) Tempel fungsi uploadStKegiatan di bawah ini (mis. tepat sesudah
//    fungsi uploadSpbyKegiatan). Fungsi ini memakai getSimabDocFolder_()
//    yang SUDAH ADA di script Anda (folder "simab_doc").
// 2) Di doPost > switch (data.action), tambahkan SATU baris ini, mis.
//    sesudah  case 'getDokumenFileBase64': ...
//        case 'uploadStKegiatan': return uploadStKegiatan(data);
// 3) Deploy > Kelola deployment > ikon pensil > Versi baru > Deploy.
//
// Nama file: "ST_<nomor ST>.pdf" (unggah ulang ST yang sama = menimpa).
// Balasan  : { status: 'success', link: 'https://drive.google.com/file/d/<id>/view' }
// =====================================================================
function uploadStKegiatan(data) {
  try {
    if (!data.fileData) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: "File ST tidak ditemukan" })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    const nomor = String(data.nomorST || data.uraian || data.id || "ST")
      .replace(/[\\\/:*?"<>|]/g, "-").trim();
    const fileName = "ST_" + nomor + ".pdf";

    const folder = getSimabDocFolder_();
    const lama = folder.getFilesByName(fileName);
    while (lama.hasNext()) lama.next().setTrashed(true); // timpa

    const blob = Utilities.newBlob(Utilities.base64Decode(data.fileData), "application/pdf", fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const link = "https://drive.google.com/file/d/" + file.getId() + "/view";

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", link: link, fileName: fileName })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
