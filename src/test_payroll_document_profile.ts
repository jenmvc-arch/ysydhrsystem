import { strict as assert } from 'node:assert';
import {
  calculatePayslip,
  getPayrollDocumentDisplaySettings,
  getPayrollDocumentFieldLabels,
  getPayrollDocumentProfile,
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

const createEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  ...createTestEmployee(),
  id: overrides.email || overrides.id || 'profile-test@example.com',
  email: overrides.email || 'profile-test@example.com',
  basicSalary: 5000,
  epfRateEmployee: 11,
  epfRateEmployer: 13,
  optInEpf: true,
  optInSocso: true,
  optInEis: true,
  optInPcb: true,
  ...overrides
});

const permanentProfile = getPayrollDocumentProfile(createEmployee({ employmentType: 'Permanent' }));
assert.equal(permanentProfile.documentType, 'Payslip');
assert.equal(permanentProfile.compensationLabel, 'Basic Salary');
assert.equal(permanentProfile.statutoryEnabled, true);

const contractWithStatutory = createEmployee({
  employmentType: 'Contract',
  contractStatutoryTreatment: 'with_statutory',
  eligibleForStatutory: 'Yes'
});
const contractWithProfile = getPayrollDocumentProfile(contractWithStatutory);
assert.equal(contractWithProfile.documentType, 'Payslip');
assert.equal(contractWithProfile.compensationLabel, 'Basic Salary');
assert.equal(contractWithProfile.statutoryEnabled, true);
assert.ok(calculatePayslip(contractWithStatutory, 8, 2026).epfEmployeeValue > 0);

const contractWithoutStatutory = createEmployee({
  employmentType: 'Contract',
  contractStatutoryTreatment: 'without_statutory',
  eligibleForStatutory: 'No'
});
const contractWithoutProfile = getPayrollDocumentProfile(contractWithoutStatutory);
assert.equal(contractWithoutProfile.documentType, 'Payment Voucher');
assert.equal(contractWithoutProfile.compensationLabel, 'Service Fees');
assert.equal(contractWithoutProfile.statutoryEnabled, false);
assert.equal(calculatePayslip(contractWithoutStatutory, 8, 2026).epfEmployeeValue, 0);

const legacyContractProfile = getPayrollDocumentProfile(createEmployee({
  employmentType: 'Fixed Term Contract',
  eligibleForStatutory: 'Yes'
}));
assert.equal(legacyContractProfile.documentType, 'Payslip');
assert.equal(legacyContractProfile.statutoryEnabled, true);

const partTime = createEmployee({ employmentType: 'Part Time', eligibleForStatutory: 'Yes' });
const partTimeProfile = getPayrollDocumentProfile(partTime);
const partTimeBreakdown = calculatePayslip(partTime, 8, 2026);
const partTimeFieldLabels = getPayrollDocumentFieldLabels(partTimeProfile);
assert.equal(partTimeProfile.documentType, 'Payment Voucher');
assert.equal(partTimeProfile.compensationLabel, 'Wages / Service Fees');
assert.equal(partTimeProfile.statutoryEnabled, false);
assert.equal(partTimeFieldLabels.designation, 'Service Role');
assert.equal(partTimeFieldLabels.dateJoined, 'Engagement Start Date');
assert.equal(partTimeFieldLabels.employmentStatus, 'Engagement Status');
assert.equal(partTimeBreakdown.epfEmployeeValue, 0);
assert.equal(partTimeBreakdown.socsoEmployeeVal, 0);
assert.equal(partTimeBreakdown.eisEmployeeVal, 0);
assert.equal(partTimeBreakdown.taxPcbVal, 0);

const contractor = createEmployee({ employmentType: 'Independent Contractor', eligibleForStatutory: 'Yes' });
const contractorProfile = getPayrollDocumentProfile(contractor);
const contractorBreakdown = calculatePayslip(contractor, 8, 2026);
assert.equal(contractorProfile.documentType, 'Payment Voucher');
assert.equal(contractorProfile.compensationLabel, 'Monthly Retainer');
assert.equal(contractorProfile.statutoryEnabled, false);
assert.equal(contractorBreakdown.epfEmployeeValue, 0);
assert.equal(contractorBreakdown.socsoEmployeeVal, 0);
assert.equal(contractorBreakdown.eisEmployeeVal, 0);
assert.equal(contractorBreakdown.taxPcbVal, 0);

const voucherDisplaySettings = getPayrollDocumentDisplaySettings(contractor);
assert.equal(voucherDisplaySettings.showEpfNumber, false);
assert.equal(voucherDisplaySettings.showEmployerContributions, false);

console.log('Payroll document profile tests passed.');
