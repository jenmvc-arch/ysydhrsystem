/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Clock, CreditCard, FileText, PlusCircle } from 'lucide-react';
import type { CorporateEntity, Employee, PayrollRecord2026, PayrollPayoutKind } from '../types';
import type { PayrollDocumentDisplaySettings } from '../types';
import {
  calculatePayslipFromRecord,
  calculateYtd,
  getDefaultPayrollDocumentDisplaySettings,
  getPayrollDocumentDisplaySettings,
  getPayrollDocumentFieldLabels,
  getPayrollDocumentProfile,
  getPayrollDocumentProfileForRecord,
  getSeparatePayoutConfig,
  isEmployeeEligibleForPayrollPeriod,
  isSeparatePayrollRecord,
  sortPayrollRecords
} from '../data';
import PayslipDocumentView from './PayslipDocumentView';
import PayrollEditorMockupView from './PayrollEditorMockupView';

interface PayrollViewProps {
  employees: Employee[];
  payrollRecords2026?: PayrollRecord2026[];
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<void>;
  onShowNotification: (title: string, message: string) => void;
  activeEntity?: CorporateEntity;
  onSavePayrollRecord?: (record: PayrollRecord2026) => Promise<void>;
}

type PayrollSubTab = 'processing' | 'document' | 'history';
type PayrollDocumentViewMode = 'regular' | 'payout';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const HISTORY_MONTHS = ['', ...MONTHS];

const formatMoney = (value: number) =>
  `RM ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

export default function PayrollView({
  employees,
  payrollRecords2026 = [],
  onUpdateEmployee,
  onShowNotification,
  activeEntity,
  onSavePayrollRecord
}: PayrollViewProps) {
  const defaultPeriod = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const [selectedPayPeriod, setSelectedPayPeriod] = useState(defaultPeriod);
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id || '');
  const [activeSubTab, setActiveSubTab] = useState<PayrollSubTab>('processing');
  const [displaySettingsDraft, setDisplaySettingsDraft] = useState<PayrollDocumentDisplaySettings>({});
  const [isSavingDisplaySettings, setIsSavingDisplaySettings] = useState(false);
  const [selectedPayoutKind, setSelectedPayoutKind] = useState<Exclude<PayrollPayoutKind, 'regular'> | null>(null);
  const [selectedPayrollRecord, setSelectedPayrollRecord] = useState<PayrollRecord2026 | null>(null);

  const [monthName, selectedYearText] = selectedPayPeriod.split(' ');
  const payMonthIndex = Math.max(1, MONTHS.indexOf(monthName) + 1);
  const payYear = Number(selectedYearText) || new Date().getFullYear();

  const entityEmployees = useMemo(() => {
    if (!activeEntity?.id) return employees;

    const scopedEmployees = employees.filter(employee => employee.entityId === activeEntity.id);
    return scopedEmployees.length > 0 ? scopedEmployees : employees;
  }, [activeEntity, employees]);

  const eligibleEmployees = useMemo(() => entityEmployees.filter(employee => (
    (selectedDepartment === 'All Departments' || employee.department === selectedDepartment) &&
    isEmployeeEligibleForPayrollPeriod(employee, payMonthIndex, payYear)
  )), [entityEmployees, payMonthIndex, payYear, selectedDepartment]);

  useEffect(() => {
    const candidatePool = eligibleEmployees.length > 0 ? eligibleEmployees : entityEmployees;
    if (candidatePool.length > 0 && !candidatePool.some(employee => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(candidatePool[0].id);
    }
  }, [eligibleEmployees, entityEmployees, selectedEmployeeId]);

  const activePayrollEmployee = entityEmployees.find(employee => employee.id === selectedEmployeeId) || entityEmployees[0];
  const activeDocumentProfile = activePayrollEmployee ? getPayrollDocumentProfile(activePayrollEmployee) : null;
  const activeDocumentFieldLabels = activeDocumentProfile
    ? getPayrollDocumentFieldLabels(activeDocumentProfile)
    : getPayrollDocumentFieldLabels({ isPaymentVoucher: false });
  const activeRegularPayrollRecord = activePayrollEmployee
    ? payrollRecords2026
      .filter(record => (
        record?.employeeEmail?.toLowerCase() === activePayrollEmployee.email.toLowerCase() &&
        record.payrollMonth === payMonthIndex &&
        record.payrollYear === payYear &&
        !isSeparatePayrollRecord(record)
      ))
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))[0]
    : undefined;

  useEffect(() => {
    if (activePayrollEmployee) {
      setDisplaySettingsDraft(getPayrollDocumentDisplaySettings(activePayrollEmployee));
    }
  }, [activePayrollEmployee?.id, activePayrollEmployee?.payrollDocumentDisplaySettings, activePayrollEmployee?.employmentType, activePayrollEmployee?.contractStatutoryTreatment]);

  const displaySettingFields: Array<{ key: keyof PayrollDocumentDisplaySettings; label: string; statutoryOnly?: boolean }> = [
    { key: 'showDesignation', label: activeDocumentFieldLabels.designation },
    { key: 'showDepartment', label: 'Department' },
    { key: 'showEmail', label: 'Email' },
    { key: 'showNricPassport', label: 'NRIC / Passport' },
    { key: 'showTin', label: 'TIN / Tax Number' },
    { key: 'showEpfNumber', label: 'EPF Number', statutoryOnly: true },
    { key: 'showDateJoined', label: activeDocumentFieldLabels.dateJoined },
    { key: 'showLastWorkingDay', label: 'Last Working Day' },
    { key: 'showBankAccount', label: 'Bank Account' },
    { key: 'showCompanyAddress', label: 'Company Address' },
    { key: 'showEarningsDetails', label: 'Earnings Details' },
    { key: 'showDeductionDetails', label: 'Deduction Details' },
    { key: 'showEmployerContributions', label: 'Employer Contributions', statutoryOnly: true },
    { key: 'showYtdSummary', label: 'YTD Summary' },
    { key: 'showNotesFooter', label: 'Notes / Footer' }
  ];

  const handleSaveDisplaySettings = async () => {
    if (!activePayrollEmployee || !onUpdateEmployee) {
      onShowNotification('Display Settings Not Saved', 'Employee update handler is not available for this payroll view.');
      return;
    }
    setIsSavingDisplaySettings(true);
    try {
      await onUpdateEmployee(activePayrollEmployee.id, {
        payrollDocumentDisplaySettings: displaySettingsDraft
      });
      onShowNotification('Display Settings Saved', `Payroll document display settings were saved for ${activePayrollEmployee.name}.`);
    } catch (error: any) {
      onShowNotification('Save Failed', error?.message || 'Payroll document display settings could not be saved.');
    } finally {
      setIsSavingDisplaySettings(false);
    }
  };

  const handleResetDisplaySettings = () => {
    if (!activePayrollEmployee) return;
    setDisplaySettingsDraft(getDefaultPayrollDocumentDisplaySettings(activePayrollEmployee));
  };

  const launchSeparatePayout = (kind: Exclude<PayrollPayoutKind, 'regular'>) => {
    setSelectedPayoutKind(kind);
    setSelectedPayrollRecord(null);
    setActiveSubTab('processing');
  };

  const clearSeparatePayoutMode = () => setSelectedPayoutKind(null);

  const handleSelectedEmployeeChange = (employeeId: string) => {
    setSelectedPayrollRecord(null);
    setSelectedEmployeeId(employeeId);
  };

  const handleSelectedPayPeriodChange = (payPeriod: string) => {
    setSelectedPayrollRecord(null);
    setSelectedPayPeriod(payPeriod);
  };

  const handleSelectedDepartmentChange = (department: string) => {
    setSelectedPayrollRecord(null);
    setSelectedDepartment(department);
  };

  const renderSeparatePayoutPanel = () => {
    if (!activePayrollEmployee) return null;

    const payoutKinds: Exclude<PayrollPayoutKind, 'regular'>[] = ['bonus', 'incentive_commission', 'claim_reimbursement'];

    return (
      <div className="bg-white border border-neutral-border p-4 rounded-lg shadow-xs text-left space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Generate Separate Payout</h4>
            <p className="text-[11px] text-on-surface-variant mt-1">
              Create a separate payroll record for bonus, commission, or claim reimbursement payments.
            </p>
          </div>
          {selectedPayoutKind && (
            <button
              type="button"
              onClick={clearSeparatePayoutMode}
              className="rounded border border-neutral-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-neutral-50"
            >
              Clear Selection
            </button>
          )}
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {payoutKinds.map(kind => {
            const config = getSeparatePayoutConfig(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => launchSeparatePayout(kind)}
                className={`rounded-lg border p-3 text-left transition-all hover:shadow-xs ${
                  selectedPayoutKind === kind
                    ? 'border-primary bg-primary/5'
                    : 'border-neutral-border bg-neutral-50 hover:bg-primary/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Separate Payout</span>
                  <PlusCircle className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-2 font-bold text-primary">{config.title}</p>
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  {kind === 'bonus' && 'Bonus payment document with optional statutory treatment.'}
                  {kind === 'incentive_commission' && 'Commission or incentive payment document with optional statutory treatment.'}
                  {kind === 'claim_reimbursement' && 'Claim or reimbursement voucher with optional statutory treatment.'}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDisplaySettingsPanel = () => {
    if (!activePayrollEmployee || !activeDocumentProfile) return null;

    return (
      <div className="bg-white border border-neutral-border p-4 rounded-lg shadow-xs text-left space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Document Display Settings</h4>
            <p className="text-[11px] text-on-surface-variant mt-1">
              Saved per employee and used for both Payslip and Payment Voucher output.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              activeDocumentProfile.isPaymentVoucher ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {activeDocumentProfile.documentType}
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              {activeDocumentProfile.compensationLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {displaySettingFields.map(field => {
            const disabled = field.statutoryOnly && !activeDocumentProfile.statutoryEnabled;
            return (
              <label
                key={field.key}
                className={`flex items-center gap-2 rounded border px-2.5 py-2 text-xs font-semibold ${
                  disabled ? 'border-neutral-border bg-neutral-50 text-on-surface-variant opacity-60' : 'border-neutral-border bg-white text-on-surface hover:bg-primary/5'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!displaySettingsDraft[field.key] && !disabled}
                  disabled={disabled}
                  onChange={event => setDisplaySettingsDraft(previous => ({
                    ...previous,
                    [field.key]: event.target.checked
                  }))}
                  className="h-3.5 w-3.5 accent-primary"
                />
                {field.label}
              </label>
            );
          })}
        </div>

        {!activeDocumentProfile.statutoryEnabled && (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">
            Statutory-only fields are disabled because this employee receives a Payment Voucher without statutory.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleResetDisplaySettings}
            className="rounded border border-neutral-border px-3 py-1.5 text-xs font-bold text-on-surface-variant hover:bg-neutral-50"
          >
            Reset to Default
          </button>
          <button
            type="button"
            onClick={handleSaveDisplaySettings}
            disabled={isSavingDisplaySettings}
            className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-container disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isSavingDisplaySettings ? 'Saving...' : 'Save Display Settings'}
          </button>
        </div>
      </div>
    );
  };

  const renderSubTabButton = (tab: PayrollSubTab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => {
        if (tab === 'document') {
          setSelectedPayrollRecord(null);
        }
        setActiveSubTab(tab);
      }}
      className={`flex-1 py-2 px-4 rounded font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
        activeSubTab === tab
          ? 'bg-primary text-white shadow-xs'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-neutral-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const renderHistory = () => {
    const activeEmployee = entityEmployees.find(employee => employee.id === selectedEmployeeId) || entityEmployees[0];

    if (!activeEmployee) {
      return (
        <div className="py-8 text-center text-xs text-on-surface-variant">
          No active employee found. Please register employees first.
        </div>
      );
    }

    const records = sortPayrollRecords(
      payrollRecords2026.filter(record => (
        record?.employeeEmail &&
        activeEmployee.email &&
        record.employeeEmail.toLowerCase() === activeEmployee.email.toLowerCase()
      ))
    );

    const ytd = calculateYtd(activeEmployee, selectedPayPeriod);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-neutral-50 border border-neutral-border/60 rounded-lg">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase block">YTD Basic Salary</span>
            <span className="text-lg font-mono font-bold text-primary mt-1 block">{formatMoney(ytd.basicSalary)}</span>
          </div>
          <div className="p-4 bg-neutral-50 border border-neutral-border/60 rounded-lg">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase block">YTD Allowances</span>
            <span className="text-lg font-mono font-bold text-primary mt-1 block">{formatMoney(ytd.allowances)}</span>
          </div>
          <div className="p-4 bg-neutral-50 border border-neutral-border/60 rounded-lg">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase block">YTD PCB Deducted</span>
            <span className="text-lg font-mono font-bold text-primary mt-1 block">{formatMoney(ytd.taxPcb)}</span>
          </div>
          <div className="p-4 bg-neutral-50 border border-neutral-border/60 rounded-lg">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase block">YTD Net Payout</span>
            <span className="text-lg font-mono font-bold text-green-700 mt-1 block">{formatMoney(ytd.netPay)}</span>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="py-12 border border-dashed border-neutral-border/60 rounded-lg text-center text-xs text-on-surface-variant space-y-2">
            <p className="font-bold text-on-surface">No Historical Records Found</p>
            <p>There are no saved payroll records for this employee in the database sheet yet.</p>
          </div>
        ) : (
          <div className="border border-neutral-border rounded-lg overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-border font-bold text-on-surface-variant uppercase tracking-wider">
                  <th className="p-3">Month</th>
                  <th className="p-3 text-right">Basic Salary</th>
                  <th className="p-3 text-right">Allowances</th>
                  <th className="p-3 text-right">Overtime/Variable</th>
                  <th className="p-3 text-right">EPF (Employee)</th>
                  <th className="p-3 text-right">PCB Deducted</th>
                  <th className="p-3 text-right font-bold text-green-700">Net Pay</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-border/50">
                {records.map(record => {
                  const recordBreakdown = calculatePayslipFromRecord(activeEmployee, record);
                  const savedNetPay = Number(record.netPay || 0);
                  const hasSavedNetMismatch = savedNetPay > 0 && Math.abs(savedNetPay - recordBreakdown.netPay) > 0.01;
                  const recordAllowances = Number(record.allowanceGeneral || 0) +
                    Number(record.allowanceTransport || 0) +
                    Number(record.allowanceParking || 0) +
                    Number(record.allowanceMeal || 0) +
                    Number(record.allowanceAccommodation || 0) +
                    Number(record.allowancePhone || 0);
                  const recordVariable = Number(record.overtime || 0) +
                    Number(record.bonusAmount || 0) +
                    Number(record.commissionAmount || 0) +
                    Number(record.backPayAmount || 0) +
                    Number(record.awsAmount || 0) +
                    Number(record.compensationAmount || 0);

                  return (
                    <tr key={record.id} className="hover:bg-neutral-50/40">
                      <td className="p-3 font-semibold text-primary">
                        {HISTORY_MONTHS[record.payrollMonth]} {record.payrollYear}
                        {record.isSeparatePayout && (
                          <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                            {record.payoutTitle || 'Separate Payout'}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">{formatMoney(record.basicSalary)}</td>
                      <td className="p-3 text-right font-mono text-on-surface-variant">{formatMoney(recordAllowances)}</td>
                      <td className="p-3 text-right font-mono text-on-surface-variant">{formatMoney(recordVariable)}</td>
                      <td className="p-3 text-right font-mono text-on-surface-variant">{formatMoney(record.epfEmployee)}</td>
                      <td className="p-3 text-right font-mono text-red-600">{formatMoney(record.actualPCBDeducted)}</td>
                      <td className="p-3 text-right font-mono font-bold text-green-700">
                        {formatMoney(recordBreakdown.netPay)}
                        {hasSavedNetMismatch && (
                          <span className="mt-1 block text-[10px] font-semibold text-amber-700">
                            Saved net {formatMoney(savedNetPay)}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPayrollRecord(record);
                            setSelectedPayPeriod(`${HISTORY_MONTHS[record.payrollMonth]} ${record.payrollYear}`);
                            setActiveSubTab('document');
                          }}
                          className="px-2.5 py-1 bg-primary/10 text-primary hover:bg-primary/20 rounded font-bold transition-colors cursor-pointer text-[10px]"
                        >
                          View {record.payoutTitle || record.documentType || getPayrollDocumentProfile(activeEmployee).documentType}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-200 space-y-6">
      <div className="bg-white border border-neutral-border p-1.5 rounded-lg flex gap-1.5 shadow-xs select-none text-left">
        {renderSubTabButton('processing', '1. Payroll Editor', <CreditCard className="w-4 h-4" />)}
        {renderSubTabButton('document', '2. Preview Only', <FileText className="w-4 h-4" />)}
        {renderSubTabButton('history', '3. YTD & Payroll History', <Clock className="w-4 h-4" />)}
      </div>

      <div className="bg-white border border-neutral-border p-4 rounded-lg flex justify-between items-center shadow-xs text-left select-none">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-primary" />
          <div>
            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Active Corporate Entity</h4>
            <p className="text-sm font-semibold text-on-background mt-0.5">{activeEntity?.name || 'All Subsidiaries'}</p>
          </div>
        </div>
        <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary font-mono font-bold px-2 py-0.5 rounded-sm uppercase">
          SANDBOX ISOLATED
        </span>
      </div>

      {renderSeparatePayoutPanel()}
      {renderDisplaySettingsPanel()}

      {activeSubTab === 'processing' ? (
        <PayrollEditorMockupView
          mode="embedded"
          employees={entityEmployees}
          payrollRecords2026={payrollRecords2026}
          activeEntity={activeEntity}
          selectedEmployeeId={selectedEmployeeId}
          onSelectedEmployeeIdChange={handleSelectedEmployeeChange}
          selectedPayPeriod={selectedPayPeriod}
          onSelectedPayPeriodChange={handleSelectedPayPeriodChange}
          selectedDepartment={selectedDepartment}
          onSelectedDepartmentChange={handleSelectedDepartmentChange}
          displaySettingsOverride={displaySettingsDraft}
          separatePayoutKind={selectedPayoutKind}
          onSavePayrollRecord={onSavePayrollRecord}
          onGeneratedPayrollRecord={record => {
            setSelectedPayrollRecord(record);
            setSelectedPayoutKind(record.payoutKind && record.payoutKind !== 'regular' ? record.payoutKind : null);
            setActiveSubTab('document');
          }}
          onShowNotification={onShowNotification}
        />
      ) : activeSubTab === 'document' ? (
        <div className="bg-white rounded-lg border border-neutral-border overflow-hidden shadow-xs">
          <PayslipDocumentView
            employees={eligibleEmployees.length > 0 ? eligibleEmployees : entityEmployees}
            selectedEmployeeId={selectedEmployeeId}
            onBack={() => setActiveSubTab('processing')}
            onShowNotification={onShowNotification}
            activeEntity={activeEntity}
            payMonth={payMonthIndex}
            payYear={payYear}
            displaySettingsOverride={displaySettingsDraft}
            payrollRecordOverride={selectedPayrollRecord || activeRegularPayrollRecord || undefined}
            allEmployeesForHrdCorp={entityEmployees}
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-neutral-border p-6 shadow-xs text-left space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-border/60 pb-4">
            <div>
              <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" /> YTD & Payroll History
              </h2>
              <p className="text-xs text-on-surface-variant mt-1">
                View YTD salary accumulation, statutory contributions, and net payout history for the selected employee.
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Select Employee</label>
              <select
                value={selectedEmployeeId}
                onChange={event => handleSelectedEmployeeChange(event.target.value)}
                className="rounded border border-neutral-border bg-surface p-1.5 focus:border-primary outline-none text-xs font-semibold text-primary cursor-pointer w-64"
              >
                {entityEmployees.map(employee => (
                  <option key={employee.id} value={employee.id}>{employee.name} ({employee.email})</option>
                ))}
              </select>
            </div>
          </div>

          {renderHistory()}
        </div>
      )}
    </div>
  );
}
