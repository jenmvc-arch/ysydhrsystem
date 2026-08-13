import assert from 'node:assert/strict';
import {
  calculatePayslip,
  getEmployeeForMonth,
  getPayrollBasicSalary,
  getSalaryProration,
  getHrdCorpLevyRate,
  seedSocsoConfigurationsAndBrackets
} from './data';
import type { Employee } from './types';
import { createTestEmployee } from './testFixtures';

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear()
};
seedSocsoConfigurationsAndBrackets();

const createEmployee = (updates: Partial<Employee> = {}): Employee => ({
  ...createTestEmployee(),
  basicSalary: 3100,
  dateOfJoined: '2020-01-01',
  salaryAdjustments: [],
  effectiveDatedProfiles: [],
  historicalPayrollRecords: [],
  allowanceGeneral: 0,
  allowanceTransport: 0,
  allowanceParking: 0,
  allowanceMeal: 0,
  allowanceAccommodation: 0,
  allowancePhone: 0,
  housingAllowance: 0,
  transportAllowance: 0,
  overtime: 0,
  performanceBonus: 0,
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
  hrdCorp: 0,
  ...updates
});

const januaryJoin = getSalaryProration(
  createEmployee({ dateOfJoined: '2026-01-16' }),
  1,
  2026
);
assert.equal(januaryJoin.calendarDays, 31);
assert.equal(januaryJoin.eligibleDays, 16);
assert.equal(januaryJoin.payableSalary, 1600);
assert.equal(januaryJoin.prorationDeduction, 1500);

const firstDayJoin = getSalaryProration(
  createEmployee({ dateOfJoined: '2026-01-01' }),
  1,
  2026
);
assert.equal(firstDayJoin.payableSalary, 3100);
assert.equal(firstDayJoin.isProrated, false);

const leapFebruary = getSalaryProration(
  createEmployee({ basicSalary: 2900, dateOfJoined: '2024-02-15' }),
  2,
  2024
);
assert.equal(leapFebruary.calendarDays, 29);
assert.equal(leapFebruary.eligibleDays, 15);
assert.equal(leapFebruary.payableSalary, 1500);

const terminationMonth = getSalaryProration(
  createEmployee({
    basicSalary: 3000,
    effectiveDatedProfiles: [{
      effectiveDate: '2024-01-01',
      dateOfTermination: '2024-04-10'
    } as any]
  }),
  4,
  2024
);
assert.equal(terminationMonth.eligibleDays, 10);
assert.equal(terminationMonth.payableSalary, 1000);

const afterTermination = getSalaryProration(
  createEmployee({
    effectiveDatedProfiles: [{
      effectiveDate: '2024-01-01',
      dateOfTermination: '2024-04-10'
    } as any]
  }),
  5,
  2024
);
assert.equal(afterTermination.fullPeriodSalary, 0);
assert.equal(afterTermination.payableSalary, 0);

const midMonthAdjustment = getSalaryProration(
  createEmployee({
    salaryAdjustments: [{
      id: 'adjustment-1',
      startDate: '2026-01-16',
      effectiveDate: '2026-01-16',
      adjustedSalary: 6200,
      createdAt: '2026-01-01T00:00:00.000Z'
    }]
  }),
  1,
  2026
);
assert.equal(midMonthAdjustment.payableSalary, 4700);
assert.equal(midMonthAdjustment.fullPeriodSalary, 4700);

const savedPayrollEmployee = createEmployee({
  dateOfJoined: '2026-01-16',
  historicalPayrollRecords: [{
    payrollMonth: 1,
    payrollYear: 2026,
    basicSalary: 1600,
    actualPCBDeducted: 0
  }]
});
assert.equal(getEmployeeForMonth(savedPayrollEmployee, 1, 2026).basicSalary, 3100);
assert.equal(getPayrollBasicSalary(savedPayrollEmployee, 1, 2026), 1600);
assert.equal(calculatePayslip(savedPayrollEmployee, 1, 2026).grossEarnings, 1600);

const manualPayPeriodSalary = calculatePayslip(savedPayrollEmployee, 1, 2026, { basicSalaryOverride: 1850 });
assert.equal(manualPayPeriodSalary.grossEarnings, 1850);
assert.equal(savedPayrollEmployee.basicSalary, 3100);

const manualStatutory = calculatePayslip(createEmployee(), 1, 2026, {
  statutoryOverrides: {
    epfEmployee: 101,
    epfEmployer: 202,
    socsoEmployee: 3,
    socsoEmployer: 4,
    lindung24Employee: 5,
    eisEmployee: 6,
    eisEmployer: 7,
    taxPcb: 8,
    hrdCorp: 9
  }
});
assert.equal(manualStatutory.totalDeductions, 123);
assert.equal(manualStatutory.totalEmployerContributions, 222);
assert.equal(manualStatutory.netPay, 2977);

const hrdCorpEmployee = createEmployee({
  basicSalary: 3100,
  allowanceGeneral: 100,
  allowanceTransport: 100,
  unpaidLeave: 50
});
assert.equal(getHrdCorpLevyRate(4), 0);
assert.equal(getHrdCorpLevyRate(5), 0.005);
assert.equal(getHrdCorpLevyRate(10), 0.01);
assert.equal(calculatePayslip(hrdCorpEmployee, 8, 2026, {
  hrdCorpLocalWorkerCount: 4,
  ignoreSavedStatutory: true
}).hrdCorpVal, 0);
assert.equal(calculatePayslip(hrdCorpEmployee, 8, 2026, {
  hrdCorpLocalWorkerCount: 5,
  ignoreSavedStatutory: true
}).hrdCorpVal, 16.25);
assert.equal(calculatePayslip(hrdCorpEmployee, 8, 2026, {
  hrdCorpLocalWorkerCount: 10,
  ignoreSavedStatutory: true
}).hrdCorpVal, 32.5);
assert.equal(calculatePayslip({ ...hrdCorpEmployee, nationality: 'Singaporean' }, 8, 2026, {
  hrdCorpLocalWorkerCount: 10,
  ignoreSavedStatutory: true
}).hrdCorpVal, 0);
assert.equal(calculatePayslip(hrdCorpEmployee, 8, 2026, {
  hrdCorpLocalWorkerCount: 5,
  hrdCorpVoluntaryOptIn: false,
  ignoreSavedStatutory: true
}).hrdCorpVal, 0);

const persistedStatutoryEmployee = createEmployee({
  historicalPayrollRecords: [{
    payrollMonth: 8,
    payrollYear: 2026,
    basicSalary: 3100,
    actualPCBDeducted: 18,
    epfEmployee: 111,
    epfEmployer: 211,
    socsoEmployee: 13,
    socsoEmployer: 14,
    lindung24Employee: 15,
    eisEmployee: 16,
    eisEmployer: 17,
    hrdCorp: 19,
    bonusDesc: 'August delivery milestone',
    commissionDesc: 'Enterprise account commission',
    backPayDesc: 'July salary correction',
    awsDesc: 'Annual wage supplement',
    compensationDesc: 'Contract completion payment',
    reimbursementDesc: 'Approved medical claim',
    deductionOthersDesc: 'Staff loan repayment'
  }]
});
const persistedStatutory = calculatePayslip(persistedStatutoryEmployee, 8, 2026);
assert.equal(persistedStatutory.epfEmployeeValue, 111);
assert.equal(persistedStatutory.epfEmployerValue, 211);
assert.equal(persistedStatutory.socsoEmployeeVal, 13);
assert.equal(persistedStatutory.socsoEmployerVal, 14);
assert.equal(persistedStatutory.skbbkEmpVal, 15);
assert.equal(persistedStatutory.eisEmployeeVal, 16);
assert.equal(persistedStatutory.eisEmployerVal, 17);
assert.equal(persistedStatutory.taxPcbVal, 18);
assert.equal(persistedStatutory.hrdCorpVal, 0);
const persistedDescriptions = getEmployeeForMonth(persistedStatutoryEmployee, 8, 2026);
assert.equal(persistedDescriptions.bonusDesc, 'August delivery milestone');
assert.equal(persistedDescriptions.commissionDesc, 'Enterprise account commission');
assert.equal(persistedDescriptions.backPayDesc, 'July salary correction');
assert.equal(persistedDescriptions.awsDesc, 'Annual wage supplement');
assert.equal(persistedDescriptions.compensationDesc, 'Contract completion payment');
assert.equal(persistedDescriptions.reimbursementDesc, 'Approved medical claim');
assert.equal(persistedDescriptions.deductionOthersDesc, 'Staff loan repayment');

const recalculatedStatutory = calculatePayslip(persistedStatutoryEmployee, 8, 2026, { ignoreSavedStatutory: true });
assert.notEqual(recalculatedStatutory.epfEmployeeValue, 111);

console.log('Salary proration tests passed.');
