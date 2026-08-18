/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Edit3,
  Eye,
  FileText,
  Plus,
  RotateCcw,
  Save,
  TrendingUp,
  X
} from 'lucide-react';
import type {
  CorporateEntity,
  Employee,
  PayrollRecord2026,
  PayrollDocumentDisplaySettings,
  PayslipDescriptionOverrides,
  PayrollLineNotes,
  PayrollPayoutKind,
  ContractStatutoryTreatment
} from '../types';
import {
  calculatePayslip,
  calculatePcb2026,
  calculateYtd,
  getEffectiveTerminationDateForDate,
  getEmployeeForMonth,
  getPayrollDocumentDisplaySettings,
  getPayrollDocumentFieldLabels,
  getPayrollDocumentProfile,
  getPayrollBasicSalary,
  getSalaryProration,
  getSeparatePayoutConfig,
  getSeparatePayoutDocumentProfile,
  getHrdCorpLocalWorkerCount,
  isEmployeeEligibleForPayrollPeriod,
  isSeparatePayrollRecord,
  type PayslipBreakdown,
  type YtdBreakdown
} from '../data';
import { formatToDDMMMYYYY, getGmt8Timestamp } from '../lib/dateUtils';
import { useFeedback } from '../context/FeedbackContext';

interface PayrollEditorMockupViewProps {
  employees: Employee[];
  payrollRecords2026?: PayrollRecord2026[];
  activeEntity?: CorporateEntity;
  mode?: 'standalone' | 'embedded';
  selectedEmployeeId?: string;
  onSelectedEmployeeIdChange?: (employeeId: string) => void;
  selectedPayPeriod?: string;
  onSelectedPayPeriodChange?: (payPeriod: string) => void;
  selectedDepartment?: string;
  onSelectedDepartmentChange?: (department: string) => void;
  displaySettingsOverride?: PayrollDocumentDisplaySettings;
  separatePayoutKind?: Exclude<PayrollPayoutKind, 'regular'> | null;
  onSavePayrollRecord?: (record: PayrollRecord2026) => Promise<void>;
  onGeneratedPayrollRecord?: (record: PayrollRecord2026) => void;
  onBack?: () => void;
  onShowNotification: (title: string, message: string) => void;
}

type MockupDraft = {
  paymentDate: string;
  basicSalary: number;
  allowanceGeneral: number;
  allowanceTransport: number;
  allowanceParking: number;
  allowanceMeal: number;
  allowanceAccommodation: number;
  allowancePhone: number;
  overtime: number;
  bonusAmount: number;
  bonusDesc: string;
  commissionAmount: number;
  commissionDesc: string;
  backPayAmount: number;
  backPayDesc: string;
  awsAmount: number;
  awsDesc: string;
  compensationAmount: number;
  compensationDesc: string;
  reimbursementAmount: number;
  reimbursementDesc: string;
  otherEarningAmount: number;
  otherEarningDesc: string;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoEmployer: number;
  lindung24Employee: number;
  eisEmployee: number;
  eisEmployer: number;
  taxPcb: number;
  hrdCorp: number;
  unpaidLeave: number;
  deductionInLieu: number;
  deductionCp38: number;
  deductionOthers: number;
  deductionOthersDesc: string;
  statutoryTreatment: ContractStatutoryTreatment;
  payoutDescription: string;
  lineNotes: PayrollLineNotes;
  descriptions: PayslipDescriptionOverrides;
};

type NumberField = Exclude<keyof MockupDraft, 'paymentDate' | 'bonusDesc' | 'commissionDesc' | 'backPayDesc' | 'awsDesc' | 'compensationDesc' | 'reimbursementDesc' | 'otherEarningDesc' | 'deductionOthersDesc' | 'statutoryTreatment' | 'payoutDescription' | 'lineNotes' | 'descriptions'>;
type VariableDescriptionField = 'bonusDesc' | 'commissionDesc' | 'backPayDesc' | 'awsDesc' | 'compensationDesc' | 'reimbursementDesc' | 'otherEarningDesc';

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

const formatMoney = (value: number) =>
  `RM ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatEditableAmount = (value: number) =>
  Number.isFinite(value) ? value.toFixed(2) : '0.00';

const parseEditableAmount = (value: string) => {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDefaultPaymentDate = (month: number, year: number) =>
  `${year}-${String(month).padStart(2, '0')}-28`;

const getDraftKey = (employee: Employee, month: number, year: number, payoutKind?: Exclude<PayrollPayoutKind, 'regular'> | null) =>
  `${employee.email.toLowerCase()}_${year}_${month}_${payoutKind || 'regular'}`;

const DEFAULT_DESCRIPTION_OVERRIDES: PayslipDescriptionOverrides = {
  basicSalary: 'Basic Salary',
  allowanceGeneral: 'General Allowance',
  allowanceTransport: 'Transport Allowance',
  allowanceParking: 'Parking Allowance',
  allowanceMeal: 'Meal Allowance',
  allowanceAccommodation: 'Accommodation Allowance',
  allowancePhone: 'Phone Allowance',
  overtime: 'Overtime',
  unpaidLeave: 'Unpaid Leave',
  deductionInLieu: 'Payment in Lieu',
  deductionCp38: 'CP38 Direct Tax',
  deductionOthers: 'Other Deductions',
  epfEmployee: 'EPF Employee',
  socsoEmployee: 'SOCSO (Invalidity)',
  lindung24Employee: 'SOCSO (LINDUNG 24 Jam)',
  eisEmployee: 'EIS',
  taxPcb: 'Income Tax (PCB)'
};

const getInitialDraft = (
  employee: Employee,
  month: number,
  year: number,
  payoutKind?: Exclude<PayrollPayoutKind, 'regular'> | null,
  hrdCorpLocalWorkerCount = 0
): MockupDraft => {
  const effectiveEmployee = getEmployeeForMonth(employee, month, year);
  const breakdown = calculatePayslip(employee, month, year, {
    hrdCorpLocalWorkerCount,
    hrdCorpVoluntaryOptIn: true
  });
  const documentProfile = getPayrollDocumentProfile(effectiveEmployee);
  const separatePayoutConfig = payoutKind ? getSeparatePayoutConfig(payoutKind) : null;
  const separatePayoutAmount = separatePayoutConfig
    ? Number(effectiveEmployee[separatePayoutConfig.amountField] || 0)
    : 0;

  const regularDraft: MockupDraft = {
    paymentDate: effectiveEmployee.paymentDate || getDefaultPaymentDate(month, year),
    basicSalary: getPayrollBasicSalary(employee, month, year),
    allowanceGeneral: effectiveEmployee.allowanceGeneral || 0,
    allowanceTransport: effectiveEmployee.allowanceTransport ?? effectiveEmployee.transportAllowance ?? 0,
    allowanceParking: effectiveEmployee.allowanceParking || 0,
    allowanceMeal: effectiveEmployee.allowanceMeal || 0,
    allowanceAccommodation: effectiveEmployee.allowanceAccommodation ?? effectiveEmployee.housingAllowance ?? 0,
    allowancePhone: effectiveEmployee.allowancePhone || 0,
    overtime: effectiveEmployee.overtime || 0,
    bonusAmount: effectiveEmployee.bonusAmount ?? effectiveEmployee.performanceBonus ?? 0,
    bonusDesc: effectiveEmployee.bonusDesc || '',
    commissionAmount: effectiveEmployee.commissionAmount || 0,
    commissionDesc: effectiveEmployee.commissionDesc || '',
    backPayAmount: effectiveEmployee.backPayAmount || 0,
    backPayDesc: effectiveEmployee.backPayDesc || '',
    awsAmount: effectiveEmployee.awsAmount || 0,
    awsDesc: effectiveEmployee.awsDesc || '',
    compensationAmount: effectiveEmployee.compensationAmount || 0,
    compensationDesc: effectiveEmployee.compensationDesc || '',
    reimbursementAmount: effectiveEmployee.reimbursementAmount || 0,
    reimbursementDesc: effectiveEmployee.reimbursementDesc || '',
    otherEarningAmount: 0,
    otherEarningDesc: '',
    epfEmployee: breakdown.epfEmployeeValue,
    epfEmployer: breakdown.epfEmployerValue,
    socsoEmployee: breakdown.socsoEmployeeVal,
    socsoEmployer: breakdown.socsoEmployerVal,
    lindung24Employee: breakdown.skbbkEmpVal,
    eisEmployee: breakdown.eisEmployeeVal,
    eisEmployer: breakdown.eisEmployerVal,
    taxPcb: breakdown.taxPcbVal,
    hrdCorp: breakdown.hrdCorpVal,
    unpaidLeave: effectiveEmployee.unpaidLeave || 0,
    deductionInLieu: effectiveEmployee.deductionInLieu || 0,
    deductionCp38: effectiveEmployee.deductionCp38 || 0,
    deductionOthers: effectiveEmployee.deductionOthers || 0,
    deductionOthersDesc: effectiveEmployee.deductionOthersDesc || '',
    statutoryTreatment: documentProfile.statutoryEnabled ? 'with_statutory' : 'without_statutory',
    payoutDescription: '',
    lineNotes: {},
    descriptions: {
      ...DEFAULT_DESCRIPTION_OVERRIDES,
      ...(effectiveEmployee.deductionOthersDesc ? { deductionOthers: effectiveEmployee.deductionOthersDesc } : {}),
      ...(effectiveEmployee.payslipDescriptions || {})
    }
  };

  if (!separatePayoutConfig) {
    return regularDraft;
  }

  return {
    ...regularDraft,
    basicSalary: 0,
    allowanceGeneral: 0,
    allowanceTransport: 0,
    allowanceParking: 0,
    allowanceMeal: 0,
    allowanceAccommodation: 0,
    allowancePhone: 0,
    overtime: 0,
    bonusAmount: payoutKind === 'bonus' ? separatePayoutAmount : 0,
    bonusDesc: payoutKind === 'bonus' ? (effectiveEmployee.bonusDesc || separatePayoutConfig.compensationLabel) : '',
    commissionAmount: payoutKind === 'incentive_commission' ? separatePayoutAmount : 0,
    commissionDesc: payoutKind === 'incentive_commission' ? (effectiveEmployee.commissionDesc || separatePayoutConfig.compensationLabel) : '',
    backPayAmount: 0,
    backPayDesc: '',
    awsAmount: 0,
    awsDesc: '',
    compensationAmount: 0,
    compensationDesc: '',
    reimbursementAmount: payoutKind === 'claim_reimbursement' ? separatePayoutAmount : 0,
    reimbursementDesc: payoutKind === 'claim_reimbursement' ? (effectiveEmployee.reimbursementDesc || separatePayoutConfig.compensationLabel) : '',
    otherEarningAmount: 0,
    otherEarningDesc: '',
    epfEmployee: 0,
    epfEmployer: 0,
    socsoEmployee: 0,
    socsoEmployer: 0,
    lindung24Employee: 0,
    eisEmployee: 0,
    eisEmployer: 0,
    taxPcb: 0,
    hrdCorp: 0,
    unpaidLeave: 0,
    deductionInLieu: 0,
    deductionCp38: 0,
    deductionOthers: 0,
    deductionOthersDesc: '',
    statutoryTreatment: separatePayoutConfig.defaultStatutoryTreatment,
    payoutDescription: '',
    lineNotes: {},
    descriptions: { ...DEFAULT_DESCRIPTION_OVERRIDES }
  };
};

const getMatchingPayrollRecord = (
  records: PayrollRecord2026[],
  employee: Employee,
  month: number,
  year: number,
  payoutKind?: Exclude<PayrollPayoutKind, 'regular'> | null
) => records
  .filter(record => (
    record?.employeeEmail?.toLowerCase() === employee.email.toLowerCase() &&
    record.payrollMonth === month &&
    record.payrollYear === year &&
    (payoutKind
      ? record.payoutKind === payoutKind && isSeparatePayrollRecord(record)
      : !isSeparatePayrollRecord(record))
  ))
  .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))[0];

const getDraftFromPayrollRecord = (
  record: PayrollRecord2026,
  employee: Employee,
  month: number,
  year: number,
  payoutKind?: Exclude<PayrollPayoutKind, 'regular'> | null,
  hrdCorpLocalWorkerCount = 0
): MockupDraft => {
  const fallbackDraft = getInitialDraft(employee, month, year, payoutKind, hrdCorpLocalWorkerCount);
  const descriptions = {
    ...DEFAULT_DESCRIPTION_OVERRIDES,
    ...(record.deductionOthersDesc ? { deductionOthers: record.deductionOthersDesc } : {}),
    ...(record.payslipDescriptions || {})
  };

  return {
    ...fallbackDraft,
    paymentDate: record.paymentDate || fallbackDraft.paymentDate,
    basicSalary: Number(record.basicSalary ?? fallbackDraft.basicSalary),
    allowanceGeneral: Number(record.allowanceGeneral ?? fallbackDraft.allowanceGeneral),
    allowanceTransport: Number(record.allowanceTransport ?? fallbackDraft.allowanceTransport),
    allowanceParking: Number(record.allowanceParking ?? fallbackDraft.allowanceParking),
    allowanceMeal: Number(record.allowanceMeal ?? fallbackDraft.allowanceMeal),
    allowanceAccommodation: Number(record.allowanceAccommodation ?? fallbackDraft.allowanceAccommodation),
    allowancePhone: Number(record.allowancePhone ?? fallbackDraft.allowancePhone),
    overtime: Number(record.overtime ?? fallbackDraft.overtime),
    bonusAmount: Number(record.bonusAmount ?? fallbackDraft.bonusAmount),
    bonusDesc: record.bonusDesc ?? fallbackDraft.bonusDesc,
    commissionAmount: Number(record.commissionAmount ?? fallbackDraft.commissionAmount),
    commissionDesc: record.commissionDesc ?? fallbackDraft.commissionDesc,
    backPayAmount: Number(record.backPayAmount ?? fallbackDraft.backPayAmount),
    backPayDesc: record.backPayDesc ?? fallbackDraft.backPayDesc,
    awsAmount: Number(record.awsAmount ?? fallbackDraft.awsAmount),
    awsDesc: record.awsDesc ?? fallbackDraft.awsDesc,
    compensationAmount: Number(record.compensationAmount ?? fallbackDraft.compensationAmount),
    compensationDesc: record.compensationDesc ?? fallbackDraft.compensationDesc,
    reimbursementAmount: Number(record.reimbursementAmount ?? fallbackDraft.reimbursementAmount),
    reimbursementDesc: record.reimbursementDesc ?? fallbackDraft.reimbursementDesc,
    unpaidLeave: Number(record.unpaidLeave ?? fallbackDraft.unpaidLeave),
    deductionInLieu: Number(record.deductionInLieu ?? fallbackDraft.deductionInLieu),
    deductionCp38: Number(record.deductionCp38 ?? fallbackDraft.deductionCp38),
    deductionOthers: Number(record.deductionOthers ?? fallbackDraft.deductionOthers),
    deductionOthersDesc: record.deductionOthersDesc ?? fallbackDraft.deductionOthersDesc,
    statutoryTreatment: record.statutoryTreatment || fallbackDraft.statutoryTreatment,
    payoutDescription: record.payoutDescription || fallbackDraft.payoutDescription,
    lineNotes: { ...(record.lineNotes || {}) },
    descriptions,
    epfEmployee: Number(record.epfEmployee ?? fallbackDraft.epfEmployee),
    epfEmployer: Number(record.epfEmployer ?? fallbackDraft.epfEmployer),
    socsoEmployee: Number(record.socsoEmployee ?? fallbackDraft.socsoEmployee),
    socsoEmployer: Number(record.socsoEmployer ?? fallbackDraft.socsoEmployer),
    lindung24Employee: Number(record.lindung24Employee ?? fallbackDraft.lindung24Employee),
    eisEmployee: Number(record.eisEmployee ?? fallbackDraft.eisEmployee),
    eisEmployer: Number(record.eisEmployer ?? fallbackDraft.eisEmployer),
    taxPcb: Number(record.actualPCBDeducted ?? fallbackDraft.taxPcb),
    hrdCorp: fallbackDraft.hrdCorp
  };
};

const getCalculationEmployee = (employee: Employee, draft: MockupDraft): Employee => ({
  ...employee,
  historicalPayrollRecords: [],
  effectiveDatedProfiles: [],
  salaryAdjustments: [],
  paymentDate: draft.paymentDate,
  basicSalary: draft.basicSalary,
  allowanceGeneral: draft.allowanceGeneral,
  allowanceTransport: draft.allowanceTransport,
  allowanceParking: draft.allowanceParking,
  allowanceMeal: draft.allowanceMeal,
  allowanceAccommodation: draft.allowanceAccommodation,
  allowancePhone: draft.allowancePhone,
  overtime: draft.overtime,
  bonusAmount: draft.bonusAmount,
  bonusDesc: draft.bonusDesc,
  commissionAmount: draft.commissionAmount,
  commissionDesc: draft.commissionDesc,
  backPayAmount: draft.backPayAmount,
  backPayDesc: draft.backPayDesc,
  awsAmount: draft.awsAmount,
  awsDesc: draft.awsDesc,
  compensationAmount: draft.compensationAmount + draft.otherEarningAmount,
  compensationDesc: draft.compensationDesc,
  reimbursementAmount: draft.reimbursementAmount,
  reimbursementDesc: draft.reimbursementDesc,
  deductionInLieu: draft.deductionInLieu,
  deductionCp38: draft.deductionCp38,
  deductionOthers: draft.deductionOthers,
  deductionOthersDesc: draft.deductionOthersDesc,
  payslipDescriptions: draft.descriptions,
  taxPcb: draft.taxPcb
});

const getDraftPayoutAmount = (draft: MockupDraft, payoutKind?: Exclude<PayrollPayoutKind, 'regular'> | null) => {
  if (!payoutKind) return 0;
  const config = getSeparatePayoutConfig(payoutKind);
  return Number(draft[config.amountField] || 0);
};

const getStatutoryAdjustedEmployee = (employee: Employee, statutoryTreatment: ContractStatutoryTreatment): Employee => ({
  ...employee,
  employmentType: statutoryTreatment === 'with_statutory' ? 'Permanent' : 'Contract',
  eligibleForStatutory: statutoryTreatment === 'with_statutory' ? 'Yes' : 'No',
  contractStatutoryTreatment: statutoryTreatment
});

const replaceCurrentYtd = (
  ytd: YtdBreakdown,
  employee: Employee,
  month: number,
  year: number,
  breakdown: PayslipBreakdown,
  draft: MockupDraft
): YtdBreakdown => {
  if (!isEmployeeEligibleForPayrollPeriod(employee, month, year)) {
    return ytd;
  }

  const savedBasic = getPayrollBasicSalary(employee, month, year);
  const savedBreakdown = calculatePayslip(employee, month, year);

  return {
    ...ytd,
    basicSalary: ytd.basicSalary - savedBasic + draft.basicSalary,
    allowances: ytd.allowances - savedBreakdown.allowancesSum + breakdown.allowancesSum,
    grossEarnings: ytd.grossEarnings - savedBreakdown.grossEarnings + breakdown.grossEarnings,
    reimbursements: ytd.reimbursements - savedBreakdown.reimbursementsSum + breakdown.reimbursementsSum,
    epfEmployee: ytd.epfEmployee - savedBreakdown.epfEmployeeValue + breakdown.epfEmployeeValue,
    epfEmployer: ytd.epfEmployer - savedBreakdown.epfEmployerValue + breakdown.epfEmployerValue,
    socsoEmployee: ytd.socsoEmployee - savedBreakdown.socsoEmployeeVal + breakdown.socsoEmployeeVal,
    socsoEmployer: ytd.socsoEmployer - savedBreakdown.socsoEmployerVal + breakdown.socsoEmployerVal,
    eisEmployee: ytd.eisEmployee - savedBreakdown.eisEmployeeVal + breakdown.eisEmployeeVal,
    eisEmployer: ytd.eisEmployer - savedBreakdown.eisEmployerVal + breakdown.eisEmployerVal,
    skbbkEmployee: ytd.skbbkEmployee - savedBreakdown.skbbkEmpVal + breakdown.skbbkEmpVal,
    skbbkEmployer: ytd.skbbkEmployer - savedBreakdown.skbbkEmplyrVal + breakdown.skbbkEmplyrVal,
    taxPcb: ytd.taxPcb - savedBreakdown.taxPcbVal + breakdown.taxPcbVal,
    totalDeductions: ytd.totalDeductions - savedBreakdown.totalDeductions + breakdown.totalDeductions,
    netPay: ytd.netPay - savedBreakdown.netPay + breakdown.netPay
  };
};

export default function PayrollEditorMockupView({
  employees,
  payrollRecords2026 = [],
  activeEntity,
  mode = 'standalone',
  selectedEmployeeId: controlledSelectedEmployeeId,
  onSelectedEmployeeIdChange,
  selectedPayPeriod: controlledSelectedPayPeriod,
  onSelectedPayPeriodChange,
  selectedDepartment: controlledSelectedDepartment,
  onSelectedDepartmentChange,
  displaySettingsOverride,
  separatePayoutKind = null,
  onSavePayrollRecord,
  onGeneratedPayrollRecord,
  onBack,
  onShowNotification
}: PayrollEditorMockupViewProps) {
  const { confirmAction } = useFeedback();
  const now = new Date();
  const isEmbedded = mode === 'embedded';
  const [internalSelectedPayPeriod, setInternalSelectedPayPeriod] = useState(
    `${MONTHS[now.getMonth()]} ${now.getFullYear()}`
  );
  const [internalSelectedDepartment, setInternalSelectedDepartment] = useState('All Departments');
  const [internalSelectedEmployeeId, setInternalSelectedEmployeeId] = useState(employees[0]?.id || '');
  const [isEditing, setIsEditing] = useState(false);
  const [editingDraft, setEditingDraft] = useState<MockupDraft | null>(null);
  const [demoDrafts, setDemoDrafts] = useState<Record<string, MockupDraft>>({});
  const [expandedEarnings, setExpandedEarnings] = useState<NumberField[]>([]);
  const [expandedDeductions, setExpandedDeductions] = useState<NumberField[]>([]);
  const [isEarningMenuOpen, setIsEarningMenuOpen] = useState(false);
  const [isDeductionMenuOpen, setIsDeductionMenuOpen] = useState(false);

  const selectedPayPeriod = controlledSelectedPayPeriod ?? internalSelectedPayPeriod;
  const selectedDepartment = controlledSelectedDepartment ?? internalSelectedDepartment;
  const selectedEmployeeId = controlledSelectedEmployeeId ?? internalSelectedEmployeeId;
  const isSeparatePayoutMode = !!separatePayoutKind;
  const separatePayoutConfig = separatePayoutKind ? getSeparatePayoutConfig(separatePayoutKind) : null;

  const setSelectedPayPeriod = (payPeriod: string) => {
    if (controlledSelectedPayPeriod === undefined) {
      setInternalSelectedPayPeriod(payPeriod);
    }
    onSelectedPayPeriodChange?.(payPeriod);
  };

  const setSelectedDepartment = (department: string) => {
    if (controlledSelectedDepartment === undefined) {
      setInternalSelectedDepartment(department);
    }
    onSelectedDepartmentChange?.(department);
  };

  const setSelectedEmployeeId = (employeeId: string) => {
    if (controlledSelectedEmployeeId === undefined) {
      setInternalSelectedEmployeeId(employeeId);
    }
    onSelectedEmployeeIdChange?.(employeeId);
  };

  const [monthName, selectedYearText] = selectedPayPeriod.split(' ');
  const payMonth = Math.max(1, MONTHS.indexOf(monthName) + 1);
  const payYear = Number(selectedYearText) || now.getFullYear();

  const departments = useMemo(() => (
    Array.from(new Set(employees.map(employee => employee.department).filter(Boolean))).sort()
  ), [employees]);

  const eligibleEmployees = useMemo(() => employees.filter(employee => (
    (selectedDepartment === 'All Departments' || employee.department === selectedDepartment) &&
    isEmployeeEligibleForPayrollPeriod(employee, payMonth, payYear)
  )), [employees, payMonth, payYear, selectedDepartment]);

  useEffect(() => {
    if (eligibleEmployees.length > 0 && !eligibleEmployees.some(employee => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(eligibleEmployees[0].id);
    }
  }, [eligibleEmployees, selectedEmployeeId]);

  useEffect(() => {
    setIsEditing(false);
    setEditingDraft(null);
    setExpandedEarnings([]);
    setExpandedDeductions([]);
    setIsEarningMenuOpen(false);
    setIsDeductionMenuOpen(false);
  }, [selectedEmployeeId, selectedPayPeriod, selectedDepartment, separatePayoutKind]);

  const rawActiveEmployee = eligibleEmployees.find(employee => employee.id === selectedEmployeeId) || eligibleEmployees[0];

  if (!rawActiveEmployee) {
    return (
      <div className={isEmbedded ? 'space-y-4' : 'max-w-5xl mx-auto space-y-4'}>
        {!isEmbedded && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Payroll Editor
          </button>
        )}
        <div className="p-10 bg-white rounded-lg border border-neutral-border text-center">
          <p className="font-bold text-primary">No eligible employees for this pay period.</p>
          <p className="text-xs text-on-surface-variant mt-1">Change the month, department, or employee filters to preview a payroll document.</p>
        </div>
      </div>
    );
  }

  const draftKey = getDraftKey(rawActiveEmployee, payMonth, payYear, separatePayoutKind);
  const matchedPayrollRecord = getMatchingPayrollRecord(
    payrollRecords2026,
    rawActiveEmployee,
    payMonth,
    payYear,
    separatePayoutKind
  );
  const hrdCorpLocalWorkerCount = getHrdCorpLocalWorkerCount(
    employees,
    payMonth,
    payYear,
    rawActiveEmployee.entityId
  );
  const savedRecordDraft = matchedPayrollRecord
    ? getDraftFromPayrollRecord(
      matchedPayrollRecord,
      rawActiveEmployee,
      payMonth,
      payYear,
      separatePayoutKind,
      hrdCorpLocalWorkerCount
    )
    : null;
  const currentDraft = savedRecordDraft || demoDrafts[draftKey] || getInitialDraft(
    rawActiveEmployee,
    payMonth,
    payYear,
    separatePayoutKind,
    hrdCorpLocalWorkerCount
  );
  const activeDraft = editingDraft || currentDraft;
  const effectiveEmployee = getEmployeeForMonth(rawActiveEmployee, payMonth, payYear);
  const selectedPayoutAmount = getDraftPayoutAmount(activeDraft, separatePayoutKind);
  const documentProfile = isSeparatePayoutMode && separatePayoutKind
    ? getSeparatePayoutDocumentProfile(separatePayoutKind, activeDraft.statutoryTreatment)
    : getPayrollDocumentProfile(effectiveEmployee);
  const documentFieldLabels = getPayrollDocumentFieldLabels(documentProfile);
  const displaySettings = {
    ...getPayrollDocumentDisplaySettings(effectiveEmployee),
    ...(displaySettingsOverride || {})
  };
  if (!documentProfile.statutoryEnabled) {
    displaySettings.showEpfNumber = false;
    displaySettings.showEmployerContributions = false;
  }
  const statutoryBasis = isSeparatePayoutMode ? selectedPayoutAmount : activeDraft.basicSalary;
  const calculationEmployee = isSeparatePayoutMode
    ? getStatutoryAdjustedEmployee(getCalculationEmployee(effectiveEmployee, activeDraft), activeDraft.statutoryTreatment)
    : getCalculationEmployee(effectiveEmployee, activeDraft);
  const calculateStatutoryBreakdown = (draft: MockupDraft, treatment: ContractStatutoryTreatment) => {
    const draftStatutoryBasis = isSeparatePayoutMode ? getDraftPayoutAmount(draft, separatePayoutKind) : draft.basicSalary;
    const calculationDraft = {
      ...draft,
      epfEmployee: 0,
      epfEmployer: 0,
      socsoEmployee: 0,
      socsoEmployer: 0,
      lindung24Employee: 0,
      eisEmployee: 0,
      eisEmployer: 0,
      taxPcb: 0,
      hrdCorp: 0
    };
    const employeeForCalc = isSeparatePayoutMode
      ? getStatutoryAdjustedEmployee(getCalculationEmployee(effectiveEmployee, calculationDraft), treatment)
      : getCalculationEmployee(effectiveEmployee, calculationDraft);
    return calculatePayslip(employeeForCalc, payMonth, payYear, {
      basicSalaryOverride: isSeparatePayoutMode ? 0 : draft.basicSalary,
      statutorySalaryOverride: isSeparatePayoutMode ? draftStatutoryBasis : undefined,
      ignoreSavedStatutory: true,
      hrdCorpLocalWorkerCount,
      hrdCorpVoluntaryOptIn: true
    });
  };
  const getDefaultStatutoryDraftValues = (draft: MockupDraft, treatment: ContractStatutoryTreatment) => {
    if (treatment === 'without_statutory') {
      return {
        epfEmployee: 0,
        epfEmployer: 0,
        socsoEmployee: 0,
        socsoEmployer: 0,
        lindung24Employee: 0,
        eisEmployee: 0,
        eisEmployer: 0,
        taxPcb: 0,
        hrdCorp: 0
      };
    }

    const statutoryBreakdown = calculateStatutoryBreakdown(draft, treatment);
    const draftStatutoryBasis = isSeparatePayoutMode ? getDraftPayoutAmount(draft, separatePayoutKind) : draft.basicSalary;
    return {
      epfEmployee: statutoryBreakdown.epfEmployeeValue,
      epfEmployer: statutoryBreakdown.epfEmployerValue,
      socsoEmployee: statutoryBreakdown.socsoEmployeeVal,
      socsoEmployer: statutoryBreakdown.socsoEmployerVal,
      lindung24Employee: statutoryBreakdown.skbbkEmpVal,
      eisEmployee: statutoryBreakdown.eisEmployeeVal,
      eisEmployer: statutoryBreakdown.eisEmployerVal,
      taxPcb: calculatePcb2026(
        draftStatutoryBasis,
        effectiveEmployee.maritalStatus || 'Single',
        effectiveEmployee.spouseIsWorking || 'No',
        effectiveEmployee.dependants?.length || 0,
        statutoryBreakdown.epfEmployeeValue,
        payMonth
      ),
      hrdCorp: statutoryBreakdown.hrdCorpVal
    };
  };
  const breakdown = calculatePayslip(calculationEmployee, payMonth, payYear, {
    basicSalaryOverride: isSeparatePayoutMode ? 0 : activeDraft.basicSalary,
    statutorySalaryOverride: isSeparatePayoutMode ? statutoryBasis : undefined,
    ignoreSavedStatutory: true,
    hrdCorpLocalWorkerCount,
    hrdCorpVoluntaryOptIn: true,
    statutoryOverrides: {
      epfEmployee: activeDraft.epfEmployee,
      epfEmployer: activeDraft.epfEmployer,
      socsoEmployee: activeDraft.socsoEmployee,
      socsoEmployer: activeDraft.socsoEmployer,
      lindung24Employee: activeDraft.lindung24Employee,
      eisEmployee: activeDraft.eisEmployee,
      eisEmployer: activeDraft.eisEmployer,
      taxPcb: activeDraft.taxPcb
    }
  });
  const ytd = replaceCurrentYtd(
    calculateYtd(rawActiveEmployee, selectedPayPeriod),
    rawActiveEmployee,
    payMonth,
    payYear,
    breakdown,
    activeDraft
  );
  const monthEnd = `${payYear}-${String(payMonth).padStart(2, '0')}-${new Date(payYear, payMonth, 0).getDate()}`;
  const lastWorkingDay = getEffectiveTerminationDateForDate(effectiveEmployee, monthEnd);
  const proration = getSalaryProration(rawActiveEmployee, payMonth, payYear);
  const setDraftStatutoryTreatment = (treatment: ContractStatutoryTreatment) => {
    setEditingDraft(previous => previous ? {
      ...previous,
      statutoryTreatment: treatment,
      ...getDefaultStatutoryDraftValues(previous, treatment)
    } : previous);
  };

  const updateDraft = <K extends keyof MockupDraft>(field: K, value: MockupDraft[K]) => {
    setEditingDraft(previous => {
      if (!previous) return previous;
      const nextDraft = { ...previous, [field]: value };
      if (
        isSeparatePayoutMode &&
        separatePayoutConfig &&
        field === separatePayoutConfig.amountField &&
        nextDraft.statutoryTreatment === 'with_statutory'
      ) {
        return {
          ...nextDraft,
          ...getDefaultStatutoryDraftValues(nextDraft, nextDraft.statutoryTreatment)
        };
      }
      return nextDraft;
    });
  };

  const updateDescription = (field: keyof PayslipDescriptionOverrides, value: string) => {
    setEditingDraft(previous => previous ? {
      ...previous,
      descriptions: { ...previous.descriptions, [field]: value }
    } : previous);
  };

  const updateLineNote = (field: NumberField, value: string) => {
    setEditingDraft(previous => previous ? {
      ...previous,
      lineNotes: {
        ...previous.lineNotes,
        [field]: value
      }
    } : previous);
  };

  const startEditing = () => {
    setEditingDraft({
      ...currentDraft,
      descriptions: { ...currentDraft.descriptions },
      lineNotes: { ...currentDraft.lineNotes }
    });
    const defaultExpandedEarnings = ([
      'allowanceGeneral',
      'allowanceTransport',
      'allowanceParking',
      'allowanceMeal',
      'allowanceAccommodation',
      'allowancePhone',
      'overtime',
      'bonusAmount',
      'commissionAmount',
      'backPayAmount',
      'awsAmount',
      'compensationAmount',
      'reimbursementAmount',
      'otherEarningAmount',
      'basicSalary'
    ].filter(field => Number(currentDraft[field]) > 0) as NumberField[]);
    if (isSeparatePayoutMode && separatePayoutConfig && !defaultExpandedEarnings.includes(separatePayoutConfig.amountField)) {
      defaultExpandedEarnings.push(separatePayoutConfig.amountField);
    }
    setExpandedEarnings(defaultExpandedEarnings);
    setExpandedDeductions([]);
    setIsEarningMenuOpen(false);
    setIsDeductionMenuOpen(false);
    setIsEditing(true);
  };

  const buildPayrollRecord = (draft: MockupDraft): PayrollRecord2026 => {
    const recordDocumentProfile = isSeparatePayoutMode && separatePayoutKind
      ? getSeparatePayoutDocumentProfile(separatePayoutKind, draft.statutoryTreatment)
      : documentProfile;
    const recordBreakdown = calculatePayslip(
      isSeparatePayoutMode
        ? getStatutoryAdjustedEmployee(getCalculationEmployee(effectiveEmployee, draft), draft.statutoryTreatment)
        : getCalculationEmployee(effectiveEmployee, draft),
      payMonth,
      payYear,
      {
        basicSalaryOverride: isSeparatePayoutMode ? 0 : draft.basicSalary,
        statutorySalaryOverride: isSeparatePayoutMode ? getDraftPayoutAmount(draft, separatePayoutKind) : undefined,
        ignoreSavedStatutory: true,
        hrdCorpLocalWorkerCount,
        hrdCorpVoluntaryOptIn: true,
        statutoryOverrides: {
          epfEmployee: draft.epfEmployee,
          epfEmployer: draft.epfEmployer,
          socsoEmployee: draft.socsoEmployee,
          socsoEmployer: draft.socsoEmployer,
          lindung24Employee: draft.lindung24Employee,
          eisEmployee: draft.eisEmployee,
          eisEmployer: draft.eisEmployer,
          taxPcb: draft.taxPcb
        }
      }
    );
    const cleanEmployeeKey = effectiveEmployee.email.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const payoutSuffix = isSeparatePayoutMode && separatePayoutKind ? `_${separatePayoutKind}_${Date.now()}` : '';

    return {
      id: `${cleanEmployeeKey}_${payYear}_${String(payMonth).padStart(2, '0')}${payoutSuffix}`,
      employeeEmail: effectiveEmployee.email,
      payrollMonth: payMonth,
      payrollYear: payYear,
      paymentDate: draft.paymentDate,
      basicSalary: isSeparatePayoutMode ? 0 : draft.basicSalary,
      allowanceGeneral: isSeparatePayoutMode ? 0 : draft.allowanceGeneral,
      allowanceTransport: isSeparatePayoutMode ? 0 : draft.allowanceTransport,
      allowanceParking: isSeparatePayoutMode ? 0 : draft.allowanceParking,
      allowanceMeal: isSeparatePayoutMode ? 0 : draft.allowanceMeal,
      allowanceAccommodation: isSeparatePayoutMode ? 0 : draft.allowanceAccommodation,
      allowancePhone: isSeparatePayoutMode ? 0 : draft.allowancePhone,
      overtime: isSeparatePayoutMode ? 0 : draft.overtime,
      bonusAmount: draft.bonusAmount,
      bonusDesc: draft.bonusDesc,
      commissionAmount: draft.commissionAmount,
      commissionDesc: draft.commissionDesc,
      backPayAmount: isSeparatePayoutMode ? 0 : draft.backPayAmount,
      backPayDesc: draft.backPayDesc,
      awsAmount: isSeparatePayoutMode ? 0 : draft.awsAmount,
      awsDesc: draft.awsDesc,
      compensationAmount: draft.compensationAmount + draft.otherEarningAmount,
      compensationDesc: draft.compensationDesc || draft.otherEarningDesc,
      reimbursementAmount: draft.reimbursementAmount,
      reimbursementDesc: draft.reimbursementDesc,
      unpaidLeave: draft.unpaidLeave,
      deductionInLieu: draft.deductionInLieu,
      deductionCp38: draft.deductionCp38,
      deductionOthers: draft.deductionOthers,
      deductionOthersDesc: draft.deductionOthersDesc,
      payslipDescriptions: draft.descriptions,
      payoutKind: isSeparatePayoutMode ? separatePayoutKind || 'bonus' : 'regular',
      isSeparatePayout: isSeparatePayoutMode,
      statutoryTreatment: isSeparatePayoutMode ? draft.statutoryTreatment : undefined,
      payoutTitle: isSeparatePayoutMode ? separatePayoutConfig?.title : undefined,
      payoutDescription: isSeparatePayoutMode ? draft.payoutDescription : undefined,
      lineNotes: draft.lineNotes,
      documentType: recordDocumentProfile.documentType,
      compensationLabel: recordDocumentProfile.compensationLabel,
      displaySettingsSnapshot: displaySettings,
      actualPCBDeducted: recordBreakdown.taxPcbVal,
      epfEmployee: recordBreakdown.epfEmployeeValue,
      epfEmployer: recordBreakdown.epfEmployerValue,
      socsoEmployee: recordBreakdown.socsoEmployeeVal,
      socsoEmployer: recordBreakdown.socsoEmployerVal,
      lindung24Employee: recordBreakdown.skbbkEmpVal,
      eisEmployee: recordBreakdown.eisEmployeeVal,
      eisEmployer: recordBreakdown.eisEmployerVal,
      hrdCorp: recordBreakdown.hrdCorpVal,
      netPay: recordBreakdown.netPay,
      createdAt: getGmt8Timestamp()
    };
  };

  const persistPayrollDraft = async () => {
    if (!editingDraft) return;
    const recordToSave = buildPayrollRecord(editingDraft);

    if (onSavePayrollRecord) {
      try {
        await onSavePayrollRecord(recordToSave);
      } catch (error: any) {
        onShowNotification('Save Failed', error?.message || 'Payroll record could not be saved.');
        return;
      }
    } else if (isSeparatePayoutMode) {
      onShowNotification('Save Failed', 'Payroll save handler is not available for separate payout generation.');
      return;
    }

    setDemoDrafts(previous => ({ ...previous, [draftKey]: editingDraft }));
    setIsEditing(false);
    setEditingDraft(null);
    onShowNotification(
      `${recordToSave.documentType || documentProfile.documentType} Saved`,
      isSeparatePayoutMode
        ? `${recordToSave.payoutTitle || 'Separate payout'} was saved and generated for preview.`
        : `Your ${documentProfile.documentType.toLowerCase()} changes have been saved in the payroll editor session.`
    );
    onGeneratedPayrollRecord?.(recordToSave);
  };

  const saveDemo = async () => {
    if (!isSeparatePayoutMode) {
      await persistPayrollDraft();
      return;
    }

    await confirmAction({
      title: 'Generate Separate Payout',
      message: `Save and generate ${separatePayoutConfig?.title || 'this separate payout'}? It will be stored as a separate payroll record and will not overwrite the regular monthly payroll.`,
      tone: 'warning',
      confirmLabel: 'Save and Generate',
      onConfirm: persistPayrollDraft,
    });
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingDraft(null);
    setIsEarningMenuOpen(false);
    setIsDeductionMenuOpen(false);
  };

  const earningOptions: Array<{
    field: NumberField;
    label: string;
    descriptionKey?: keyof PayslipDescriptionOverrides;
    descriptionField?: VariableDescriptionField;
  }> = [
    { field: 'allowanceGeneral', label: 'General Allowance', descriptionKey: 'allowanceGeneral' },
    { field: 'allowanceTransport', label: 'Transport Allowance', descriptionKey: 'allowanceTransport' },
    { field: 'allowanceParking', label: 'Parking Allowance', descriptionKey: 'allowanceParking' },
    { field: 'allowanceMeal', label: 'Meal Allowance', descriptionKey: 'allowanceMeal' },
    { field: 'allowanceAccommodation', label: 'Accommodation Allowance', descriptionKey: 'allowanceAccommodation' },
    { field: 'allowancePhone', label: 'Phone Allowance', descriptionKey: 'allowancePhone' },
    { field: 'overtime', label: 'Overtime', descriptionKey: 'overtime' },
    { field: 'bonusAmount', label: 'Performance Bonus', descriptionField: 'bonusDesc' },
    { field: 'commissionAmount', label: 'Commission', descriptionField: 'commissionDesc' },
    { field: 'backPayAmount', label: 'BackPay / Arrears', descriptionField: 'backPayDesc' },
    { field: 'awsAmount', label: 'AWS', descriptionField: 'awsDesc' },
    { field: 'compensationAmount', label: 'Compensation / Severance', descriptionField: 'compensationDesc' },
    { field: 'reimbursementAmount', label: 'Reimbursements', descriptionField: 'reimbursementDesc' },
    { field: 'otherEarningAmount', label: 'Others:', descriptionField: 'otherEarningDesc' }
  ];
  const displayedEarningOptions = isSeparatePayoutMode
    ? earningOptions.filter(option => (
      option.field === 'bonusAmount' ||
      option.field === 'commissionAmount' ||
      option.field === 'reimbursementAmount' ||
      option.field === 'otherEarningAmount'
    ))
    : earningOptions;

  const addEarning = (field: NumberField) => {
    setExpandedEarnings(previous => previous.includes(field) ? previous : [...previous, field]);
    setIsEarningMenuOpen(false);
  };

  const deductionOptions: Array<{
    field: NumberField;
    label: string;
    subdued?: boolean;
  }> = [
    { field: 'unpaidLeave', label: 'Unpaid Leave' },
    { field: 'deductionInLieu', label: 'Payment in Lieu' },
    { field: 'deductionCp38', label: 'CP38 Direct Tax' },
    { field: 'deductionOthers', label: 'Others', subdued: true }
  ];

  const addDeduction = (field: NumberField) => {
    setExpandedDeductions(previous => previous.includes(field) ? previous : [...previous, field]);
    setIsDeductionMenuOpen(false);
  };

  const removeLine = (
    field: NumberField,
    section: 'earnings' | 'deductions',
    descriptionKey?: keyof PayslipDescriptionOverrides,
    descriptionField?: VariableDescriptionField
  ) => {
    setEditingDraft(previous => {
      if (!previous) return previous;
      const { [field]: _removedAmount, ...remainingLineNotes } = previous.lineNotes;
      const nextDescriptions = { ...previous.descriptions };
      if (descriptionKey) delete nextDescriptions[descriptionKey];

      return {
        ...previous,
        [field]: 0,
        ...(descriptionField ? { [descriptionField]: '' } : {}),
        lineNotes: remainingLineNotes,
        descriptions: nextDescriptions
      };
    });

    if (section === 'earnings') {
      setExpandedEarnings(previous => previous.filter(item => item !== field));
    } else {
      setExpandedDeductions(previous => previous.filter(item => item !== field));
    }
  };

  const useDefaultCalculatedAmount = () => {
    if (!editingDraft) return;

    const defaultBasicSalary = isSeparatePayoutMode ? 0 : proration.payableSalary;
    const baseDraft = {
      ...editingDraft,
      basicSalary: defaultBasicSalary,
      taxPcb: 0
    };
    const defaultStatutoryValues = getDefaultStatutoryDraftValues(baseDraft, editingDraft.statutoryTreatment);

    setEditingDraft(previous => previous ? {
      ...previous,
      basicSalary: defaultBasicSalary,
      ...defaultStatutoryValues
    } : previous);
    onShowNotification(
      'Default Calculated Amounts Applied',
      'Basic salary and statutory amounts were restored. Manual earnings and deductions were left unchanged.'
    );
  };

  const renderLine = ({
    label,
    amount,
    field,
    descriptionKey,
    descriptionField,
    fallback,
    alwaysShow = false,
    earningsOnly = false,
    collapsedWhenEditing = false,
    removable = false
  }: {
    label: string;
    amount: number;
    field: NumberField;
    descriptionKey?: keyof PayslipDescriptionOverrides;
    descriptionField?: VariableDescriptionField;
    fallback?: string;
    alwaysShow?: boolean;
    earningsOnly?: boolean;
    collapsedWhenEditing?: boolean;
    removable?: boolean;
  }) => {
    if (!isEditing && !alwaysShow && amount === 0) return null;
    const isPrimarySeparatePayoutLine = isSeparatePayoutMode && separatePayoutConfig?.amountField === field;
    if (isEditing && earningsOnly && field !== 'basicSalary' && !expandedEarnings.includes(field) && !isPrimarySeparatePayoutLine) return null;
    if (isEditing && collapsedWhenEditing && !expandedDeductions.includes(field)) return null;

    const descriptionValue = descriptionKey
      ? activeDraft.descriptions[descriptionKey] || ''
      : descriptionField
        ? activeDraft[descriptionField]
        : '';
    const normalizedDescriptionValue = descriptionKey === 'basicSalary' && descriptionValue === DEFAULT_DESCRIPTION_OVERRIDES.basicSalary
      ? ''
      : descriptionValue;
    const displayLabel = normalizedDescriptionValue || fallback || label;
    const isSubdued = descriptionField === 'otherEarningDesc';
    const lineNote = activeDraft.lineNotes[field] || '';

    return (
      <div key={field} className="border-t border-primary/10 py-2 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditing && (descriptionKey || descriptionField) ? (
              <input
                type="text"
                value={normalizedDescriptionValue}
                placeholder={fallback || label}
                onChange={event => descriptionKey
                  ? updateDescription(descriptionKey, event.target.value)
                  : updateDraft(descriptionField as VariableDescriptionField, event.target.value)}
                className={`w-full rounded border border-neutral-border bg-white px-2 py-1 text-xs outline-none focus:border-primary ${
                  isSubdued ? 'text-on-surface-variant' : 'text-[#5a352b]'
                } placeholder:text-[#b8a6a0]`}
              />
            ) : (
              <span className="block truncate">{displayLabel}</span>
            )}
            {isEditing ? (
              <textarea
                value={lineNote}
                onChange={event => updateLineNote(field, event.target.value)}
                placeholder="Add description for clarification..."
                rows={2}
                className="mt-1 w-full resize-y rounded border border-neutral-border bg-white px-2 py-1 text-[11px] leading-relaxed text-on-surface outline-none focus:border-primary placeholder:text-[#b8a6a0]"
              />
            ) : lineNote ? (
              <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-on-surface-variant">{lineNote}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isEditing && removable && (
              <button
                type="button"
                onClick={() => removeLine(field, earningsOnly ? 'earnings' : 'deductions', descriptionKey, descriptionField)}
                className="rounded border border-red-300 px-1.5 py-1 text-[10px] font-bold text-red-700 hover:bg-red-50"
              >
                Cancel
              </button>
            )}
            {isEditing ? (
              <input
                type="text"
                inputMode="decimal"
                value={formatEditableAmount(Number(activeDraft[field] || 0))}
                onChange={event => updateDraft(field, parseEditableAmount(event.target.value))}
                className="w-28 rounded border border-neutral-border bg-white px-2 py-1 text-right font-mono text-xs outline-none focus:border-primary"
              />
            ) : (
              <span className="font-mono">{formatMoney(amount)}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderEmployerLine = (label: string, field: NumberField, amount: number) => (
    <div className="min-w-0 flex-1">
      <span className="block text-[10px] font-semibold text-on-surface-variant uppercase">{label}</span>
      {isEditing ? (
        <input
          type="text"
          inputMode="decimal"
          value={formatEditableAmount(Number(activeDraft[field] || 0))}
          onChange={event => updateDraft(field, parseEditableAmount(event.target.value))}
          className="mt-1 w-full rounded border border-neutral-border bg-white px-2 py-1 font-mono text-xs outline-none focus:border-primary"
        />
      ) : (
        <span className="mt-1 block font-mono font-bold text-on-surface">{formatMoney(amount)}</span>
      )}
    </div>
  );

  return (
    <div className={`${isEmbedded ? '' : 'max-w-6xl mx-auto'} space-y-5 animate-in fade-in duration-200`}>
      {!isEmbedded && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded border border-neutral-border bg-white px-3 py-2 text-xs font-bold text-primary hover:bg-neutral-50"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Payroll
            </button>
            <div>
              <h1 className="text-xl font-bold text-primary">Payroll Editor</h1>
              <p className="text-xs text-on-surface-variant">Simplified payroll document canvas for editing</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            <Eye className="w-3.5 h-3.5" /> Payroll editor session
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-border bg-white p-4 shadow-xs lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Employee</label>
          <select
            value={rawActiveEmployee.id}
            onChange={event => setSelectedEmployeeId(event.target.value)}
            className="w-full rounded border border-neutral-border bg-white px-2.5 py-2 text-xs font-semibold text-primary outline-none focus:border-primary"
          >
            {eligibleEmployees.map(employee => (
              <option key={employee.id} value={employee.id}>{employee.name} - {employee.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Month</label>
          <select
            value={monthName}
            onChange={event => setSelectedPayPeriod(`${event.target.value} ${payYear}`)}
            className="w-full rounded border border-neutral-border bg-white px-2.5 py-2 text-xs outline-none focus:border-primary"
          >
            {MONTHS.map(month => <option key={month}>{month}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Year</label>
          <select
            value={String(payYear)}
            onChange={event => setSelectedPayPeriod(`${monthName} ${event.target.value}`)}
            className="w-full rounded border border-neutral-border bg-white px-2.5 py-2 text-xs outline-none focus:border-primary"
          >
            {Array.from({ length: 31 }, (_, index) => 2020 + index).reverse().map(year => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Department</label>
          <select
            value={selectedDepartment}
            onChange={event => setSelectedDepartment(event.target.value)}
            className="w-full rounded border border-neutral-border bg-white px-2.5 py-2 text-xs outline-none focus:border-primary"
          >
            <option>All Departments</option>
            {departments.map(department => <option key={department}>{department}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={isEditing ? cancelEditing : startEditing}
          className="inline-flex items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-container"
        >
          {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
          {isEditing ? 'Cancel Edit' : `Edit ${isSeparatePayoutMode ? separatePayoutConfig?.title : documentProfile.documentType}`}
        </button>
      </div>

      {isSeparatePayoutMode && separatePayoutConfig && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-xs shadow-xs">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-900">
                Generate Separate Payout: {separatePayoutConfig.title}
              </h3>
              <p className="text-amber-800">
                This payout will be saved as a separate payroll record and will not overwrite the regular monthly salary payroll.
              </p>
            </div>
            <div className="min-w-[280px] text-[10px] font-bold uppercase tracking-wider text-amber-900">
              <span>Statutory Treatment</span>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded border border-amber-300 bg-white p-1">
                <button
                  type="button"
                  disabled={!isEditing}
                  aria-pressed={activeDraft.statutoryTreatment === 'with_statutory'}
                  onClick={() => setDraftStatutoryTreatment('with_statutory')}
                  className={`rounded px-2 py-2 text-left text-[11px] normal-case tracking-normal transition-colors ${
                    activeDraft.statutoryTreatment === 'with_statutory'
                      ? 'bg-primary text-white'
                      : 'text-amber-900 hover:bg-amber-50'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="block font-black">With Statutory</span>
                  <span className="mt-0.5 block text-[9px] font-semibold opacity-80">Generate Payslip</span>
                </button>
                <button
                  type="button"
                  disabled={!isEditing}
                  aria-pressed={activeDraft.statutoryTreatment === 'without_statutory'}
                  onClick={() => setDraftStatutoryTreatment('without_statutory')}
                  className={`rounded px-2 py-2 text-left text-[11px] normal-case tracking-normal transition-colors ${
                    activeDraft.statutoryTreatment === 'without_statutory'
                      ? 'bg-primary text-white'
                      : 'text-amber-900 hover:bg-amber-50'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="block font-black">Without Statutory</span>
                  <span className="mt-0.5 block text-[9px] font-semibold opacity-80">Generate Payment Voucher</span>
                </button>
              </div>
              <p className="mt-1 text-[10px] font-medium normal-case tracking-normal text-amber-800/80">
                {isEditing ? 'Select either treatment before saving.' : 'Click Edit to change the treatment.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-on-surface-variant">
            {isSeparatePayoutMode
              ? 'Separate payout edit mode is active. Enter the payout amount, statutory treatment, and long descriptions before generating.'
              : 'Inline edit mode is active. Add earnings only when needed, or restore calculated statutory amounts.'}
          </p>
          <button
            type="button"
            onClick={saveDemo}
            className="inline-flex items-center justify-center gap-2 rounded bg-green-700 px-4 py-2 font-bold text-white hover:bg-green-800"
          >
            <Save className="w-4 h-4" /> {isSeparatePayoutMode ? 'Save and Generate' : 'Save'}
          </button>
        </div>
      )}

      <article className="mx-auto max-w-5xl rounded border border-[#e3d3c4] bg-[#fffdfa] p-5 text-[#5a352b] shadow-sm sm:p-8">
        <header className="flex flex-col gap-4 border-b border-[#eadfd6] pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-primary">{documentProfile.documentType.toUpperCase()}</h2>
            <p className="mt-1 text-xs text-on-surface-variant">{selectedPayPeriod}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              <CalendarDays className="w-3.5 h-3.5" /> {activeEntity?.name || 'Active Entity'}
            </span>
            <span className={`ml-2 mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              documentProfile.isPaymentVoucher ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {documentProfile.compensationLabel}
            </span>
          </div>
          <div className="text-left text-xs sm:text-right">
            <p className="font-bold text-primary">{activeEntity?.name || 'Company not configured'}</p>
            {displaySettings.showCompanyAddress && (
              <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-on-surface-variant">
                {activeEntity?.address || 'Company address not configured'}
              </p>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-x-10 gap-y-4 border-b border-[#eadfd6] py-6 text-xs sm:grid-cols-2">
          <div className="space-y-3">
            <div><span className="block text-[10px] text-on-surface-variant">{documentProfile.isPaymentVoucher ? 'Recipient Name' : 'Employee Name'}</span><strong className="block mt-0.5 text-primary">{effectiveEmployee.name}</strong></div>
            {displaySettings.showDesignation && <div><span className="block text-[10px] text-on-surface-variant">{documentFieldLabels.designation}</span><strong className="block mt-0.5 text-primary">{effectiveEmployee.designation}</strong></div>}
            {displaySettings.showDepartment && <div><span className="block text-[10px] text-on-surface-variant">Department</span><strong className="block mt-0.5 text-primary">{effectiveEmployee.department}</strong></div>}
            {displaySettings.showNricPassport && <div><span className="block text-[10px] text-on-surface-variant">NRIC / Passport</span><strong className="block mt-0.5 font-mono text-primary">{effectiveEmployee.nricPassport || 'N/A'}</strong></div>}
            {displaySettings.showDateJoined && <div><span className="block text-[10px] text-on-surface-variant">{documentFieldLabels.dateJoined}</span><strong className="block mt-0.5 text-primary">{formatToDDMMMYYYY(effectiveEmployee.dateOfJoined)}</strong></div>}
            {displaySettings.showTin && <div><span className="block text-[10px] text-on-surface-variant">TIN / Tax Number</span><strong className="block mt-0.5 font-mono text-primary">{effectiveEmployee.taxNumber || 'N/A'}</strong></div>}
          </div>
          <div className="space-y-3">
            {displaySettings.showEmail && <div><span className="block text-[10px] text-on-surface-variant">Email Address</span><strong className="block mt-0.5 break-all text-primary">{effectiveEmployee.email}</strong></div>}
            {displaySettings.showBankAccount && <div><span className="block text-[10px] text-on-surface-variant">Bank Account</span><strong className="block mt-0.5 text-primary">{effectiveEmployee.bankName || 'N/A'} <span className="font-mono">- {effectiveEmployee.accountNo || 'N/A'}</span></strong></div>}
            <div>
              <span className="block text-[10px] text-on-surface-variant">Payment Date</span>
              {isEditing ? (
                <input
                  type="date"
                  value={activeDraft.paymentDate}
                  onChange={event => updateDraft('paymentDate', event.target.value)}
                  className="mt-1 rounded border border-neutral-border bg-white px-2 py-1 font-mono text-xs outline-none focus:border-primary"
                />
              ) : (
                <strong className="block mt-0.5 text-primary">{formatToDDMMMYYYY(activeDraft.paymentDate)}</strong>
              )}
            </div>
            {displaySettings.showEpfNumber && <div><span className="block text-[10px] text-on-surface-variant">EPF Member Number</span><strong className="block mt-0.5 font-mono text-primary">{effectiveEmployee.epfNumber || 'N/A'}</strong></div>}
            {displaySettings.showLastWorkingDay && <div><span className="block text-[10px] text-on-surface-variant">Last Working Day</span><strong className="block mt-0.5 text-primary">{lastWorkingDay ? formatToDDMMMYYYY(lastWorkingDay) : 'N/A'}</strong></div>}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8 border-b border-[#eadfd6] py-6 lg:grid-cols-2 lg:gap-10">
          <div>
            <h3 className="flex items-center gap-2 border-b border-[#eadfd6] pb-2 text-sm font-bold text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-600" /> Earnings & Additions
            </h3>
            <div className="mt-1">
            {isSeparatePayoutMode && separatePayoutConfig ? (
                <>
                  {renderLine({
                    label: separatePayoutConfig.title,
                    amount: selectedPayoutAmount,
                    field: separatePayoutConfig.amountField,
                    descriptionField: separatePayoutConfig.descriptionField,
                    fallback: separatePayoutConfig.title,
                    alwaysShow: true,
                    earningsOnly: true
                  })}
                  {displaySettings.showEarningsDetails && displayedEarningOptions
                    .filter(option => option.field !== separatePayoutConfig.amountField)
                    .map(option => renderLine({
                      label: option.label,
                      amount: activeDraft[option.field],
                      field: option.field,
                      descriptionKey: option.descriptionKey,
                      descriptionField: option.descriptionField,
                      fallback: option.label,
                      earningsOnly: true,
                      removable: true
                    }))}
                </>
              ) : (
                renderLine({ label: documentProfile.compensationLabel, amount: activeDraft.basicSalary, field: 'basicSalary', descriptionKey: 'basicSalary', fallback: documentProfile.compensationLabel, alwaysShow: true, earningsOnly: true })
              )}
              {!isSeparatePayoutMode && displaySettings.showEarningsDetails && (
                <>
                  {renderLine({ label: 'General Allowance', amount: activeDraft.allowanceGeneral, field: 'allowanceGeneral', descriptionKey: 'allowanceGeneral', fallback: 'General Allowance', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Transport Allowance', amount: activeDraft.allowanceTransport, field: 'allowanceTransport', descriptionKey: 'allowanceTransport', fallback: 'Transport Allowance', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Parking Allowance', amount: activeDraft.allowanceParking, field: 'allowanceParking', descriptionKey: 'allowanceParking', fallback: 'Parking Allowance', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Meal Allowance', amount: activeDraft.allowanceMeal, field: 'allowanceMeal', descriptionKey: 'allowanceMeal', fallback: 'Meal Allowance', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Accommodation Allowance', amount: activeDraft.allowanceAccommodation, field: 'allowanceAccommodation', descriptionKey: 'allowanceAccommodation', fallback: 'Accommodation Allowance', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Phone Allowance', amount: activeDraft.allowancePhone, field: 'allowancePhone', descriptionKey: 'allowancePhone', fallback: 'Phone Allowance', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Overtime', amount: activeDraft.overtime, field: 'overtime', descriptionKey: 'overtime', fallback: 'Overtime', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Performance Bonus', amount: activeDraft.bonusAmount, field: 'bonusAmount', descriptionField: 'bonusDesc', fallback: 'Performance Bonus', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Commission', amount: activeDraft.commissionAmount, field: 'commissionAmount', descriptionField: 'commissionDesc', fallback: 'Commission', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'BackPay / Arrears', amount: activeDraft.backPayAmount, field: 'backPayAmount', descriptionField: 'backPayDesc', fallback: 'BackPay / Arrears', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'AWS', amount: activeDraft.awsAmount, field: 'awsAmount', descriptionField: 'awsDesc', fallback: 'AWS', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Compensation / Severance', amount: activeDraft.compensationAmount, field: 'compensationAmount', descriptionField: 'compensationDesc', fallback: 'Compensation / Severance', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Reimbursements', amount: activeDraft.reimbursementAmount, field: 'reimbursementAmount', descriptionField: 'reimbursementDesc', fallback: 'Reimbursements', earningsOnly: true, removable: true })}
                  {renderLine({ label: 'Others:', amount: activeDraft.otherEarningAmount, field: 'otherEarningAmount', descriptionField: 'otherEarningDesc', fallback: 'Others:', earningsOnly: true, removable: true })}
                </>
              )}
              {isEditing && displaySettings.showEarningsDetails && (
                <div className="relative mt-3">
                  <button
                    type="button"
                    onClick={() => setIsEarningMenuOpen(previous => !previous)}
                    className="inline-flex items-center gap-1.5 rounded border border-dashed border-green-600/50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> {isSeparatePayoutMode ? 'Add payment item' : 'Add earning'}
                  </button>
                  {isEarningMenuOpen && (
                    <div className="absolute left-0 top-10 z-20 w-64 rounded border border-neutral-border bg-white p-2 shadow-xl">
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                        {isSeparatePayoutMode ? 'Choose a payment item' : 'Choose an earning'}
                      </p>
                      {displayedEarningOptions.map(option => {
                        const isAdded = expandedEarnings.includes(option.field);
                        return (
                        <button
                          key={option.field}
                          type="button"
                          disabled={isAdded}
                          onClick={() => addEarning(option.field)}
                          className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                            option.field === 'otherEarningAmount'
                              ? 'text-on-surface-variant hover:bg-neutral-50 hover:text-on-surface'
                              : 'text-on-surface hover:bg-primary/5 hover:text-primary'
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <span>{option.label}</span>
                          {isAdded && <span className="text-[9px] font-bold uppercase tracking-wider">Added</span>}
                        </button>
                        );
                      })}
                      {displayedEarningOptions.every(option => expandedEarnings.includes(option.field)) && (
                        <p className="px-2 py-1.5 text-xs text-on-surface-variant">All earning types are already visible.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-primary/20 pt-3 text-xs font-bold text-primary">
                <span>{documentProfile.isPaymentVoucher ? 'Gross Amount' : 'Total Earnings & Reimbursements'}</span>
                <span className="font-mono">{formatMoney(breakdown.grossEarnings + breakdown.reimbursementsSum)}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 border-b border-[#eadfd6] pb-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-red-700">
                <span className="h-2 w-2 rounded-full bg-red-600" /> Deductions
              </h3>
              {isEditing && documentProfile.statutoryEnabled && (
                <button
                  type="button"
                  onClick={useDefaultCalculatedAmount}
                  className="inline-flex items-center justify-center gap-2 rounded border border-primary/30 bg-white px-3 py-2 text-[10px] font-bold text-primary hover:bg-primary/5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Use Default Calculated Amount
                </button>
              )}
            </div>
            <div className="mt-1">
              {documentProfile.statutoryEnabled && (
                <>
                  {renderLine({ label: `EPF (Employee ${effectiveEmployee.epfRateEmployee || 11}%)`, amount: breakdown.epfEmployeeValue, field: 'epfEmployee', descriptionKey: 'epfEmployee', fallback: `EPF (Employee ${effectiveEmployee.epfRateEmployee || 11}%)`, alwaysShow: true })}
                  {renderLine({ label: 'SOCSO (Invalidity)', amount: breakdown.socsoEmployeeVal, field: 'socsoEmployee', descriptionKey: 'socsoEmployee', fallback: 'SOCSO (Invalidity)' })}
                  {renderLine({ label: 'SOCSO (LINDUNG 24 Jam)', amount: breakdown.skbbkEmpVal, field: 'lindung24Employee', descriptionKey: 'lindung24Employee', fallback: 'SOCSO (LINDUNG 24 Jam)' })}
                  {renderLine({ label: 'EIS', amount: breakdown.eisEmployeeVal, field: 'eisEmployee', descriptionKey: 'eisEmployee', fallback: 'EIS', alwaysShow: true })}
                  {renderLine({ label: 'Income Tax (PCB)', amount: breakdown.taxPcbVal, field: 'taxPcb', descriptionKey: 'taxPcb', fallback: 'Income Tax (PCB)', alwaysShow: true })}
                </>
              )}
              {isEditing && (
                <div className="relative mt-3">
                  <button
                    type="button"
                    onClick={() => setIsDeductionMenuOpen(previous => !previous)}
                    className="inline-flex items-center gap-1.5 rounded border border-dashed border-red-600/50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add deduction
                  </button>
                  {isDeductionMenuOpen && (
                    <div className="absolute left-0 top-10 z-20 w-64 rounded border border-neutral-border bg-white p-2 shadow-xl">
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Choose a deduction</p>
                      {deductionOptions
                        .filter(option => documentProfile.statutoryEnabled || option.field !== 'deductionCp38')
                        .map(option => {
                        const isAdded = expandedDeductions.includes(option.field);
                        return (
                        <button
                          key={option.field}
                          type="button"
                          disabled={isAdded}
                          onClick={() => addDeduction(option.field)}
                          className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                            option.subdued
                              ? 'text-on-surface-variant hover:bg-neutral-50 hover:text-on-surface'
                              : 'text-on-surface hover:bg-red-50 hover:text-red-700'
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span>{option.label}</span>
                            {isAdded && <span className="text-[9px] font-bold uppercase tracking-wider">Added</span>}
                          </span>
                        </button>
                        );
                      })}
                      {deductionOptions
                        .filter(option => documentProfile.statutoryEnabled || option.field !== 'deductionCp38')
                        .every(option => expandedDeductions.includes(option.field)) && (
                        <p className="px-2 py-1.5 text-xs text-on-surface-variant">All deduction types are already visible.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {displaySettings.showDeductionDetails && (
                <>
                  {renderLine({ label: 'Unpaid Leave', amount: activeDraft.unpaidLeave, field: 'unpaidLeave', descriptionKey: 'unpaidLeave', fallback: 'Unpaid Leave', collapsedWhenEditing: true, removable: true })}
                  {renderLine({ label: 'Payment in Lieu', amount: activeDraft.deductionInLieu, field: 'deductionInLieu', descriptionKey: 'deductionInLieu', fallback: 'Payment in Lieu', collapsedWhenEditing: true, removable: true })}
                  {documentProfile.statutoryEnabled && renderLine({ label: 'CP38 Direct Tax', amount: activeDraft.deductionCp38, field: 'deductionCp38', descriptionKey: 'deductionCp38', fallback: 'CP38 Direct Tax', collapsedWhenEditing: true, removable: true })}
                  {renderLine({ label: 'Other Deductions', amount: activeDraft.deductionOthers, field: 'deductionOthers', descriptionKey: 'deductionOthers', fallback: activeDraft.deductionOthersDesc || 'Other Deductions', collapsedWhenEditing: true, removable: true })}
                </>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-red-200 pt-3 text-xs font-bold text-red-700">
                <span>{documentProfile.isPaymentVoucher ? 'Other Deductions' : 'Total Deductions'}</span>
                <span className="font-mono">{formatMoney(breakdown.totalDeductions)}</span>
              </div>
            </div>
          </div>
        </section>

	        {documentProfile.statutoryEnabled && displaySettings.showEmployerContributions && (
	          <section className="rounded border border-[#e3d3c4] bg-[#f8f1e8] p-4">
	            <h3 className="text-xs font-bold text-on-surface-variant">
	              Employer Contributions <span className="font-normal">(Not paid to employee)</span>
	            </h3>
	            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
	              {renderEmployerLine(`EPF (${effectiveEmployee.epfRateEmployer || 13}%)`, 'epfEmployer', breakdown.epfEmployerValue)}
	              {renderEmployerLine('SOCSO', 'socsoEmployer', breakdown.socsoEmployerVal)}
	              {renderEmployerLine('EIS', 'eisEmployer', breakdown.eisEmployerVal)}
	            </div>
	          </section>
	        )}

	        {displaySettings.showYtdSummary && (
	        <section className="mt-6 rounded border border-[#e3d3c4] bg-[#fcfaf7] p-4">
	          <div className="flex flex-col gap-2 border-b border-[#eadfd6] pb-3 sm:flex-row sm:items-center sm:justify-between">
	            <h3 className="flex items-center gap-2 text-sm font-bold text-primary">
	              <TrendingUp className="w-4 h-4" /> Year-to-Date (YTD) Balances
            </h3>
            <span className="w-fit rounded-full bg-neutral-200/70 px-2.5 py-1 font-mono text-[10px] font-semibold text-on-surface-variant">
              Accrued up to {selectedPayPeriod} ({ytd.months} Months)
            </span>
	          </div>
	          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
	            {[
	              [documentProfile.isPaymentVoucher ? 'YTD Gross Amount' : 'YTD Gross Pay', ytd.grossEarnings, 'text-on-surface'],
	              ...(documentProfile.statutoryEnabled ? [
	                ['YTD EPF (Emp)', ytd.epfEmployee, 'text-on-surface'],
	                ['YTD Tax (PCB)', ytd.taxPcb, 'text-red-700']
	              ] : []),
	              [documentProfile.isPaymentVoucher ? 'YTD Net Payable' : 'YTD Net Pay', ytd.netPay, 'text-primary']
	            ].map(([label, value, color]) => (
	              <div key={String(label)} className="rounded border border-neutral-border/50 bg-white p-3">
	                <span className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
                <span className={`mt-1 block font-mono text-sm font-bold ${color}`}>{formatMoney(Number(value))}</span>
              </div>
	            ))}
	          </div>
	          {documentProfile.statutoryEnabled && (
	            <div className="mt-3 grid grid-cols-2 gap-2 rounded border border-neutral-border/30 bg-white p-3 text-[10px] text-on-surface-variant sm:grid-cols-4">
	              <span>YTD Allowances: <strong className="font-mono text-on-surface">{formatMoney(ytd.allowances)}</strong></span>
	              <span>YTD SOCSO (Emp): <strong className="font-mono text-on-surface">{formatMoney(ytd.socsoEmployee)}</strong></span>
	              <span>YTD LINDUNG 24: <strong className="font-mono text-on-surface">{formatMoney(ytd.skbbkEmployee)}</strong></span>
	              <span>YTD EIS (Emp): <strong className="font-mono text-on-surface">{formatMoney(ytd.eisEmployee)}</strong></span>
	            </div>
	          )}
	        </section>
	        )}

	        <section className="mt-5 rounded border border-primary/20 bg-primary/5 p-4">
	          <div className="flex items-center justify-between gap-4">
	            <h3 className="text-xs font-bold text-primary">Calculation Summary</h3>
	            <span className="font-mono text-sm font-bold text-primary">{formatMoney(breakdown.netPay)}</span>
	          </div>
	          <div className="mt-3 space-y-1 text-xs">
	            <div className="flex justify-between gap-4"><span className="text-on-surface-variant">{documentProfile.isPaymentVoucher ? 'Gross Amount' : 'Gross Earnings + Reimbursements'}</span><span className="font-mono">{formatMoney(breakdown.grossEarnings + breakdown.reimbursementsSum)}</span></div>
	            <div className="flex justify-between gap-4"><span className="text-on-surface-variant">{documentProfile.isPaymentVoucher ? 'Other Deductions' : 'Total Deductions'}</span><span className="font-mono text-red-700">- {formatMoney(breakdown.totalDeductions)}</span></div>
	            <div className="flex justify-between gap-4 border-t border-primary/15 pt-2 font-bold text-primary"><span>{documentProfile.isPaymentVoucher ? 'Net Payable' : 'Net Pay'}</span><span className="font-mono">{formatMoney(breakdown.netPay)}</span></div>
	          </div>
	        </section>

        {proration.isProrated && (
          <div className="mt-4 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <Check className="h-4 w-4 shrink-0" />
            Prorated salary preview: {proration.eligibleDays} of {proration.calendarDays} eligible days.
          </div>
        )}
      </article>

      {!isEmbedded && (
        <div className="flex items-center justify-center gap-2 text-[10px] text-on-surface-variant">
          <FileText className="w-3.5 h-3.5" />
          This payroll editor mirrors the document information hierarchy without saving payroll data.
        </div>
      )}
    </div>
  );
}
