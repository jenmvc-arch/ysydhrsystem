# 💼 YSYD HRMS — Enterprise Core Console

YSYD HRMS is a premium, high-performance corporate console designed for managing personnel directory, employee appraisals, real-time payroll records, and statutory compliance.

Originally backed by Supabase, the database layer and file storage have been fully migrated to use **Google Sheets** (as a relational data store) and **Google Drive** (for secure, public graphic asset hosting) via a serverless **Google Apps Script Web App** proxy.

---

## 🚀 Features
- **Interactive Dashboard**: Real-time overview of active personnel counts, subsidiary distribution, and review cycles.
- **Dynamic Employee Directory**: Multi-tab personnel profiles tracking career progression history, emergency contacts, dependants, and document uploads.
- **Consolidated Payroll Processing**: Automated calculations for basic salary, housing and transport allowances, employee/employer statutory contributions (EPF, SOCSO, EIS), tax PCB, and unpaid leaves.
- **PDF Payslip Generation**: Direct download of professional, printable A4 payslips powered by a local Puppeteer PDF printer.
- **Performance Appraisals**: Scoring panels for teamwork, communication, and problem-solving, along with appraisal state tracking and goal management.

---

## 🛠️ Google Sheets & Drive Setup

Follow these steps to connect your local HR Nexus application to your own Google Account database:

### 1. Create Spreadsheet & Folder
1. Create a blank **Google Spreadsheet**. Copy the **Spreadsheet ID** from the URL (the long code between `/d/` and `/edit`).
2. Create a folder in **Google Drive** to store employee photos. Copy the **Folder ID** from the URL (the long code at the end of the folder path).

### 2. Add Google Apps Script
1. Open your Google Spreadsheet, click **Extensions -> Apps Script** (use an Incognito window if you run into Google multi-login errors).
2. Delete the default template and paste the script below:

```javascript
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";
const DRIVE_FOLDER_ID = "YOUR_DRIVE_FOLDER_ID_HERE";

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

const SCHEMA = {
  "corporate_entities": ["name", "registrationNumber", "address", "taxReferenceNo", "epfReferenceNo", "socsoReferenceNo", "currency", "isActive", "theme", "logoUrl", "googleScriptUrl"],
  "employees": ["email", "entityName", "name", "designation", "department", "status", "bankName", "accountNo", "basicSalary", "housingAllowance", "transportAllowance", "overtime", "performanceBonus", "epfRateEmployee", "epfRateEmployer", "socsoEmployee", "socsoEmployer", "eisEmployee", "eisEmployer", "taxPcb", "unpaidLeave", "hrdCorp", "avatarUrl", "gender", "nricPassport", "nationality", "contactNumber", "taxNumber", "epfNumber", "employmentType", "maritalStatus", "eligibleForStatutory", "emergencyContactName", "emergencyContactRelation", "emergencyContactPhone", "dateOfJoined", "dateOfConfirmation", "careerHistory", "dependants", "allowanceGeneral", "allowanceTransport", "allowanceParking", "allowanceMeal", "allowanceAccommodation", "allowancePhone", "reimbursementAmount", "reimbursementDesc", "bonusAmount", "bonusDesc", "commissionAmount", "commissionDesc", "backPayAmount", "backPayDesc", "awsAmount", "awsDesc", "compensationAmount", "compensationDesc", "deductionInLieu", "deductionCp38", "deductionOthers", "deductionOthersDesc", "spouseName", "spouseNric", "spouseIsWorking", "spouseCompany", "spousePosition", "hasDependants", "icFrontUrl", "icBackUrl", "educationCertUrl", "skbbkEmployee", "skbbkEmployer", "historicalPayrollRecords", "effectiveDatedProfiles", "historicalPcbResults", "historicalVariances", "tp1Declarations", "tp3Data", "salaryAdjustments"],
  "performances": ["employeeEmail", "reviewCycleId", "managerName", "reviewStatus", "rating", "teamworkScore", "communicationScore", "problemSolvingScore", "selfEvaluation", "managerComments", "goals"],
  "users": ["email", "password", "name", "role"],
  "audit_logs": ["id", "employeeEmail", "changedBy", "changeType", "oldValue", "newValue", "createdAt"],
  "payroll_records_2026": ["id", "employeeEmail", "payrollMonth", "payrollYear", "basicSalary", "allowanceGeneral", "allowanceTransport", "allowanceParking", "allowanceMeal", "allowanceAccommodation", "allowancePhone", "overtime", "bonusAmount", "bonusDesc", "commissionAmount", "commissionDesc", "backPayAmount", "backPayDesc", "awsAmount", "awsDesc", "compensationAmount", "compensationDesc", "reimbursementAmount", "reimbursementDesc", "unpaidLeave", "deductionInLieu", "deductionCp38", "deductionOthers", "deductionOthersDesc", "actualPCBDeducted", "epfEmployee", "epfEmployer", "socsoEmployee", "socsoEmployer", "lindung24Employee", "eisEmployee", "eisEmployer", "hrdCorp", "netPay", "paymentDate", "payslipDescriptions", "payoutKind", "isSeparatePayout", "statutoryTreatment", "payoutTitle", "payoutDescription", "lineNotes", "documentType", "compensationLabel", "displaySettingsSnapshot", "createdAt", "updatedAt"]
};

function initializeDatabase() {
  const ss = getSpreadsheet();
  for (let sheetName in SCHEMA) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(SCHEMA[sheetName]);
    } else {
      const data = sheet.getDataRange().getValues();
      const existingHeaders = data[0] || [];
      const schemaHeaders = SCHEMA[sheetName];
      const missingHeaders = schemaHeaders.filter(h => !existingHeaders.includes(h));
      if (missingHeaders.length > 0) {
        sheet.insertColumnsAfter(existingHeaders.length, missingHeaders.length);
        const nextCol = existingHeaders.length + 1;
        sheet.getRange(1, nextCol, 1, missingHeaders.length).setValues([missingHeaders]);
      }
    }
  }
}

function doGet(e) {
  try {
    initializeDatabase();
    const ss = getSpreadsheet();
    const result = {};
    for (let sheetName in SCHEMA) {
      const sheet = ss.getSheetByName(sheetName);
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const rows = [];
      for (let i = 1; i < data.length; i++) {
        const rowObj = {};
        for (let j = 0; j < headers.length; j++) {
          rowObj[headers[j]] = data[i][j];
        }
        rows.push(rowObj);
      }
      result[sheetName] = rows;
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeTyp```javascript
// Please copy the complete, production-ready script directly from google_apps_script.gs in the repository root.
// It includes LockService concurrency locks, openById(SPREADSHEET_ID), payload validation, diagnostic endpoint, and structured logging.
```

3. Replace `CONFIG.SPREADSHEET_ID` with your actual Google Spreadsheet ID at the top of the file, save, and click **Deploy -> New Deployment**.
4. Configure as a **Web App**, set Execute as to **"Me"**, and Who has access to **"Anyone"**.
5. Copy the generated Web App URL into `VITE_GOOGLE_SCRIPT_URL` in `.env.local` / Vercel secrets. Web App URL.

### 3. Add Account Details (Optional)
To log in with the default admin accounts on your spreadsheet, add a row to the **`users`** sheet in Google Sheets:
- **email**: `jennylaw.hr`
- **password**: `admin123#`
- **name**: `Jenny Law`
- **role**: `Global Administrator`

---

## 🚀 Running Locally

**Prerequisites:** Node.js (v18+)

1. Clone or download the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local config file:
   Copy `.env.example` to `.env.local` and add your Google Script Web App URL:
   ```env
   VITE_GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/your_deployment_id/exec"
   ```
4. Start the frontend developer server (Vite):
   ```bash
   npm run dev
   ```
5. Start the PDF rendering backend (Express + Puppeteer):
   ```bash
   npm run server
   ```
