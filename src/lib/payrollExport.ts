import { zipSync, strToU8 } from 'fflate';
import { jsPDF } from 'jspdf';
import type { Employee, PayrollRecord2026 } from '../types';
import type { PayrollExportAudit, PayrollExportFilters, PayrollExportFormat } from './exportTypes';
import { calculatePayslipFromRecord, isSeparatePayrollRecord } from '../data';

export interface PayrollExportColumn {
  key: string;
  label: string;
  sensitive?: boolean;
  getValue: (record: PayrollRecord2026, employee?: Employee) => string | number;
}

const money = (value: number) => Number(value || 0).toFixed(2);

const allowances = (record: PayrollRecord2026) => (
  Number(record.allowanceGeneral || 0) +
  Number(record.allowanceTransport || 0) +
  Number(record.allowanceParking || 0) +
  Number(record.allowanceMeal || 0) +
  Number(record.allowanceAccommodation || 0) +
  Number(record.allowancePhone || 0)
);

const variableEarnings = (record: PayrollRecord2026) => (
  Number(record.overtime || 0) +
  Number(record.bonusAmount || 0) +
  Number(record.commissionAmount || 0) +
  Number(record.backPayAmount || 0) +
  Number(record.awsAmount || 0) +
  Number(record.compensationAmount || 0)
);

const totalDeductions = (record: PayrollRecord2026, employee?: Employee) => {
  const breakdown = employee ? calculatePayslipFromRecord(employee, record) : null;
  return breakdown?.totalDeductions ?? (
    Number(record.epfEmployee || 0) +
    Number(record.socsoEmployee || 0) +
    Number(record.lindung24Employee || 0) +
    Number(record.eisEmployee || 0) +
    Number(record.actualPCBDeducted || 0) +
    Number(record.unpaidLeave || 0) +
    Number(record.incompleteMonthDeduction || 0) +
    Number(record.deductionInLieu || 0) +
    Number(record.deductionCp38 || 0) +
    Number(record.deductionOthers || 0)
  );
};

export const PAYROLL_EXPORT_COLUMNS: PayrollExportColumn[] = [
  { key: 'serialNumber', label: 'Serial number', getValue: () => '' },
  { key: 'employeeName', label: 'Employee name', getValue: (_record, employee) => employee?.name || '' },
  { key: 'employmentType', label: 'Employment type', getValue: (_record, employee) => employee?.employmentType || '' },
  { key: 'paymentMode', label: 'Payment mode', sensitive: true, getValue: (_record, employee) => employee?.bankName ? 'Bank transfer' : 'Manual' },
  { key: 'icPassport', label: 'IC / Passport number', sensitive: true, getValue: (_record, employee) => employee?.nricPassport || '' },
  { key: 'bankName', label: 'Bank name', sensitive: true, getValue: (_record, employee) => employee?.bankName || '' },
  { key: 'bankAccountNumber', label: 'Bank account number', sensitive: true, getValue: (_record, employee) => employee?.accountNo || '' },
  { key: 'basicSalary', label: 'Basic salary', sensitive: true, getValue: record => money(record.basicSalary) },
  { key: 'commission', label: 'Commission', sensitive: true, getValue: record => money(record.commissionAmount) },
  { key: 'allowances', label: 'Allowances', sensitive: true, getValue: record => money(allowances(record)) },
  { key: 'unpaidLeave', label: 'Unpaid leave', sensitive: true, getValue: record => money(record.unpaidLeave) },
  { key: 'incompleteMonthDeduction', label: 'Incomplete-month deduction', sensitive: true, getValue: record => money(record.incompleteMonthDeduction) },
  { key: 'grossPay', label: 'Gross Pay', sensitive: true, getValue: (record, employee) => money(record.grossPay ?? (employee ? calculatePayslipFromRecord(employee, record).grossPay : record.basicSalary + allowances(record) + variableEarnings(record))) },
  { key: 'employeeEpf', label: 'Employee EPF', sensitive: true, getValue: record => money(record.epfEmployee) },
  { key: 'employeeSocso', label: 'Employee SOCSO', sensitive: true, getValue: record => money(record.socsoEmployee) },
  { key: 'employeeLindung24', label: 'Employee LINDUNG 24 Jam', sensitive: true, getValue: record => money(record.lindung24Employee) },
  { key: 'employeeEis', label: 'Employee EIS', sensitive: true, getValue: record => money(record.eisEmployee) },
  { key: 'pcb', label: 'PCB', sensitive: true, getValue: record => money(record.actualPCBDeducted) },
  { key: 'totalDeduction', label: 'Total deduction', sensitive: true, getValue: (record, employee) => money(totalDeductions(record, employee)) },
  { key: 'netPay', label: 'Net Pay', sensitive: true, getValue: record => money(record.netPay) },
  { key: 'employerEpf', label: 'Employer EPF', sensitive: true, getValue: record => money(record.epfEmployer) },
  { key: 'employerSocso', label: 'Employer SOCSO', sensitive: true, getValue: record => money(record.socsoEmployer) },
  { key: 'employerEis', label: 'Employer EIS', sensitive: true, getValue: record => money(record.eisEmployer) },
  { key: 'paymentDescription', label: 'Payment description', getValue: record => record.payoutDescription || record.compensationLabel || 'Monthly payroll' }
];

export const DEFAULT_PAYROLL_EXPORT_COLUMNS = PAYROLL_EXPORT_COLUMNS
  .filter(column => !column.sensitive)
  .map(column => column.key);

export const getPayrollExportColumns = (keys: string[]) => (
  PAYROLL_EXPORT_COLUMNS.filter(column => keys.includes(column.key))
);

export const buildPayrollExportRows = (
  records: PayrollRecord2026[],
  employees: Employee[],
  columns: PayrollExportColumn[]
) => records.map((record, index) => {
  const employee = employees.find(item => item.email.toLowerCase() === record.employeeEmail.toLowerCase());
  const row: Record<string, string | number> = {};
  columns.forEach(column => {
    row[column.key] = column.key === 'serialNumber'
      ? index + 1
      : column.getValue(record, employee);
  });
  return row;
});

const escapeCsv = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadBlob = (contents: BlobPart, filename: string, type: string) => {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const columnLetter = (index: number) => {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const xml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const buildXlsx = (headers: string[], rows: Array<Record<string, string | number>>, columns: PayrollExportColumn[]) => {
  const sheetRows = [
    headers,
    ...rows.map(row => columns.map(column => row[column.key] ?? ''))
  ];
  const sheetData = sheetRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnLetter(columnIndex)}${rowIndex + 1}`;
      const numeric = typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value));
      return numeric
        ? `<c r="${ref}"><v>${xml(value)}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Payroll" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`)
  };
  return zipSync(files);
};

export const exportPayrollRows = (
  format: PayrollExportFormat,
  rows: Array<Record<string, string | number>>,
  columns: PayrollExportColumn[],
  filename: string
) => {
  const headers = columns.map(column => column.label);
  if (format === 'csv' || format === 'txt') {
    const separator = format === 'txt' ? '\t' : ',';
    const body = [headers, ...rows.map(row => columns.map(column => row[column.key] ?? ''))]
      .map(line => line.map(escapeCsv).join(separator))
      .join('\n');
    downloadBlob(`\uFEFF${body}`, filename, format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8');
    return;
  }

  if (format === 'xlsx') {
    downloadBlob(buildXlsx(headers, rows, columns), filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return;
  }

  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  document.setFontSize(8);
  document.text('Payroll Export', 28, 28);
  let y = 46;
  const width = 785 / Math.max(1, columns.length);
  const drawRow = (values: string[]) => {
    values.forEach((value, index) => document.text(String(value).slice(0, 22), 28 + index * width, y));
    y += 14;
    if (y > 560) {
      document.addPage();
      y = 28;
    }
  };
  drawRow(headers);
  rows.forEach(row => drawRow(columns.map(column => String(row[column.key] ?? ''))));
  document.save(filename);
};

export const buildPayrollExportAudit = (input: Omit<PayrollExportAudit, 'createdAt'>): PayrollExportAudit => ({
  ...input,
  createdAt: new Date().toISOString()
});

export const persistPayrollExportAudit = (audit: PayrollExportAudit) => {
  const key = 'payroll_export_audit_log';
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  localStorage.setItem(key, JSON.stringify([...existing, audit].slice(-200)));
};

export const isProcessedPayrollRecord = (record: Pick<PayrollRecord2026, 'status'>) => (
  record.status === undefined || record.status === 'Processed'
);

export const isPayrollRecordInScope = (
  record: PayrollRecord2026,
  employees: Employee[],
  filters: PayrollExportFilters
) => {
  const employee = employees.find(item => item.email.toLowerCase() === record.employeeEmail.toLowerCase());
  return isProcessedPayrollRecord(record) &&
    record.payrollMonth === filters.payrollMonth &&
    record.payrollYear === filters.payrollYear &&
    (!filters.department || filters.department === 'All Departments' || employee?.department === filters.department) &&
    (!filters.selectedRecordIds || filters.selectedRecordIds.includes(record.id));
};

export const isSeparatePayoutForExport = (record: PayrollRecord2026) => isSeparatePayrollRecord(record);
