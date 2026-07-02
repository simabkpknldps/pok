// ============================================
// FUNGSI GAS BARU: updatePelaksanaKegiatan
// Tambahkan ini di file GAS Anda
// ============================================

// Masukkan function ini di dalam doPost switch case:
// case 'updatePelaksanaKegiatan': return updatePelaksanaKegiatan(data);

function updatePelaksanaKegiatan(data) {
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    const sheet = ss.getSheetByName("Data_Kegiatan_2026");
    
    // 1. HAPUS data lama dengan id kegiatan tertentu
    const oldIdKegiatan = data.idKegiatanLama; // ID kegiatan lama (untuk mencari baris yang akan dihapus)
    const rowsToDelete = [];
    
    const allData = sheet.getDataRange().getValues();
    
    for (let i = allData.length - 1; i >= 1; i--) {
      if (String(allData[i][0]) === String(oldIdKegiatan)) {
        rowsToDelete.push(i + 1); // append 1 karena array 0-indexed tapi sheet 1-indexed
      }
    }
    
    // Delete dari bawah ke atas agar index tidak berubah
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      sheet.deleteRow(rowsToDelete[i]);
    }
    
    Logger.log(`Deleted ${rowsToDelete.length} rows with old id: ${oldIdKegiatan}`);
    
    // 2. INSERT data baru untuk setiap pelaksana di tabel
    const pelaksanaList = data.pelaksanaData; // Array of {nama, tglMulai, tglSelesai, jumlah}
    
    if (!pelaksanaList || pelaksanaList.length === 0) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: "Tidak ada data pelaksana" })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    
    const today = new Date();
    const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy-MM-dd");
    
    // 3. INSERT baris baru untuk setiap pelaksana
    for (let j = 0; j < pelaksanaList.length; j++) {
      const p = pelaksanaList[j];
      const newIdKegiatan = generateRandomId(10); // Generate 10 digit alphanumerical
      
      const newRow = [
        newIdKegiatan,        // A: id kegiatan baru
        data.mak,             // B: MAK
        data.uraian,          // C: Uraian
        p.nama,               // D: Pelaksana Tugas
        data.tujuan,          // E: Tujuan
        data.tglSt,           // F: Tgl ST/ND
        p.tglMulai || "",     // G: Tgl Mulai
        p.tglSelesai || "",   // H: Tgl Selesai
        "",                   // I: (untuk formula)
        "",                   // J: (untuk formula)
        "", "",               // K, L: (akan di-set formula nanti)
        p.jumlah || "",       // M: Jumlah (atau estimasi)
        data.userLogin,       // N: User
        todayStr,             // O: Tgl Proses (yyyy-MM-dd)
        ""                    // P: (akan di-set formula)
      ];
      
      sheet.appendRow(newRow);
      const lastRow = sheet.getLastRow();
      
      // 4. SET FORMULA di K, L, P (sesuai dengan last row yang baru ditambah)
      // K: =IF(I{row}="",TODAY()-H{row},I{row}-H{row})
      sheet.getRange(lastRow, 11).setFormula(`=IF(I${lastRow}="",TODAY()-H${lastRow},I${lastRow}-H${lastRow})`);
      
      // L: =IF(AND(I{row}="",J{row}=""),0,IF(AND(I{row}<>"",J{row}=""),TODAY()-I{row},J{row}-I{row}))
      sheet.getRange(lastRow, 12).setFormula(`=IF(AND(I${lastRow}="",J${lastRow}=""),0,IF(AND(I${lastRow}<>"",J${lastRow}=""),TODAY()-I${lastRow},J${lastRow}-I${lastRow}))`);
      
      // P: =IF(Q{row}<>"","Selesai",IF(J{row}<>"","Terbayar",IF(I{row}<>"","LPT",IF(TODAY()-H{row}<0,"Rekam Data","Terlaksana"))))
      sheet.getRange(lastRow, 16).setFormula(`=IF(Q${lastRow}<>"","Selesai",IF(J${lastRow}<>"","Terbayar",IF(I${lastRow}<>"","LPT",IF(TODAY()-H${lastRow}<0,"Rekam Data","Terlaksana"))))`);
      
      // Format kolom M (Jumlah) sebagai number dengan separator
      sheet.getRange(lastRow, 13).setNumberFormat("#,##0");
    }
    
    Logger.log(`Inserted ${pelaksanaList.length} new rows`);
    
    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", message: `Berhasil menyimpan ${pelaksanaList.length} data pelaksana` })
    ).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    Logger.log("Error di updatePelaksanaKegiatan: " + err.toString());
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function generateRandomId(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ============================================
// JUGA TAMBAHKAN INI di GAS untuk load ref_pegawai:
// ============================================

function loadRefPegawai() {
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    const sheet = ss.getSheetByName("ref_pegawai");
    
    // Ambil kolom A dari baris 2 sampai terakhir
    const data = sheet.getRange("A2:A" + sheet.getLastRow()).getValues();
    const result = data.map(row => row[0]).filter(String);
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Tambahkan di doGet switch case:
// if (action === 'loadRefPegawai') {
//   return loadRefPegawai();
// }
