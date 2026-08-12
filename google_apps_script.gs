/**
 * RED POINT HR / MEGA HR - GOOGLE APPS SCRIPT DATABASE BACKEND
 * Production Google Sheets Persistence API with Concurrency Locks & Data Validation
 * 
 * Instructions:
 * 1. Open Google Sheets -> Extensions -> Apps Script
 * 2. Paste this entire code into Code.gs
 * 3. Set SPREADSHEET_ID below to your actual Google Sheets ID (from the URL)
 * 4. Click Deploy -> New Deployment -> Select "Web app"
 * 5. Execute as: "Me", Who has access: "Anyone"
 * 6. Copy Web App URL into VITE_GOOGLE_SCRIPT_URL in .env.local / Vercel secrets
 */

// CENTRAL CONFIGURATION
var CONFIG = {
  SPREADSHEET_ID: "1_REPLACE_WITH_YOUR_ACTUAL_SPREADSHEET_ID_HERE", // Set your Google Spreadsheet ID
  DRIVE_FOLDER_ID: "", // Optional Google Drive Folder ID for uploaded files
  SHEETS: {
    EMPLOYEES: "employees",
    CANDIDATES: "candidates",
    PERFORMANCES: "performances",
    PAYROLL: "payroll_records_2026",
    ENTITIES: "corporate_entities",
    USERS: "users",
    AUDIT_LOGS: "audit_logs"
  },
  DEFAULT_ENTITY_ID: "",
  DEFAULT_ENTITY_NAME: ""
};

/**
 * Open Spreadsheet safely using explicit ID
 */
function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID && !CONFIG.SPREADSHEET_ID.includes("REPLACE")) {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (err) {
      console.warn("Could not open spreadsheet by ID. Fallback to active spreadsheet if bound.", err);
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Handle HTTP GET Requests (Fetch initial data load)
 */
function doGet(e) {
  var logHeader = "[doGet]";
  try {
    console.log(logHeader, "Initializing database read request...");
    initializeDatabase();
    var ss = getSpreadsheet();
    if (!ss) {
      throw new Error("Spreadsheet could not be opened. Check SPREADSHEET_ID configuration.");
    }
    
    var sheetsToFetch = [
      CONFIG.SHEETS.ENTITIES,
      CONFIG.SHEETS.EMPLOYEES,
      CONFIG.SHEETS.PERFORMANCES,
      CONFIG.SHEETS.USERS,
      CONFIG.SHEETS.AUDIT_LOGS,
      CONFIG.SHEETS.CANDIDATES,
      CONFIG.SHEETS.PAYROLL
    ];

    var result = {};

    sheetsToFetch.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        result[sheetName] = [];
        return;
      }
      var data = sheet.getDataRange().getValues();
      if (data.length <= 1) {
        result[sheetName] = [];
        return;
      }

      var headers = data[0].map(function(h) { return String(h).trim(); });
      var rows = [];
      for (var i = 1; i < data.length; i++) {
        var rowObj = {};
        var hasValue = false;
        for (var j = 0; j < headers.length; j++) {
          var val = data[i][j];
          rowObj[headers[j]] = val;
          if (val !== "" && val !== null && val !== undefined) {
            hasValue = true;
          }
        }
        if (hasValue) {
          rows.push(rowObj);
        }
      }
      result[sheetName] = rows;
    });

    console.log(logHeader, "Data load successful. Entity count:", (result.corporate_entities || []).length, "Employee count:", (result.employees || []).length);
    return responseJSON({ success: true, data: result });
  } catch (error) {
    console.error(logHeader, "Fatal error reading database:", error.toString(), error.stack);
    return responseJSON({ success: false, error: error.toString(), stack: error.stack });
  }
}

/**
 * Handle HTTP POST Requests (Create, Update, Delete, Upsert, File Upload, Diagnostics)
 */
function doPost(e) {
  var logHeader = "[doPost]";
  var lock = LockService.getScriptLock();
  
  try {
    // Acquire concurrency lock to prevent simultaneous write conflicts (Wait up to 30 seconds)
    var acquired = lock.waitLock(30000);
    if (!acquired) {
      throw new Error("Lock timeout: Another save operation is currently in progress. Please retry.");
    }

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Invalid request: Empty POST body content.");
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var data = payload.data || {};
    var sheetName = payload.sheetName;
    var entityId = payload.entityId || data.entityId || "";

    console.log(logHeader, "Action:", action, "| Sheet:", sheetName, "| Entity:", entityId, "| Key:", payload.keyName, "=", payload.keyValue);

    // 1. Diagnostics Action
    if (action === "diagnose") {
      var diagResults = runDiagnostics();
      return responseJSON({ success: true, diagnostics: diagResults });
    }

    // 2. File Upload Action
    if (action === "upload_file") {
      if (!CONFIG.DRIVE_FOLDER_ID) {
        throw new Error("DRIVE_FOLDER_ID is not configured in Apps Script CONFIG.");
      }
      var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
      var contentType = payload.contentType || "image/png";
      var blob = Utilities.newBlob(Utilities.base64Decode(payload.base64), contentType, payload.filename);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var fileUrl = "https://lh3.googleusercontent.com/d/" + file.getId() + "=s800";
      return responseJSON({ success: true, url: fileUrl });
    }

    // 2.5. Clear record data while preserving each sheet's header row.
    if (action === "clear_data") {
      var requestedSheets = Array.isArray(payload.sheetNames) ? payload.sheetNames : [];
      if (requestedSheets.length === 0) {
        throw new Error("Clear failed: sheetNames must contain at least one sheet.");
      }

      var allowedSheets = [
        CONFIG.SHEETS.ENTITIES,
        CONFIG.SHEETS.EMPLOYEES,
        CONFIG.SHEETS.USERS,
        CONFIG.SHEETS.CANDIDATES,
        CONFIG.SHEETS.PERFORMANCES,
        CONFIG.SHEETS.PAYROLL,
        CONFIG.SHEETS.AUDIT_LOGS
      ];
      var clearSs = getSpreadsheet();
      if (!clearSs) {
        throw new Error("Spreadsheet reference unavailable.");
      }

      var clearedSheets = [];
      requestedSheets.forEach(function(requestedSheetName) {
        if (allowedSheets.indexOf(requestedSheetName) === -1) {
          throw new Error("Clear failed: sheet is not an approved data sheet: " + requestedSheetName);
        }
        var clearSheet = clearSs.getSheetByName(requestedSheetName);
        if (!clearSheet) {
          return;
        }
        var lastRow = clearSheet.getLastRow();
        var lastColumn = clearSheet.getLastColumn();
        if (lastRow > 1 && lastColumn > 0) {
          clearSheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
        }
        clearedSheets.push(requestedSheetName);
      });
      SpreadsheetApp.flush();
      return responseJSON({ success: true, action: "clear_data", clearedSheets: clearedSheets });
    }

    initializeDatabase();
    var ss = getSpreadsheet();
    if (!ss) {
      throw new Error("Spreadsheet reference unavailable.");
    }

    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error("Target sheet not found: " + sheetName);
    }

    var allRows = sheet.getDataRange().getValues();
    var actualHeaders = allRows[0] || [];
    var normalizedHeaders = actualHeaders.map(function(h) { return String(h).trim().toLowerCase(); });

    if (actualHeaders.length === 0) {
      throw new Error("Sheet '" + sheetName + "' has no header row.");
    }

    var nowTimestamp = new Date().toISOString();

    // 3. ACTION: INSERT (Create new record)
    if (action === "insert") {
      validatePayload(sheetName, data, "insert");

      // Ensure Permanent Unique ID
      if (!data.id || String(data.id).trim() === "") {
        data.id = "REC-" + Utilities.getUuid().substring(0, 8).toUpperCase();
      }

      // Default Timestamps
      if (!data.createdAt && !data.created_at) {
        data.createdAt = nowTimestamp;
      }
      data.updatedAt = nowTimestamp;

      var newRow = actualHeaders.map(function(h) {
        var key = String(h).trim();
        return data[key] !== undefined ? data[key] : "";
      });

      sheet.appendRow(newRow);
      SpreadsheetApp.flush();

      console.log(logHeader, "Insert success for ID:", data.id, "in sheet:", sheetName);
      return responseJSON({ success: true, action: "insert", record: data });
    }

    // 4. ACTION: UPDATE (Edit existing record by Unique ID or Key)
    else if (action === "update") {
      var keyName = String(payload.keyName || "id").trim();
      var keyToFind = keyName.toLowerCase();
      var idColIndex = normalizedHeaders.indexOf(keyToFind);

      if (idColIndex === -1) {
        // Fallback search for 'id', 'email', or 'name'
        idColIndex = normalizedHeaders.indexOf("id");
        if (idColIndex === -1) idColIndex = normalizedHeaders.indexOf("email");
        if (idColIndex === -1) idColIndex = normalizedHeaders.indexOf("name");
      }

      if (idColIndex === -1) {
        throw new Error("Key column '" + keyName + "' not found in sheet '" + sheetName + "' headers.");
      }

      var searchVal = String(payload.keyValue).trim().toLowerCase();
      if (!searchVal) {
        throw new Error("Update failed: Search key value cannot be empty.");
      }

      var foundIndex = -1;
      for (var r = 1; r < allRows.length; r++) {
        var cellVal = String(allRows[r][idColIndex]).trim().toLowerCase();
        if (cellVal === searchVal) {
          foundIndex = r + 1; // 1-indexed row number
          break;
        }
      }

      if (foundIndex === -1) {
        throw new Error("Record not found for update matching " + keyName + " = '" + payload.keyValue + "' in sheet '" + sheetName + "'");
      }

      validatePayload(sheetName, data, "update");

      // Preserve original row data while applying updates
      var existingRowValues = allRows[foundIndex - 1];
      var updatedRecordObj = {};

      var updatedRow = actualHeaders.map(function(h, colIdx) {
        var colName = String(h).trim();
        var currentVal = existingRowValues[colIdx];
        
        // Preserve immutable fields (created_at / id if not changing)
        if (colName === "createdAt" || colName === "created_at") {
          updatedRecordObj[colName] = currentVal || nowTimestamp;
          return currentVal || nowTimestamp;
        }
        
        if (colName === "updatedAt" || colName === "updated_at") {
          updatedRecordObj[colName] = nowTimestamp;
          return nowTimestamp;
        }

        if (data[colName] !== undefined) {
          updatedRecordObj[colName] = data[colName];
          return data[colName];
        } else {
          updatedRecordObj[colName] = currentVal;
          return currentVal;
        }
      });

      sheet.getRange(foundIndex, 1, 1, actualHeaders.length).setValues([updatedRow]);
      SpreadsheetApp.flush();

      console.log(logHeader, "Update success at row:", foundIndex, "in sheet:", sheetName);
      return responseJSON({ success: true, action: "update", targetRow: foundIndex, record: updatedRecordObj });
    }

    // 5. ACTION: DELETE (Remove record by Unique ID or Key)
    else if (action === "delete") {
      var delKeyName = String(payload.keyName || "id").trim();
      var delKeyToFind = delKeyName.toLowerCase();
      var delColIdx = normalizedHeaders.indexOf(delKeyToFind);

      if (delColIdx === -1) {
        delColIdx = normalizedHeaders.indexOf("id");
        if (delColIdx === -1) delColIdx = normalizedHeaders.indexOf("email");
        if (delColIdx === -1) delColIdx = normalizedHeaders.indexOf("name");
      }

      if (delColIdx === -1) {
        throw new Error("Key column '" + delKeyName + "' not found in sheet '" + sheetName + "' headers.");
      }

      var delSearchVal = String(payload.keyValue).trim().toLowerCase();
      var delRowIdx = -1;

      for (var d = 1; d < allRows.length; d++) {
        var dCellVal = String(allRows[d][delColIdx]).trim().toLowerCase();
        if (dCellVal === delSearchVal) {
          delRowIdx = d + 1;
          break;
        }
      }

      if (delRowIdx === -1) {
        throw new Error("Record not found for deletion matching " + delKeyName + " = '" + payload.keyValue + "' in sheet '" + sheetName + "'");
      }

      sheet.deleteRow(delRowIdx);
      SpreadsheetApp.flush();

      console.log(logHeader, "Delete success at row:", delRowIdx, "in sheet:", sheetName);
      return responseJSON({ success: true, action: "delete", deletedRow: delRowIdx });
    }

    // 6. ACTION: UPSERT (Update if exists, else Insert)
    else if (action === "upsert") {
      var upsertFoundRow = -1;
      for (var u = 1; u < allRows.length; u++) {
        var isMatch = true;
        for (var qKey in payload.query) {
          var qColIdx = normalizedHeaders.indexOf(String(qKey).trim().toLowerCase());
          if (qColIdx === -1) {
            isMatch = false;
            break;
          }
          var cellValueStr = String(allRows[u][qColIdx]).trim().toLowerCase();
          var queryValueStr = String(payload.query[qKey]).trim().toLowerCase();
          if (cellValueStr !== queryValueStr) {
            isMatch = false;
            break;
          }
        }
        if (isMatch) {
          upsertFoundRow = u + 1;
          break;
        }
      }

      data.updatedAt = nowTimestamp;

      if (upsertFoundRow !== -1) {
        var existingRowVals = allRows[upsertFoundRow - 1];
        var upsertUpdatedRow = actualHeaders.map(function(h, cIdx) {
          var headerName = String(h).trim();
          return data[headerName] !== undefined ? data[headerName] : existingRowVals[cIdx];
        });
        sheet.getRange(upsertFoundRow, 1, 1, actualHeaders.length).setValues([upsertUpdatedRow]);
        SpreadsheetApp.flush();
        return responseJSON({ success: true, action: "upsert_update", targetRow: upsertFoundRow, record: data });
      } else {
        if (!data.id) data.id = "REC-" + Utilities.getUuid().substring(0, 8).toUpperCase();
        if (!data.createdAt) data.createdAt = nowTimestamp;
        var upsertNewRow = actualHeaders.map(function(h) {
          var headerName = String(h).trim();
          return data[headerName] !== undefined ? data[headerName] : "";
        });
        sheet.appendRow(upsertNewRow);
        SpreadsheetApp.flush();
        return responseJSON({ success: true, action: "upsert_insert", record: data });
      }
    } else {
      throw new Error("Unsupported or missing action parameter: " + action);
    }

  } catch (error) {
    console.error(logHeader, "Error executing doPost action:", error.toString(), error.stack);
    return responseJSON({ success: false, error: error.toString(), stack: error.stack });
  } finally {
    try {
      lock.releaseLock();
    } catch (lErr) {
      console.warn("Lock release warning:", lErr);
    }
  }
}

/**
 * Backend Data Validation Rules
 */
function validatePayload(sheetName, data, action) {
  if (!data || typeof data !== "object") {
    throw new Error("Validation Error: Payload data must be a non-null object.");
  }

  if (sheetName === CONFIG.SHEETS.EMPLOYEES) {
    if (action === "insert") {
      if (!data.name || String(data.name).trim() === "") throw new Error("Validation Error: Employee full name is required.");
      if (!data.email || String(data.email).trim() === "") throw new Error("Validation Error: Employee email address is required.");
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
      throw new Error("Validation Error: Invalid employee email address format ('" + data.email + "').");
    }
    if (data.basicSalary !== undefined && isNaN(Number(data.basicSalary))) {
      throw new Error("Validation Error: Basic salary must be a valid number.");
    }
  }

  if (sheetName === CONFIG.SHEETS.CANDIDATES) {
    if (action === "insert") {
      if (!data.name || String(data.name).trim() === "") throw new Error("Validation Error: Candidate name is required.");
      if (!data.email || String(data.email).trim() === "") throw new Error("Validation Error: Candidate email is required.");
    }
  }
}

/**
 * Self-Healing Database Initialization: Ensures sheets and header rows exist
 */
function initializeDatabase() {
  var ss = getSpreadsheet();
  if (!ss) return;

  var schema = {
    corporate_entities: ["id", "name", "registrationNumber", "address", "taxReferenceNo", "epfReferenceNo", "socsoReferenceNo", "currency", "isActive", "logoUrl", "googleScriptUrl"],
    employees: ["id", "entityId", "entityName", "name", "email", "designation", "department", "status", "bankName", "accountNo", "basicSalary", "housingAllowance", "transportAllowance", "overtime", "performanceBonus", "epfRateEmployee", "epfRateEmployer", "socsoEmployee", "socsoEmployer", "eisEmployee", "eisEmployer", "taxPcb", "unpaidLeave", "hrdCorp", "avatarUrl", "gender", "nricPassport", "nationality", "contactNumber", "taxNumber", "epfNumber", "employmentType", "maritalStatus", "eligibleForStatutory", "emergencyContactName", "emergencyContactRelation", "emergencyContactPhone", "dateOfJoined", "dateOfConfirmation", "allowanceGeneral", "allowanceTransport", "allowanceParking", "allowanceMeal", "allowanceAccommodation", "allowancePhone", "reimbursementAmount", "reimbursementDesc", "bonusAmount", "bonusDesc", "commissionAmount", "commissionDesc", "backPayAmount", "backPayDesc", "awsAmount", "awsDesc", "compensationAmount", "compensationDesc", "deductionInLieu", "deductionCp38", "deductionOthers", "deductionOthersDesc", "spouseName", "spouseNric", "spouseIsWorking", "spouseCompany", "spousePosition", "hasDependants", "icFrontUrl", "icBackUrl", "educationCertUrl", "skbbkEmployee", "skbbkEmployer", "careerHistory", "dependants", "salaryAdjustments", "createdAt", "updatedAt"],
    candidates: ["id", "name", "email", "phone", "designation", "department", "entityName", "entityId", "stage", "progress", "dateJoined", "createdAt", "updatedAt"],
    performances: ["employeeId", "employeeEmail", "reviewCycleId", "managerName", "reviewStatus", "rating", "teamworkScore", "communicationScore", "problemSolvingScore", "selfEvaluation", "managerComments", "goals", "createdAt", "updatedAt"],
    payroll_records_2026: ["id", "employeeEmail", "payrollMonth", "payrollYear", "basicSalary", "allowanceGeneral", "allowanceTransport", "allowanceParking", "allowanceMeal", "allowanceAccommodation", "allowancePhone", "overtime", "bonusAmount", "bonusDesc", "commissionAmount", "commissionDesc", "backPayAmount", "backPayDesc", "awsAmount", "awsDesc", "compensationAmount", "compensationDesc", "reimbursementAmount", "reimbursementDesc", "unpaidLeave", "deductionInLieu", "deductionCp38", "deductionOthers", "deductionOthersDesc", "actualPCBDeducted", "epfEmployee", "epfEmployer", "socsoEmployee", "socsoEmployer", "lindung24Employee", "eisEmployee", "eisEmployer", "hrdCorp", "netPay", "paymentDate", "payslipDescriptions", "payoutKind", "isSeparatePayout", "statutoryTreatment", "payoutTitle", "payoutDescription", "lineNotes", "documentType", "compensationLabel", "displaySettingsSnapshot", "createdAt", "updatedAt"],
    users: ["email", "password", "name", "role", "createdAt"],
    audit_logs: ["id", "employeeEmail", "changedBy", "changeType", "oldValue", "newValue", "createdAt"]
  };

  for (var sheetName in schema) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(schema[sheetName]);
    } else if (sheet.getDataRange().getLastRow() === 0) {
      sheet.appendRow(schema[sheetName]);
    } else {
      var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map(function(header) { return String(header).trim(); });
      var missingHeaders = schema[sheetName].filter(function(header) {
        return existingHeaders.indexOf(header) === -1;
      });
      if (missingHeaders.length > 0) {
        sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
      }
    }
  }
}

/**
 * Diagnostic Endpoint Runner (Requirement 12)
 */
function runDiagnostics() {
  var diag = {
    timestamp: new Date().toISOString(),
    spreadsheetIdConfigured: CONFIG.SPREADSHEET_ID,
    spreadsheetAccess: false,
    readPermission: false,
    writePermission: false,
    uniqueIdColumnPresent: false,
    sheetStatuses: {},
    crudTest: { create: false, update: false, delete: false },
    errors: []
  };

  try {
    var ss = getSpreadsheet();
    if (!ss) {
      diag.errors.push("Failed to access Spreadsheet via openById/getActiveSpreadsheet.");
      return diag;
    }

    diag.spreadsheetAccess = true;
    diag.readPermission = true;

    // Check sheets
    var requiredSheets = [CONFIG.SHEETS.EMPLOYEES, CONFIG.SHEETS.CANDIDATES, CONFIG.SHEETS.ENTITIES];
    requiredSheets.forEach(function(sName) {
      var sheet = ss.getSheetByName(sName);
      if (sheet) {
        var headers = sheet.getDataRange().getValues()[0] || [];
        var hasId = headers.map(function(h) { return String(h).toLowerCase(); }).indexOf("id") !== -1;
        diag.sheetStatuses[sName] = { exists: true, headersCount: headers.length, hasIdColumn: hasId };
        if (hasId) diag.uniqueIdColumnPresent = true;
      } else {
        diag.sheetStatuses[sName] = { exists: false };
      }
    });

    // Test Write Permission & CRUD
    var testSheet = ss.getSheetByName(CONFIG.SHEETS.AUDIT_LOGS) || ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
    if (testSheet) {
      var testId = "DIAG-TEST-" + Utilities.getUuid().substring(0, 6);
      
      // 1. Create Test
      testSheet.appendRow([testId, "diag@test.com", "system", "DIAGNOSTIC_TEST", "", "test", new Date().toISOString()]);
      SpreadsheetApp.flush();
      diag.crudTest.create = true;
      diag.writePermission = true;

      // 2. Update / Find Test
      var rows = testSheet.getDataRange().getValues();
      var testRowIdx = -1;
      for (var r = 1; r < rows.length; r++) {
        if (String(rows[r][0]) === testId) {
          testRowIdx = r + 1;
          break;
        }
      }

      if (testRowIdx !== -1) {
        testSheet.getRange(testRowIdx, 6).setValue("test_updated");
        SpreadsheetApp.flush();
        diag.crudTest.update = true;

        // 3. Delete Test
        testSheet.deleteRow(testRowIdx);
        SpreadsheetApp.flush();
        diag.crudTest.delete = true;
      }
    }

  } catch (err) {
    diag.errors.push("Diagnostic failure: " + err.toString());
  }

  return diag;
}

/**
 * Standard JSON Response Builder
 */
function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
