/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import rawScheduleData from './data/perkeso_lindung24_phase1_2026.json';

import { 
  CorporateEntity, 
  Employee, 
  CareerHistoryEntry,
  ReviewCycle, 
  EmployeePerformance, 
  Candidate,
  PCBProcessingMode,
  HistoricalCalculationBasis,
  HistoricalPCBStatus,
  EmployeeTaxProfile,
  HistoricalPayrollRecord,
  TP1Declaration,
  TP3Data,
  PCBCalculationStep,
  HistoricalPCBResult,
  PCBHistoricalVariance,
  HistoricalPCBMonthContext,
  EmployeePCBHistoryLedgerEntry,
  EmployeeTP3Declaration,
  Dependant,
  ContractStatutoryTreatment,
  PayrollDocumentDisplaySettings,
  PayrollDocumentType,
  PayrollPayoutKind,
  PayrollRecord2026
} from './types';
import { getGmt8DateString } from './lib/dateUtils';
import { Decimal, dec } from './lib/decimal';
import {
  SOCSOSchemeCode,
  SOCSOCategory,
  SOCSOPhase,
  EmployeeSocsoProfile,
  SOCSOConfiguration,
  SOCSOBracket,
  SocsoEarningComponent,
  SocsoManualOverride,
  SocsoAuditLog,
  SocsoContributionResult,
  SOCSOContributionSchedule,
  SOCSOContributionBracket
} from './types';

export const INITIAL_ENTITIES: CorporateEntity[] = [];

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_REVIEW_CYCLES: ReviewCycle[] = [];

export const INITIAL_PERFORMANCES: EmployeePerformance[] = [];

export interface PayslipBreakdown {
  grossEarnings: number;
  epfEmployeeValue: number;
  epfEmployerValue: number;
  socsoEmployeeVal: number;
  socsoEmployerVal: number;
  eisEmployeeVal: number;
  eisEmployerVal: number;
  taxPcbVal: number;
  skbbkEmpVal: number;
  skbbkEmplyrVal: number;
  hrdCorpVal: number;
  totalDeductions: number;
  totalEmployerContributions: number;
  netPay: number;
  allowancesSum: number;
  reimbursementsSum: number;
}

export interface PayslipStatutoryOverrides {
  epfEmployee?: number;
  epfEmployer?: number;
  socsoEmployee?: number;
  socsoEmployer?: number;
  lindung24Employee?: number;
  eisEmployee?: number;
  eisEmployer?: number;
  taxPcb?: number;
  hrdCorp?: number;
}

export interface PayslipCalculationOptions {
  basicSalaryOverride?: number;
  statutorySalaryOverride?: number;
  statutoryEligibilityOverride?: boolean;
  statutoryOverrides?: PayslipStatutoryOverrides;
  ignoreSavedStatutory?: boolean;
  hrdCorpLocalWorkerCount?: number;
  hrdCorpVoluntaryOptIn?: boolean;
}

export function isLocalHrdCorpWorker(employee: Pick<Employee, 'nationality'>): boolean {
  const nationality = String(employee.nationality || '').trim().toLowerCase();
  return nationality === 'malaysian' || nationality === 'local' || nationality.includes('malaysia');
}

export function getHrdCorpLevyRate(localWorkerCount: number, voluntaryOptIn = true): number {
  if (localWorkerCount >= 10) return 0.01;
  if (localWorkerCount >= 5 && voluntaryOptIn) return 0.005;
  return 0;
}

export function getHrdCorpLocalWorkerCount(
  employees: Employee[],
  month: number,
  year: number,
  entityId?: string
): number {
  return employees.filter(employee => (
    (!entityId || employee.entityId === entityId) &&
    isLocalHrdCorpWorker(employee) &&
    isEmployeeEligibleForPayrollPeriod(employee, month, year)
  )).length;
}

export interface PayrollDocumentProfile {
  documentType: PayrollDocumentType;
  compensationLabel: string;
  statutoryEnabled: boolean;
  isPaymentVoucher: boolean;
  requiresContractStatutoryChoice: boolean;
  contractStatutoryTreatment?: ContractStatutoryTreatment;
}

export interface PayrollDocumentFieldLabels {
  detailsTitle: string;
  designation: string;
  dateJoined: string;
  employmentStatus: string;
}

export interface SeparatePayoutConfig {
  kind: Exclude<PayrollPayoutKind, 'regular'>;
  title: string;
  compensationLabel: string;
  amountField: 'bonusAmount' | 'commissionAmount' | 'reimbursementAmount';
  descriptionField: 'bonusDesc' | 'commissionDesc' | 'reimbursementDesc';
  defaultStatutoryTreatment: ContractStatutoryTreatment;
}

export const SEPARATE_PAYOUT_CONFIGS: Record<Exclude<PayrollPayoutKind, 'regular'>, SeparatePayoutConfig> = {
  bonus: {
    kind: 'bonus',
    title: 'Bonus',
    compensationLabel: 'Bonus',
    amountField: 'bonusAmount',
    descriptionField: 'bonusDesc',
    defaultStatutoryTreatment: 'with_statutory'
  },
  incentive_commission: {
    kind: 'incentive_commission',
    title: 'Incentives / Commission',
    compensationLabel: 'Incentives / Commission',
    amountField: 'commissionAmount',
    descriptionField: 'commissionDesc',
    defaultStatutoryTreatment: 'with_statutory'
  },
  claim_reimbursement: {
    kind: 'claim_reimbursement',
    title: 'Claim / Reimbursement',
    compensationLabel: 'Claim / Reimbursement',
    amountField: 'reimbursementAmount',
    descriptionField: 'reimbursementDesc',
    defaultStatutoryTreatment: 'without_statutory'
  }
};

export const isSeparatePayrollRecord = (record?: Pick<PayrollRecord2026, 'isSeparatePayout' | 'payoutKind'> | Pick<HistoricalPayrollRecord, 'isSeparatePayout' | 'payoutKind'>) =>
  !!record && (record.isSeparatePayout === true || (!!record.payoutKind && record.payoutKind !== 'regular'));

export const getSeparatePayoutConfig = (kind: Exclude<PayrollPayoutKind, 'regular'>): SeparatePayoutConfig =>
  SEPARATE_PAYOUT_CONFIGS[kind];

export function mergePayrollRecords2026(records: PayrollRecord2026[], recordToSave: PayrollRecord2026): PayrollRecord2026[] {
  const savingSeparatePayout = isSeparatePayrollRecord(recordToSave);
  const filtered = records.filter(record => {
    if (record.id === recordToSave.id) return false;
    if (savingSeparatePayout || isSeparatePayrollRecord(record)) return true;
    return !(
      record.employeeEmail.toLowerCase() === recordToSave.employeeEmail.toLowerCase() &&
      record.payrollMonth === recordToSave.payrollMonth &&
      record.payrollYear === recordToSave.payrollYear
    );
  });
  return [...filtered, recordToSave];
}

export function getSeparatePayoutDocumentProfile(kind: Exclude<PayrollPayoutKind, 'regular'>, statutoryTreatment: ContractStatutoryTreatment): PayrollDocumentProfile {
  const config = getSeparatePayoutConfig(kind);
  const statutoryEnabled = statutoryTreatment === 'with_statutory';

  return {
    documentType: statutoryEnabled ? 'Payslip' : 'Payment Voucher',
    compensationLabel: config.compensationLabel,
    statutoryEnabled,
    isPaymentVoucher: !statutoryEnabled,
    requiresContractStatutoryChoice: false,
    contractStatutoryTreatment: statutoryTreatment
  };
}

export function getPayrollDocumentProfileForRecord(
  employee: Pick<Employee, 'employmentType' | 'eligibleForStatutory' | 'contractStatutoryTreatment'>,
  record?: Pick<PayrollRecord2026, 'documentType' | 'compensationLabel' | 'payoutKind' | 'isSeparatePayout' | 'statutoryTreatment'>
): PayrollDocumentProfile {
  const baseProfile = getPayrollDocumentProfile(employee);

  if (!record || !isSeparatePayrollRecord(record)) {
    return record?.documentType
      ? {
        ...baseProfile,
        documentType: record.documentType,
        isPaymentVoucher: record.documentType === 'Payment Voucher',
        statutoryEnabled: record.documentType === 'Payment Voucher' ? false : baseProfile.statutoryEnabled,
        compensationLabel: record.compensationLabel || baseProfile.compensationLabel
      }
      : baseProfile;
  }

  const payoutKind = (record.payoutKind && record.payoutKind !== 'regular' ? record.payoutKind : 'bonus') as Exclude<PayrollPayoutKind, 'regular'>;
  const statutoryTreatment = record.statutoryTreatment || (record.documentType === 'Payment Voucher' ? 'without_statutory' : 'with_statutory');
  return {
    ...getSeparatePayoutDocumentProfile(payoutKind, statutoryTreatment),
    documentType: record.documentType || (statutoryTreatment === 'with_statutory' ? 'Payslip' : 'Payment Voucher'),
    compensationLabel: record.compensationLabel || getSeparatePayoutConfig(payoutKind).compensationLabel
  };
}

const isContractEmploymentType = (employmentType?: string) =>
  employmentType === 'Contract' || employmentType === 'Fixed Term Contract';

const resolveContractStatutoryTreatment = (employee: Pick<Employee, 'employmentType' | 'eligibleForStatutory' | 'contractStatutoryTreatment'>): ContractStatutoryTreatment | undefined => {
  if (!isContractEmploymentType(employee.employmentType)) {
    return undefined;
  }
  if (employee.contractStatutoryTreatment) {
    return employee.contractStatutoryTreatment;
  }
  if (employee.eligibleForStatutory === 'Yes') {
    return 'with_statutory';
  }
  if (employee.eligibleForStatutory === 'No') {
    return 'without_statutory';
  }
  return undefined;
};

export function getPayrollDocumentProfile(employee: Pick<Employee, 'employmentType' | 'eligibleForStatutory' | 'contractStatutoryTreatment'>): PayrollDocumentProfile {
  const employmentType = employee.employmentType || 'Permanent';
  const contractTreatment = resolveContractStatutoryTreatment(employee);

  if (employmentType === 'Probation' || employmentType === 'Probationary' || employmentType === 'Permanent' || employmentType === 'Confirmation') {
    return {
      documentType: 'Payslip',
      compensationLabel: 'Basic Salary',
      statutoryEnabled: true,
      isPaymentVoucher: false,
      requiresContractStatutoryChoice: false
    };
  }

  if (isContractEmploymentType(employmentType)) {
    const statutoryEnabled = contractTreatment === 'with_statutory';
    return {
      documentType: statutoryEnabled ? 'Payslip' : 'Payment Voucher',
      compensationLabel: statutoryEnabled ? 'Basic Salary' : 'Service Fees',
      statutoryEnabled,
      isPaymentVoucher: !statutoryEnabled,
      requiresContractStatutoryChoice: !contractTreatment,
      contractStatutoryTreatment: contractTreatment
    };
  }

  if (employmentType === 'Part Time') {
    return {
      documentType: 'Payment Voucher',
      compensationLabel: 'Wages / Service Fees',
      statutoryEnabled: false,
      isPaymentVoucher: true,
      requiresContractStatutoryChoice: false
    };
  }

  if (employmentType === 'Independent Contractor' || employmentType === 'Independent Contractor / Freelance') {
    return {
      documentType: 'Payment Voucher',
      compensationLabel: 'Monthly Retainer',
      statutoryEnabled: false,
      isPaymentVoucher: true,
      requiresContractStatutoryChoice: false
    };
  }

  if (employmentType === 'Internship') {
    return {
      documentType: 'Payment Voucher',
      compensationLabel: 'Allowance',
      statutoryEnabled: false,
      isPaymentVoucher: true,
      requiresContractStatutoryChoice: false
    };
  }

  return {
    documentType: 'Payslip',
    compensationLabel: 'Basic Salary',
    statutoryEnabled: true,
    isPaymentVoucher: false,
    requiresContractStatutoryChoice: false
  };
}

export function getPayrollDocumentFieldLabels(profile: Pick<PayrollDocumentProfile, 'isPaymentVoucher'>): PayrollDocumentFieldLabels {
  if (profile.isPaymentVoucher) {
    return {
      detailsTitle: 'Recipient Details',
      designation: 'Service Role',
      dateJoined: 'Engagement Start Date',
      employmentStatus: 'Engagement Status'
    };
  }

  return {
    detailsTitle: 'Employee Details',
    designation: 'Designation',
    dateJoined: 'Date Joined',
    employmentStatus: 'Employment Status'
  };
}

export function getDefaultPayrollDocumentDisplaySettings(employee: Pick<Employee, 'employmentType' | 'eligibleForStatutory' | 'contractStatutoryTreatment'>): Required<PayrollDocumentDisplaySettings> {
  const profile = getPayrollDocumentProfile(employee);
  return {
    showDesignation: true,
    showDepartment: true,
    showEmail: true,
    showNricPassport: true,
    showTin: true,
    showEpfNumber: profile.statutoryEnabled,
    showDateJoined: true,
    showLastWorkingDay: true,
    showBankAccount: true,
    showCompanyAddress: true,
    showEarningsDetails: true,
    showDeductionDetails: true,
    showEmployerContributions: profile.statutoryEnabled,
    showYtdSummary: profile.statutoryEnabled,
    showNotesFooter: true
  };
}

export function getPayrollDocumentDisplaySettings(employee: Pick<Employee, 'employmentType' | 'eligibleForStatutory' | 'contractStatutoryTreatment' | 'payrollDocumentDisplaySettings'>): Required<PayrollDocumentDisplaySettings> {
  const profile = getPayrollDocumentProfile(employee);
  const defaults = getDefaultPayrollDocumentDisplaySettings(employee);
  const merged = {
    ...defaults,
    ...(employee.payrollDocumentDisplaySettings || {})
  };

  if (!profile.statutoryEnabled) {
    merged.showEpfNumber = false;
    merged.showEmployerContributions = false;
  }

  return merged;
}

export function getPayslipLabel(employmentType: string): string {
  return getPayrollDocumentProfile({ employmentType: employmentType as Employee['employmentType'] }).compensationLabel;
}

export function getStatutoryDeductions2026(salary: number): {
  socsoEmployee: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
} {
  if (salary <= 0) {
    return { socsoEmployee: 0, socsoEmployer: 0, eisEmployee: 0, eisEmployer: 0 };
  }

  // 1. EIS (0.2% Employee, 0.2% Employer, capped at RM6,000 ceiling in 2026)
  let eisEmployee = 0;
  let eisEmployer = 0;
  
  if (salary >= 6000) {
    eisEmployee = 11.90;
    eisEmployer = 11.90;
  } else {
    const bracketVal = Math.ceil(salary / 100) * 100;
    eisEmployee = parseFloat((bracketVal * 0.002 - 0.10).toFixed(2));
    eisEmployer = eisEmployee;
    if (eisEmployee < 0.10) {
      eisEmployee = 0.10;
      eisEmployer = 0.10;
    }
  }

  // 2. SOCSO (Category 1 - Employment Injury & Invalidity, capped at RM6,000 ceiling in 2026)
  let socsoEmployee = 0;
  let socsoEmployer = 0;

  if (salary >= 6000) {
    socsoEmployee = 29.15;
    socsoEmployer = 101.50;
  } else {
    const bracketVal = Math.ceil(salary / 100) * 100;
    if (bracketVal <= 1000) {
      socsoEmployee = parseFloat((bracketVal * 0.005 - 0.25).toFixed(2));
      socsoEmployer = parseFloat((bracketVal * 0.0175 - 0.75).toFixed(2));
    } else if (bracketVal <= 3000) {
      socsoEmployee = parseFloat((bracketVal * 0.005 - 0.25).toFixed(2));
      socsoEmployer = parseFloat((bracketVal * 0.0175 - 1.00).toFixed(2));
    } else if (bracketVal <= 4000) {
      socsoEmployee = parseFloat((bracketVal * 0.005 - 0.25).toFixed(2));
      socsoEmployer = parseFloat((bracketVal * 0.0175 - 1.50).toFixed(2));
    } else if (bracketVal <= 5000) {
      socsoEmployee = parseFloat((bracketVal * 0.005 - 0.75).toFixed(2));
      socsoEmployer = parseFloat((bracketVal * 0.0175 - 3.00).toFixed(2));
    } else { // 5000 to 6000
      socsoEmployee = parseFloat((bracketVal * 0.005 - 0.85).toFixed(2));
      socsoEmployer = parseFloat((bracketVal * 0.0175 - 3.50).toFixed(2));
    }

    if (socsoEmployee < 0.10) socsoEmployee = 0.10;
    if (socsoEmployer < 0.40) socsoEmployer = 0.40;
  }

  return { socsoEmployee, socsoEmployer, eisEmployee, eisEmployer };
}

export const DEFAULT_SOCSO_EARNING_COMPONENTS: SocsoEarningComponent[] = [
  { earningCode: 'basic_salary', earningName: 'Basic Salary', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Salary', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'overtime', earningName: 'Overtime Pay', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Overtime', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'commission', earningName: 'Commissions', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Commission', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'allowance_general', earningName: 'General Allowance', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Allowance', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'allowance_transport', earningName: 'Transport Allowance', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Allowance', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'allowance_parking', earningName: 'Parking Allowance', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Allowance', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'allowance_meal', earningName: 'Meal Allowance', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Allowance', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'allowance_accommodation', earningName: 'Accommodation Allowance', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Allowance', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'allowance_phone', earningName: 'Phone Allowance', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Allowance', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'bonus', earningName: 'Performance Bonus', subjectToSocso: false, includedInSocsoWages: false, excludedFromSocsoWages: true, earningCategory: 'Bonus', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'backpay', earningName: 'BackPay / Arrears', subjectToSocso: true, includedInSocsoWages: true, excludedFromSocsoWages: false, earningCategory: 'Remuneration', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'aws', earningName: 'AWS (13th Month)', subjectToSocso: false, includedInSocsoWages: false, excludedFromSocsoWages: true, earningCategory: 'Bonus', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'compensation', earningName: 'Compensation / Severance', subjectToSocso: false, includedInSocsoWages: false, excludedFromSocsoWages: true, earningCategory: 'Compensation', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false },
  { earningCode: 'reimbursement', earningName: 'Reimbursement', subjectToSocso: false, includedInSocsoWages: false, excludedFromSocsoWages: true, earningCategory: 'Reimbursement', effectiveFrom: '2020-01-01', effectiveTo: '9999-12-31', statutoryReference: 'Act 4', requiresReview: false }
];

function roundToTwoDecimals(val: number): number {
  return Math.round(val * 100) / 100;
}

export function parseDobFromNric(nric: string): string {
  if (!nric) return '1990-01-01';
  const clean = nric.replace(/[^0-9]/g, '');
  if (clean.length < 6) return '1990-01-01';
  const yy = clean.substring(0, 2);
  const mm = clean.substring(2, 4);
  const dd = clean.substring(4, 6);
  const yearPrefix = parseInt(yy, 10) > 30 ? '19' : '20';
  return `${yearPrefix}${yy}-${mm}-${dd}`;
}

export function generateOfficialSocsoBrackets(configId: string, category: 'FIRST_CATEGORY' | 'SECOND_CATEGORY', phase: SOCSOPhase): SOCSOBracket[] {
  const boundaries = [
    { min: 0, max: 30, assumed: 30 },
    { min: 30, max: 50, assumed: 50 },
    { min: 50, max: 70, assumed: 70 },
    { min: 70, max: 100, assumed: 100 },
    { min: 100, max: 140, assumed: 140 },
    { min: 140, max: 200, assumed: 200 },
    { min: 200, max: 300, assumed: 300 },
    { min: 300, max: 400, assumed: 400 },
  ];

  for (let val = 400; val < 5900; val += 100) {
    boundaries.push({
      min: val,
      max: val + 100,
      assumed: val + 100
    });
  }
  
  // Maximum bracket 5900 to 6000 has midpoint assumed wage 5950
  boundaries.push({
    min: 5900,
    max: 6000,
    assumed: 5950
  });

  boundaries.push({
    min: 6000,
    max: 999999,
    assumed: 5950
  });

  return boundaries.map((b, index) => {
    let employerEmploymentInjury = 0;
    let employerInvalidity = 0;
    let employeeInvalidity = 0;
    let employeeNonEmploymentInjury = 0;

    const assumed = b.assumed;

    // Progressive deduction constants for employer and employee contributions to align with standard tables
    let C_er = 0;
    let C_ee_l24 = 0;

    if (phase === 'PRE_JUNE_2026') {
      if (assumed === 900) C_er = 0.10;
      else if (assumed === 1000) C_er = 0.15;
      else if (assumed === 4000) C_er = 0.30;
      else if (assumed === 5000) C_er = (category === 'FIRST_CATEGORY') ? 1.00 : 0.40;
      else if (assumed === 5950) C_er = 0.025;
    } else {
      if (assumed === 900) C_er = 0.10;
      else if (assumed === 1000) C_er = 0.15;
      else if (assumed === 3500) {
        C_er = 0.35;
        C_ee_l24 = 0.20;
      }
      else if (assumed === 4000) C_er = 0.30;
      else if (assumed === 5000) C_er = 0.40;
      else if (assumed === 5950) C_er = 0.025;
    }

    if (phase === 'PRE_JUNE_2026') {
      if (category === 'FIRST_CATEGORY') {
        const empTotal = roundToTwoDecimals(assumed * 0.0175 - C_er);
        employerInvalidity = roundToTwoDecimals(assumed * 0.005);
        employerEmploymentInjury = roundToTwoDecimals(empTotal - employerInvalidity);
        employeeInvalidity = roundToTwoDecimals(assumed * 0.005);
        employeeNonEmploymentInjury = 0;
      } else {
        employerEmploymentInjury = roundToTwoDecimals(assumed * 0.0125 - C_er);
        employerInvalidity = 0;
        employeeInvalidity = 0;
        employeeNonEmploymentInjury = 0;
      }
    } else {
      let lindung24Rate = 0.0075; // Phase 1
      if (phase === 'LINDUNG24_PHASE_2') lindung24Rate = 0.0100;
      if (phase === 'LINDUNG24_PHASE_3') lindung24Rate = 0.0125;

      if (category === 'FIRST_CATEGORY') {
        const empTotal = roundToTwoDecimals(assumed * 0.0175 - C_er);
        employerInvalidity = roundToTwoDecimals(assumed * 0.005);
        employerEmploymentInjury = roundToTwoDecimals(empTotal - employerInvalidity);

        employeeInvalidity = roundToTwoDecimals(assumed * 0.005);
        employeeNonEmploymentInjury = roundToTwoDecimals(assumed * lindung24Rate - C_ee_l24);
      } else {
        employerEmploymentInjury = roundToTwoDecimals(assumed * 0.0125 - C_er);
        employerInvalidity = 0;
        employeeInvalidity = 0;
        employeeNonEmploymentInjury = roundToTwoDecimals(assumed * lindung24Rate - C_ee_l24);
      }
    }

    // Min boundary limits override matching Act 4 guidelines
    if (b.min === 0) {
      if (phase === 'PRE_JUNE_2026') {
        if (category === 'FIRST_CATEGORY') {
          employerEmploymentInjury = 0.30;
          employerInvalidity = 0.10;
          employeeInvalidity = 0.10;
        } else {
          employerEmploymentInjury = 0.30;
        }
      } else {
        if (category === 'FIRST_CATEGORY') {
          employerEmploymentInjury = 0.40;
          employerInvalidity = 0.15;
          employeeInvalidity = 0.15;
          employeeNonEmploymentInjury = 0.25;
        } else {
          employerEmploymentInjury = 0.40;
          employeeNonEmploymentInjury = 0.25;
        }
      }
    }

    const employerTotal = roundToTwoDecimals(employerEmploymentInjury + employerInvalidity);
    const employeeTotal = roundToTwoDecimals(employeeInvalidity + employeeNonEmploymentInjury);
    const combinedTotal = roundToTwoDecimals(employerTotal + employeeTotal);

    return {
      id: `${configId}-bracket-${index + 1}`,
      configurationId: configId,
      contributionCategory: category,
      lowerWageLimit: b.min,
      upperWageLimit: b.max,
      lowerLimitInclusive: b.min > 0 ? false : true,
      upperLimitInclusive: true,
      wageBracketNumber: index + 1,
      assumedMonthlyWage: assumed,
      employerEmploymentInjury: parseFloat(employerEmploymentInjury.toFixed(2)),
      employerInvalidity: parseFloat(employerInvalidity.toFixed(2)),
      employerTotal: parseFloat(employerTotal.toFixed(2)),
      employeeInvalidity: parseFloat(employeeInvalidity.toFixed(2)),
      employeeNonEmploymentInjury: parseFloat(employeeNonEmploymentInjury.toFixed(2)),
      employeeTotal: parseFloat(employeeTotal.toFixed(2)),
      combinedTotal: parseFloat(combinedTotal.toFixed(2)),
      effectiveFrom: phase === 'PRE_JUNE_2026' ? '2020-01-01' : '2026-06-01',
      effectiveTo: phase === 'PRE_JUNE_2026' ? '2026-05-31' : '9999-12-31'
    };
  });
}

export function seedSocsoConfigurationsAndBrackets() {
  const existing = localStorage.getItem('socso_contribution_schedules');
  if (existing) return;

  const schedules: SOCSOContributionSchedule[] = [
    {
      id: 'cfg-perkeso-act4-lindung24-phase1-2026',
      schedule_code: 'PERKESO_ACT4_LINDUNG24_PHASE1_2026',
      schedule_name: 'PERKESO Act 4 First Phase Contribution Table including LINDUNG 24 JAM',
      effective_from: '2026-06-01',
      effective_to: null,
      currency: 'MYR',
      storage_unit: 'sen',
      wage_ceiling_sen: 600000,
      status: 'ACTIVE',
      official_source: 'https://www.perkeso.gov.my/images/arahan/Employer_Circular_No_2_2026-PekelilingLindung24Jam_English.pdf',
      compatibility_reference: 'https://payroll.my/payroll-software/socso-contribution-table',
      source_file_name: 'socso_perkeso_2026_contribution_table.json',
      source_file_hash: 'd3b07384d113edec49eaa6238ad5ff00',
      created_by: 'system',
      created_at: new Date().toISOString(),
      approved_by: 'system',
      approved_at: new Date().toISOString(),
      activated_by: 'system',
      activated_at: new Date().toISOString()
    }
  ];

  const brackets: SOCSOContributionBracket[] = [];
  rawScheduleData.rows.forEach((r: any) => {
    brackets.push({
      id: `cfg-perkeso-act4-lindung24-phase1-2026-bracket-${r.bracket_number}`,
      schedule_id: 'cfg-perkeso-act4-lindung24-phase1-2026',
      bracket_number: r.bracket_number,
      description: r.description,
      lower_bound_sen: r.lower_bound_sen,
      upper_bound_sen: r.upper_bound_sen,
      lower_bound_inclusive: r.lower_bound_inclusive,
      upper_bound_inclusive: r.upper_bound_inclusive,
      is_maximum_bracket: r.is_maximum_bracket,

      category1_employer_invalidity_sen: r.category1_employer_invalidity_sen,
      category1_employer_employment_injury_sen: r.category1_employer_employment_injury_sen,
      category1_employer_total_sen: r.category1_employer_total_sen,

      category1_employee_invalidity_sen: r.category1_employee_invalidity_sen,
      category1_employee_lindung24_sen: r.category1_employee_lindung24_sen,
      category1_employee_total_sen: r.category1_employee_total_sen,
      category1_grand_total_sen: r.category1_grand_total_sen,

      category2_employer_employment_injury_sen: r.category2_employer_employment_injury_sen,
      category2_employer_total_sen: r.category2_employer_total_sen,

      category2_employee_lindung24_sen: r.category2_employee_lindung24_sen,
      category2_employee_total_sen: r.category2_employee_total_sen,
      category2_grand_total_sen: r.category2_grand_total_sen,

      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });

  // Seed legacy layouts for backward compatibility in display cards/lists
  const legacyConfigs: SOCSOConfiguration[] = [
    {
      id: 'cfg-pre-june-2026-c1',
      schemeCode: 'SOCSO_ACT4',
      legislation: 'Employees Social Security Act 1969, Act 4',
      contributionCategory: 'FIRST_CATEGORY',
      phase: 'PRE_JUNE_2026',
      effectiveFrom: '2020-01',
      effectiveTo: '2026-05',
      wageCeiling: 6000,
      sourceDocument: 'PERKESO Contribution Schedule Table 1',
      sourceDocumentDate: '2020-01-01',
      sourceVersion: 'v1.0',
      status: 'approved',
      approvedBy: 'system-admin@nexus.com',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'cfg-pre-june-2026-c2',
      schemeCode: 'SOCSO_ACT4',
      legislation: 'Employees Social Security Act 1969, Act 4',
      contributionCategory: 'SECOND_CATEGORY',
      phase: 'PRE_JUNE_2026',
      effectiveFrom: '2020-01',
      effectiveTo: '2026-05',
      wageCeiling: 6000,
      sourceDocument: 'PERKESO Contribution Schedule Table 2',
      sourceDocumentDate: '2020-01-01',
      sourceVersion: 'v1.0',
      status: 'approved',
      approvedBy: 'system-admin@nexus.com',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'cfg-lindung24-p1-c1',
      schemeCode: 'LINDUNG_24_JAM',
      legislation: 'Employees Social Security Act 1969, Act 4',
      contributionCategory: 'FIRST_CATEGORY',
      phase: 'LINDUNG24_PHASE_1',
      effectiveFrom: '2026-06',
      effectiveTo: '9999-12',
      wageCeiling: 6000,
      sourceDocument: 'PERKESO Gazette June 2026 Table 1',
      sourceDocumentDate: '2026-05-01',
      sourceVersion: 'v2.0-p1',
      status: 'approved',
      approvedBy: 'system-admin@nexus.com',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'cfg-lindung24-p1-c2',
      schemeCode: 'LINDUNG_24_JAM',
      legislation: 'Employees Social Security Act 1969, Act 4',
      contributionCategory: 'SECOND_CATEGORY',
      phase: 'LINDUNG24_PHASE_1',
      effectiveFrom: '2026-06',
      effectiveTo: '9999-12',
      wageCeiling: 6000,
      sourceDocument: 'PERKESO Gazette June 2026 Table 2',
      sourceDocumentDate: '2026-05-01',
      sourceVersion: 'v2.0-p1',
      status: 'approved',
      approvedBy: 'system-admin@nexus.com',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const legacyBrackets: SOCSOBracket[] = [];
  const preJune1Brackets = generateOfficialSocsoBrackets('cfg-pre-june-2026-c1', 'FIRST_CATEGORY', 'PRE_JUNE_2026');
  const preJune2Brackets = generateOfficialSocsoBrackets('cfg-pre-june-2026-c2', 'SECOND_CATEGORY', 'PRE_JUNE_2026');
  legacyBrackets.push(...preJune1Brackets, ...preJune2Brackets);
  rawScheduleData.rows.forEach((r: any) => {
    legacyBrackets.push({
      id: `cfg-lindung24-p1-c1-bracket-${r.bracket_number}`,
      configurationId: 'cfg-lindung24-p1-c1',
      contributionCategory: 'FIRST_CATEGORY',
      lowerWageLimit: r.lower_bound_sen / 100,
      upperWageLimit: (r.upper_bound_sen || 9999999) / 100,
      lowerLimitInclusive: r.lower_bound_inclusive,
      upperLimitInclusive: r.upper_bound_inclusive,
      wageBracketNumber: r.bracket_number,
      assumedMonthlyWage: r.lower_bound_sen / 100,
      employerEmploymentInjury: r.category1_employer_employment_injury_sen / 100,
      employerInvalidity: r.category1_employer_invalidity_sen / 100,
      employerTotal: r.category1_employer_total_sen / 100,
      employeeInvalidity: r.category1_employee_invalidity_sen / 100,
      employeeNonEmploymentInjury: r.category1_employee_lindung24_sen / 100,
      employeeTotal: r.category1_employee_total_sen / 100,
      combinedTotal: r.category1_grand_total_sen / 100,
      effectiveFrom: '2026-06-01',
      effectiveTo: '9999-12-31'
    });

    legacyBrackets.push({
      id: `cfg-lindung24-p1-c2-bracket-${r.bracket_number}`,
      configurationId: 'cfg-lindung24-p1-c2',
      contributionCategory: 'SECOND_CATEGORY',
      lowerWageLimit: r.lower_bound_sen / 100,
      upperWageLimit: (r.upper_bound_sen || 9999999) / 100,
      lowerLimitInclusive: r.lower_bound_inclusive,
      upperLimitInclusive: r.upper_bound_inclusive,
      wageBracketNumber: r.bracket_number,
      assumedMonthlyWage: r.lower_bound_sen / 100,
      employerEmploymentInjury: r.category2_employer_employment_injury_sen / 100,
      employerInvalidity: 0,
      employerTotal: r.category2_employer_total_sen / 100,
      employeeInvalidity: 0,
      employeeNonEmploymentInjury: r.category2_employee_lindung24_sen / 100,
      employeeTotal: r.category2_employee_total_sen / 100,
      combinedTotal: r.category2_grand_total_sen / 100,
      effectiveFrom: '2026-06-01',
      effectiveTo: '9999-12-31'
    });
  });

  localStorage.setItem('socso_contribution_schedules', JSON.stringify(schedules));
  localStorage.setItem('socso_contribution_brackets_new', JSON.stringify(brackets));
  localStorage.setItem('socso_configurations', JSON.stringify(legacyConfigs));
  localStorage.setItem('socso_contribution_brackets', JSON.stringify(legacyBrackets));
  localStorage.setItem('socso_earning_components', JSON.stringify(DEFAULT_SOCSO_EARNING_COMPONENTS));
}

export function determineSocsoCategory(employee: Employee, payrollPeriod: string): SOCSOCategory {
  const profile = employee.socsoProfile || {
    employeeId: employee.id,
    nationality: 'Local',
    identityNumber: '',
    dateOfBirth: '1990-01-01',
    employmentStartDate: '2026-01-01',
    contractType: 'Permanent',
    isUnderContractOfService: true,
    socsoRegistrationNumber: '',
    socsoRegistered: true,
    socsoCoverageStatus: 'Covered',
    firstSocsoContributionDate: '2015-01-01',
    hasPreviousSocsoContribution: true,
    contributionCategory: 'FIRST_CATEGORY',
    multipleEmployerStatus: 'Single Employer',
    selectedEmployerForLindung24: true,
    foreignWorkerStatus: 'Local',
    domesticWorkerStatus: false,
    effectiveFrom: '2026-01-01',
    effectiveTo: '9999-12-31'
  };

  if (profile.socsoCoverageStatus === 'Exempt') {
    return 'EXEMPT';
  }

  if (!profile.dateOfBirth) {
    return 'REVIEW_REQUIRED';
  }

  const dob = new Date(profile.dateOfBirth);
  const payDate = new Date(payrollPeriod + '-01');
  let age = payDate.getFullYear() - dob.getFullYear();
  const m = payDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && payDate.getDate() < dob.getDate())) {
    age--;
  }

  if (age >= 60) {
    return 'SECOND_CATEGORY';
  }

  if (profile.hasPreviousSocsoContribution === undefined) return 'REVIEW_REQUIRED';

  if (!profile.hasPreviousSocsoContribution && !profile.firstSocsoContributionDate) {
    return 'REVIEW_REQUIRED';
  }

  if (profile.hasPreviousSocsoContribution === false && profile.firstSocsoContributionDate) {
    const firstDate = new Date(profile.firstSocsoContributionDate);
    let firstAge = firstDate.getFullYear() - dob.getFullYear();
    const firstM = firstDate.getMonth() - dob.getMonth();
    if (firstM < 0 || (firstM === 0 && firstDate.getDate() < dob.getDate())) {
      firstAge--;
    }
    if (firstAge >= 55) {
      return 'SECOND_CATEGORY';
    }
  }

  if (age >= 55 && profile.hasPreviousSocsoContribution && !profile.firstSocsoContributionDate) {
    return 'REVIEW_REQUIRED';
  }

  if (!profile.foreignWorkerStatus) return 'REVIEW_REQUIRED';
  if (profile.domesticWorkerStatus === undefined) return 'REVIEW_REQUIRED';

  if (profile.multipleEmployerStatus === 'Multiple Employers' && profile.selectedEmployerForLindung24 === undefined) {
    return 'REVIEW_REQUIRED';
  }

  return 'FIRST_CATEGORY';
}

export function formatMYRFromSen(amountInSen: number): string {
  const isNegative = amountInSen < 0;
  const absAmount = Math.abs(amountInSen);
  const ringgit = Math.floor(absAmount / 100);
  const cents = absAmount % 100;
  return `${isNegative ? '-' : ''}RM${ringgit}.${cents.toString().padStart(2, '0')}`;
}

export function calculateSocsoWagesInSen(payrollItems: { code: string; amount: number }[]): number {
  let wagesInSen = 0;
  const config = JSON.parse(localStorage.getItem('socso_earning_components') || '[]');
  const activeComponents = config.length > 0 ? config : DEFAULT_SOCSO_EARNING_COMPONENTS;

  for (const item of payrollItems) {
    if (item.code === 'unpaid_leave') continue;
    const comp = activeComponents.find(c => c.earningCode === item.code);
    if (comp && comp.includedInSocsoWages) {
      wagesInSen += new Decimal(item.amount).toIntegerCents();
    }
  }

  const unpaid = payrollItems.find(item => item.code === 'unpaid_leave');
  if (unpaid) {
    wagesInSen -= new Decimal(unpaid.amount).toIntegerCents();
  }

  return wagesInSen < 0 ? 0 : wagesInSen;
}

export function calculateSocsoWages(payrollItems: { code: string; amount: number }[]): number {
  return calculateSocsoWagesInSen(payrollItems) / 100;
}

export function findSocsoBracket(
  scheduleOrWage: SOCSOContributionSchedule | number,
  socsoWagesInSenOrCategory?: number | 'FIRST_CATEGORY' | 'SECOND_CATEGORY',
  period?: string
): any {
  if (typeof scheduleOrWage === 'object') {
    const schedule = scheduleOrWage as SOCSOContributionSchedule;
    const wagesInSen = socsoWagesInSenOrCategory as number;

    const brackets: SOCSOContributionBracket[] = JSON.parse(localStorage.getItem('socso_contribution_brackets_new') || '[]');
    const matched = brackets.filter(b => {
      if (b.schedule_id !== schedule.id) return false;
      const isAboveLower = b.lower_bound_inclusive ? (wagesInSen >= b.lower_bound_sen) : (wagesInSen > b.lower_bound_sen);
      if (!isAboveLower) return false;

      if (b.is_maximum_bracket || b.upper_bound_sen === null) {
        return true;
      }
      const isBelowUpper = b.upper_bound_inclusive ? (wagesInSen <= b.upper_bound_sen) : (wagesInSen < b.upper_bound_sen);
      return isBelowUpper;
    });

    if (matched.length === 0) {
      throw new Error(`No wage bracket is found for wage in sen: ${wagesInSen}`);
    }
    return matched[0];
  } else {
    // Legacy compatibility mode:
    const contributionWage = scheduleOrWage as number;
    const category = socsoWagesInSenOrCategory as 'FIRST_CATEGORY' | 'SECOND_CATEGORY';
    const activePeriod = period || '2026-06';
    const wagesInSen = Math.round(contributionWage * 100);

    // Find active schedule for that period and category
    const schedules: SOCSOContributionSchedule[] = JSON.parse(localStorage.getItem('socso_contribution_schedules') || '[]');
    let schedule = schedules.find(s => {
      const matchCat = s.schedule_code.includes(category === 'FIRST_CATEGORY' ? 'C1' : 'C2') || s.schedule_code.includes('PHASE1_2026') || s.schedule_code.includes('LINDUNG24');
      const startMonth = s.effective_from.substring(0, 7);
      const endMonth = s.effective_to ? s.effective_to.substring(0, 7) : null;
      return s.status === 'ACTIVE' && startMonth <= activePeriod && (endMonth === null || activePeriod <= endMonth);
    });

    if (!schedule) {
      // Fallback: use legacy SOCSOBracket mapping if no schedule active
      const brackets: SOCSOBracket[] = JSON.parse(localStorage.getItem('socso_contribution_brackets') || '[]');
      const legacyConfig = JSON.parse(localStorage.getItem('socso_configurations') || '[]').find((c: any) => c.status === 'approved' && c.effectiveFrom <= activePeriod && activePeriod <= c.effectiveTo && c.contributionCategory === category);
      if (legacyConfig) {
        const matched = brackets.filter(b => b.configurationId === legacyConfig.id && b.contributionCategory === category && contributionWage > b.lowerWageLimit && contributionWage <= b.upperWageLimit);
        if (matched.length > 0) return matched[0];
      }
      throw new Error('No active schedule found for period: ' + activePeriod);
    }

    const bracket = findSocsoBracket(schedule, wagesInSen);
    // Map SOCSOContributionBracket to legacy SOCSOBracket
    return {
      id: bracket.id,
      configurationId: bracket.schedule_id,
      contributionCategory: category,
      lowerWageLimit: bracket.lower_bound_sen / 100,
      upperWageLimit: (bracket.upper_bound_sen || 9999999) / 100,
      lowerLimitInclusive: bracket.lower_bound_inclusive,
      upperLimitInclusive: bracket.upper_bound_inclusive,
      wageBracketNumber: bracket.bracket_number,
      assumedMonthlyWage: bracket.lower_bound_sen / 100, // placeholder
      employerEmploymentInjury: (category === 'FIRST_CATEGORY' ? bracket.category1_employer_employment_injury_sen : bracket.category2_employer_employment_injury_sen) / 100,
      employerInvalidity: (category === 'FIRST_CATEGORY' ? bracket.category1_employer_invalidity_sen : 0) / 100,
      employerTotal: (category === 'FIRST_CATEGORY' ? bracket.category1_employer_total_sen : bracket.category2_employer_total_sen) / 100,
      employeeInvalidity: (category === 'FIRST_CATEGORY' ? bracket.category1_employee_invalidity_sen : 0) / 100,
      employeeNonEmploymentInjury: (category === 'FIRST_CATEGORY' ? bracket.category1_employee_lindung24_sen : bracket.category2_employee_lindung24_sen) / 100,
      employeeTotal: (category === 'FIRST_CATEGORY' ? bracket.category1_employee_total_sen : bracket.category2_employee_total_sen) / 100,
      combinedTotal: (category === 'FIRST_CATEGORY' ? bracket.category1_grand_total_sen : bracket.category2_grand_total_sen) / 100,
      effectiveFrom: schedule.effective_from,
      effectiveTo: schedule.effective_to || '9999-12-31'
    };
  }
}

export function calculateSocsoContribution(params: {
  employeeSocsoProfile?: EmployeeSocsoProfile;
  payrollContributionMonth?: string;
  payrollItems: { code: string; amount: number }[];
  contributionSchedule?: SOCSOContributionSchedule;
  // Compatibility:
  employee?: Employee;
  payrollPeriod?: string;
}): SocsoContributionResult & { display: any } {
  let profile = params.employeeSocsoProfile || params.employee?.socsoProfile;
  if (!profile && params.employee) {
    profile = {
      employeeId: params.employee.id,
      nationality: 'Local',
      identityNumber: '',
      dateOfBirth: '1990-01-01',
      employmentStartDate: '2026-01-01',
      contractType: 'Permanent',
      isUnderContractOfService: true,
      socsoRegistrationNumber: '',
      socsoRegistered: true,
      socsoCoverageStatus: 'Covered',
      firstSocsoContributionDate: '2015-01-01',
      hasPreviousSocsoContribution: true,
      contributionCategory: 'FIRST_CATEGORY',
      multipleEmployerStatus: 'Single Employer',
      selectedEmployerForLindung24: true,
      foreignWorkerStatus: 'Local',
      domesticWorkerStatus: false,
      effectiveFrom: '2026-01-01',
      effectiveTo: '9999-12-31'
    };
  }

  if (!profile) {
    throw new Error('Employee SOCSO Profile is required.');
  }

  const rawPeriod = params.payrollContributionMonth || params.payrollPeriod || '2026-06';
  const period = rawPeriod.substring(0, 7); // e.g. "2026-06"
  const items = params.payrollItems;

  const warnings: string[] = [];
  const errors: string[] = [];

  const category = params.employee ? determineSocsoCategory(params.employee, period) : profile.contributionCategory;

  if (category === 'EXEMPT' || profile.socsoCoverageStatus === 'Exempt') {
    return {
      employeeId: profile.employeeId,
      payrollPeriod: period,
      effectiveDate: getGmt8DateString(),
      socsoCoverageStatus: 'Exempt',
      contributionCategory: 'EXEMPT',
      grossRemuneration: items.reduce((sum, item) => sum + item.amount, 0),
      includedSocsoWages: 0,
      excludedSocsoWages: 0,
      socsoWages: 0,
      contributionWage: 0,
      wageCeilingApplied: false,
      wageBracketNumber: 0,
      wageBracketDescription: 'Statutory Exempt / Out of Scope',
      employerEmploymentInjury: 0,
      employerInvalidity: 0,
      employerSocsoTotal: 0,
      employeeInvalidity: 0,
      employeeLindung24: 0,
      employeeSocsoTotal: 0,
      totalSocsoContribution: 0,
      configurationVersion: 'SYSTEM_EXEMPT',
      calculationTimestamp: new Date().toISOString(),
      warningMessages: [],
      validationErrors: [],
      calculationStatus: 'exempt',
      display: {
        actualSocsoWagesFormatted: 'RM0.00',
        employerTotalFormatted: 'RM0.00',
        employeeInvalidityFormatted: 'RM0.00',
        employeeLindung24Formatted: 'RM0.00',
        employeeTotalFormatted: 'RM0.00',
        grandTotalFormatted: 'RM0.00'
      }
    } as any;
  }

  const actualWagesInSen = calculateSocsoWagesInSen(items);

  if (period < '2026-06') {
    // Legacy fallback path:
    let legacyCat: 'FIRST_CATEGORY' | 'SECOND_CATEGORY' = 'FIRST_CATEGORY';
    if (category === 'SECOND_CATEGORY') {
      legacyCat = 'SECOND_CATEGORY';
    }
    const bracket = findSocsoBracket(actualWagesInSen / 100, legacyCat, period);
    const erEmploymentInjury = bracket.employerEmploymentInjury;
    const erInvalidity = bracket.employerInvalidity;
    const erTotal = bracket.employerTotal;
    const eeInvalidity = bracket.employeeInvalidity;
    const eeLindung24 = bracket.employeeNonEmploymentInjury || 0;
    const eeTotal = bracket.employeeTotal;

    // Overrides check
    let finalEmployer = erTotal;
    let finalEmployee = eeTotal;
    let calcStatus: 'calculated' | 'override_applied' = 'calculated';

    const employeeId = params.employee?.id || profile.employeeId;
    const overrides: SocsoManualOverride[] = JSON.parse(localStorage.getItem('socso_manual_overrides') || '[]');
    const activeOverride = overrides.find(o => o.employeeId === employeeId && o.payrollPeriod === period);

    if (activeOverride) {
      finalEmployer = activeOverride.correctedEmployerSocso;
      finalEmployee = activeOverride.correctedEmployeeSocso;
      calcStatus = 'override_applied';
      warnings.push(`Manual statutory override applied: Employer corrected to RM ${finalEmployer}, Employee corrected to RM ${finalEmployee}.`);
    }

    return {
      employeeId,
      payrollPeriod: period,
      effectiveDate: getGmt8DateString(),
      socsoCoverageStatus: profile.socsoCoverageStatus,
      contributionCategory: category,
      grossRemuneration: items.reduce((sum, item) => sum + item.amount, 0),
      includedSocsoWages: actualWagesInSen / 100,
      excludedSocsoWages: (items.reduce((sum, item) => sum + item.amount, 0) * 100 - actualWagesInSen) / 100,
      socsoWages: actualWagesInSen / 100,
      contributionWage: actualWagesInSen / 100,
      wageCeilingApplied: actualWagesInSen > 600000,
      wageBracketNumber: bracket.wageBracketNumber,
      wageBracketDescription: `${bracket.lowerWageLimit} to ${bracket.upperWageLimit}`,
      employerEmploymentInjury: erEmploymentInjury,
      employerInvalidity: erInvalidity,
      employerSocsoTotal: finalEmployer,
      employeeInvalidity: eeInvalidity,
      employeeLindung24: eeLindung24,
      employeeSocsoTotal: finalEmployee,
      totalSocsoContribution: finalEmployer + finalEmployee,
      configurationVersion: bracket.configurationId,
      calculationTimestamp: new Date().toISOString(),
      warningMessages: warnings,
      validationErrors: errors,
      calculationStatus: calcStatus,
      display: {
        actualSocsoWagesFormatted: `RM${(actualWagesInSen / 100).toFixed(2)}`,
        employerTotalFormatted: `RM${finalEmployer.toFixed(2)}`,
        employeeInvalidityFormatted: `RM${eeInvalidity.toFixed(2)}`,
        employeeLindung24Formatted: `RM${eeLindung24.toFixed(2)}`,
        employeeTotalFormatted: `RM${finalEmployee.toFixed(2)}`,
        grandTotalFormatted: `RM${(finalEmployer + finalEmployee).toFixed(2)}`
      }
    } as any;
  }

  // If wages are exactly RM0.00:
  if (actualWagesInSen === 0) {
    return {
      employeeId: profile.employeeId,
      payrollPeriod: period,
      effectiveDate: getGmt8DateString(),
      socsoCoverageStatus: profile.socsoCoverageStatus,
      contributionCategory: category,
      grossRemuneration: items.reduce((sum, item) => sum + item.amount, 0),
      includedSocsoWages: 0,
      excludedSocsoWages: 0,
      socsoWages: 0,
      contributionWage: 0,
      wageCeilingApplied: false,
      wageBracketNumber: 0,
      wageBracketDescription: 'No wages payable',
      employerEmploymentInjury: 0,
      employerInvalidity: 0,
      employerSocsoTotal: 0,
      employeeInvalidity: 0,
      employeeLindung24: 0,
      employeeSocsoTotal: 0,
      totalSocsoContribution: 0,
      configurationVersion: 'PERKESO_ACT4_LINDUNG24_PHASE1_2026',
      calculationTimestamp: new Date().toISOString(),
      warningMessages: [],
      validationErrors: [],
      calculationStatus: 'exempt',
      display: {
        actualSocsoWagesFormatted: 'RM0.00',
        employerTotalFormatted: 'RM0.00',
        employeeInvalidityFormatted: 'RM0.00',
        employeeLindung24Formatted: 'RM0.00',
        employeeTotalFormatted: 'RM0.00',
        grandTotalFormatted: 'RM0.00'
      }
    } as any;
  }

  // Get active schedule for period
  let schedule = params.contributionSchedule;
  if (!schedule) {
    const schedules: SOCSOContributionSchedule[] = JSON.parse(localStorage.getItem('socso_contribution_schedules') || '[]');
    schedule = schedules.find(s => {
      const startMonth = s.effective_from.substring(0, 7);
      const endMonth = s.effective_to ? s.effective_to.substring(0, 7) : null;
      return s.status === 'ACTIVE' && startMonth <= period && (endMonth === null || period <= endMonth);
    });
  }

  if (!schedule) {
    throw new Error('No active SOCSO contribution schedule found for period: ' + period);
  }

  const lookupWagesInSen = Math.min(actualWagesInSen, schedule.wage_ceiling_sen);
  const wageCeilingApplied = actualWagesInSen > schedule.wage_ceiling_sen;

  if (wageCeilingApplied) {
    warnings.push('The Monthly wage ceiling has been applied.');
  }

  // Exact lookup:
  const bracket = findSocsoBracket(schedule, actualWagesInSen);

  let erEmploymentInjury = 0;
  let erInvalidity = 0;
  let erTotal = 0;
  let eeInvalidity = 0;
  let eeLindung24 = 0;
  let eeTotal = 0;
  let grandTotal = 0;

  let calcCategory = category as 'FIRST_CATEGORY' | 'SECOND_CATEGORY' | 'REVIEW_REQUIRED';
  if (calcCategory === 'REVIEW_REQUIRED') {
    calcCategory = (profile.contributionCategory || 'FIRST_CATEGORY') as 'FIRST_CATEGORY' | 'SECOND_CATEGORY' | 'REVIEW_REQUIRED';
  }

  if (calcCategory === 'FIRST_CATEGORY') {
    erEmploymentInjury = bracket.category1_employer_employment_injury_sen;
    erInvalidity = bracket.category1_employer_invalidity_sen;
    erTotal = bracket.category1_employer_total_sen;

    eeInvalidity = bracket.category1_employee_invalidity_sen;
    eeLindung24 = bracket.category1_employee_lindung24_sen;
    eeTotal = bracket.category1_employee_total_sen;
    
    grandTotal = bracket.category1_grand_total_sen;
  } else {
    erEmploymentInjury = bracket.category2_employer_employment_injury_sen;
    erInvalidity = 0;
    erTotal = bracket.category2_employer_total_sen;

    eeInvalidity = 0;
    eeLindung24 = bracket.category2_employee_lindung24_sen;
    eeTotal = bracket.category2_employee_total_sen;

    grandTotal = bracket.category2_grand_total_sen;
  }

  // LINDUNG 24 Jam bypass logic
  if (profile.multipleEmployerStatus === 'Multiple Employers' && !profile.selectedEmployerForLindung24) {
    eeLindung24 = 0;
    eeTotal = eeInvalidity; // Employee total drops to just invalidity
    erTotal = erEmploymentInjury + erInvalidity;
    grandTotal = erTotal + eeTotal;
    warnings.push('LINDUNG 24 Jam contribution is bypassed as this employer is not selected for this multiple-employer account.');
  }

  // Overrides check
  let finalEmployer = erTotal;
  let finalEmployee = eeTotal;
  let calcStatus: 'calculated' | 'override_applied' = 'calculated';

  const employeeId = params.employee?.id || profile.employeeId;
  const overrides: SocsoManualOverride[] = JSON.parse(localStorage.getItem('socso_manual_overrides') || '[]');
  const activeOverride = overrides.find(o => o.employeeId === employeeId && o.payrollPeriod === period);

  if (activeOverride) {
    finalEmployer = Math.round(activeOverride.correctedEmployerSocso * 100);
    finalEmployee = Math.round(activeOverride.correctedEmployeeSocso * 100);
    calcStatus = 'override_applied';
    warnings.push(`Manual statutory override applied: Employer corrected to ${formatMYRFromSen(finalEmployer)}, Employee corrected to ${formatMYRFromSen(finalEmployee)}.`);
  }

  // Map to result object (both legacy fields and new ones)
  const result: any = {
    // New calculation values (as requested)
    employeeId: employeeId,
    payrollContributionMonth: period,
    contributionCategory: category,
    scheduleCode: schedule.schedule_code,
    scheduleVersion: '1.0',
    actualSocsoWagesInSen: actualWagesInSen,
    lookupWagesInSen: lookupWagesInSen,
    wageCeilingInSen: schedule.wage_ceiling_sen,
    wageCeilingApplied: wageCeilingApplied,
    bracketNumber: bracket.bracket_number,
    bracketDescription: bracket.description,

    employerInvalidityContributionInSen: erInvalidity,
    employerEmploymentInjuryContributionInSen: erEmploymentInjury,
    employerTotalContributionInSen: finalEmployer,

    employeeInvalidityContributionInSen: eeInvalidity,
    employeeLindung24ContributionInSen: eeLindung24,
    employeeTotalContributionInSen: finalEmployee,

    grandTotalContributionInSen: finalEmployer + finalEmployee,

    calculationStatus: calcStatus,
    warnings: warnings,
    errors: errors,
    calculatedAt: new Date().toISOString(),

    // Legacy fields for backward compatibility inside Payslips Views and Delta calculations
    payrollPeriod: period,
    effectiveDate: getGmt8DateString(),
    socsoCoverageStatus: profile.socsoCoverageStatus,
    grossRemuneration: items.reduce((sum, item) => sum + item.amount, 0),
    includedSocsoWages: actualWagesInSen / 100,
    excludedSocsoWages: (items.reduce((sum, item) => sum + item.amount, 0) * 100 - actualWagesInSen) / 100,
    socsoWages: actualWagesInSen / 100,
    contributionWage: lookupWagesInSen / 100,
    wageBracketNumber: bracket.bracket_number,
    wageBracketDescription: bracket.description,
    employerEmploymentInjury: erEmploymentInjury / 100,
    employerInvalidity: erInvalidity / 100,
    employerSocsoTotal: finalEmployer / 100,
    employeeInvalidity: eeInvalidity / 100,
    employeeLindung24: eeLindung24 / 100,
    employeeSocsoTotal: finalEmployee / 100,
    totalSocsoContribution: (finalEmployer + finalEmployee) / 100,
    configurationVersion: schedule.schedule_code,
    calculationTimestamp: new Date().toISOString(),
    warningMessages: warnings,
    validationErrors: errors,

    // Separate display object
    display: {
      actualSocsoWagesFormatted: formatMYRFromSen(actualWagesInSen),
      employerTotalFormatted: formatMYRFromSen(finalEmployer),
      employeeInvalidityFormatted: formatMYRFromSen(eeInvalidity),
      employeeLindung24Formatted: formatMYRFromSen(eeLindung24),
      employeeTotalFormatted: formatMYRFromSen(finalEmployee),
      grandTotalFormatted: formatMYRFromSen(finalEmployer + finalEmployee)
    }
  };

  return result;
}

export function truncateToTwoDecimals(value: number): number {
  const str = value.toString();
  if (str.includes('.')) {
    const parts = str.split('.');
    return parseFloat(parts[0] + '.' + parts[1].slice(0, 2));
  }
  return value;
}

export function roundUpToFiveSen(value: number): number {
  const amountInSen = Math.round(value * 100);
  if (amountInSen % 5 === 0) {
    return amountInSen / 100;
  }
  return (amountInSen + (5 - (amountInSen % 5))) / 100;
}

export function calculateAnnualTaxProgressive(P: Decimal, category: string): { annualTax: Decimal, M: number, R: number, B: number } {
  const pVal = P.toNumber();
  let M = 0;
  let R = 0;
  let B = 0;

  if (pVal <= 5000) {
    return { annualTax: dec(0), M: 0, R: 0, B: 0 };
  } else if (pVal <= 20000) {
    M = 5000;
    R = 0.01;
    B = category === 'CATEGORY_2' ? -800 : -400;
  } else if (pVal <= 35000) {
    M = 20000;
    R = 0.03;
    B = category === 'CATEGORY_2' ? -650 : -250;
  } else if (pVal <= 50000) {
    M = 35000;
    R = 0.06;
    B = 600;
  } else if (pVal <= 70000) {
    M = 50000;
    R = 0.11;
    B = 1500;
  } else if (pVal <= 100000) {
    M = 70000;
    R = 0.19;
    B = 3700;
  } else if (pVal <= 400000) {
    M = 100000;
    R = 0.25;
    B = 9400;
  } else if (pVal <= 600000) {
    M = 400000;
    R = 0.26;
    B = 84400;
  } else if (pVal <= 2000000) {
    M = 600000;
    R = 0.28;
    B = 136400;
  } else {
    M = 2000000;
    R = 0.30;
    B = 528400;
  }

  const pMinusM = P.sub(M);
  const tax = pMinusM.mul(R).add(B);
  const annualTax = Decimal.fromCents(Math.max(0, tax.toIntegerCents()));
  return { annualTax, M, R, B };
}

export function determineTaxCategory(
  maritalStatus: string,
  spouseIsWorking: string,
  hasChildren: boolean
): 'CATEGORY_1' | 'CATEGORY_2' | 'CATEGORY_3' {
  if (maritalStatus === 'Single' || maritalStatus === 'Divorced' || maritalStatus === 'Widowed') {
    return hasChildren ? 'CATEGORY_3' : 'CATEGORY_1';
  }
  if (maritalStatus === 'Married') {
    if (spouseIsWorking === 'No') {
      return 'CATEGORY_2';
    } else {
      return 'CATEGORY_3';
    }
  }
  return 'CATEGORY_1';
}

export interface PCB2026Params {
  employeeTaxProfile: EmployeeTaxProfile;
  employeeChildren?: Dependant[];
  payrollMonth: number;
  currentNormalRemuneration: number;
  currentAdditionalRemuneration: number;
  taxableBenefitsInKind?: number;
  valueOfLivingAccommodation?: number;
  taxablePerquisites?: number;
  taxExemptRemuneration?: number;
  currentQualifyingEPF: number;
  additionalRemunerationQualifyingEPF?: number;
  currentSocsoRelief?: number;
  payrollHistory?: HistoricalPayrollRecord[];
  tp1Declarations?: TP1Declaration[];
  tp3Declaration?: TP3Data;
  currentZakat?: number;
  accumulatedZakat?: number;
  currentDepartureLevy?: number;
  accumulatedDepartureLevy?: number;
  accumulatedPCB?: number;
  accumulatedNormal?: number;
  accumulatedEPF?: number;
  cp38Instruction?: number;
  statutoryConfiguration?: PCBConfiguration;
  employee_pcb_history_ledger?: EmployeePCBHistoryLedgerEntry[];
  employee_tp3_declarations?: EmployeeTP3Declaration[];
}

export interface PCBConfiguration {
  id: string;
  assessmentYear: number;
  configurationCode: string;
  configurationVersion: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED' | 'REJECTED';
  sourceDocumentName: string;
  sourceDocumentVersion: string;
  sourceDocumentDate: string;
  officialCalculatorReference: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  activatedBy?: string;
  activatedAt?: string;
}

export function calculatePCB2026(params: PCB2026Params) {
  const {
    employeeTaxProfile,
    employeeChildren,
    payrollMonth,
    currentNormalRemuneration,
    currentAdditionalRemuneration,
    taxableBenefitsInKind,
    valueOfLivingAccommodation,
    taxablePerquisites,
    currentQualifyingEPF,
    additionalRemunerationQualifyingEPF,
    payrollHistory,
    tp1Declarations,
    tp3Declaration,
    currentZakat,
    accumulatedZakat,
    currentDepartureLevy,
    accumulatedDepartureLevy,
    accumulatedPCB,
    accumulatedNormal: paramAccumulatedNormal,
    accumulatedEPF: paramAccumulatedEPF,
    cp38Instruction,
    statutoryConfiguration,
    employee_pcb_history_ledger,
    employee_tp3_declarations
  } = params;

  const Y1 = dec(currentNormalRemuneration);
  const Yt = dec(currentAdditionalRemuneration);
  const K1 = dec(currentQualifyingEPF);
  const Kt = dec(additionalRemunerationQualifyingEPF || 0);

  const n = 12 - payrollMonth;

  const validationErrors: string[] = [];
  const validationWarnings: string[] = [];

  if (payrollMonth < 1 || payrollMonth > 12) {
    validationErrors.push("Current payroll month is invalid.");
  }

  let accumulatedNormal = dec(paramAccumulatedNormal || 0);
  let accumulatedAdditional = dec(0);
  let accumulatedEPF = dec(paramAccumulatedEPF || 0);
  let accumulatedPaidPCB = dec(accumulatedPCB || 0);
  let accumulatedPaidZakat = dec(accumulatedZakat || 0);
  let accumulatedPaidLevy = dec(accumulatedDepartureLevy || 0);

  let previousEmployerPCB = 0;
  let currentEmployerPreviousPCB = 0;
  let reversedPCB = 0;
  let validAdjustmentPCB = 0;
  let prevEmployerRemuneration = 0;
  let currentEmployerRemuneration = 0;

  if (employee_pcb_history_ledger) {
    const verifiedTP3 = employee_tp3_declarations 
      ? employee_tp3_declarations.filter(t => t.verificationStatus === 'VERIFIED') 
      : [];
    
    // 1. Unverified/cancelled TP3 check
    if (employee_tp3_declarations) {
      for (const t of employee_tp3_declarations) {
        if (t.verificationStatus === 'UNVERIFIED') {
          validationErrors.push("TP3 values are unverified but included in calculations.");
        }
      }
    }

    // 2. Draft payroll / missing status check / current/future X check
    for (const l of employee_pcb_history_ledger) {
      if (l.status === 'DRAFT') {
        validationErrors.push("Draft payroll is included in history ledger.");
      }
      if (!l.status) {
        validationErrors.push("A historical PCB source has no status.");
      }
      if (l.payroll_month === payrollMonth) {
        validationErrors.push("Current month is included in X.");
      }
      if (l.payroll_month > payrollMonth) {
        validationErrors.push("Future payroll is included in X.");
      }
      if (l.source_type === 'APPROVED_ADJUSTMENT' && l.source_reference?.toLowerCase().includes('cp38')) {
        validationErrors.push("CP38 is included in X.");
      }
    }

    // 3. Duplicate key check
    const keys = new Set<string>();
    for (const l of employee_pcb_history_ledger) {
      const key = `${l.employee_id}-${l.assessment_year}-${l.source_type}-${l.source_reference || 'ref'}-${l.payroll_month}`;
      if (keys.has(key)) {
        validationErrors.push(`Accumulated PCB contains duplicate records: ${key}`);
      }
      keys.add(key);
    }

    // Run calculateAccumulatedPCBHistory
    const hist = calculateAccumulatedPCBHistory({
      employeeId: employeeTaxProfile.nricPassport || 'emp',
      assessmentYear: 2026,
      currentPayrollMonth: payrollMonth,
      verifiedTP3Records: verifiedTP3,
      finalizedPayrollHistory: employee_pcb_history_ledger
    });

    accumulatedPaidPCB = dec(hist.accumulatedPCB_X);
    previousEmployerPCB = hist.previousEmployerPCB;
    currentEmployerPreviousPCB = hist.currentEmployerPreviousPCB;
    reversedPCB = hist.reversedPCB;
    validAdjustmentPCB = hist.validAdjustmentPCB;

    // Accumulate prior normal income and EPF from verified TP3
    let tp3Normal = 0;
    let tp3Additional = 0;
    let tp3EPF = 0;
    let tp3Zakat = 0;
    for (const t of verifiedTP3) {
      tp3Normal += t.previousEmployerRemuneration || 0;
      tp3Additional += t.previousEmployerAdditionalRemuneration || 0;
      tp3EPF += t.previousEmployerEpf || 0;
      tp3Zakat += t.previousEmployerZakat || 0;
    }

    prevEmployerRemuneration = tp3Normal;

    // Accumulate current employer prior payrolls
    if (payrollHistory && payrollHistory.length > 0) {
      let calcNormal = 0;
      let calcEPF = 0;
      for (const p of payrollHistory) {
        if (p.payrollMonth < payrollMonth) {
          const recordNormal = (p.basicSalary || 0) + 
            (p.allowanceGeneral || 0) +
            (p.allowanceTransport || 0) +
            (p.allowanceParking || 0) +
            (p.allowanceMeal || 0) +
            (p.allowanceAccommodation || 0) +
            (p.allowancePhone || 0);
          calcNormal += recordNormal;
          calcEPF += p.epfEmployee || 0;
        }
      }
      currentEmployerRemuneration = calcNormal;
      accumulatedNormal = dec(tp3Normal + calcNormal);
      accumulatedEPF = dec(tp3EPF + calcEPF);
    } else {
      currentEmployerRemuneration = paramAccumulatedNormal || 0;
      accumulatedNormal = dec(tp3Normal + (paramAccumulatedNormal || 0));
      accumulatedEPF = dec(tp3EPF + (paramAccumulatedEPF || 0));
    }

    accumulatedPaidZakat = dec(tp3Zakat + (accumulatedZakat || 0));
  } else {
    // Fallback to legacy behaviour
    let calcNormal = 0;
    if (payrollHistory && payrollHistory.length > 0) {
      for (const record of payrollHistory) {
        if (record.payrollMonth < payrollMonth) {
          const recordNormal = (record.basicSalary || 0) + 
            (record.allowanceGeneral || 0) +
            (record.allowanceTransport || 0) +
            (record.allowanceParking || 0) +
            (record.allowanceMeal || 0) +
            (record.allowanceAccommodation || 0) +
            (record.allowancePhone || 0);
          
          calcNormal += recordNormal;
          accumulatedNormal = accumulatedNormal.add(recordNormal);

          const recordAdditional = 
            (record.overtime || 0) +
            (record.performanceBonus || 0) +
            (record.bonusAmount || 0) +
            (record.commissionAmount || 0) +
            (record.backPayAmount || 0) +
            (record.awsAmount || 0) +
            (record.compensationAmount || 0);

          accumulatedAdditional = accumulatedAdditional.add(recordAdditional);
          accumulatedEPF = accumulatedEPF.add(record.epfEmployee || 0);
          accumulatedPaidPCB = accumulatedPaidPCB.add(record.actualPCBDeducted || 0);
          accumulatedPaidZakat = accumulatedPaidZakat.add(record.zakat || 0);
          accumulatedPaidLevy = accumulatedPaidLevy.add(0);
        }
      }
    }
    currentEmployerRemuneration = calcNormal || paramAccumulatedNormal || 0;

    let tp3Normal = 0;
    if (tp3Declaration) {
      tp3Normal = tp3Declaration.previousEmployerRemuneration || tp3Declaration.accumulatedPriorRemuneration || 0;
      accumulatedNormal = accumulatedNormal.add(tp3Normal);
      accumulatedAdditional = accumulatedAdditional.add(tp3Declaration.previousEmployerAdditionalRemuneration || 0);
      accumulatedEPF = accumulatedEPF.add(tp3Declaration.previousEmployerEpf || tp3Declaration.accumulatedPriorEPF || 0);
      accumulatedPaidPCB = accumulatedPaidPCB.add(tp3Declaration.previousEmployerPcb || tp3Declaration.accumulatedPriorPCB || 0);
      accumulatedPaidZakat = accumulatedPaidZakat.add(tp3Declaration.previousEmployerZakat || 0);
    }
    prevEmployerRemuneration = tp3Normal;
  }

  const Y2 = Y1;

  const annualQualifyingLimit = dec(4000);
  const totalEPFSoFar = accumulatedEPF.add(K1);
  const remainingEPFLimit = Decimal.fromCents(Math.max(0, annualQualifyingLimit.toIntegerCents() - totalEPFSoFar.toIntegerCents()));
  
  let K2 = dec(0);
  if (n > 0) {
    const projectedLimit = remainingEPFLimit.div(n);
    K2 = projectedLimit.toIntegerCents() < K1.toIntegerCents() ? projectedLimit : K1;
  }

  const hasChildren = (employeeChildren && employeeChildren.length > 0) || (employeeTaxProfile.dependantsCount || 0) > 0;
  const category = determineTaxCategory(
    employeeTaxProfile.maritalStatus || 'Single',
    employeeTaxProfile.spouseIsWorking || 'No',
    hasChildren
  );

  let childReliefTotal = 0;
  if (employeeChildren && employeeChildren.length > 0) {
    for (const child of employeeChildren) {
      let childBase = child.isDisabled ? 6000 : 2000;
      if (child.inTertiaryEducation) {
        childReliefTotal += childBase + 8000;
      } else {
        childReliefTotal += childBase;
      }
    }
  } else {
    childReliefTotal = (employeeTaxProfile.dependantsCount || 0) * 2000;
  }

  const tp1Limits: Record<string, number> = {
    tp1_parent_medical: 8000,
    tp1_disabled_equipment: 6000,
    tp1_serious_medical: 10000,
    tp1_medical_exam: 1000,
    tp1_study_fees: 7000,
    tp1_childcare: 3000,
    tp1_life_insurance: 3000,
    tp1_prs: 3000,
    tp1_medical_insurance: 3000,
    tp1_socso_relief: 1000,
    tp1_lifestyle: 2500,
    tp1_breastfeeding: 1000,
    tp1_child_takaful: 3000,
    tp1_child_rehab: 4000,
    tp1_tourism: 1000,
    tp1_sustainability: 2500
  };

  const claimsByCategory: Record<string, { prior: number; current: number }> = {};
  for (const key of Object.keys(tp1Limits)) {
    claimsByCategory[key] = { prior: 0, current: 0 };
  }

  if (tp1Declarations && tp1Declarations.length > 0) {
    for (const d of tp1Declarations) {
      if (d.taxYear === 2026 && (d.approvalStatus === 'APPROVED' || d.approvalStatus === 'Approved')) {
        const cat = d.claimCategory;
        if (claimsByCategory[cat]) {
          if (d.effectivePayrollMonth < payrollMonth) {
            claimsByCategory[cat].prior += d.claimedAmount;
          } else if (d.effectivePayrollMonth === payrollMonth) {
            claimsByCategory[cat].current += d.claimedAmount;
          }
        }
      }
    }
  }

  let accumulatedLP = dec(0);
  let currentLP1 = dec(0);

  for (const [cat, limitVal] of Object.entries(tp1Limits)) {
    const limit = dec(limitVal);
    const priorClaimed = dec(claimsByCategory[cat].prior);
    const currentClaimed = dec(claimsByCategory[cat].current);

    const cappedPrior = priorClaimed.toIntegerCents() > limit.toIntegerCents() ? limit : priorClaimed;
    const remainingLimit = Decimal.fromCents(Math.max(0, limit.toIntegerCents() - cappedPrior.toIntegerCents()));
    const cappedCurrent = currentClaimed.toIntegerCents() > remainingLimit.toIntegerCents() ? remainingLimit : currentClaimed;

    accumulatedLP = accumulatedLP.add(cappedPrior);
    currentLP1 = currentLP1.add(cappedCurrent);
  }

  if (tp3Declaration) {
    const tp3QualDeductions = (tp3Declaration as any).previousQualifyingDeductions || 0;
    accumulatedLP = accumulatedLP.add(tp3QualDeductions);
  }

  // Normal reliefs (without additional remuneration)
  const annualEpf = accumulatedEPF.add(K1).add(K2.mul(n));
  const epfRelief = annualEpf.toIntegerCents() > 400000 ? dec(4000) : annualEpf;

  const reliefsTotal = dec(9000)
    .add(category === 'CATEGORY_2' ? 4000 : 0)
    .add(employeeTaxProfile.employeeDisabled ? 6000 : 0)
    .add((category === 'CATEGORY_2' && employeeTaxProfile.spouseDisabled) ? 5000 : 0)
    .add(childReliefTotal)
    .add(accumulatedLP)
    .add(currentLP1)
    .add(epfRelief);

  const totalNormalIncome = accumulatedNormal.add(Y1).add(Y2.mul(n));
  const PWithoutCurrentAdditional = Decimal.fromCents(Math.max(0, totalNormalIncome.toIntegerCents() - reliefsTotal.toIntegerCents()));

  let M = 0;
  let R = 0.0;
  let B = 0;
  let T = 0;
  let annualTaxWithoutCurrentAdditional = dec(0);

  const calcType = employeeTaxProfile.taxCalculationType || 'RESIDENT_PROGRESSIVE';

  if (employeeTaxProfile.taxResidenceStatus === 'NON_RESIDENT') {
    // Non-resident
  } else if (calcType === 'RETURNING_EXPERT_PROGRAMME' || calcType === 'KNOWLEDGE_WORKER_SPECIFIED_REGION') {
    R = 0.15;
    const pVal = PWithoutCurrentAdditional.toNumber();
    if (pVal <= 35000) {
      T = category === 'CATEGORY_2' ? 800 : 400;
    } else {
      T = 0;
    }
    const tax = PWithoutCurrentAdditional.mul(0.15).sub(T);
    annualTaxWithoutCurrentAdditional = Decimal.fromCents(Math.max(0, tax.toIntegerCents()));
  } else if (calcType === 'NON_CITIZEN_C_SUITE_APPROVED_COMPANY') {
    R = 0.15;
    const tax = PWithoutCurrentAdditional.mul(0.15);
    annualTaxWithoutCurrentAdditional = Decimal.fromCents(Math.max(0, tax.toIntegerCents()));
  } else {
    const prog = calculateAnnualTaxProgressive(PWithoutCurrentAdditional, category);
    annualTaxWithoutCurrentAdditional = prog.annualTax;
    M = prog.M;
    R = prog.R;
    B = prog.B;
  }

  const Z = accumulatedPaidZakat.add(accumulatedPaidLevy);
  const X = accumulatedPaidPCB;

  let normalPCBUntruncated = dec(0);
  if (employeeTaxProfile.taxResidenceStatus === 'NON_RESIDENT') {
    const nonResTaxable = Y1.add(taxableBenefitsInKind || 0).add(valueOfLivingAccommodation || 0).add(taxablePerquisites || 0);
    normalPCBUntruncated = nonResTaxable.mul(0.30);
  } else {
    const annualTaxNetOfXAndZ = Decimal.fromCents(Math.max(0, annualTaxWithoutCurrentAdditional.toIntegerCents() - (Z.toIntegerCents() + X.toIntegerCents())));
    if (n + 1 > 0) {
      normalPCBUntruncated = annualTaxNetOfXAndZ.div(n + 1);
    }
  }

  const normalPCBTruncated = Decimal.fromCents(Math.trunc(normalPCBUntruncated.toNumber() * 100));

  let normalPCBAfterMinimumRule = normalPCBTruncated;
  if (employeeTaxProfile.taxResidenceStatus !== 'NON_RESIDENT') {
    if (normalPCBTruncated.toIntegerCents() < 1000) {
      normalPCBAfterMinimumRule = dec(0);
    }
  }

  const currentMonthZakatVal = dec(currentZakat || 0);
  const currentMonthLevyVal = dec(currentDepartureLevy || 0);

  let netNormalPCBCents = normalPCBAfterMinimumRule.toIntegerCents() - (currentMonthZakatVal.toIntegerCents() + currentMonthLevyVal.toIntegerCents());
  if (netNormalPCBCents < 0) {
    netNormalPCBCents = 0;
  }
  const netNormalPCB = Decimal.fromCents(netNormalPCBCents);

  const totalPCBForYearWithoutCurrentAdditional = X.add(normalPCBAfterMinimumRule.mul(n + 1));

  const totalEPFWithBonus = accumulatedEPF.add(K1).add(Kt);
  const remainingEPFLimitWithBonus = Decimal.fromCents(Math.max(0, annualQualifyingLimit.toIntegerCents() - totalEPFWithBonus.toIntegerCents()));
  
  let K2WithBonus = dec(0);
  if (n > 0) {
    const projectedLimit = remainingEPFLimitWithBonus.div(n);
    K2WithBonus = projectedLimit.toIntegerCents() < K1.toIntegerCents() ? projectedLimit : K1;
  }

  const annualEpfWithBonus = accumulatedEPF.add(K1).add(Kt).add(K2WithBonus.mul(n));
  const epfReliefWithBonus = annualEpfWithBonus.toIntegerCents() > 400000 ? dec(4000) : annualEpfWithBonus;

  const reliefsTotalWithBonus = dec(9000)
    .add(category === 'CATEGORY_2' ? 4000 : 0)
    .add(employeeTaxProfile.employeeDisabled ? 6000 : 0)
    .add((category === 'CATEGORY_2' && employeeTaxProfile.spouseDisabled) ? 5000 : 0)
    .add(childReliefTotal)
    .add(accumulatedLP)
    .add(currentLP1)
    .add(epfReliefWithBonus);

  const totalIncomeWithBonus = accumulatedNormal.add(Y1).add(Yt).add(Y2.mul(n));
  const PWithCurrentAdditional = Decimal.fromCents(Math.max(0, totalIncomeWithBonus.toIntegerCents() - reliefsTotalWithBonus.toIntegerCents()));

  let annualTaxWithCurrentAdditional = dec(0);
  if (employeeTaxProfile.taxResidenceStatus === 'NON_RESIDENT') {
    // Non-resident
  } else if (calcType === 'RETURNING_EXPERT_PROGRAMME' || calcType === 'KNOWLEDGE_WORKER_SPECIFIED_REGION') {
    const tax = PWithCurrentAdditional.mul(0.15).sub(T);
    annualTaxWithCurrentAdditional = Decimal.fromCents(Math.max(0, tax.toIntegerCents()));
  } else if (calcType === 'NON_CITIZEN_C_SUITE_APPROVED_COMPANY') {
    const tax = PWithCurrentAdditional.mul(0.15);
    annualTaxWithCurrentAdditional = Decimal.fromCents(Math.max(0, tax.toIntegerCents()));
  } else {
    const prog = calculateAnnualTaxProgressive(PWithCurrentAdditional, category);
    annualTaxWithCurrentAdditional = prog.annualTax;
  }

  let additionalPCBUntruncated = dec(0);
  if (employeeTaxProfile.taxResidenceStatus === 'NON_RESIDENT') {
    additionalPCBUntruncated = Yt.mul(0.30);
  } else {
    const diff = annualTaxWithCurrentAdditional.toIntegerCents() - totalPCBForYearWithoutCurrentAdditional.toIntegerCents();
    additionalPCBUntruncated = Decimal.fromCents(Math.max(0, diff));
  }

  const additionalPCBTruncated = Decimal.fromCents(Math.trunc(additionalPCBUntruncated.toNumber() * 100));

  let additionalPCBAfterMinimumRule = additionalPCBTruncated;
  if (employeeTaxProfile.taxResidenceStatus !== 'NON_RESIDENT') {
    if (additionalPCBTruncated.toIntegerCents() < 1000) {
      additionalPCBAfterMinimumRule = dec(0);
    }
  }

  const finalPCBPreFiveSenRounding = netNormalPCB.add(additionalPCBAfterMinimumRule);
  const finalPCBCents = finalPCBPreFiveSenRounding.toIntegerCents();
  const roundedPCBCents = roundUpToFiveSen(finalPCBCents / 100) * 100;
  const finalPCB = Decimal.fromCents(roundedPCBCents);

  return {
    employeeId: employeeTaxProfile.nricPassport || '',
    assessmentYear: 2026,
    payrollMonth,
    taxResidenceStatus: employeeTaxProfile.taxResidenceStatus || 'RESIDENT',
    calculationType: calcType,
    employeeCategory: category,
    Y: accumulatedNormal.toNumber(),
    K: accumulatedEPF.toNumber(),
    Y1: Y1.toNumber(),
    K1: K1.toNumber(),
    Y2: Y2.toNumber(),
    K2: K2.toNumber(),
    Yt: Yt.toNumber(),
    Kt: Kt.toNumber(),
    n,
    D: 9000,
    S: category === 'CATEGORY_2' ? 4000 : 0,
    Du: employeeTaxProfile.employeeDisabled ? 6000 : 0,
    Su: (category === 'CATEGORY_2' && employeeTaxProfile.spouseDisabled) ? 5000 : 0,
    Q: childReliefTotal / 2000,
    C: employeeChildren ? employeeChildren.length : (employeeTaxProfile.dependantsCount || 0),
    accumulatedLP: accumulatedLP.toNumber(),
    currentLP1: currentLP1.toNumber(),
    PWithoutCurrentAdditional: PWithoutCurrentAdditional.toNumber(),
    PWithCurrentAdditional: PWithCurrentAdditional.toNumber(),
    M,
    R,
    B,
    T,
    annualTaxWithoutCurrentAdditional: annualTaxWithoutCurrentAdditional.toNumber(),
    normalPCBUntruncated: normalPCBUntruncated.toNumber(),
    normalPCBTruncated: normalPCBTruncated.toNumber(),
    normalPCBAfterMinimumRule: normalPCBAfterMinimumRule.toNumber(),
    currentMonthZakatOffset: currentMonthZakatVal.toNumber(),
    currentMonthDepartureLevyOffset: currentMonthLevyVal.toNumber(),
    netNormalPCB: netNormalPCB.toNumber(),
    totalPCBForYearWithoutCurrentAdditional: totalPCBForYearWithoutCurrentAdditional.toNumber(),
    annualTaxWithCurrentAdditional: annualTaxWithCurrentAdditional.toNumber(),
    additionalPCBUntruncated: additionalPCBUntruncated.toNumber(),
    additionalPCBTruncated: additionalPCBTruncated.toNumber(),
    additionalPCBAfterMinimumRule: additionalPCBAfterMinimumRule.toNumber(),
    finalPCBPreFiveSenRounding: finalPCBPreFiveSenRounding.toNumber(),
    finalPCB: finalPCB.toNumber(),
    cp38: cp38Instruction || 0,
    totalTaxPayrollDeduction: finalPCB.add(cp38Instruction || 0).toNumber(),
    configurationVersion: statutoryConfiguration?.configurationVersion || 'v1.0.0',
    formulaVersion: 'HASiL 2026 progressive v1',
    calculationTimestamp: new Date().toISOString(),
    warnings: validationWarnings,
    errors: validationErrors,
    status: validationErrors.length > 0 ? 'failed' : 'calculated',
    
    // Section 17 compliant fields
    taxCategory: category,
    accumulatedPreviousEmployerRemuneration: prevEmployerRemuneration,
    accumulatedCurrentEmployerRemuneration: currentEmployerRemuneration,
    accumulatedQualifyingEPF: accumulatedEPF.toNumber(),
    accumulatedAllowableDeductions: accumulatedLP.toNumber(),
    accumulatedPreviousEmployerPCB: previousEmployerPCB,
    accumulatedCurrentEmployerPCB: currentEmployerPreviousPCB,
    accumulatedAdjustedPCB: validAdjustmentPCB,
    accumulatedPCB_X: X.toNumber(),
    accumulatedZakat_Z: Z.toNumber(),
    estimatedAnnualChargeableIncome_P: PWithoutCurrentAdditional.toNumber(),
    selectedTaxBracket: `Bracket (M=${M}, R=${R})`,
    estimatedAnnualTax: annualTaxWithoutCurrentAdditional.toNumber(),
    remainingEstimatedTax: Math.max(0, annualTaxWithoutCurrentAdditional.toNumber() - X.toNumber() - Z.toNumber()),
    currentAndRemainingMonthCount: n + 1,
    CP38: cp38Instruction || 0,
    totalTaxDeduction: finalPCB.add(cp38Instruction || 0).toNumber()
  };
}

export function calculatePcb2026(
  salary: number,
  maritalStatus: string,
  spouseIsWorking: string,
  dependantsCount: number,
  epfMonthly: number,
  month: number = 1
): number {
  const profile: EmployeeTaxProfile = {
    maritalStatus: maritalStatus as any,
    spouseIsWorking: spouseIsWorking as any,
    dependantsCount: dependantsCount,
    eligibleForStatutory: 'Yes',
    taxResidenceStatus: 'RESIDENT',
    taxCalculationType: 'RESIDENT_PROGRESSIVE'
  } as any;

  // 1. Calculate stateless annual tax first to estimate prior PCB
  const annualIncome = salary * 12;
  const annualEpf = epfMonthly * 12;
  const epfRelief = Math.min(4000, annualEpf);
  const childRelief = dependantsCount * 2000;
  const spouseRelief = (maritalStatus === 'Married' && spouseIsWorking === 'No') ? 4000 : 0;
  const totalReliefs = 9000 + spouseRelief + childRelief + epfRelief;
  const chargeableIncome = Math.max(0, annualIncome - totalReliefs);
  
  const hasChildren = dependantsCount > 0;
  const category = determineTaxCategory(maritalStatus, spouseIsWorking, hasChildren);
  const prog = calculateAnnualTaxProgressive(Decimal.fromCents(chargeableIncome * 100), category);
  const estimatedAnnualTax = prog.annualTax.toNumber();
  const estimatedMonthlyPCB = estimatedAnnualTax / 12;

  // 2. Build simulated accumulated values for prior months
  const priorMonths = Math.max(0, month - 1);
  const accumulatedNormal = salary * priorMonths;
  const accumulatedEPF = epfMonthly * priorMonths;
  const accumulatedPCB = estimatedMonthlyPCB * priorMonths;

  const result = calculatePCB2026({
    employeeTaxProfile: profile,
    payrollMonth: month,
    currentNormalRemuneration: salary,
    currentQualifyingEPF: epfMonthly,
    currentAdditionalRemuneration: 0,
    accumulatedNormal,
    accumulatedEPF,
    accumulatedPCB
  });

  return result.finalPCB;
}

interface PayrollDateParts {
  year: number;
  month: number;
  day: number;
}

export interface SalaryProrationResult {
  fullPeriodSalary: number;
  payableSalary: number;
  prorationDeduction: number;
  calendarDays: number;
  eligibleDays: number;
  excludedDays: number;
  eligibleStartDay: number | null;
  eligibleEndDay: number | null;
  joinDate?: string;
  terminationDate?: string;
  isProrated: boolean;
}

const parsePayrollDate = (value?: string): PayrollDateParts | null => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDay = new Date(year, month, 0).getDate();
  if (month < 1 || month > 12 || day < 1 || day > maxDay) return null;
  return { year, month, day };
};

const comparePayrollMonth = (date: PayrollDateParts, month: number, year: number) => (
  (date.year * 12 + date.month) - (year * 12 + month)
);

const isEmployeeSeparationStatus = (status?: Employee['status']) =>
  status === 'Resigned' || status === 'Terminated';

const getSortedEffectiveProfiles = (employee: Employee) =>
  [...(employee.effectiveDatedProfiles || [])]
    .filter(profile => Boolean(parsePayrollDate(profile.effectiveDate)))
    .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));

const getCareerHistoryStatus = (value?: string): Employee['status'] | null => {
  switch (value) {
    case 'Active':
    case 'On Leave':
    case 'Resigned':
    case 'Terminated':
    case 'Suspended':
      return value;
    default:
      return null;
  }
};

const getSortedStatusChangeHistory = (employee: Employee): CareerHistoryEntry[] =>
  [...(employee.careerHistory || [])]
    .filter(entry => (
      entry.type === 'Status Change' &&
      Boolean(parsePayrollDate(entry.date)) &&
      Boolean(getCareerHistoryStatus(entry.newValue))
    ))
    .sort((left, right) => left.date.localeCompare(right.date));

const getStatusChangeEntryForDate = (
  employee: Employee,
  targetDateStr: string
): CareerHistoryEntry | undefined => {
  let matched: CareerHistoryEntry | undefined;

  for (const entry of getSortedStatusChangeHistory(employee)) {
    if (entry.date > targetDateStr) continue;
    matched = entry;
  }

  return matched;
};

const getFallbackEffectiveProfile = (employee: Employee): EmployeeTaxProfile => ({
  effectiveDate: employee.dateOfJoined || '2026-01-01',
  basicSalary: employee.basicSalary,
  employmentStatus: employee.status,
  housingAllowance: employee.housingAllowance || 0,
  transportAllowance: employee.transportAllowance || 0,
  allowanceGeneral: employee.allowanceGeneral || 0,
  allowanceTransport: employee.allowanceTransport || 0,
  allowanceParking: employee.allowanceParking || 0,
  allowanceMeal: employee.allowanceMeal || 0,
  allowanceAccommodation: employee.allowanceAccommodation || 0,
  allowancePhone: employee.allowancePhone || 0,
  commissionAmount: employee.commissionAmount || 0,
  maritalStatus: employee.maritalStatus || 'Single',
  spouseIsWorking: employee.spouseIsWorking || 'No',
  spouseNric: employee.spouseNric || '',
  spouseName: employee.spouseName || '',
  hasDependants: employee.hasDependants || 'No',
  dependantsCount: employee.dependants?.length || 0,
  eligibleForStatutory: employee.eligibleForStatutory || 'Yes',
  epfRateEmployee: employee.epfRateEmployee || 11,
  epfRateEmployer: employee.epfRateEmployer || 13,
  taxNumber: employee.taxNumber || '',
  nricPassport: employee.nricPassport || '',
  dateOfJoined: employee.dateOfJoined || '',
  dateOfTermination: employee.dateOfTermination,
  approvedAt: getGmt8DateString(),
  assistReconciliationRequired: false,
});

export function getEffectiveTerminationDateForDate(
  employee: Employee,
  targetDateStr: string
): string | undefined {
  const directDate = parsePayrollDate(employee.dateOfTermination)
    ? employee.dateOfTermination
    : undefined;
  const profile = getEffectiveProfileForDate(employee, targetDateStr);
  const historyEntry = getStatusChangeEntryForDate(employee, targetDateStr);
  const historyStatus = getCareerHistoryStatus(historyEntry?.newValue);

  if (historyStatus) {
    if (isEmployeeSeparationStatus(historyStatus)) {
      return profile.dateOfTermination || directDate || historyEntry?.date;
    }
    return undefined;
  }

  const profileStatus = profile.employmentStatus || employee.status;
  if (profile.dateOfTermination && profile.dateOfTermination <= targetDateStr) {
    return profile.dateOfTermination;
  }
  if (isEmployeeSeparationStatus(profileStatus)) {
    return profile.dateOfTermination || directDate || profile.effectiveDate;
  }

  return directDate && directDate <= targetDateStr ? directDate : undefined;
}

const getEmployeeTerminationDate = (
  employee: Employee,
  targetDateStr = getGmt8DateString()
): string | undefined => getEffectiveTerminationDateForDate(employee, targetDateStr);

export function getSalaryProration(employee: Employee, month: number, year: number): SalaryProrationResult {
  const calendarDays = new Date(year, month, 0).getDate();
  const targetDateStr = `${year}-${String(month).padStart(2, '0')}-${String(calendarDays).padStart(2, '0')}`;
  const joinDate = parsePayrollDate(employee.dateOfJoined);
  const terminationDateValue = getEmployeeTerminationDate(employee, targetDateStr);
  const terminationDate = parsePayrollDate(terminationDateValue);

  const periodBeforeEmployment = !!joinDate && comparePayrollMonth(joinDate, month, year) > 0;
  const periodAfterEmployment = !!terminationDate && comparePayrollMonth(terminationDate, month, year) < 0;
  if (periodBeforeEmployment || periodAfterEmployment) {
    return {
      fullPeriodSalary: 0,
      payableSalary: 0,
      prorationDeduction: 0,
      calendarDays,
      eligibleDays: 0,
      excludedDays: calendarDays,
      eligibleStartDay: null,
      eligibleEndDay: null,
      joinDate: employee.dateOfJoined,
      terminationDate: terminationDateValue,
      isProrated: false
    };
  }

  const eligibleStartDay = joinDate && comparePayrollMonth(joinDate, month, year) === 0
    ? joinDate.day
    : 1;
  const eligibleEndDay = terminationDate && comparePayrollMonth(terminationDate, month, year) === 0
    ? terminationDate.day
    : calendarDays;
  const eligibleDays = Math.max(0, eligibleEndDay - eligibleStartDay + 1);

  const salaryAdjustments = (employee.salaryAdjustments || [])
    .map(adjustment => ({ adjustment, date: parsePayrollDate(adjustment.effectiveDate) }))
    .filter((entry): entry is { adjustment: typeof entry.adjustment; date: PayrollDateParts } => (
      entry.date !== null && Number(entry.adjustment.adjustedSalary) >= 0
    ))
    .sort((left, right) => (
      left.date.year - right.date.year ||
      left.date.month - right.date.month ||
      left.date.day - right.date.day
    ));

  let fullPeriodSalary = 0;
  let payableSalary = 0;
  for (let day = 1; day <= calendarDays; day++) {
    let monthlyRate = Number(employee.basicSalary || 0);
    for (const entry of salaryAdjustments) {
      const effectiveKey = entry.date.year * 10000 + entry.date.month * 100 + entry.date.day;
      const payrollDayKey = year * 10000 + month * 100 + day;
      if (effectiveKey <= payrollDayKey) monthlyRate = Number(entry.adjustment.adjustedSalary || 0);
    }

    const dailyRate = monthlyRate / calendarDays;
    fullPeriodSalary += dailyRate;
    if (day >= eligibleStartDay && day <= eligibleEndDay) payableSalary += dailyRate;
  }

  const roundedFullPeriodSalary = Number(fullPeriodSalary.toFixed(2));
  const roundedPayableSalary = Number(payableSalary.toFixed(2));
  const prorationDeduction = Number(Math.max(0, roundedFullPeriodSalary - roundedPayableSalary).toFixed(2));

  return {
    fullPeriodSalary: roundedFullPeriodSalary,
    payableSalary: roundedPayableSalary,
    prorationDeduction,
    calendarDays,
    eligibleDays,
    excludedDays: calendarDays - eligibleDays,
    eligibleStartDay,
    eligibleEndDay,
    joinDate: employee.dateOfJoined,
    terminationDate: terminationDateValue,
    isProrated: eligibleDays < calendarDays
  };
}

export function getProratedBasicSalary(employee: Employee, month: number, year: number): number {
  return getSalaryProration({ ...employee, salaryAdjustments: [] }, month, year).payableSalary;
}

export function getAdjustedBasicSalary(employee: Employee, month: number, year: number): number {
  return getSalaryProration(employee, month, year).payableSalary;
}

export function getMonthlyBaseSalary(employee: Employee, month: number, year: number): number {
  const resolvedEmployee = getEmployeeForMonth(employee, month, year);
  const calendarDays = new Date(year, month, 0).getDate();
  const joinDate = parsePayrollDate(resolvedEmployee.dateOfJoined);
  const periodBeforeEmployment = !!joinDate && comparePayrollMonth(joinDate, month, year) > 0;
  if (periodBeforeEmployment) {
    return 0;
  }

  const salaryAdjustments = (resolvedEmployee.salaryAdjustments || [])
    .map(adjustment => ({ adjustment, date: parsePayrollDate(adjustment.effectiveDate) }))
    .filter((entry): entry is { adjustment: typeof entry.adjustment; date: PayrollDateParts } => (
      entry.date !== null && Number(entry.adjustment.adjustedSalary) >= 0
    ))
    .sort((left, right) => (
      left.date.year - right.date.year ||
      left.date.month - right.date.month ||
      left.date.day - right.date.day
    ));

  let fullPeriodSalary = 0;
  for (let day = 1; day <= calendarDays; day++) {
    let monthlyRate = Number(resolvedEmployee.basicSalary || 0);
    for (const entry of salaryAdjustments) {
      const effectiveKey = entry.date.year * 10000 + entry.date.month * 100 + entry.date.day;
      const payrollDayKey = year * 10000 + month * 100 + day;
      if (effectiveKey <= payrollDayKey) monthlyRate = Number(entry.adjustment.adjustedSalary || 0);
    }

    fullPeriodSalary += monthlyRate / calendarDays;
  }

  return Number(fullPeriodSalary.toFixed(2));
}

export function isEmployeeEligibleForPayrollPeriod(employee: Employee, month: number, year: number): boolean {
  const monthStartDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndDay = new Date(year, month, 0).getDate();
  const monthEndDate = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDay).padStart(2, '0')}`;
  const joinDate = parsePayrollDate(employee.dateOfJoined);
  const terminationDateValue = getEffectiveTerminationDateForDate(employee, monthEndDate);
  const terminationDate = parsePayrollDate(terminationDateValue);

  if (joinDate && comparePayrollMonth(joinDate, month, year) > 0) {
    return false;
  }

  if (terminationDate) {
    const terminationDateString = `${terminationDate.year}-${String(terminationDate.month).padStart(2, '0')}-${String(terminationDate.day).padStart(2, '0')}`;
    if (terminationDateString < monthStartDate) {
      return false;
    }
  }

  const monthEndStatus = getEffectiveEmploymentStatusForDate(employee, monthEndDate);
  if (isEmployeeSeparationStatus(monthEndStatus) && !terminationDate) {
    return false;
  }

  return getSalaryProration(employee, month, year).eligibleDays > 0;
}

function getHistoricalPayrollRecord(employee: Employee, month: number, year?: number): HistoricalPayrollRecord | undefined {
  return (employee.historicalPayrollRecords || []).find(record => (
    !isSeparatePayrollRecord(record) &&
    record.payrollMonth === month &&
    (year === undefined || record.payrollYear === undefined || record.payrollYear === year)
  ));
}

export function getPayrollBasicSalary(employee: Employee, month: number, year: number): number {
  const savedRecord = getHistoricalPayrollRecord(employee, month, year);
  return savedRecord?.basicSalary ?? getAdjustedBasicSalary(employee, month, year);
}

export function getEmployeeForMonth(employee: Employee, month: number, year?: number): Employee {
  const resolvedYear = year ?? new Date().getFullYear();
  const effectiveProfile = getEffectiveProfileForMonth(employee, month, resolvedYear);
  const effectiveStatus = getEffectiveEmploymentStatus(employee, month, resolvedYear);
  const monthEndDay = new Date(resolvedYear, month, 0).getDate();
  const monthEndDate = `${resolvedYear}-${String(month).padStart(2, '0')}-${String(monthEndDay).padStart(2, '0')}`;
  const effectiveEmployee: Employee = {
    ...employee,
    status: effectiveStatus,
    paymentDate: employee.paymentDate,
    payslipDescriptions: employee.payslipDescriptions,
    basicSalary: effectiveProfile.basicSalary,
    housingAllowance:
      effectiveProfile.housingAllowance !== undefined
        ? effectiveProfile.housingAllowance
        : employee.housingAllowance,
    transportAllowance:
      effectiveProfile.transportAllowance !== undefined
        ? effectiveProfile.transportAllowance
        : employee.transportAllowance,
    allowanceGeneral:
      effectiveProfile.allowanceGeneral !== undefined
        ? effectiveProfile.allowanceGeneral
        : employee.allowanceGeneral,
    allowanceTransport:
      effectiveProfile.allowanceTransport !== undefined
        ? effectiveProfile.allowanceTransport
        : employee.allowanceTransport,
    allowanceParking:
      effectiveProfile.allowanceParking !== undefined
        ? effectiveProfile.allowanceParking
        : employee.allowanceParking,
    allowanceMeal:
      effectiveProfile.allowanceMeal !== undefined
        ? effectiveProfile.allowanceMeal
        : employee.allowanceMeal,
    allowanceAccommodation:
      effectiveProfile.allowanceAccommodation !== undefined
        ? effectiveProfile.allowanceAccommodation
        : employee.allowanceAccommodation,
    allowancePhone:
      effectiveProfile.allowancePhone !== undefined
        ? effectiveProfile.allowancePhone
        : employee.allowancePhone,
    commissionAmount:
      effectiveProfile.commissionAmount !== undefined
        ? effectiveProfile.commissionAmount
        : employee.commissionAmount,
    maritalStatus: effectiveProfile.maritalStatus || employee.maritalStatus,
    spouseIsWorking:
      effectiveProfile.spouseIsWorking !== undefined
        ? effectiveProfile.spouseIsWorking
        : employee.spouseIsWorking,
    spouseNric:
      effectiveProfile.spouseNric !== undefined
        ? effectiveProfile.spouseNric
        : employee.spouseNric,
    spouseName:
      effectiveProfile.spouseName !== undefined
        ? effectiveProfile.spouseName
        : employee.spouseName,
    hasDependants:
      effectiveProfile.hasDependants !== undefined
        ? effectiveProfile.hasDependants
        : employee.hasDependants,
    eligibleForStatutory:
      effectiveProfile.eligibleForStatutory !== undefined
        ? effectiveProfile.eligibleForStatutory
        : employee.eligibleForStatutory,
    contractStatutoryTreatment:
      effectiveProfile.contractStatutoryTreatment !== undefined
        ? effectiveProfile.contractStatutoryTreatment
        : employee.contractStatutoryTreatment,
    payrollDocumentDisplaySettings:
      effectiveProfile.payrollDocumentDisplaySettings !== undefined
        ? effectiveProfile.payrollDocumentDisplaySettings
        : employee.payrollDocumentDisplaySettings,
    epfRateEmployee:
      effectiveProfile.epfRateEmployee !== undefined
        ? effectiveProfile.epfRateEmployee
        : employee.epfRateEmployee,
    epfRateEmployer:
      effectiveProfile.epfRateEmployer !== undefined
        ? effectiveProfile.epfRateEmployer
        : employee.epfRateEmployer,
    taxNumber:
      effectiveProfile.taxNumber !== undefined
        ? effectiveProfile.taxNumber
        : employee.taxNumber,
    nricPassport:
      effectiveProfile.nricPassport !== undefined
        ? effectiveProfile.nricPassport
        : employee.nricPassport,
    dateOfJoined:
      effectiveProfile.dateOfJoined !== undefined
        ? effectiveProfile.dateOfJoined
        : employee.dateOfJoined,
    dateOfTermination: getEffectiveTerminationDateForDate(employee, monthEndDate),
  };

  const histRecord = getHistoricalPayrollRecord(employee, month, year);
  if (!histRecord) {
    return effectiveEmployee;
  }
  
  return {
    ...effectiveEmployee,
    paymentDate:
      histRecord.paymentDate !== undefined
        ? histRecord.paymentDate
        : effectiveEmployee.paymentDate,
    payslipDescriptions:
      histRecord.payslipDescriptions !== undefined
        ? histRecord.payslipDescriptions
        : effectiveEmployee.payslipDescriptions,
    allowanceGeneral:
      histRecord.allowanceGeneral !== undefined
        ? histRecord.allowanceGeneral
        : effectiveEmployee.allowanceGeneral,
    allowanceTransport:
      histRecord.allowanceTransport !== undefined
        ? histRecord.allowanceTransport
        : effectiveEmployee.allowanceTransport,
    allowanceParking:
      histRecord.allowanceParking !== undefined
        ? histRecord.allowanceParking
        : effectiveEmployee.allowanceParking,
    allowanceMeal:
      histRecord.allowanceMeal !== undefined
        ? histRecord.allowanceMeal
        : effectiveEmployee.allowanceMeal,
    allowanceAccommodation:
      histRecord.allowanceAccommodation !== undefined
        ? histRecord.allowanceAccommodation
        : effectiveEmployee.allowanceAccommodation,
    allowancePhone:
      histRecord.allowancePhone !== undefined
        ? histRecord.allowancePhone
        : effectiveEmployee.allowancePhone,
    overtime: histRecord.overtime !== undefined ? histRecord.overtime : effectiveEmployee.overtime,
    bonusAmount:
      histRecord.bonusAmount !== undefined
        ? histRecord.bonusAmount
        : (histRecord.performanceBonus !== undefined
            ? histRecord.performanceBonus
            : effectiveEmployee.bonusAmount),
    bonusDesc:
      histRecord.bonusDesc !== undefined
        ? histRecord.bonusDesc
        : effectiveEmployee.bonusDesc,
    commissionAmount:
      histRecord.commissionAmount !== undefined
        ? histRecord.commissionAmount
        : effectiveEmployee.commissionAmount,
    commissionDesc:
      histRecord.commissionDesc !== undefined
        ? histRecord.commissionDesc
        : effectiveEmployee.commissionDesc,
    backPayAmount:
      histRecord.backPayAmount !== undefined
        ? histRecord.backPayAmount
        : effectiveEmployee.backPayAmount,
    backPayDesc:
      histRecord.backPayDesc !== undefined
        ? histRecord.backPayDesc
        : effectiveEmployee.backPayDesc,
    awsAmount:
      histRecord.awsAmount !== undefined
        ? histRecord.awsAmount
        : effectiveEmployee.awsAmount,
    awsDesc:
      histRecord.awsDesc !== undefined
        ? histRecord.awsDesc
        : effectiveEmployee.awsDesc,
    compensationAmount:
      histRecord.compensationAmount !== undefined
        ? histRecord.compensationAmount
        : effectiveEmployee.compensationAmount,
    compensationDesc:
      histRecord.compensationDesc !== undefined
        ? histRecord.compensationDesc
        : effectiveEmployee.compensationDesc,
    reimbursementAmount:
      histRecord.reimbursementAmount !== undefined
        ? histRecord.reimbursementAmount
        : effectiveEmployee.reimbursementAmount,
    reimbursementDesc:
      histRecord.reimbursementDesc !== undefined
        ? histRecord.reimbursementDesc
        : effectiveEmployee.reimbursementDesc,
    unpaidLeave:
      histRecord.unpaidLeave !== undefined
        ? histRecord.unpaidLeave
        : effectiveEmployee.unpaidLeave,
    deductionInLieu:
      histRecord.deductionInLieu !== undefined
        ? histRecord.deductionInLieu
        : effectiveEmployee.deductionInLieu,
    deductionCp38:
      histRecord.deductionCp38 !== undefined
        ? histRecord.deductionCp38
        : (histRecord.cp38 !== undefined ? histRecord.cp38 : effectiveEmployee.deductionCp38),
    deductionOthers:
      histRecord.deductionOthers !== undefined
        ? histRecord.deductionOthers
        : effectiveEmployee.deductionOthers,
    deductionOthersDesc:
      histRecord.deductionOthersDesc !== undefined
        ? histRecord.deductionOthersDesc
        : effectiveEmployee.deductionOthersDesc,
    taxPcb:
      histRecord.actualPCBDeducted !== undefined
        ? histRecord.actualPCBDeducted
        : effectiveEmployee.taxPcb
  };
}

export function calculatePayslip(employee: Employee, month?: number, year?: number, options: PayslipCalculationOptions = {}): PayslipBreakdown {
  const mergedEmployee = month !== undefined ? getEmployeeForMonth(employee, month, year) : employee;
  const savedRecord = month !== undefined && !options.ignoreSavedStatutory
    ? getHistoricalPayrollRecord(employee, month, year)
    : undefined;
  const savedStatutory: PayslipStatutoryOverrides = savedRecord ? {
    epfEmployee: savedRecord.epfEmployee,
    epfEmployer: savedRecord.epfEmployer,
    socsoEmployee: savedRecord.socsoEmployee,
    socsoEmployer: savedRecord.socsoEmployer,
    lindung24Employee: savedRecord.lindung24Employee,
    eisEmployee: savedRecord.eisEmployee,
    eisEmployer: savedRecord.eisEmployer,
    taxPcb: savedRecord.actualPCBDeducted
  } : {};
  const statutoryOverrides = { ...savedStatutory, ...options.statutoryOverrides };
  const basicSalary = options.basicSalaryOverride !== undefined
    ? options.basicSalaryOverride
    : (month !== undefined && year !== undefined)
      ? getPayrollBasicSalary(employee, month, year)
      : (mergedEmployee.basicSalary || 0);
  const statutorySalary = options.statutorySalaryOverride !== undefined
    ? options.statutorySalaryOverride
    : basicSalary;

  // Compute individual allowances, falling back to old ones for backwards compatibility
  const allowanceGen = mergedEmployee.allowanceGeneral || 0;
  const allowanceTrans = mergedEmployee.allowanceTransport !== undefined ? mergedEmployee.allowanceTransport : (mergedEmployee.transportAllowance || 0);
  const allowancePark = mergedEmployee.allowanceParking || 0;
  const allowanceMl = mergedEmployee.allowanceMeal || 0;
  const allowanceAccom = mergedEmployee.allowanceAccommodation !== undefined ? mergedEmployee.allowanceAccommodation : (mergedEmployee.housingAllowance || 0);
  const allowancePh = mergedEmployee.allowancePhone || 0;
  
  const allowancesSum = allowanceGen + allowanceTrans + allowancePark + allowanceMl + allowanceAccom + allowancePh;

  // Other dynamic earnings
  const overtimeVal = mergedEmployee.overtime || 0;
  const bonusVal = mergedEmployee.bonusAmount !== undefined ? mergedEmployee.bonusAmount : (mergedEmployee.performanceBonus || 0);
  const commissionVal = mergedEmployee.commissionAmount || 0;
  const backPayVal = mergedEmployee.backPayAmount || 0;
  const awsVal = mergedEmployee.awsAmount || 0;
  const compensationVal = mergedEmployee.compensationAmount || 0;
  
  // Reimbursements (usually non-taxable)
  const reimbursementsSum = mergedEmployee.reimbursementAmount || 0;

  // Gross Earnings subject to statutory deductions / standard gross
  const grossEarnings = 
    basicSalary + 
    allowancesSum + 
    overtimeVal + 
    bonusVal + 
    commissionVal + 
    backPayVal + 
    awsVal + 
    compensationVal;

  const isEligible = options.statutoryEligibilityOverride ?? getPayrollDocumentProfile(mergedEmployee).statutoryEnabled;
  const appliedStatutoryOverrides = isEligible ? statutoryOverrides : {};

  const optInEpf = mergedEmployee.optInEpf !== false;
  const optInSocso = mergedEmployee.optInSocso !== false;
  const optInEis = mergedEmployee.optInEis !== false;
  const optInPcb = mergedEmployee.optInPcb !== false;

  const epfRateEmp = mergedEmployee.epfRateEmployee || 11;
  const epfRateEmployerCalculated = statutorySalary <= 5000 ? 13 : 12;
  const epfRateEmployer = mergedEmployee.epfRateEmployer || epfRateEmployerCalculated;

  const autoEpfEmployeeValue = (isEligible && optInEpf) ? Math.round((statutorySalary * epfRateEmp) / 100) : 0;
  const autoEpfEmployerValue = (isEligible && optInEpf) ? Math.round((statutorySalary * epfRateEmployer) / 100) : 0;
  const epfEmployeeValue = appliedStatutoryOverrides.epfEmployee ?? autoEpfEmployeeValue;
  const epfEmployerValue = appliedStatutoryOverrides.epfEmployer ?? autoEpfEmployerValue;

  // Custom Deductions
  const unpaidLeaveVal = mergedEmployee.unpaidLeave || 0;
  const deductionInLieuVal = mergedEmployee.deductionInLieu || 0;
  const deductionCp38Val = mergedEmployee.deductionCp38 || 0;
  const deductionOthersVal = mergedEmployee.deductionOthers || 0;

  // Calculate 2026 dynamic SOCSO and EIS
  const stat2026 = getStatutoryDeductions2026(statutorySalary);
  
  const payrollItems = options.statutorySalaryOverride !== undefined
    ? [{ code: 'basic_salary', amount: statutorySalary }]
    : [
      { code: 'basic_salary', amount: basicSalary },
      { code: 'overtime', amount: overtimeVal },
      { code: 'commission', amount: commissionVal },
      { code: 'allowance_general', amount: allowanceGen },
      { code: 'allowance_transport', amount: allowanceTrans },
      { code: 'allowance_parking', amount: allowancePark },
      { code: 'allowance_meal', amount: allowanceMl },
      { code: 'allowance_accommodation', amount: allowanceAccom },
      { code: 'allowance_phone', amount: allowancePh },
      { code: 'backpay', amount: backPayVal }
    ];
  if (unpaidLeaveVal > 0) {
    payrollItems.push({ code: 'unpaid_leave', amount: unpaidLeaveVal });
  }

  const actMonth = month !== undefined ? month : (new Date().getMonth() + 1);
  const actYear = year !== undefined ? year : new Date().getFullYear();
  const periodStr = `${actYear}-${String(actMonth).padStart(2, '0')}`;

  const socsoRes = calculateSocsoContribution({
    employee: mergedEmployee,
    payrollPeriod: periodStr,
    payrollItems
  });

  const autoSocsoEmployeeVal = (isEligible && optInSocso) ? socsoRes.employeeInvalidity : 0;
  const autoSocsoEmployerVal = (isEligible && optInSocso) ? socsoRes.employerSocsoTotal : 0;
  const isLindung24OptedIn = optInSocso && (mergedEmployee.enableLindung24 === true);
  const autoSkbbkEmpVal = (isEligible && isLindung24OptedIn) ? socsoRes.employeeLindung24 : 0;
  const socsoEmployeeVal = appliedStatutoryOverrides.socsoEmployee ?? autoSocsoEmployeeVal;
  const socsoEmployerVal = appliedStatutoryOverrides.socsoEmployer ?? autoSocsoEmployerVal;
  const skbbkEmpVal = appliedStatutoryOverrides.lindung24Employee ?? autoSkbbkEmpVal;
  const skbbkEmplyrVal = 0; // LINDUNG 24 is employee-borne
  const autoEisEmployeeVal = (isEligible && optInEis) ? stat2026.eisEmployee : 0;
  const autoEisEmployerVal = (isEligible && optInEis) ? stat2026.eisEmployer : 0;
  const eisEmployeeVal = appliedStatutoryOverrides.eisEmployee ?? autoEisEmployeeVal;
  const eisEmployerVal = appliedStatutoryOverrides.eisEmployer ?? autoEisEmployerVal;

  // Calculate PCB from the current profile when no saved value exists.
  const autoTaxPcbVal = (isEligible && optInPcb)
    ? (mergedEmployee.taxPcb === undefined
      ? calculatePcb2026(statutorySalary, mergedEmployee.maritalStatus || 'Single', mergedEmployee.spouseIsWorking || 'No', mergedEmployee.dependants?.length || 0, autoEpfEmployeeValue, actMonth)
      : mergedEmployee.taxPcb)
    : 0;
  const taxPcbVal = appliedStatutoryOverrides.taxPcb ?? autoTaxPcbVal;
  const hrdCorpRate = getHrdCorpLevyRate(
    options.hrdCorpLocalWorkerCount ?? 0,
    options.hrdCorpVoluntaryOptIn ?? true
  );
  const hrdCorpWageBase = Math.max(0, basicSalary - unpaidLeaveVal) + allowancesSum;
  const autoHrdCorpVal = (
    isEligible &&
    isLocalHrdCorpWorker(mergedEmployee) &&
    hrdCorpRate > 0
  )
    ? roundToTwoDecimals(hrdCorpWageBase * hrdCorpRate)
    : 0;
  const hrdCorpVal = isEligible
    ? appliedStatutoryOverrides.hrdCorp ?? autoHrdCorpVal
    : 0;

  // Total Deductions
  const totalDeductions =
    epfEmployeeValue +
    socsoEmployeeVal +
    eisEmployeeVal +
    skbbkEmpVal +
    taxPcbVal +
    unpaidLeaveVal +
    deductionInLieuVal +
    deductionCp38Val +
    deductionOthersVal;

  const totalEmployerContributions =
    epfEmployerValue +
    socsoEmployerVal +
    eisEmployerVal +
    skbbkEmplyrVal +
    hrdCorpVal;

  // Net Pay = Gross Earnings + Reimbursements - Total Deductions
  const netPay = grossEarnings + reimbursementsSum - totalDeductions;

  return {
    grossEarnings,
    epfEmployeeValue,
    epfEmployerValue,
    socsoEmployeeVal,
    socsoEmployerVal,
    eisEmployeeVal,
    eisEmployerVal,
    taxPcbVal,
    skbbkEmpVal,
    skbbkEmplyrVal,
    hrdCorpVal,
    totalDeductions,
    totalEmployerContributions,
    netPay,
    allowancesSum,
    reimbursementsSum
  };
}

export interface YtdBreakdown {
  months: number;
  basicSalary: number;
  allowances: number;
  bonus: number;
  commissions: number;
  backPay: number;
  aws: number;
  compensation: number;
  overtime: number;
  reimbursements: number;
  grossEarnings: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
  skbbkEmployee: number;
  skbbkEmployer: number;
  taxPcb: number;
  totalDeductions: number;
  netPay: number;
}

export function getMonthsMultiplier(period: string): number {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  for (let i = 0; i < months.length; i++) {
    if (period.includes(months[i])) {
      return i + 1;
    }
  }
  return 10; // Default to October (10th month)
}

export function calculateYtd(employee: Employee, period: string): YtdBreakdown {
  const targetMonths = getMonthsMultiplier(period);
  const match = period.match(/\d{4}/);
  const targetYear = match ? parseInt(match[0], 10) : 2026;
  let serviceMonths = 0;
  let ytdBasic = 0;
  let ytdAllowances = 0;
  let ytdBonus = 0;
  let ytdCommissions = 0;
  let ytdBackPay = 0;
  let ytdAws = 0;
  let ytdCompensation = 0;
  let ytdOvertime = 0;
  let ytdReimbursements = 0;
  let ytdGross = 0;
  let ytdEpfEmployee = 0;
  let ytdEpfEmployer = 0;
  let ytdSocsoEmployee = 0;
  let ytdSocsoEmployer = 0;
  let ytdEisEmployee = 0;
  let ytdEisEmployer = 0;
  let ytdSkbbkEmployee = 0;
  let ytdSkbbkEmployer = 0;
  let ytdTaxPcb = 0;
  let ytdDeductions = 0;
  let ytdNetPay = 0;

  for (let m = 1; m <= targetMonths; m++) {
    const record = getHistoricalPayrollRecord(employee, m, targetYear);
    const separateRecords = (employee.historicalPayrollRecords || []).filter(history => (
      isSeparatePayrollRecord(history) &&
      history.payrollMonth === m &&
      (history.payrollYear === undefined || history.payrollYear === targetYear)
    ));
    const hasWorkedInPeriod = isEmployeeEligibleForPayrollPeriod(employee, m, targetYear);
    if (!record && !hasWorkedInPeriod && separateRecords.length === 0) {
      continue;
    }

    if (record || hasWorkedInPeriod) {
      serviceMonths += 1;
      const monthlyEmployee = getEmployeeForMonth(employee, m, targetYear);
      const monthlyBreakdown = calculatePayslip(employee, m, targetYear);

      ytdBasic += getPayrollBasicSalary(employee, m, targetYear);
      ytdAllowances += monthlyBreakdown.allowancesSum;
      ytdBonus += monthlyEmployee.bonusAmount !== undefined
        ? monthlyEmployee.bonusAmount
        : (monthlyEmployee.performanceBonus || 0);
      ytdCommissions += monthlyEmployee.commissionAmount || 0;
      ytdBackPay += monthlyEmployee.backPayAmount || 0;
      ytdAws += monthlyEmployee.awsAmount || 0;
      ytdCompensation += monthlyEmployee.compensationAmount || 0;
      ytdOvertime += monthlyEmployee.overtime || 0;
      ytdReimbursements += monthlyBreakdown.reimbursementsSum;
      ytdGross += monthlyBreakdown.grossEarnings;
      ytdEpfEmployee += monthlyBreakdown.epfEmployeeValue;
      ytdEpfEmployer += monthlyBreakdown.epfEmployerValue;
      ytdSocsoEmployee += monthlyBreakdown.socsoEmployeeVal;
      ytdSocsoEmployer += monthlyBreakdown.socsoEmployerVal;
      ytdEisEmployee += monthlyBreakdown.eisEmployeeVal;
      ytdEisEmployer += monthlyBreakdown.eisEmployerVal;
      ytdSkbbkEmployee += monthlyBreakdown.skbbkEmpVal;
      ytdSkbbkEmployer += monthlyBreakdown.skbbkEmplyrVal;
      ytdTaxPcb += monthlyBreakdown.taxPcbVal;
      ytdDeductions += monthlyBreakdown.totalDeductions;
      ytdNetPay += monthlyBreakdown.netPay;
    }

    separateRecords.forEach(separateRecord => {
      const recordAllowances =
        (separateRecord.allowanceGeneral || 0) +
        (separateRecord.allowanceTransport || 0) +
        (separateRecord.allowanceParking || 0) +
        (separateRecord.allowanceMeal || 0) +
        (separateRecord.allowanceAccommodation || 0) +
        (separateRecord.allowancePhone || 0);
      const recordBonus = separateRecord.bonusAmount || 0;
      const recordCommission = separateRecord.commissionAmount || 0;
      const recordBackPay = separateRecord.backPayAmount || 0;
      const recordAws = separateRecord.awsAmount || 0;
      const recordCompensation = separateRecord.compensationAmount || 0;
      const recordOvertime = separateRecord.overtime || 0;
      const recordReimbursements = separateRecord.reimbursementAmount || 0;
      const recordGross =
        (separateRecord.basicSalary || 0) +
        recordAllowances +
        recordOvertime +
        recordBonus +
        recordCommission +
        recordBackPay +
        recordAws +
        recordCompensation;
      const recordDeductions =
        (separateRecord.epfEmployee || 0) +
        (separateRecord.socsoEmployee || 0) +
        (separateRecord.eisEmployee || 0) +
        (separateRecord.lindung24Employee || 0) +
        (separateRecord.actualPCBDeducted || 0) +
        (separateRecord.unpaidLeave || 0) +
        (separateRecord.deductionInLieu || 0) +
        (separateRecord.deductionCp38 || 0) +
        (separateRecord.deductionOthers || 0);

      ytdBasic += separateRecord.basicSalary || 0;
      ytdAllowances += recordAllowances;
      ytdBonus += recordBonus;
      ytdCommissions += recordCommission;
      ytdBackPay += recordBackPay;
      ytdAws += recordAws;
      ytdCompensation += recordCompensation;
      ytdOvertime += recordOvertime;
      ytdReimbursements += recordReimbursements;
      ytdGross += recordGross;
      ytdEpfEmployee += separateRecord.epfEmployee || 0;
      ytdEpfEmployer += separateRecord.epfEmployer || 0;
      ytdSocsoEmployee += separateRecord.socsoEmployee || 0;
      ytdSocsoEmployer += separateRecord.socsoEmployer || 0;
      ytdEisEmployee += separateRecord.eisEmployee || 0;
      ytdEisEmployer += separateRecord.eisEmployer || 0;
      ytdSkbbkEmployee += separateRecord.lindung24Employee || 0;
      ytdTaxPcb += separateRecord.actualPCBDeducted || 0;
      ytdDeductions += recordDeductions;
      ytdNetPay += separateRecord.netPay !== undefined ? separateRecord.netPay : recordGross + recordReimbursements - recordDeductions;
    });
  }

  return {
    months: serviceMonths,
    basicSalary: ytdBasic,
    allowances: ytdAllowances,
    bonus: ytdBonus,
    commissions: ytdCommissions,
    backPay: ytdBackPay,
    aws: ytdAws,
    compensation: ytdCompensation,
    overtime: ytdOvertime,
    reimbursements: ytdReimbursements,
    grossEarnings: ytdGross,
    epfEmployee: ytdEpfEmployee,
    epfEmployer: ytdEpfEmployer,
    socsoEmployee: ytdSocsoEmployee,
    socsoEmployer: ytdSocsoEmployer,
    eisEmployee: ytdEisEmployee,
    eisEmployer: ytdEisEmployer,
    skbbkEmployee: ytdSkbbkEmployee,
    skbbkEmployer: ytdSkbbkEmployer,
    taxPcb: ytdTaxPcb,
    totalDeductions: ytdDeductions,
    netPay: ytdNetPay
  };
}

export interface UserAccount {
  email: string;
  password: string;
  name: string;
  role: string;
  mustChangePassword?: boolean;
  profileLoadedFromServer?: boolean;
}

export const MOCK_USERS: UserAccount[] = [];

export const INITIAL_CANDIDATES: Candidate[] = [];

export const SEED_ENTITIES: CorporateEntity[] = [];

export const SEED_EMPLOYEES: Employee[] = [];

export const SEED_PERFORMANCES: EmployeePerformance[] = [];

export const SEED_CANDIDATES: Candidate[] = [];

export const SEED_REVIEW_CYCLES: ReviewCycle[] = [];

export function getEffectiveProfileForDate(employee: Employee, targetDateStr: string): EmployeeTaxProfile {
  const fallback = getFallbackEffectiveProfile(employee);
  let matched = fallback;

  for (const profile of getSortedEffectiveProfiles(employee)) {
    if (profile.effectiveDate > targetDateStr) continue;

    matched = {
      ...matched,
      ...profile,
      employmentStatus: profile.employmentStatus || matched.employmentStatus || employee.status,
    };

    if (profile.employmentStatus) {
      matched.dateOfTermination = isEmployeeSeparationStatus(profile.employmentStatus)
        ? profile.dateOfTermination || profile.effectiveDate
        : profile.dateOfTermination;
    }
  }

  return matched;
}

export function getEffectiveEmploymentStatusForDate(
  employee: Employee,
  targetDateStr: string
): Employee['status'] {
  const historyStatus = getCareerHistoryStatus(
    getStatusChangeEntryForDate(employee, targetDateStr)?.newValue
  );
  if (historyStatus) {
    return historyStatus;
  }

  return getEffectiveProfileForDate(employee, targetDateStr).employmentStatus || employee.status;
}

export function getEffectiveEmploymentStatus(
  employee: Employee,
  month: number,
  year: number
): Employee['status'] {
  const lastDay = new Date(year, month, 0).getDate();
  const targetDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return getEffectiveEmploymentStatusForDate(employee, targetDateStr);
}

export const CURRENT_EMPLOYMENT_STATUSES: Employee['status'][] = ['Active'];

export function isCurrentActiveEmployee(
  employee: Employee,
  targetDateStr = getGmt8DateString()
): boolean {
  if (employee.dateOfJoined && employee.dateOfJoined > targetDateStr) {
    return false;
  }

  const terminationDate = getEffectiveTerminationDateForDate(employee, targetDateStr);
  if (terminationDate && terminationDate <= targetDateStr) {
    return false;
  }

  return CURRENT_EMPLOYMENT_STATUSES.includes(
    getEffectiveEmploymentStatusForDate(employee, targetDateStr)
  );
}

export function getCurrentActiveEmployees(
  employees: Employee[],
  targetDateStr = getGmt8DateString()
): Employee[] {
  return employees.filter((employee) => isCurrentActiveEmployee(employee, targetDateStr));
}

export function getEffectiveProfileForMonth(employee: Employee, month: number, year: number): EmployeeTaxProfile {
  const targetDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  return getEffectiveProfileForDate(employee, targetDateStr);
}

export function getPayrollRecordForMonth(
  employee: Employee,
  month: number,
  year = 2026
): HistoricalPayrollRecord {
  const record = getHistoricalPayrollRecord(employee, month, year);
  if (record) return record;
  
  // Build a default from the effective profile and current payroll eligibility.
  const profile = getEffectiveProfileForMonth(employee, month, year);
  const isEligible = profile.eligibleForStatutory !== 'No';
  const epfEmpRate = profile.epfRateEmployee || 11;
  const epfVal = isEligible ? Math.round((profile.basicSalary * epfEmpRate) / 100) : 0;
  const effectiveEmployee = getEmployeeForMonth(employee, month, year);

  return {
    payrollMonth: month,
    basicSalary: getAdjustedBasicSalary(effectiveEmployee, month, year),
    allowanceGeneral: profile.allowanceGeneral || 0,
    allowanceTransport: profile.allowanceTransport || 0,
    allowanceParking: profile.allowanceParking || 0,
    allowanceMeal: profile.allowanceMeal || 0,
    allowanceAccommodation: profile.allowanceAccommodation || 0,
    allowancePhone: profile.allowancePhone || 0,
    commissionAmount: profile.commissionAmount || 0,
    epfEmployee: epfVal,
    zakat: 0,
    cp38: 0,
    actualPCBDeducted: 0
  };
}

export function buildPCBContext(params: {
  employee: Employee;
  taxYear: number;
  month: number;
  currentPayroll: HistoricalPayrollRecord;
  priorResults: HistoricalPCBResult[];
  calculationBasis: HistoricalCalculationBasis;
  profile: EmployeeTaxProfile;
}): HistoricalPCBMonthContext {
  const m = params.month;
  
  // Previous employer TP3 data
  const tp3Raw = params.employee.tp3Data || {};
  const tp3: TP3Data = {
    taxYear: tp3Raw.taxYear || params.taxYear,
    previousEmployerRemuneration: tp3Raw.previousEmployerRemuneration !== undefined ? tp3Raw.previousEmployerRemuneration : (tp3Raw.accumulatedPriorRemuneration || 0),
    previousEmployerAdditionalRemuneration: tp3Raw.previousEmployerAdditionalRemuneration || 0,
    previousEmployerEpf: tp3Raw.previousEmployerEpf !== undefined ? tp3Raw.previousEmployerEpf : (tp3Raw.accumulatedPriorEPF || 0),
    previousEmployerPcb: tp3Raw.previousEmployerPcb !== undefined ? tp3Raw.previousEmployerPcb : (tp3Raw.accumulatedPriorPCB || 0),
    previousEmployerZakat: tp3Raw.previousEmployerZakat || 0
  };

  // YTD accumulation from prior results (up to m-1)
  let accumulatedRemuneration = 0;
  let accumulatedAdditionalRemuneration = 0;
  let accumulatedEmployeeEPF = 0;
  let accumulatedPCB = 0;
  let accumulatedZakat = 0;

  for (const prior of params.priorResults) {
    if (prior.payrollMonth < m) {
      accumulatedRemuneration += prior.currentNormalRemuneration;
      accumulatedAdditionalRemuneration += prior.currentAdditionalRemuneration;
      accumulatedEmployeeEPF += prior.currentMonthEmployeeEPF;
      
      // Accumulation depends on Calculation Basis
      if (params.calculationBasis === 'actual_deduction_history') {
        accumulatedPCB += prior.actualPCBDeducted || 0;
      } else {
        accumulatedPCB += prior.calculatedPCB;
      }
      accumulatedZakat += prior.currentZakat;
    }
  }

  // Current month inputs
  const normalAllowanceSum = 
    (params.currentPayroll.allowanceGeneral || 0) +
    (params.currentPayroll.allowanceTransport || 0) +
    (params.currentPayroll.allowanceParking || 0) +
    (params.currentPayroll.allowanceMeal || 0) +
    (params.currentPayroll.allowanceAccommodation || 0) +
    (params.currentPayroll.allowancePhone || 0);

  const currentMonthNormalRemuneration = params.currentPayroll.basicSalary + normalAllowanceSum;
  
  const additionalRemuneration = 
    (params.currentPayroll.overtime || 0) +
    (params.currentPayroll.performanceBonus || 0) +
    (params.currentPayroll.bonusAmount || 0) +
    (params.currentPayroll.commissionAmount || 0) +
    (params.currentPayroll.backPayAmount || 0) +
    (params.currentPayroll.awsAmount || 0) +
    (params.currentPayroll.compensationAmount || 0);

  const currentMonthEmployeeEPF = params.currentPayroll.epfEmployee || 0;
  const currentMonthZakat = params.currentPayroll.zakat || 0;
  const currentMonthCP38 = params.currentPayroll.cp38 || 0;

  // Projection remaining months
  // If termination date is known, projection ends at the termination date
  const terminationDate = params.profile.dateOfTermination;
  let remainingMonths = 12 - m;
  if (terminationDate) {
    const termParts = terminationDate.split('-');
    const termYear = termParts[0] ? Number(termParts[0]) : 2026;
    if (termYear === params.taxYear && termParts[1]) {
      const termMonth = Number(termParts[1]);
      remainingMonths = Math.max(0, termMonth - m);
    }
  }

  const projectedRemainingNormalRemuneration = currentMonthNormalRemuneration;

  return {
    taxYear: params.taxYear,
    payrollMonth: m,
    employeeProfileEffectiveForMonth: params.profile,
    previousEmployerTP3: tp3,
    priorCurrentEmployerPayrolls: [], // conceptually stored in accumulated fields
    currentMonthPayroll: params.currentPayroll,
    accumulatedRemunerationBeforeCurrentMonth: accumulatedRemuneration,
    accumulatedAdditionalRemunerationBeforeCurrentMonth: accumulatedAdditionalRemuneration,
    accumulatedEmployeeEPFBeforeCurrentMonth: accumulatedEmployeeEPF,
    accumulatedPCBBeforeCurrentMonth: accumulatedPCB,
    accumulatedZakatBeforeCurrentMonth: accumulatedZakat,
    currentMonthNormalRemuneration,
    currentMonthAdditionalRemuneration: additionalRemuneration,
    currentMonthEmployeeEPF,
    currentMonthZakat,
    currentMonthCP38,
    projectedRemainingNormalRemuneration,
    remainingApplicableMonths: remainingMonths,
    calculationBasis: params.calculationBasis,
    employeeId: params.employee.id,
    employee_pcb_history_ledger: params.employee.employee_pcb_history_ledger,
    employee_tp3_declarations: params.employee.employee_tp3_declarations
  };
}

export function calculateAnnualTaxSpec(taxableIncome: number): number {
  let annualTax = 0;
  if (taxableIncome <= 5000) {
    annualTax = 0;
  } else if (taxableIncome <= 20000) {
    annualTax = (taxableIncome - 5000) * 0.01;
  } else if (taxableIncome <= 35000) {
    annualTax = 150 + (taxableIncome - 20000) * 0.03;
  } else if (taxableIncome <= 50000) {
    annualTax = 600 + (taxableIncome - 35000) * 0.06;
  } else if (taxableIncome <= 70000) {
    annualTax = 1500 + (taxableIncome - 50000) * 0.11;
  } else if (taxableIncome <= 100000) {
    annualTax = 3700 + (taxableIncome - 70000) * 0.19;
  } else if (taxableIncome <= 400000) {
    annualTax = 9400 + (taxableIncome - 100000) * 0.25;
  } else if (taxableIncome <= 600000) {
    annualTax = 84400 + (taxableIncome - 400000) * 0.26;
  } else if (taxableIncome <= 2000000) {
    annualTax = 136400 + (taxableIncome - 600000) * 0.28;
  } else {
    annualTax = 528400 + (taxableIncome - 2000000) * 0.30;
  }
  return annualTax;
}

export function calculateMonthlyPCB(context: HistoricalPCBMonthContext): HistoricalPCBResult {
  const profile = context.employeeProfileEffectiveForMonth;
  const tp3 = context.previousEmployerTP3;
  const m = context.payrollMonth;

  // Group TP1 claims from employee profile
  const tp1Declarations = context.employeeProfileEffectiveForMonth ? (context as any).employee?.tp1Declarations : [];

  const res2026 = calculatePCB2026({
    employeeTaxProfile: profile,
    employeeChildren: profile.dependantsCount ? Array(profile.dependantsCount).fill({ isDisabled: false }) : [],
    payrollMonth: m,
    currentNormalRemuneration: context.currentMonthNormalRemuneration,
    currentAdditionalRemuneration: context.currentMonthAdditionalRemuneration,
    currentQualifyingEPF: context.currentMonthEmployeeEPF,
    tp3Declaration: {
      previousEmployerRemuneration: tp3.previousEmployerRemuneration,
      previousEmployerAdditionalRemuneration: tp3.previousEmployerAdditionalRemuneration,
      previousEmployerEpf: tp3.previousEmployerEpf,
      previousEmployerPcb: tp3.previousEmployerPcb,
      previousEmployerZakat: tp3.previousEmployerZakat
    },
    accumulatedPCB: context.accumulatedPCBBeforeCurrentMonth,
    accumulatedZakat: context.accumulatedZakatBeforeCurrentMonth,
    currentZakat: context.currentMonthZakat,
    cp38Instruction: context.currentMonthCP38,
    payrollHistory: [],
    tp1Declarations: tp1Declarations,
    employee_pcb_history_ledger: context.employee_pcb_history_ledger,
    employee_tp3_declarations: context.employee_tp3_declarations
  });

  const steps: PCBCalculationStep[] = [
    { stepName: "Estimate Annual Normal Remuneration", output: res2026.Y + res2026.Y1 + res2026.Y2 * res2026.n },
    { stepName: "Estimate EPF Relief", output: Math.min(4000, res2026.K + res2026.K1 + res2026.K2 * res2026.n) },
    { stepName: "Compute Total Reliefs", output: res2026.D + (res2026.S || 0) + (res2026.Q || 0) * (res2026.C || 0) + Math.min(4000, res2026.K + res2026.K1 + res2026.K2 * res2026.n) },
    { stepName: "Compute Chargeable Income (Normal)", output: res2026.PWithoutCurrentAdditional },
    { stepName: "Calculate Annual Tax Liability (Normal)", output: res2026.annualTaxWithoutCurrentAdditional },
    { stepName: "Calculate Monthly PCB (Normal)", output: res2026.normalPCBAfterMinimumRule }
  ];

  if (context.currentMonthAdditionalRemuneration > 0) {
    steps.push(
      { stepName: "Estimate Annual Remuneration with Additional Remuneration", output: res2026.Y + res2026.Y1 + res2026.Yt + res2026.Y2 * res2026.n },
      { stepName: "Calculate Annual Tax Liability (with Additional Remuneration)", output: res2026.annualTaxWithCurrentAdditional },
      { stepName: "Calculate Monthly PCB (Additional)", output: res2026.additionalPCBAfterMinimumRule }
    );
  }

  const calculatedPCB = res2026.finalPCB;
  const actualPCBDeducted = context.currentMonthPayroll.actualPCBDeducted;
  const pcbVariance = parseFloat((actualPCBDeducted - calculatedPCB).toFixed(2));

  let status: HistoricalPCBStatus = "calculated";
  if (pcbVariance !== 0) {
    status = "variance_detected";
  }

  return {
    employeeId: context.employeeId,
    taxYear: context.taxYear,
    payrollMonth: m,
    processingMode: "historical_reconstruction",
    calculationBasis: context.calculationBasis,
    effectiveEmployeeProfileVersion: profile.effectiveDate,
    taxConfigurationVersion: "HASiL 2026 progressive v1",
    currentNormalRemuneration: context.currentMonthNormalRemuneration,
    currentAdditionalRemuneration: context.currentMonthAdditionalRemuneration,
    currentMonthEmployeeEPF: context.currentMonthEmployeeEPF,
    accumulatedPriorRemuneration: context.accumulatedRemunerationBeforeCurrentMonth,
    accumulatedPriorAdditionalRemuneration: context.accumulatedAdditionalRemunerationBeforeCurrentMonth,
    accumulatedPriorEPF: context.accumulatedEmployeeEPFBeforeCurrentMonth,
    accumulatedPriorPCB: context.accumulatedPCBBeforeCurrentMonth,
    accumulatedPriorZakat: context.accumulatedZakatBeforeCurrentMonth,
    previousEmployerRemuneration: tp3.previousEmployerRemuneration,
    previousEmployerEPF: tp3.previousEmployerEpf,
    previousEmployerPCB: tp3.previousEmployerPcb,
    previousEmployerZakat: tp3.previousEmployerZakat,
    projectedRemainingRemuneration: context.projectedRemainingNormalRemuneration,
    estimatedAnnualIncome: res2026.PWithCurrentAdditional,
    qualifyingDeductions: res2026.accumulatedLP + res2026.currentLP1,
    personalAndFamilyReliefs: res2026.D + (res2026.S || 0) + (res2026.Du || 0) + (res2026.Su || 0) + (res2026.Q || 0) * (res2026.C || 0),
    approvedTP1Reliefs: res2026.currentLP1,
    estimatedChargeableIncome: res2026.PWithCurrentAdditional,
    estimatedAnnualTax: res2026.annualTaxWithCurrentAdditional,
    normalRemunerationPCB: res2026.netNormalPCB,
    additionalRemunerationPCB: res2026.additionalPCBAfterMinimumRule,
    calculatedPCB,
    actualPCBDeducted,
    pcbVariance,
    currentZakat: context.currentMonthZakat,
    currentCP38: context.currentMonthCP38,
    totalActualTaxDeduction: actualPCBDeducted,
    totalCalculatedTaxDeduction: calculatedPCB,
    calculationTimestamp: new Date().toISOString(),
    calculationVersion: 1,
    status,
    warnings: res2026.warnings || [],
    errors: res2026.errors || [],
    calculationBreakdown: steps,

    // Section 17 fields
    assessmentYear: res2026.assessmentYear,
    taxResidenceStatus: res2026.taxResidenceStatus,
    taxCategory: res2026.taxCategory,
    accumulatedPreviousEmployerRemuneration: res2026.accumulatedPreviousEmployerRemuneration,
    accumulatedCurrentEmployerRemuneration: res2026.accumulatedCurrentEmployerRemuneration,
    accumulatedQualifyingEPF: res2026.accumulatedQualifyingEPF,
    accumulatedAllowableDeductions: res2026.accumulatedAllowableDeductions,
    accumulatedPreviousEmployerPCB: res2026.accumulatedPreviousEmployerPCB,
    accumulatedCurrentEmployerPCB: res2026.accumulatedCurrentEmployerPCB,
    accumulatedAdjustedPCB: res2026.accumulatedAdjustedPCB,
    accumulatedPCB_X: res2026.accumulatedPCB_X,
    accumulatedZakat_Z: res2026.accumulatedZakat_Z,
    estimatedAnnualChargeableIncome_P: res2026.estimatedAnnualChargeableIncome_P,
    selectedTaxBracket: res2026.selectedTaxBracket,
    M: res2026.M,
    R: res2026.R,
    B: res2026.B,
    remainingEstimatedTax: res2026.remainingEstimatedTax,
    currentAndRemainingMonthCount: res2026.currentAndRemainingMonthCount,
    currentMonthZakatOffset: res2026.currentMonthZakatOffset,
    finalPCB: res2026.finalPCB,
    CP38: res2026.CP38,
    totalTaxDeduction: res2026.totalTaxDeduction,
    configurationVersion: res2026.configurationVersion
  };
}

export interface AccumulatedPCBHistoryResult {
  previousEmployerPCB: number;
  currentEmployerPreviousPCB: number;
  reversedPCB: number;
  validAdjustmentPCB: number;
  accumulatedPCB_X: number;
  sourceBreakdown: Array<{
    month: number;
    sourceType: string;
    ref: string;
    amount: number;
    status: string;
    details?: string;
  }>;
  excludedRecords: Array<{
    id: string;
    reason: string;
  }>;
  exclusionReasons: string[];
}

export function calculateAccumulatedPCBHistory(params: {
  employeeId: string;
  assessmentYear: number;
  currentPayrollMonth: number;
  verifiedTP3Records: EmployeeTP3Declaration[];
  finalizedPayrollHistory: EmployeePCBHistoryLedgerEntry[];
  payrollAdjustments?: any[];
}): AccumulatedPCBHistoryResult {
  const { employeeId, assessmentYear, currentPayrollMonth, verifiedTP3Records, finalizedPayrollHistory } = params;

  let previousEmployerPCB = 0;
  let currentEmployerPreviousPCB = 0;
  let reversedPCB = 0;
  let validAdjustmentPCB = 0;

  const sourceBreakdown: AccumulatedPCBHistoryResult['sourceBreakdown'] = [];
  const excludedRecords: AccumulatedPCBHistoryResult['excludedRecords'] = [];
  const exclusionReasonsSet = new Set<string>();

  const uniqueKeys = new Map<string, any>();

  // 1. Process verified TP3 records
  for (const tp3 of verifiedTP3Records) {
    if (tp3.taxYear !== assessmentYear) {
      excludedRecords.push({ id: tp3.id || 'tp3', reason: `Tax year ${tp3.taxYear} does not match assessment year ${assessmentYear}` });
      exclusionReasonsSet.add(`TP3 tax year mismatch`);
      continue;
    }
    if (tp3.verificationStatus !== 'VERIFIED') {
      excludedRecords.push({ id: tp3.id || 'tp3', reason: `Verification status is ${tp3.verificationStatus}` });
      exclusionReasonsSet.add(`TP3 unverified or cancelled`);
      continue;
    }
    
    const amt = tp3.previousEmployerPcb || 0;
    const key = `${employeeId}-${assessmentYear}-TP3_PREVIOUS_EMPLOYER-tp3-${currentPayrollMonth}`;
    if (uniqueKeys.has(key)) {
      excludedRecords.push({ id: tp3.id || 'tp3', reason: `Duplicate TP3 entry key: ${key}` });
      exclusionReasonsSet.add(`Duplicate TP3 record`);
      continue;
    }
    uniqueKeys.set(key, tp3);
    previousEmployerPCB += amt;
    sourceBreakdown.push({
      month: 0,
      sourceType: 'TP3_PREVIOUS_EMPLOYER',
      ref: 'TP3 Form',
      amount: amt,
      status: tp3.verificationStatus,
      details: 'Verified previous employer TP3'
    });
  }

  // Eligible statuses
  const ELIGIBLE_STATUSES = ['FINALIZED', 'APPROVED', 'LOCKED', 'PAID', 'SUBMITTED', 'REVERSED'];

  // 2. Process finalized payroll history (current employer)
  for (const ledger of finalizedPayrollHistory) {
    if (ledger.assessment_year !== assessmentYear) {
      excludedRecords.push({ id: ledger.id, reason: `Ledger year ${ledger.assessment_year} mismatch` });
      exclusionReasonsSet.add(`Ledger year mismatch`);
      continue;
    }
    if (ledger.payroll_month >= currentPayrollMonth) {
      excludedRecords.push({ id: ledger.id, reason: `Ledger month ${ledger.payroll_month} is >= current month ${currentPayrollMonth}` });
      exclusionReasonsSet.add(`Ledger month is current/future`);
      continue;
    }

    const key = `${employeeId}-${assessmentYear}-${ledger.source_type}-${ledger.source_reference || 'ref'}-${ledger.payroll_month}`;
    if (uniqueKeys.has(key)) {
      excludedRecords.push({ id: ledger.id, reason: `Duplicate ledger entry key: ${key}` });
      exclusionReasonsSet.add(`Duplicate ledger record`);
      continue;
    }
    uniqueKeys.set(key, ledger);

    if (!ELIGIBLE_STATUSES.includes(ledger.status)) {
      excludedRecords.push({ id: ledger.id, reason: `Status is ${ledger.status}` });
      exclusionReasonsSet.add(`Ledger status not final/eligible`);
      continue;
    }

    const effectiveAmount = ledger.effective_amount !== undefined ? ledger.effective_amount : ledger.total_pcb;

    if (ledger.source_type === 'CURRENT_EMPLOYER_PAYROLL') {
      currentEmployerPreviousPCB += effectiveAmount;
      sourceBreakdown.push({
        month: ledger.payroll_month,
        sourceType: 'CURRENT_EMPLOYER_PAYROLL',
        ref: ledger.source_reference,
        amount: effectiveAmount,
        status: ledger.status,
        details: `Finalized payroll for Month ${ledger.payroll_month}`
      });
    } else if (ledger.source_type === 'APPROVED_ADJUSTMENT') {
      validAdjustmentPCB += effectiveAmount;
      sourceBreakdown.push({
        month: ledger.payroll_month,
        sourceType: 'APPROVED_ADJUSTMENT',
        ref: ledger.source_reference,
        amount: effectiveAmount,
        status: ledger.status,
        details: `Approved manual adjustment: ${ledger.exclusion_reason || ''}`
      });
    } else if (ledger.source_type === 'REVERSAL') {
      reversedPCB += Math.abs(effectiveAmount);
      sourceBreakdown.push({
        month: ledger.payroll_month,
        sourceType: 'REVERSAL',
        ref: ledger.source_reference,
        amount: effectiveAmount,
        status: ledger.status,
        details: `Reversed deduction reference ${ledger.reversal_reference || ''}`
      });
    }
  }

  const accumulatedPCB_X = Math.max(0, previousEmployerPCB + currentEmployerPreviousPCB + validAdjustmentPCB - reversedPCB);

  return {
    previousEmployerPCB,
    currentEmployerPreviousPCB,
    reversedPCB,
    validAdjustmentPCB,
    accumulatedPCB_X,
    sourceBreakdown,
    excludedRecords,
    exclusionReasons: Array.from(exclusionReasonsSet)
  };
}

export interface RecalculatePCBForwardResult {
  earliestAffectedMonth: number;
  monthsReviewed: number[];
  monthsRecalculated: number[];
  lockedMonthsSkipped: number[];
  originalPCBTotal: number;
  recalculatedPCBTotal: number;
  difference: number;
  currentMonthAdjustment: number;
  warnings: string[];
  submissionAmendmentRequired: boolean;
}

export function recalculatePCBForward(params: {
  employee: Employee;
  assessmentYear: number;
  changedEffectiveMonth: number;
  reason: string;
  changedBy: string;
}): RecalculatePCBForwardResult {
  const { employee, assessmentYear, changedEffectiveMonth } = params;
  
  const monthsReviewed: number[] = [];
  const monthsRecalculated: number[] = [];
  const lockedMonthsSkipped: number[] = [];
  const warnings: string[] = [];

  const ledger = employee.employee_pcb_history_ledger || [];
  const tp3 = employee.employee_tp3_declarations || [];

  // Original total PCB
  const originalPCBTotal = ledger
    .filter(l => l.assessment_year === assessmentYear && l.status !== 'CANCELLED')
    .reduce((sum, l) => sum + (l.source_type === 'REVERSAL' ? -l.effective_amount : l.effective_amount), 0);

  const start = Math.max(1, changedEffectiveMonth);
  
  const lockedMonths = new Set(
    ledger
      .filter(l => l.assessment_year === assessmentYear && (l.status === 'LOCKED' || l.status === 'PAID' || l.status === 'SUBMITTED'))
      .map(l => l.payroll_month)
  );

  let recalculatedPCBTotal = 0;
  const results: HistoricalPCBResult[] = [];
  const joinDate = employee.dateOfJoined || '2026-01-01';
  const joinParts = joinDate.split('-');
  const joinYear = joinParts[0] ? Number(joinParts[0]) : 2026;
  const joinMonth = (joinYear === assessmentYear && joinParts[1]) ? Number(joinParts[1]) : 1;

  for (let m = 1; m <= 12; m++) {
    monthsReviewed.push(m);
    if (m < joinMonth) continue;

    const profile = getEffectiveProfileForMonth(employee, m, assessmentYear);
    const payroll = getPayrollRecordForMonth(employee, m, assessmentYear);

    const isLocked = lockedMonths.has(m);
    if (m < start || isLocked) {
      if (isLocked) {
        lockedMonthsSkipped.push(m);
      }
      const monthLedgerSum = ledger
        .filter(l => l.assessment_year === assessmentYear && l.payroll_month === m && l.status !== 'CANCELLED')
        .reduce((sum, l) => sum + (l.source_type === 'REVERSAL' ? -l.effective_amount : l.effective_amount), 0);
      
      const calcVal = monthLedgerSum || payroll.actualPCBDeducted || 0;
      recalculatedPCBTotal += calcVal;

      results.push({
        employeeId: employee.id,
        taxYear: assessmentYear,
        payrollMonth: m,
        calculatedPCB: calcVal,
        actualPCBDeducted: calcVal,
        currentNormalRemuneration: payroll.basicSalary + ((payroll.allowanceGeneral || 0) + (payroll.allowanceTransport || 0) + (payroll.allowanceParking || 0) + (payroll.allowanceMeal || 0) + (payroll.allowanceAccommodation || 0) + (payroll.allowancePhone || 0)),
        currentAdditionalRemuneration: (payroll.overtime || 0) + (payroll.performanceBonus || 0) + (payroll.bonusAmount || 0) + (payroll.commissionAmount || 0) + (payroll.backPayAmount || 0) + (payroll.awsAmount || 0) + (payroll.compensationAmount || 0),
        currentMonthEmployeeEPF: payroll.epfEmployee || 0,
        currentZakat: payroll.zakat || 0,
        currentCP38: payroll.cp38 || 0,
        pcbVariance: 0,
        processingMode: 'historical_reconstruction',
        calculationBasis: 'actual_deduction_history',
        effectiveEmployeeProfileVersion: profile.effectiveDate || 'default',
        taxConfigurationVersion: '2026-v1',
        accumulatedPriorRemuneration: 0,
        accumulatedPriorAdditionalRemuneration: 0,
        accumulatedPriorEPF: 0,
        accumulatedPriorPCB: 0,
        accumulatedPriorZakat: 0,
        previousEmployerRemuneration: 0,
        previousEmployerEPF: 0,
        previousEmployerPCB: 0,
        previousEmployerZakat: 0,
        projectedRemainingRemuneration: 0,
        estimatedAnnualIncome: 0,
        qualifyingDeductions: 0,
        personalAndFamilyReliefs: 0,
        approvedTP1Reliefs: 0,
        estimatedChargeableIncome: 0,
        estimatedAnnualTax: 0,
        normalRemunerationPCB: calcVal,
        additionalRemunerationPCB: 0,
        totalActualTaxDeduction: calcVal,
        totalCalculatedTaxDeduction: calcVal,
        calculationTimestamp: new Date().toISOString(),
        calculationVersion: 1,
        status: 'calculated',
        warnings: [],
        errors: [],
        calculationBreakdown: []
      });
      continue;
    }

    monthsRecalculated.push(m);
    const priorVerifiedTP3 = tp3.filter(t => t.verificationStatus === 'VERIFIED');
    const priorLedgers: any[] = [];
    
    for (const t of priorVerifiedTP3) {
      priorLedgers.push({
        id: t.id,
        assessment_year: t.taxYear,
        payroll_month: 0,
        source_type: 'TP3_PREVIOUS_EMPLOYER',
        source_reference: 'TP3 Form',
        effective_amount: t.previousEmployerPcb,
        total_pcb: t.previousEmployerPcb,
        status: 'FINALIZED'
      });
    }

    for (const res of results) {
      priorLedgers.push({
        id: `payroll-${res.payrollMonth}`,
        assessment_year: assessmentYear,
        payroll_month: res.payrollMonth,
        source_type: 'CURRENT_EMPLOYER_PAYROLL',
        source_reference: `Month ${res.payrollMonth}`,
        effective_amount: res.calculatedPCB,
        total_pcb: res.calculatedPCB,
        status: 'FINALIZED'
      });
    }

    const historyX = calculateAccumulatedPCBHistory({
      employeeId: employee.id,
      assessmentYear,
      currentPayrollMonth: m,
      verifiedTP3Records: priorVerifiedTP3,
      finalizedPayrollHistory: priorLedgers
    });

    const accumulatedPCB = historyX.accumulatedPCB_X;
    const tp3Zakat = priorVerifiedTP3.reduce((sum, t) => sum + t.previousEmployerZakat, 0);
    const prevZakat = results.reduce((sum, r) => sum + r.currentZakat, 0);
    const accumulatedZakat = tp3Zakat + prevZakat;

    const context = buildPCBContext({
      employee,
      taxYear: assessmentYear,
      month: m,
      currentPayroll: payroll,
      priorResults: results,
      calculationBasis: 'actual_deduction_history',
      profile
    });

    context.accumulatedPCBBeforeCurrentMonth = accumulatedPCB;
    context.accumulatedZakatBeforeCurrentMonth = accumulatedZakat;

    const res = calculateMonthlyPCB(context);
    recalculatedPCBTotal += res.calculatedPCB;
    results.push(res);
  }

  const difference = recalculatedPCBTotal - originalPCBTotal;
  const submissionAmendmentRequired = lockedMonthsSkipped.length > 0 && Math.abs(difference) > 0.01;

  if (submissionAmendmentRequired) {
    warnings.push(`Statutory submission amendment may be required: historical locked months were skipped, but recalculated values changed by RM ${difference.toFixed(2)}.`);
  }

  return {
    earliestAffectedMonth: start,
    monthsReviewed,
    monthsRecalculated,
    lockedMonthsSkipped,
    originalPCBTotal,
    recalculatedPCBTotal,
    difference,
    currentMonthAdjustment: difference,
    warnings,
    submissionAmendmentRequired
  };
}

export function reconstructPCBHistory(params: {
  employee: Employee;
  taxYear: number;
  startMonth: number;
  endMonth: number;
  calculationBasis: HistoricalCalculationBasis;
}): HistoricalPCBResult[] {
  const results: HistoricalPCBResult[] = [];
  const start = Math.max(1, params.startMonth);
  const end = Math.min(12, params.endMonth);

  const joinDate = params.employee.dateOfJoined || '2026-01-01';
  const joinParts = joinDate.split('-');
  const joinYear = joinParts[0] ? Number(joinParts[0]) : 2026;
  const joinMonth = (joinYear === params.taxYear && joinParts[1]) ? Number(joinParts[1]) : 1;

  for (let m = 1; m <= end; m++) {
    if (m < joinMonth) {
      continue;
    }

    const profile = getEffectiveProfileForMonth(params.employee, m, params.taxYear);
    const payroll = getPayrollRecordForMonth(params.employee, m, params.taxYear);
    
    const context = buildPCBContext({
      employee: params.employee,
      taxYear: params.taxYear,
      month: m,
      currentPayroll: payroll,
      priorResults: results,
      calculationBasis: params.calculationBasis,
      profile
    });
    
    const result = calculateMonthlyPCB(context);
    results.push(result);
  }

  return results.filter(r => r.payrollMonth >= start && r.payrollMonth <= end);
}

export function recalculatePCBFromMonth(params: {
  employee: Employee;
  taxYear: number;
  changedMonth: number;
  calculationBasis: HistoricalCalculationBasis;
}): HistoricalPCBResult[] {
  const joinDate = params.employee.dateOfJoined || '2026-01-01';
  const joinParts = joinDate.split('-');
  const joinYear = joinParts[0] ? Number(joinParts[0]) : 2026;
  const joinMonth = (joinYear === params.taxYear && joinParts[1]) ? Number(joinParts[1]) : 1;

  const results: HistoricalPCBResult[] = [];
  
  for (let m = 1; m <= 12; m++) {
    if (m < joinMonth) continue;
    
    const profile = getEffectiveProfileForMonth(params.employee, m, params.taxYear);
    const payroll = getPayrollRecordForMonth(params.employee, m, params.taxYear);
    
    const context = buildPCBContext({
      employee: params.employee,
      taxYear: params.taxYear,
      month: m,
      currentPayroll: payroll,
      priorResults: results,
      calculationBasis: params.calculationBasis,
      profile
    });
    
    const res = calculateMonthlyPCB(context);
    res.processingMode = m === params.changedMonth ? "historical_recalculation" : "historical_reconstruction";
    results.push(res);
  }
  
  return results;
}

export function getDirectLogoUrl(url: string | undefined): string {
  if (!url) return '';
  // Check if it's a Google Drive link
  if (url.includes('drive.google.com')) {
    // Extract file ID
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  return url;
}

export async function compressLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 250;
        const MAX_HEIGHT = 100;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => {
        reject(new Error('Failed to load image for compression'));
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}
