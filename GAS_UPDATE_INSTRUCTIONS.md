# 📝 INSTRUKSI UPDATE GAS untuk Modal Pelaksana Kegiatan

## ⚠️ PENTING: Update GAS Script Anda

Berikut adalah langkah-langkah untuk update Google Apps Script Anda:

---

## 1. UPDATE FUNCTION `doPost` - Tambahkan case baru

Buka GAS Anda dan cari function `doPost`. Di dalam switch case, tambahkan:

```javascript
case 'updatePelaksanaKegiatan': return updatePelaksanaKegiatan(data);
```

Sehingga switch case Anda menjadi:

```javascript
switch(data.action) {
    case 'login': return handleLogin(data.nip, data.password);
    case 'getDashboardData': return getDashboardData();
    case 'getPOKData': return ContentService.createTextOutput(JSON.stringify(getPOKData())).setMimeType(ContentService.MimeType.JSON);
    case 'simpanKegiatan': return simpanKegiatan(data);
    case 'updatePelaksanaKegiatan': return updatePelaksanaKegiatan(data);  // ← TAMBAHKAN INI
    default: 
        return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Action tidak ditemukan: " + data.action}))
          .setMimeType(ContentService.MimeType.JSON);
}
```

---

## 2. UPDATE FUNCTION `doGet` - Tambahkan case baru

Di function `doGet`, cari bagian switch/if statements dan tambahkan:

```javascript
if (action === 'loadRefPegawai') {
    return loadRefPegawai();
}
```

Sehingga menjadi:

```javascript
if (action === 'loadLokasi') {
    return loadLokasi();
}

if (action === 'loadRefPegawai') {
    return loadRefPegawai();  // ← TAMBAHKAN INI
}

if (action === 'getGasUrl') {
    // ... existing code
}
```

---

## 3. TAMBAHKAN FUNCTION-FUNCTION BARU

Copy dan paste function-function berikut di **akhir file GAS Anda** (setelah semua function existing):

```javascript
// ============================================
// FUNGSI BARU: updatePelaksanaKegiatan
// ============================================

function updatePelaksanaKegiatan(data) {
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    const sheet = ss.getSheetByName("Data_Kegiatan_2026");
    
    // 1. HAPUS data lama dengan id kegiatan tertentu
    const oldIdKegiatan = data.idKegiatanLama;
    const rowsToDelete = [];
    
    const allData = sheet.getDataRange().getValues();
    
    for (let i = allData.length - 1; i >= 1; i--) {
      if (String(allData[i][0]) === String(oldIdKegiatan)) {
        rowsToDelete.push(i + 1);
      }
    }
    
    // Delete dari bawah ke atas agar index tidak berubah
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      sheet.deleteRow(rowsToDelete[i]);
    }
    
    Logger.log(`Deleted ${rowsToDelete.length} rows with old id: ${oldIdKegiatan}`);
    
    // 2. INSERT data baru untuk setiap pelaksana di tabel
    const pelaksanaList = data.pelaksanaData;
    
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
      const newIdKegiatan = generateRandomId(10);
      
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
        "", "",               // K, L: (akan di-set formula)
        p.jumlah || "",       // M: Jumlah
        data.userLogin,       // N: User
        todayStr,             // O: Tgl Proses (yyyy-MM-dd)
        ""                    // P: (akan di-set formula)
      ];
      
      sheet.appendRow(newRow);
      const lastRow = sheet.getLastRow();
      
      // 4. SET FORMULA di K, L, P
      // K: =IF(I{row}="",TODAY()-H{row},I{row}-H{row})
      sheet.getRange(lastRow, 11).setFormula(`=IF(I${lastRow}="",TODAY()-H${lastRow},I${lastRow}-H${lastRow})`);
      
      // L: =IF(AND(I{row}="",J{row}=""),0,IF(AND(I{row}<>"",J{row}=""),TODAY()-I{row},J{row}-I{row}))
      sheet.getRange(lastRow, 12).setFormula(`=IF(AND(I${lastRow}="",J${lastRow}=""),0,IF(AND(I${lastRow}<>"",J${lastRow}=""),TODAY()-I${lastRow},J${lastRow}-I${lastRow}))`);
      
      // P: =IF(Q{row}<>"","Selesai",IF(J{row}<>"","Terbayar",IF(I{row}<>"","LPT",IF(TODAY()-H{row}<0,"Rekam Data","Terlaksana"))))
      sheet.getRange(lastRow, 16).setFormula(`=IF(Q${lastRow}<>"","Selesai",IF(J${lastRow}<>"","Terbayar",IF(I${lastRow}<>"","LPT",IF(TODAY()-H${lastRow}<0,"Rekam Data","Terlaksana"))))`);
      
      // Format kolom M (Jumlah) sebagai number
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
```

---

## 4. DEPLOY ULANG GAS

1. Klik **Deploy** → **New deployment**
2. Pilih **Type**: Web app
3. Pilih **Execute as**: (email Anda)
4. Pilih **Who has access**: Anyone
5. Klik **Deploy**
6. Copy URL baru dan update di file `v3_dashboard.html` (sessionStorage.setItem('realUrl', ...))

---

## ✅ HASIL

Setelah update:

- ✅ Tombol **Users icon** di tabel detil akan membuka modal "Pelaksana Kegiatan"
- ✅ Form akan menampilkan data kegiatan (read-only)
- ✅ Input pelaksana dengan autocomplete dari `ref_pegawai`
- ✅ Submit → Tambah row ke tabel dengan input Tgl Mulai, Tgl Selesai, Jumlah
- ✅ Button delete untuk hapus row
- ✅ **Simpan** → Delete data lama + Insert data baru untuk setiap pelaksana
- ✅ Generate 10 digit random ID untuk setiap baris
- ✅ Set formula di kolom K, L, P otomatis

---

## 🔍 TROUBLESHOOTING

| Masalah | Solusi |
|---------|--------|
| "Action tidak ditemukan" | Pastikan case `updatePelaksanaKegiatan` sudah di-add di doPost |
| "Tidak ada data pelaksana" | Pastikan sudah submit minimal 1 pelaksana sebelum simpan |
| Datalist tidak muncul | Cek apakah `loadRefPegawai` sudah di-add di doGet |
| Tidak bisa deploy | Pastikan punya authorization edit ke GAS script |

