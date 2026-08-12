import { strict as assert } from 'node:assert';
import {
  calculatePayslip,
  calculateYtd,
  getPayrollDocumentProfileForRecord,
  getSeparatePayoutConfig,
  mergePayrollRecords2026,
  isSeparatePayrollRecord,
  seedSocsoConfigurationsAndBrackets
} from './data';
import type { Employee, PayrollRecord2026 } from './types';
import { createTestEmployee } from './testFixtures';

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear()
};
seedSocsoConfigurationsAndBrackets();

const createEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  ...createTestEmployee(),
  id: overrides.email || overrides.id || 'separate-payout@example.com',
  email: overrides.email || 'separate-payout@example.com',
  basicSalary: 5000,
  epfRateEmployee: 11,
  epfRateEmployer: 13,
  optInEpf: true,
  optInSocso: true,
  optInEis: true,
  optInPcb: true,
  ...overrides
});

const bonusRecord: PayrollRecord2026 = {
  id: 'bonus-record-2026-08',
  employeeEmail: 'separate-payout@example.com',
  payrollMonth: 8,
  payrollYear: 2026,
  paymentDate: '2026-08-28',
  basicSalary: 0,
  allowanceGeneral: 0,
  allowanceTransport: 0,
  allowanceParking: 0,
  allowanceMeal: 0,
  allowanceAccommodation: 0,
  allowancePhone: 0,
  overtime: 0,
  bonusAmount: 1000,
  bonusDesc: 'Performance bonus',
  commissionAmount: 0,
  commissionDesc: '',
  backPayAmount: 0,
  awsAmount: 0,
  compensationAmount: 0,
  reimbursementAmount: 0,
  unpaidLeave: 0,
  deductionInLieu: 0,
  deductionCp38: 0,
  deductionOthers: 0,
  actualPCBDeducted: 0,
  epfEmployee: 110,
  epfEmployer: 130,
  socsoEmployee: 0,
  socsoEmployer: 0,
  eisEmployee: 0,
  eisEmployer: 0,
  netPay: 890,
  createdAt: '2026-08-07T00:00:00.000Z',
  payoutKind: 'bonus',
  isSeparatePayout: true,
  statutoryTreatment: 'with_statutory',
  payoutTitle: 'Bonus',
  payoutDescription: 'Quarterly reward',
  lineNotes: { bonusAmount: 'Paid after performance review' },
  documentType: 'Payslip',
  compensationLabel: 'Bonus'
};

const bonusEmployee = createEmployee({
  employmentType: 'Permanent',
  eligibleForStatutory: 'Yes',
  bonusAmount: 1000,
  bonusDesc: 'Performance bonus'
});

assert.equal(isSeparatePayrollRecord(bonusRecord), true);
assert.equal(getSeparatePayoutConfig('bonus').title, 'Bonus');
const bonusProfile = getPayrollDocumentProfileForRecord(bonusEmployee, bonusRecord);
assert.equal(bonusProfile.documentType, 'Payslip');
assert.equal(bonusProfile.compensationLabel, 'Bonus');
assert.equal(bonusProfile.statutoryEnabled, true);

const bonusBreakdown = calculatePayslip(bonusEmployee, 8, 2026, {
  basicSalaryOverride: 0,
  statutorySalaryOverride: 1000,
  ignoreSavedStatutory: true
});
assert.equal(bonusBreakdown.grossEarnings, 1000);
assert.ok(bonusBreakdown.epfEmployeeValue > 0);

const voucherRecord: PayrollRecord2026 = {
  id: 'claim-record-2026-08',
  employeeEmail: 'separate-payout@example.com',
  payrollMonth: 8,
  payrollYear: 2026,
  paymentDate: '2026-08-28',
  basicSalary: 0,
  allowanceGeneral: 0,
  allowanceTransport: 0,
  allowanceParking: 0,
  allowanceMeal: 0,
  allowanceAccommodation: 0,
  allowancePhone: 0,
  overtime: 0,
  bonusAmount: 0,
  commissionAmount: 0,
  backPayAmount: 0,
  awsAmount: 0,
  compensationAmount: 0,
  reimbursementAmount: 450,
  reimbursementDesc: 'Travel claim',
  unpaidLeave: 0,
  deductionInLieu: 0,
  deductionCp38: 0,
  deductionOthers: 0,
  actualPCBDeducted: 0,
  epfEmployee: 0,
  epfEmployer: 0,
  socsoEmployee: 0,
  socsoEmployer: 0,
  eisEmployee: 0,
  eisEmployer: 0,
  netPay: 450,
  createdAt: '2026-08-07T00:00:00.000Z',
  payoutKind: 'claim_reimbursement',
  isSeparatePayout: true,
  statutoryTreatment: 'without_statutory',
  payoutTitle: 'Claim / Reimbursement',
  payoutDescription: 'Approved travel reimbursement',
  lineNotes: { reimbursementAmount: 'Claimed with receipts attached' },
  documentType: 'Payment Voucher',
  compensationLabel: 'Claim / Reimbursement'
};

const voucherEmployee = createEmployee({
  employmentType: 'Contract',
  eligibleForStatutory: 'No',
  reimbursementAmount: 450,
  reimbursementDesc: 'Travel claim'
});

const voucherProfile = getPayrollDocumentProfileForRecord(voucherEmployee, voucherRecord);
assert.equal(voucherProfile.documentType, 'Payment Voucher');
assert.equal(voucherProfile.compensationLabel, 'Claim / Reimbursement');
assert.equal(voucherProfile.statutoryEnabled, false);

const voucherBreakdown = calculatePayslip(voucherEmployee, 8, 2026, {
  basicSalaryOverride: 0,
  statutorySalaryOverride: 450,
  ignoreSavedStatutory: true,
  statutoryOverrides: {
    epfEmployee: 0,
    epfEmployer: 0,
    socsoEmployee: 0,
    socsoEmployer: 0,
    lindung24Employee: 0,
    eisEmployee: 0,
    eisEmployer: 0,
    taxPcb: 0,
    hrdCorp: 0
  }
});
assert.equal(voucherBreakdown.grossEarnings, 0);
assert.equal(voucherBreakdown.reimbursementsSum, 450);
assert.equal(voucherBreakdown.epfEmployeeValue, 0);

const staleStatutoryVoucherBreakdown = calculatePayslip(voucherEmployee, 8, 2026, {
  basicSalaryOverride: 0,
  statutorySalaryOverride: 450,
  statutoryEligibilityOverride: false,
  ignoreSavedStatutory: true,
  statutoryOverrides: {
    epfEmployee: 99,
    epfEmployer: 99,
    socsoEmployee: 99,
    socsoEmployer: 99,
    eisEmployee: 99,
    eisEmployer: 99,
    taxPcb: 99,
    hrdCorp: 99
  }
});
assert.equal(staleStatutoryVoucherBreakdown.totalEmployerContributions, 0);
assert.equal(staleStatutoryVoucherBreakdown.totalDeductions, 0);

const ytdEmployee = createEmployee({
  historicalPayrollRecords: [
    {
      payrollMonth: 8,
      payrollYear: 2026,
      paymentDate: '2026-08-28',
      basicSalary: 5000,
      allowanceGeneral: 0,
      allowanceTransport: 0,
      allowanceParking: 0,
      allowanceMeal: 0,
      allowanceAccommodation: 0,
      allowancePhone: 0,
      overtime: 0,
      bonusAmount: 0,
      commissionAmount: 0,
      backPayAmount: 0,
      awsAmount: 0,
      compensationAmount: 0,
      reimbursementAmount: 0,
      unpaidLeave: 0,
      deductionInLieu: 0,
      deductionCp38: 0,
      deductionOthers: 0,
      actualPCBDeducted: 0,
      epfEmployee: 0,
      epfEmployer: 0,
      socsoEmployee: 0,
      socsoEmployer: 0,
      eisEmployee: 0,
      eisEmployer: 0,
      netPay: 0,
      payoutKind: 'regular',
      isSeparatePayout: false
    },
    bonusRecord
  ]
});
const ytd = calculateYtd(ytdEmployee, 'August 2026');
assert.equal(ytd.months, 8);
assert.equal(ytd.bonus, 1000);

const regularRecord: PayrollRecord2026 = {
  id: 'regular-record-2026-08',
  employeeEmail: 'separate-payout@example.com',
  payrollMonth: 8,
  payrollYear: 2026,
  paymentDate: '2026-08-28',
  basicSalary: 5000,
  allowanceGeneral: 0,
  allowanceTransport: 0,
  allowanceParking: 0,
  allowanceMeal: 0,
  allowanceAccommodation: 0,
  allowancePhone: 0,
  overtime: 0,
  bonusAmount: 0,
  commissionAmount: 0,
  backPayAmount: 0,
  awsAmount: 0,
  compensationAmount: 0,
  reimbursementAmount: 0,
  unpaidLeave: 0,
  deductionInLieu: 0,
  deductionCp38: 0,
  deductionOthers: 0,
  actualPCBDeducted: 0,
  epfEmployee: 0,
  epfEmployer: 0,
  socsoEmployee: 0,
  socsoEmployer: 0,
  eisEmployee: 0,
  eisEmployer: 0,
  netPay: 0,
  createdAt: '2026-08-07T00:00:00.000Z',
  payoutKind: 'regular',
  isSeparatePayout: false
};

const mergedRecords = mergePayrollRecords2026([regularRecord, bonusRecord], {
  ...regularRecord,
  netPay: 4200
});
assert.equal(mergedRecords.length, 2);
assert.equal(mergedRecords.find(record => record.id === regularRecord.id)?.netPay, 4200);

const mergedWithSeparate = mergePayrollRecords2026([regularRecord], bonusRecord);
assert.equal(mergedWithSeparate.length, 2);
assert.ok(mergedWithSeparate.some(record => record.id === regularRecord.id));
assert.ok(mergedWithSeparate.some(record => record.id === bonusRecord.id));

console.log('Separate payroll payout tests passed.');
