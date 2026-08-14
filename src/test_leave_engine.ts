import assert from 'node:assert/strict';
import {
  REPLACEMENT_LEAVE_CODE,
  buildDefaultLeaveData,
  calculateLeaveBalances,
  calculateLeavePayrollDeductions,
  calculateOffInLieuEligibleDays,
  consumeReplacementLeaveCredits,
  findAssignmentConflicts,
  getDefaultOffInLieuExpiry,
  makeLeaveId,
  makeRuntimeLeaveId,
} from './lib/leaveEngine';
import { createTestEmployee } from './testFixtures';

const entityId = 'TEST-ENTITY';
const data = buildDefaultLeaveData(entityId);
const employee = createTestEmployee({
  id: 'employee-1',
  email: 'employee-1@example.com',
  entityId,
  basicSalary: 3100,
});

const annualType = data.leaveTypes.find((type) => type.name === 'Annual Leave');
const unpaidType = data.leaveTypes.find((type) => type.name === 'Unpaid Leave');
const replacementType = data.leaveTypes.find((type) => type.code === REPLACEMENT_LEAVE_CODE);
assert.ok(annualType);
assert.ok(unpaidType);
assert.ok(replacementType);

const defaultBalances = calculateLeaveBalances(employee.id, data, '2026-08-15');
const annualBalance = defaultBalances.find((balance) => balance.leaveType === 'Annual Leave');
assert.equal(annualBalance?.entitlementDays, 18);
assert.equal(annualBalance?.remainingDays, 18);

const expiredCarryoverData = {
  ...data,
  ledger: [{
    id: 'expired-carry',
    entityId,
    employeeId: employee.id,
    leaveTypeId: annualType.id,
    leaveType: annualType.name,
    source: 'carry_over' as const,
    effectiveDate: '2026-01-01',
    expiryDate: '2026-02-01',
    amountDays: 3,
    remainingDays: 3,
  }],
};
assert.equal(
  calculateLeaveBalances(employee.id, expiredCarryoverData, '2026-08-15').find((balance) => balance.leaveType === 'Annual Leave')?.remainingDays,
  18
);

const activeCarryoverData = {
  ...data,
  ledger: [{
    id: 'active-carry',
    entityId,
    employeeId: employee.id,
    leaveTypeId: annualType.id,
    leaveType: annualType.name,
    source: 'carry_over' as const,
    effectiveDate: '2026-01-01',
    expiryDate: '2026-12-31',
    amountDays: 3,
    remainingDays: 3,
  }],
};
assert.equal(
  calculateLeaveBalances(employee.id, activeCarryoverData, '2026-08-15').find((balance) => balance.leaveType === 'Annual Leave')?.remainingDays,
  21
);

const secondGroupId = makeLeaveId(entityId, 'group-test-duplicate');
const duplicateAssignmentData = {
  ...data,
  leaveGroups: [
    ...data.leaveGroups,
    {
      id: secondGroupId,
      entityId,
      name: 'Duplicate Annual Group',
      isDefault: false,
      isActive: true,
    },
  ],
  groupItems: [
    ...data.groupItems,
    {
      id: makeLeaveId(entityId, 'item-duplicate-annual'),
      entityId,
      groupId: secondGroupId,
      leaveTypeId: annualType.id,
      conditionPolicyId: data.conditionPolicies[0].id,
      carryoverSettingId: data.carryoverSettings[0].id,
    },
  ],
  assignments: [
    {
      id: 'assignment-1',
      entityId,
      employeeId: employee.id,
      groupId: data.leaveGroups[0].id,
      effectiveDate: '2026-01-01',
      isActive: true,
    },
    {
      id: 'assignment-2',
      entityId,
      employeeId: employee.id,
      groupId: secondGroupId,
      effectiveDate: '2026-01-01',
      isActive: true,
    },
  ],
};
const conflicts = findAssignmentConflicts(
  employee.id,
  duplicateAssignmentData.assignments,
  duplicateAssignmentData.leaveGroups,
  duplicateAssignmentData.groupItems,
  duplicateAssignmentData.leaveTypes
);
assert.equal(conflicts.length, 1);
assert.equal(conflicts[0].leaveType, 'Annual Leave');

assert.equal(calculateOffInLieuEligibleDays('18:00', '23:30'), 0.5);
assert.equal(calculateOffInLieuEligibleDays('08:00', '15:30'), 1);
assert.equal(getDefaultOffInLieuExpiry('2026-01-31'), '2026-02-28');

const replacementLedger = [
  {
    id: 'credit-later',
    entityId,
    employeeId: employee.id,
    leaveTypeId: replacementType.id,
    leaveType: replacementType.name,
    source: 'off_in_lieu' as const,
    effectiveDate: '2026-08-10',
    expiryDate: '2026-10-01',
    amountDays: 1,
    remainingDays: 1,
  },
  {
    id: 'credit-earlier',
    entityId,
    employeeId: employee.id,
    leaveTypeId: replacementType.id,
    leaveType: replacementType.name,
    source: 'off_in_lieu' as const,
    effectiveDate: '2026-08-01',
    expiryDate: '2026-09-01',
    amountDays: 1,
    remainingDays: 1,
  },
];
const consumedLedger = consumeReplacementLeaveCredits(employee.id, replacementType.id, 1.5, replacementLedger, '2026-08-15');
assert.equal(consumedLedger.find((entry) => entry.id === 'credit-earlier')?.remainingDays, 0);
assert.equal(consumedLedger.find((entry) => entry.id === 'credit-later')?.remainingDays, 0.5);

const unpaidPolicy = data.conditionPolicies.find((policy) => policy.name === 'Unpaid Leave Policy');
assert.ok(unpaidPolicy);
const deductions = calculateLeavePayrollDeductions({
  employee,
  request: {
    id: makeRuntimeLeaveId('leave-request'),
    entityId,
    employeeId: employee.id,
    employeeName: employee.name,
    leaveTypeId: unpaidType.id,
    leaveType: unpaidType.name,
    startDate: '2026-07-31',
    endDate: '2026-08-02',
    totalDays: 3,
    reason: 'Unpaid leave',
    status: 'Approved',
    appliedDate: '2026-07-01',
    source: 'admin',
  },
  policy: unpaidPolicy,
  availableBeforeApproval: 0,
});
assert.equal(deductions.length, 2);
assert.deepEqual(deductions.map((deduction) => [deduction.payrollMonth, deduction.deductionDays]), [[7, 1], [8, 2]]);
assert.equal(deductions.reduce((sum, deduction) => sum + deduction.deductionDays, 0), 3);
assert.equal(deductions[0].deductionAmount, 100);
assert.equal(deductions[1].deductionAmount, 200);

console.log('Leave engine tests passed.');
