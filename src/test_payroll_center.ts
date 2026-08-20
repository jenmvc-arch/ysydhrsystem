import { strict as assert } from 'node:assert';
import { calculatePayslip, seedSocsoConfigurationsAndBrackets } from './data';
import type { Employee, PayrollRecord2026 } from './types';
import {
  buildPayrollExportRows,
  DEFAULT_PAYROLL_EXPORT_COLUMNS,
  getPayrollExportColumns,
  isPayrollRecordInScope
} from './lib/payrollExport';
import { canExportSensitivePayroll } from './lib/exportPermissions';
import { createTestEmployee } from './testFixtures';

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear()
};
seedSocsoConfigurationsAndBrackets();

const employee: Employee = {
  ...createTestEmployee(),
  id: 'payroll-center@example.com',
  email: 'payroll-center@example.com',
  entityId: 'entity-a',
  employmentType: 'Contract',
  eligibleForStatutory: 'No',
  contractStatutoryTreatment: 'without_statutory',
  basicSalary: 1000,
  allowanceGeneral: 100,
  allowanceTransport: 0,
  allowanceParking: 0,
  allowanceMeal: 0,
  allowanceAccommodation: 0,
  allowancePhone: 0,
  commissionAmount: 200,
  unpaidLeave: 50,
  incompleteMonthDeduction: 75,
  deductionOthers: 25,
  reimbursementAmount: 0
};

const breakdown = calculatePayslip(employee, 8, 2026, { ignoreSavedStatutory: true });
assert.equal(breakdown.grossEarnings, 1300);
assert.equal(breakdown.grossPay, 1175);
assert.equal(breakdown.totalDeductions, 25);
assert.equal(breakdown.netPay, 1150);

const record: PayrollRecord2026 = {
  id: 'payroll-center-record',
  employeeEmail: employee.email,
  payrollMonth: 8,
  payrollYear: 2026,
  basicSalary: 1000,
  allowanceGeneral: 100,
  allowanceTransport: 0,
  allowanceParking: 0,
  allowanceMeal: 0,
  allowanceAccommodation: 0,
  allowancePhone: 0,
  overtime: 0,
  bonusAmount: 0,
  commissionAmount: 200,
  backPayAmount: 0,
  awsAmount: 0,
  compensationAmount: 0,
  reimbursementAmount: 0,
  unpaidLeave: 50,
  incompleteMonthDeduction: 75,
  deductionInLieu: 0,
  deductionCp38: 0,
  deductionOthers: 25,
  actualPCBDeducted: 0,
  epfEmployee: 0,
  epfEmployer: 0,
  socsoEmployee: 0,
  socsoEmployer: 0,
  eisEmployee: 0,
  eisEmployer: 0,
  grossPay: 1175,
  netPay: 1150,
  status: 'Processed',
  calculationVersion: 'gross_pay_v2',
  createdAt: '2026-08-20T00:00:00.000Z'
};

assert.equal(isPayrollRecordInScope(record, [employee], {
  entityId: employee.entityId,
  department: employee.department,
  payrollMonth: 8,
  payrollYear: 2026
}), true);
assert.equal(isPayrollRecordInScope({ ...record, status: 'Draft' }, [employee], {
  entityId: employee.entityId,
  department: employee.department,
  payrollMonth: 8,
  payrollYear: 2026
}), false);

const exportColumns = getPayrollExportColumns([
  ...DEFAULT_PAYROLL_EXPORT_COLUMNS,
  'grossPay',
  'netPay'
]);
const rows = buildPayrollExportRows([record], [employee], exportColumns);
assert.equal(rows.length, 1);
assert.equal(rows[0].grossPay, '1175.00');
assert.equal(rows[0].netPay, '1150.00');
assert.equal(canExportSensitivePayroll('Global Administrator'), true);
assert.equal(canExportSensitivePayroll('Leader'), false);

console.log('Payroll Center tests passed.');
