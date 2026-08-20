import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  RefreshCw,
  Square
} from 'lucide-react';
import type { CorporateEntity, Employee, PayrollRecord2026 } from '../types';
import { calculatePayslipFromRecord, getPayrollDocumentProfileForRecord } from '../data';
import {
  buildPayrollExportAudit,
  buildPayrollExportRows,
  DEFAULT_PAYROLL_EXPORT_COLUMNS,
  exportPayrollRows,
  getPayrollExportColumns,
  PAYROLL_EXPORT_COLUMNS,
  isPayrollRecordInScope,
  type PayrollExportColumn
} from '../lib/payrollExport';
import type { PayrollExportFormat } from '../lib/exportTypes';
import { canExportPayroll, canExportSensitivePayroll } from '../lib/exportPermissions';

interface PayrollFileViewProps {
  employees: Employee[];
  payrollRecords2026: PayrollRecord2026[];
  activeEntity?: CorporateEntity;
  selectedMonth: number;
  selectedYear: number;
  selectedDepartment: string;
  userRole?: string;
  userId?: string | null;
  userName?: string | null;
  onPreview: (record: PayrollRecord2026) => void;
  onShowNotification: (title: string, message: string) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const formatMoney = (value: number) => `RM ${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })
  : 'Not available';

const getEmployee = (employees: Employee[], record: PayrollRecord2026) => (
  employees.find(employee => employee.email.toLowerCase() === record.employeeEmail.toLowerCase())
);

export default function PayrollFileView({
  employees,
  payrollRecords2026,
  activeEntity,
  selectedMonth,
  selectedYear,
  selectedDepartment,
  userRole,
  userId,
  userName,
  onPreview,
  onShowNotification
}: PayrollFileViewProps) {
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<PayrollExportFormat>('xlsx');
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>(DEFAULT_PAYROLL_EXPORT_COLUMNS);
  const [isExporting, setIsExporting] = useState(false);
  const sensitiveExportAllowed = canExportSensitivePayroll(userRole);

  const filteredRecords = useMemo(() => payrollRecords2026
    .filter(record => isPayrollRecordInScope(record, employees, {
      entityId: activeEntity?.id,
      entityName: activeEntity?.name,
      department: selectedDepartment,
      payrollMonth: selectedMonth,
      payrollYear: selectedYear
    }))
    .sort((left, right) => {
      const leftEmployee = getEmployee(employees, left)?.name || left.employeeEmail;
      const rightEmployee = getEmployee(employees, right)?.name || right.employeeEmail;
      return leftEmployee.localeCompare(rightEmployee);
    }), [activeEntity, employees, payrollRecords2026, selectedDepartment, selectedMonth, selectedYear]);

  useEffect(() => {
    setSelectedRecordIds(previous => previous.filter(id => filteredRecords.some(record => record.id === id)));
  }, [filteredRecords]);

  const selectedRecords = filteredRecords.filter(record => selectedRecordIds.includes(record.id));
  const allSelected = filteredRecords.length > 0 && selectedRecordIds.length === filteredRecords.length;

  const toggleRecord = (recordId: string) => {
    setSelectedRecordIds(previous => previous.includes(recordId)
      ? previous.filter(id => id !== recordId)
      : [...previous, recordId]);
  };

  const toggleAll = () => {
    setSelectedRecordIds(allSelected ? [] : filteredRecords.map(record => record.id));
  };

  const toggleColumn = (column: PayrollExportColumn) => {
    if (column.sensitive && !sensitiveExportAllowed) return;
    setSelectedColumnKeys(previous => previous.includes(column.key)
      ? previous.filter(key => key !== column.key)
      : [...previous, column.key]);
  };

  const handleExport = async () => {
    if (!canExportPayroll(userRole)) {
      onShowNotification('Export Restricted', 'Your role does not have permission to export payroll data.');
      return;
    }
    const columns = getPayrollExportColumns(selectedColumnKeys);
    if (columns.length === 0) {
      onShowNotification('Select Export Columns', 'Choose at least one export column before continuing.');
      return;
    }
    const records = selectedRecords.length > 0 ? selectedRecords : filteredRecords;
    if (records.length === 0) {
      onShowNotification('Nothing to Export', 'There are no processed payroll records in the current Payroll File scope.');
      return;
    }

    setIsExporting(true);
    const scope = `${activeEntity?.name || 'All subsidiaries'} / ${selectedDepartment} / ${MONTHS[selectedMonth - 1]} ${selectedYear}`;
    const filters = {
      entityId: activeEntity?.id,
      entityName: activeEntity?.name,
      department: selectedDepartment,
      payrollMonth: selectedMonth,
      payrollYear: selectedYear,
      selectedRecordIds: selectedRecords.length > 0 ? selectedRecordIds : undefined
    };
    try {
      const rows = buildPayrollExportRows(records, employees, columns);
      const safeScope = `${MONTHS[selectedMonth - 1]}_${selectedYear}`.replace(/\s+/g, '_');
      exportPayrollRows(
        exportFormat,
        rows,
        columns,
        `Payroll_${safeScope}.${exportFormat}`
      );
      const audit = buildPayrollExportAudit({
        userId: userId || undefined,
        userName: userName || undefined,
        role: userRole || undefined,
        module: 'payroll',
        format: exportFormat,
        scope,
        recordCount: records.length,
        selectedFields: columns.map(column => column.key),
        filters,
        status: 'success'
      });
      localStorage.setItem('payroll_last_export_audit', JSON.stringify(audit));
      onShowNotification('Payroll Export Started', `${records.length} processed record${records.length === 1 ? '' : 's'} exported as ${exportFormat.toUpperCase()}.`);
    } catch (error: any) {
      const audit = buildPayrollExportAudit({
        userId: userId || undefined,
        userName: userName || undefined,
        role: userRole || undefined,
        module: 'payroll',
        format: exportFormat,
        scope,
        recordCount: records.length,
        selectedFields: columns.map(column => column.key),
        filters,
        status: 'failure',
        errorMessage: error?.message || String(error)
      });
      localStorage.setItem('payroll_last_export_audit', JSON.stringify(audit));
      onShowNotification('Export Failed', error?.message || 'Payroll export could not be generated.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="space-y-5 text-left">
      <div className="flex flex-col gap-4 border-b border-neutral-border/70 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-primary">
            <FileSpreadsheet className="h-5 w-5" /> Payroll File
          </h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Processed payroll records for {MONTHS[selectedMonth - 1]} {selectedYear}, {selectedDepartment}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="payroll-export-format">Export format</label>
          <select
            id="payroll-export-format"
            value={exportFormat}
            onChange={event => setExportFormat(event.target.value as PayrollExportFormat)}
            className="rounded border border-neutral-border bg-white px-2.5 py-2 text-xs font-semibold"
          >
            <option value="xlsx">XLSX</option>
            <option value="csv">CSV</option>
            <option value="txt">TXT</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || filteredRecords.length === 0}
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Export selected records, or all filtered records when none are selected"
          >
            {isExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {selectedRecords.length > 0 ? `Export ${selectedRecords.length}` : 'Export Filtered'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-border bg-neutral-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">Export columns</h3>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Identity, banking, salary, statutory, tax, deduction, and net-pay fields are sensitive.
            </p>
          </div>
          {!sensitiveExportAllowed && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
              <LockKeyhole className="h-3.5 w-3.5" /> Sensitive fields require payroll export permission.
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {getPayrollExportColumns(PAYROLL_EXPORT_COLUMNS.map(column => column.key)).map(column => {
            const checked = selectedColumnKeys.includes(column.key);
            const disabled = Boolean(column.sensitive && !sensitiveExportAllowed);
            return (
              <label
                key={column.key}
                className={`flex items-center gap-2 rounded border px-2.5 py-2 text-[11px] font-semibold ${
                  disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked && !disabled}
                  disabled={disabled}
                  onChange={() => toggleColumn(column)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span>{column.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-border p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-on-surface-variant" />
          <h3 className="mt-3 text-sm font-bold text-on-surface">No processed payroll records.</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-on-surface-variant">
            Use Save and Process in Payroll Editor to add the current employee to this Payroll File.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-border bg-white px-3 py-3 text-xs">
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-2 font-bold text-primary"
              aria-label={allSelected ? 'Deselect all processed payroll records' : 'Select all processed payroll records'}
            >
              {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-on-surface-variant">
              {selectedRecords.length} selected of {filteredRecords.length} processed record{filteredRecords.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-xs">
              <caption className="sr-only">Processed payroll records</caption>
              <thead>
                <tr className="border-b border-neutral-border bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  <th className="p-3">Select</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Payroll period</th>
                  <th className="p-3 text-right">Gross Pay</th>
                  <th className="p-3 text-right">Deductions</th>
                  <th className="p-3 text-right">Net Pay</th>
                  <th className="p-3">Processed At</th>
                  <th className="p-3 text-center">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-border/60">
                {filteredRecords.map(record => {
                  const employee = getEmployee(employees, record);
                  const breakdown = employee ? calculatePayslipFromRecord(employee, record) : null;
                  const profile = employee ? getPayrollDocumentProfileForRecord(employee, record) : null;
                  const isSelected = selectedRecordIds.includes(record.id);
                  return (
                    <tr key={record.id} className="hover:bg-neutral-50">
                      <td className="p-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRecord(record.id)}
                            aria-label={`Select payroll record for ${employee?.name || record.employeeEmail}`}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="sr-only">{isSelected ? 'Selected' : 'Not selected'}</span>
                        </label>
                      </td>
                      <td className="p-3">
                        <span className="block font-bold text-on-surface">{employee?.name || record.employeeEmail}</span>
                        <span className="block text-[10px] text-on-surface-variant">{record.payoutTitle || profile?.compensationLabel || 'Monthly payroll'}</span>
                      </td>
                      <td className="p-3">{employee?.department || 'Unassigned'}</td>
                      <td className="p-3 font-mono">{MONTHS[record.payrollMonth - 1]} {record.payrollYear}</td>
                      <td className="p-3 text-right font-mono">{formatMoney(record.grossPay ?? breakdown?.grossPay ?? 0)}</td>
                      <td className="p-3 text-right font-mono">{formatMoney(breakdown?.totalDeductions ?? 0)}</td>
                      <td className="p-3 text-right font-mono font-bold">{formatMoney(record.netPay ?? breakdown?.netPay ?? 0)}</td>
                      <td className="p-3 whitespace-nowrap text-on-surface-variant">{formatDateTime(record.createdAt)}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => onPreview(record)}
                          className="inline-flex items-center gap-1.5 rounded border border-neutral-border px-2.5 py-1.5 font-bold text-primary hover:bg-neutral-50"
                          title={`Preview ${profile?.documentType || 'payroll document'} for ${employee?.name || record.employeeEmail}`}
                        >
                          <Eye className="h-3.5 w-3.5" /> Preview
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
