import multer, { diskStorage } from "multer";
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import csv from "csv-parser";
import { existsSync, mkdirSync, createReadStream, unlinkSync } from "fs";
import { join, extname } from "path";
import { query } from "../../config/db.js";
import config from "../config.js";

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
  const workbook = XLSX.readFile(filePath);
  const allData = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const sheetData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
    });

    if (!sheetData[1] || sheetData.length < 4) continue;

    const headers = sheetData[1]
      .map((h, i) => ({ key: String(h).trim(), index: i }))
      .filter(({ key }) => key !== "");

    const dataWithSheet = sheetData
      .slice(3)
      .filter((row) => row.some((cell) => cell !== ""))
      .map((row) => {
        const obj = {};
        headers.forEach(({ key, index }) => {
          obj[key] = row[index] ?? "";
        });
        obj._sourceSheet = sheetName;
        obj.bp = sheetName;
        return obj;
      });

    allData.push(...dataWithSheet);
  }

  return allData;
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

// Normalize string to datetime if possible, else return original
function normalizeDate(dateStr) {
  if (!dateStr || dateStr.trim() === "" || dateStr.trim().length !== 8)
    return null;
  const s = dateStr.trim();
  // expects yyyymmdd
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export const batchUpload = async (req, res) => {
  const test = await query(`SELECT DB_NAME() AS db`);
  let filePath = null;

  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    filePath = req.file.path;
    const fileExt = extname(req.file.originalname).toLowerCase();

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
    const paramNames = cleaned.map((_, i) => `@p${i}`).join(", ");


    // 3. Fetch active employees from the master DB
    const empResult = await query(
      `
      SELECT Empl_id, gradelevel, payrollclass, DateLeft, exittype
      FROM dbo.hr_employees
      WHERE Empl_id IN (${paramNames})
    `,
      cleaned.map((r) => String(r.service_number || "").trim()),
    );

    const empRows = empResult.recordset;

    const activeEmployeeSet = new Set(
      empRows
        .filter((r) => !Boolean(r.DateLeft?.trim()) && !Boolean(r.exittype?.trim()))
        .map((r) => r.Empl_id?.trim().toLowerCase()),
    );
    const inactiveEmployeeSet = new Set(
      empRows
        .filter((r) => Boolean(r.DateLeft?.trim()) || Boolean(r.exittype?.trim()))
        .map((r) => r.Empl_id?.trim().toLowerCase()),
    );
    const nonExistentSet = new Set(
      cleaned
        .filter((r) => r.service_number &&
          !activeEmployeeSet.has(String(r.service_number).trim().toLowerCase()) &&
          !inactiveEmployeeSet.has(String(r.service_number).trim().toLowerCase()))
        .map((r) => String(r.service_number).trim().toLowerCase())
    );


    const inactiveCount = inactiveEmployeeSet.size;

    // 4. Filter to active only + attach level
    const filtered = cleaned.filter((row) => {
      return (
        row.service_number &&
        activeEmployeeSet.has(String(row.service_number)?.trim().toLowerCase())
      );
    });

    const inactiveFiltered = cleaned.filter((row) => {
      return (
        row.service_number &&
        inactiveEmployeeSet.has(String(row.service_number)?.trim().toLowerCase())
      );
    });


    const nonExistentFiltered = cleaned.filter(r=> r.service_number &&  nonExistentSet.has(String(r.service_number)?.trim().toLowerCase()))

    const employeeMap = new Map(
      empRows.map((e) => [
        e.Empl_id?.trim().toLowerCase(),
        [e.gradelevel, e.payrollclass, e.DateLeft, e.exittype],
      ]),
    );

    for (const row of filtered) {
      const [level, payclass] = employeeMap.get(
        row.service_number?.trim().toLowerCase(),
      ) || [null, null];
      if (level) row.level = level.slice(0, 2);
      if (payclass) row.payclass = payclass;
    }

    for (const row of inactiveFiltered) {
      const [level, payclass, dateLeft, exittype] = employeeMap.get(
        row.service_number?.trim().toLowerCase(),
      ) || [null, null, null, null];
      if (level) row.level = level.slice(0, 2);
      if (payclass) row.payclass = payclass;
      if (dateLeft) row.dateLeft = new Date(normalizeDate(dateLeft));
      if (exittype) row.exittype = exittype;
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
      inactive: inactiveCount,
      computed: 0,
      non_exist: nonExistentSet.size,
      duplicates: duplicates.length,
    };

    // 6. Per-payclass lookups using cross-database queries (MSSQL three-part naming)
    const insertRecords = [];

    // Active employees first
    for (const [payclass, rows] of payclassMap.entries()) {
      const db = PAYCLASS_MAPPING[payclass];
      if (!db) {
        console.warn(
          `[adjustments] No DB mapping for payclass ${payclass}, skipping`,
        );
        continue;
      }

      const payHeadCode = [...new Set(rows.map((r) => r.bp))];

      // Build IN clause params as @p0, @p1, ...
      const paramNames = payHeadCode.map((_, i) => `@p${i}`).join(", ");

      // Three-part name: [DatabaseName].[dbo].[TableName]
      const pcResult = await query(
        `SELECT *
        FROM [${db}].[dbo].[py_payperrank]
        WHERE one_type IN (${paramNames})`,
        payHeadCode.map((bp) => bp.trim()),
      );

      const payperrankMap = new Map();

      for (const ppr of pcResult.recordset) {
        payperrankMap.set(`${ppr.one_type}`.trim(), ppr);
      }

      for (const row of rows) {
        const ppr = payperrankMap.get(row.bp.trim());

        // if (
        //   !row.amount &&
        //   ppr.Status.toLowerCase().trim() === "active" &&
        //   ppr.perc === "R"
        // ) {
        //   row.bpm = ppr[`one_amount${row.level}`] || 0;
        // }

        if (ppr && !row.amount) {
          row.amount = ppr[`one_amount${row.level}`] || 0;
        }

        const sourceSheet = row._sourceSheet || row._sourcesheet || "Sheet1";
        insertRecords.push({
          "SVC. No.": row.service_number,
          "Payment Type": row.bp,
          "Amount Payable": row.amount,
          "Payment Indicator": "T",
          Ternor: 1,
          "Pay Class": `${row.payclass}`,
          _sourceSheet: `${sourceSheet}-${row.payclass}`,
        });
      }

      if (insertRecords.length === 0) {
        continue;
      }
    }
    // Inactive employees go to a separate sheet with minimal info
    for (const row of inactiveFiltered) {
      const sourceSheet = row._sourceSheet || row._sourcesheet || "Sheet1";
      insertRecords.push({
        "SVC. No.": row.service_number,
        "Date Left": row.dateLeft || "N/A",
        "Exit Type": row.exittype || "N/A",
        "Pay Class": `${row.payclass}`,
        _sourceSheet: `${sourceSheet}-INACTIVE-${row.payclass}`,
      });
    }

    // Non Existent employees(possibly not yet entered into DB or typos) also go to a separate sheet
    for (const row of nonExistentFiltered) {
      insertRecords.push({
        "SVC. No.": row.service_number,
        "Rank": row.rank || "N/A",
        "Surname": row.surname || "N/A",
        "Other Names": row.other_names || "N/A",
        "Amount": row.amount || "N/A",
        _sourceSheet: `NONEXISTENT`,
      });
    }

    results.computed = activeEmployeeSet.size;

    // 7. Build multi-sheet output workbook
    const recordsBySheet = {};
    for (const record of insertRecords) {
      const sheetName = record._sourceSheet || "Sheet1";

      if (!recordsBySheet[sheetName]) {
        recordsBySheet[sheetName] = [];
      }

      // Remove _sourceSheet before adding to output
      const { _sourceSheet, ...cleanRecord } = record;
      recordsBySheet[sheetName].push(cleanRecord);
    }

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    for (const [sheetName, records] of Object.entries(recordsBySheet)) {
      if (!records.length) continue;
      const worksheet = workbook.addWorksheet(sheetName || "Sheet 1", {
        views: [{ state: "frozen", ySplit: 4 }], // Freeze first 4 rows
      });

      // Add main header - Row 1
      worksheet.mergeCells("A1:F1");
      const mainHeader = worksheet.getCell("A1");
      mainHeader.value = "Nigerian Navy (Naval Headquarters)";
      mainHeader.font = {
        name: "Arial",
        size: 13,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      mainHeader.alignment = { horizontal: "center", vertical: "middle" };
      mainHeader.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E78" }, // Dark navy blue
      };
      mainHeader.border = {
        bottom: { style: "thin", color: { argb: "FF000000" } },
      };
      worksheet.getRow(1).height = 22;

      // Add sub header - Row 2
      worksheet.mergeCells("A2:F2");
      const subHeader = worksheet.getCell("A2");
      subHeader.value = "CENTRAL PAY OFFICE, 23 POINT ROAD, APAPA";
      subHeader.font = {
        name: "Arial",
        size: 11,
        bold: true,
        color: { argb: "FF000000" },
      };
      subHeader.alignment = { horizontal: "center", vertical: "middle" };
      subHeader.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9D9D9" }, // Medium gray
      };
      subHeader.border = {
        bottom: { style: "thin", color: { argb: "FF000000" } },
      };
      worksheet.getRow(2).height = 18;

      // Empty row 3
      worksheet.getRow(3).height = 5;
      //headers comes from record

      const headers = Object?.keys(records[0]);

      const headerRow = worksheet.getRow(4);
      headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = {
          name: "Arial",
          size: 10,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2E5C8A" }, // Darker blue
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FFFFFFFF" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FFFFFFFF" } },
        };
      });
      headerRow.height = 19.5;

      //add records Array<Record<any,any>>

      let currentRowNumber = 5;

      records.forEach((record) => {
        const row = worksheet.getRow(currentRowNumber);

        headers.forEach((header, colIndex) => {
          const cell = row.getCell(colIndex + 1);
          cell.value = record[header];

          if (header === "Amount Payable" || header === "Amount To Date" || header === "Amount") {
            cell.numFmt = '"₦"#,##0.00';
            cell.alignment = { horizontal: "right", vertical: "middle" };
          }

          // Border for clean table look
          cell.font = { name: "Arial", size: 10 };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = {
            top: { style: "thin", color: { argb: "FFD3D3D3" } },
            left: { style: "thin", color: { argb: "FFD3D3D3" } },
            bottom: { style: "thin", color: { argb: "FFD3D3D3" } },
            right: { style: "thin", color: { argb: "FFD3D3D3" } },
          };
        });

        row.height = 18;
        currentRowNumber++;
      });

      // Add data validation
      // Payment Indicator column (D)
      worksheet.getCell("D5").dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"T,P"'],
        showErrorMessage: true,
        errorTitle: "Invalid Payment Indicator",
        error: "Please select T (Temporary) or P (Permanent)",
      };

      worksheet.columns.forEach((column) => {
        column.width = 18;
      });

      // worksheet.getColumn("Date Left").numFmt = "yyyy-mm-dd";
    }

    const buffer = await workbook.xlsx.writeBuffer();

    // Clean up file
    tryDelete(filePath);

    return res.status(200).json({
      message: "Batch adjustment upload completed",
      summary: results,
      file: {
        filename: "pay_head-adjustments.xlsx",
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

export const template = async (req, res) => {
  // Create sample data
  const sampleData = [
    {
      Serial: "01",
      Rank: "Lt",
      Surname: "Doe",
      "Other Names": "John",
      "Service Number": "NN/0022",
      Ships: "NN/KADA",
      Amount: 237093.45,
      Remarks: "Sample remark",
    },
  ];

  const workbook = new ExcelJS.Workbook();

  // Main WorkSheet(PT359)
  const worksheet = workbook.addWorksheet("PT359", {
    views: [{ state: "frozen", ySplit: 3 }], // Freeze first 3 rows
  });

  const columnWidths = [10, 10, 20, 25, 20, 20, 15, 25];
  columnWidths.forEach((width, i) => {
    worksheet.getColumn(i + 1).width = width;
  });
  // Add main header - Row 1
  worksheet.mergeCells("A1:H1");
  const mainHeader = worksheet.getCell("A1");
  mainHeader.value = "PERSONNEL ENTITLED TO SEAGOING ALLOWANCE* FOR THE MONTH ";
  mainHeader.font = {
    name: "Arial Narrow",
    size: 14,
    bold: true,
    underline: true,
  };
  mainHeader.alignment = { vertical: "middle" };
  mainHeader.width = 30;

  // Header Rows - Row 2

  const headerRow = worksheet.getRow(2);
  const headers = Object.keys(sampleData[0]);

  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;

    cell.font = {
      name: "Arial Narrow",
      size: 14,
      bold: true,
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });
  // headerRow.height = 19;

  // Sub header Row - Row 3 (etters a - j, for some reason)

  const subHeaderRow = worksheet.getRow(3);
  const subHeaders = ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)", "(h)"];

  subHeaders.forEach((subHeader, index) => {
    const cell = subHeaderRow.getCell(index + 1);

    cell.value = subHeader;
    cell.font = {
      name: "Arial Narrow",
      size: 14,
      bold: true,
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FFFFFFFF" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FFFFFFFF" } },
    };
  });
  subHeaderRow.height = 19.5;

  // Rest is Data Rows - Row 4 and below

  const data = Object.values(sampleData[0]);

  const dataRow = worksheet.getRow(4);

  data.forEach((value, index) => {
    const cell = dataRow.getCell(index + 1);
    cell.value = value;

    cell.font = { name: "Arial Narrow", size: 14 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD3D3D3" } },
      left: { style: "thin", color: { argb: "FFD3D3D3" } },
      bottom: { style: "thin", color: { argb: "FFD3D3D3" } },
      right: { style: "thin", color: { argb: "FFD3D3D3" } },
    };
  });
  dataRow.height = 22;

  // Instruction sheet

  const instructionsSheet = workbook.addWorksheet("Instructions");

  instructionsSheet.mergeCells("A1:D1");
  const instrHeader = instructionsSheet.getCell("A1");
  instrHeader.value =
    "INSTRUCTIONS FOR FILLING THE PAYHEAD ADJUSTMENTS TEMPLATE. (DELETE INSTRUCTIONS SHEET BEFORE UPLOADING)";
  instrHeader.font = { size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  instrHeader.alignment = { horizontal: "center", vertical: "middle" };
  instrHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  instructionsSheet.getRow(1).height = 25;
  instructionsSheet.getRow(2).height = 25;

  const instructions = [
    "1. Make sure each sheet name matches the payhead code in the system for correct mapping",
    "2. Do not modify the header rows (rows 1-3) or column names",
    "3. Fill data starting from row 4",
    "4. Serial: Serial Number (e.g., 1)",
    "5. Rank*: Valid Brief Rank (e.g., Lt, CDR, CAPT,  etc.)",
    "6. Surname*: Surname Of Personnel",
    "7. Other Names: Other Names of Personnel",
    "8. Service Number*: Employee service number (e.g., NN001)",
    "9. Ships: Name of ship/unit (e.g.,NNS KADA, NNS KANO, etc.)",
    "10. Amount*: Numeric value (e.g., 5000.00)",
    "11. Remarks: Further details if necessary",
    "12. All Asterisked (*) fields are mandatory",
  ];

  instructions.forEach((instruction, index) => {
    const cell = instructionsSheet.getCell(`A${index + 3}`);
    cell.value = instruction;
    cell.font = { name: "Arial", size: 11 };
    cell.alignment = { horizontal: "left", vertical: "middle" };
  });

  instructionsSheet.getColumn("A").width = 95;

  const buffer = await workbook.xlsx.writeBuffer();

  // Send file
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=payment-Adjustments_template.xlsx",
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.send(buffer);
};
