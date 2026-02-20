import multer, { diskStorage } from "multer";
import XLSX from "xlsx";
import csv from "csv-parser";
import { existsSync, mkdirSync, createReadStream, unlinkSync } from "fs";
import { join, extname } from "path";
import { query } from "../../config/db.js";
import config from "../../config.js";

const PAYCLASS_MAPPING = {
  1: config.databases.officers,
  2: config.databases.wofficers,
  3: config.databases.ratings,
  4: config.databases.ratingsA,
  5: config.databases.ratingsB,
  6: config.databases.juniorTrainee,
};

// ─── Multer setup ────────────────────────────────────────────────────────────

const storage = diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(process.cwd(), "uploads");
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "batch-adjustments-" + unique + extname(file.originalname));
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = [".xlsx", ".xls", ".csv"];
    const ext = extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error("Only .xlsx, .xls, and .csv files are allowed"));
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Normalise row keys: lowercase + spaces → underscores
function normalize(row) {
  const out = {};
  for (const key in row) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    out[key.trim().toLowerCase().replace(/\s+/g, "_")] = row[key];
  }
  return out;
}

// Stable fingerprint for deduplication
function rowSignature(row) {
  const sorted = Object.keys(row).sort();
  const norm = {};
  for (const k of sorted) {
    norm[k] = typeof row[k] === "string" ? row[k].trim() : row[k];
  }
  return JSON.stringify(norm);
}

function deduplicate(rows) {
  const seen = new Set();
  const cleaned = [];
  const duplicates = [];
  for (const row of rows) {
    const sig = rowSignature(row);
    if (!seen.has(sig)) {
      seen.add(sig);
      cleaned.push(row);
    } else duplicates.push(row);
  }
  return { cleaned, duplicates };
}

// Parse multi-sheet Excel file
function parseExcelFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const all = [];
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet]);
    all.push(...rows.map((r) => ({ ...r, _sourceSheet: sheet })));
  }
  return all;
}

// Parse CSV (single sheet)
function parseCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    createReadStream(filePath)
      .pipe(csv())
      .on("data", (d) => results.push(d))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

// Safe cleanup
function tryDelete(filePath) {
  try {
    if (filePath && existsSync(filePath)) unlinkSync(filePath);
  } catch (e) {
    console.warn("[cleanup] Could not delete temp file:", e.message);
  }
}

export const batchUpload = async (req, res) => {
  const test = await query(`SELECT DB_NAME() AS db`);
  console.log(test.recordset);
  let filePath = null;

  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    filePath = req.file.path;
    const fileExt = extname(req.file.originalname).toLowerCase();
    const createdBy = "SYSTEM"; // No auth — hardcoded or derive from a request header if needed

    // 1. Parse
    let rawData;
    if (fileExt === ".csv") {
      rawData = (await parseCSVFile(filePath)).map(normalize);
    } else {
      rawData = parseExcelFile(filePath).map(normalize);
    }

    rawData = (rawData || []).filter((r) => Object.keys(r).length > 0);
    if (!rawData.length)
      return res.status(400).json({ error: "File is empty or invalid" });

    // 2. Deduplicate
    const { cleaned, duplicates } = deduplicate(rawData);

    // 3. Fetch active employees from the master DB
    const empResult = await query(`
      SELECT Empl_id, gradelevel
      FROM dbo.hr_employees
      WHERE (DateLeft IS NULL OR DateLeft = '')
        AND (exittype IS NULL OR exittype = '')
    `);

    const empRows = empResult.recordset;
    const activeEmployeeSet = new Set(empRows.map((r) => r.Empl_id?.trim()));
    const employeeMap = new Map(
      empRows.map((e) => [e.Empl_id?.trim().toLowerCase(), e.gradelevel]),
    );

    // 4. Filter to active only + attach level
    const filtered = cleaned.filter((row) =>
      activeEmployeeSet.has(row.numb?.trim()),
    );

    for (const row of filtered) {
      const level = employeeMap.get(row.numb?.trim().toLowerCase());
      if (level) row.level = level.slice(0, 2);
    }

    // 5. Group by payclass
    const payclassMap = new Map();
    for (const row of filtered) {
      const pc = row.payclass;
      if (!payclassMap.has(pc)) payclassMap.set(pc, []);
      payclassMap.get(pc).push(row);
    }

    const results = {
      totalUniqueRecords: cleaned.length,
      inactive: cleaned.length - filtered.length,
      uploaded: 0,
      existing: 0,
      duplicates: duplicates.length,
    };

    // 6. Per-payclass lookups using cross-database queries (MSSQL three-part naming)
    const insertRecords = [];

    for (const [payclass, rows] of payclassMap.entries()) {
      const db = PAYCLASS_MAPPING[payclass];
      if (!db) {
        console.warn(
          `[adjustments] No DB mapping for payclass ${payclass}, skipping`,
        );
        continue;
      }

      const bpDescriptions = [
        ...new Set(rows.map((r) => r.bp?.toLowerCase().trim()).filter(Boolean)),
      ];
      if (!bpDescriptions.length) continue;

      // Build IN clause params as @p0, @p1, ...
      const paramNames = bpDescriptions.map((_, i) => `@p${i}`).join(", ");

      // Three-part name: [DatabaseName].[dbo].[TableName]
      const pcResult = await query(
        `SELECT
          e.PaymentType,
          e.elmDesc,
          e.perc,
          e.Status,
          p.*
        FROM [${db}].[dbo].[py_elementType] e
        LEFT JOIN [${db}].[dbo].[py_payperrank] p
          ON p.one_type = e.PaymentType
        WHERE LOWER(e.elmDesc) IN (${paramNames})`,
        bpDescriptions,
      );

      const payperrankMap = new Map();
      for (const ppr of pcResult.recordset) {
        payperrankMap.set(ppr.elmDesc?.toLowerCase().trim(), ppr);
      }

      for (const row of rows) {
        const ppr = payperrankMap.get(row.bp?.toLowerCase().trim());
        if (!ppr) continue;

        row.code = ppr.PaymentType;

        if (
          !row.bpm &&
          ppr.Status?.toLowerCase().trim() === "active" &&
          ppr.perc === "R"
        ) {
          row.bpm = ppr[`one_amount${row.level}`] || 0;
        }

        insertRecords.push({
          "Service Number": row.numb,
          "Payment Type": row.code,
          "Maker 1": "No",
          "Amount Payable": row.bpm,
          "Maker 2": "No",
          "Amount To Date": 0,
          "Payment Indicator": "T",
          "Number of Months": 1,
          _sourceSheet: row._sourceSheet || row._sourcesheet || "Sheet1",
        });
      }
    }

    // 7. Build multi-sheet output workbook
    const recordsBySheet = {};
    for (const record of insertRecords) {
      const sheet = record._sourceSheet || "Sheet1";
      if (!recordsBySheet[sheet]) recordsBySheet[sheet] = [];
      const { _sourceSheet, ...clean } = record;
      recordsBySheet[sheet].push(clean);
    }

    const outWorkbook = XLSX.utils.book_new();
    for (const [sheetName, records] of Object.entries(recordsBySheet)) {
      utils.book_append_sheet(
        outWorkbook,
        utils.json_to_sheet(records),
        sheetName,
      );
    }

    const buffer = XLSX.write(outWorkbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    tryDelete(filePath);

    return res.status(200).json({
      message: "Batch adjustment upload completed",
      summary: results,
      file: {
        filename: "payroll-adjustments.xlsx",
        data: buffer.toString("base64"),
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    tryDelete(filePath);
    console.error("[adjustments] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error processing adjustments",
      error: error.message,
    });
  }
};

export const template = (req, res) => {
  const sample = [
    {
      Numb: "NN001",
      Title: "Lt",
      Surname: "Dabrinze",
      "Other Names": "Nihinkea",
      BPC: "BP",
      BP: "REVISED CONSOLIDATED PAY",
      BPA: "TAXABLE PAYMENT",
      BPM: "237007.92",
      Payclass: "1",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sample);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payment-Adjustments-Sample");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=payment-adjustments_template.xlsx",
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.send(buffer);
};
