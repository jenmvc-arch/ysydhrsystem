/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Employee } from '../types';
import { getGmt8DateString, getGmt8Timestamp } from './dateUtils';
import { isSupabaseConfigured, supabase, supabaseClient } from './supabaseClient';

export type LeaveRequestStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type LeavePaidTreatment = 'paid' | 'unpaid';
export type LeaveDeductionBasis = 'calendar_day' | 'working_day' | 'fixed_daily_rate';
export type LeaveRoundingRule = 'none' | 'nearest_half_day' | 'half_day_up' | 'full_day_up';
export type LeaveProrationRule = 'none' | 'join_date' | 'confirmation_date' | 'calendar_year';
export type LeaveExcessHandling = 'block' | 'allow_unpaid' | 'allow_negative';
export type LeaveLedgerSource = 'entitlement' | 'carry_over' | 'off_in_lieu' | 'leave_taken' | 'expiry' | 'adjustment';
export type OffInLieuStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected';

export const REPLACEMENT_LEAVE_CODE = 'replacement_leave';
export const DEFAULT_LEAVE_GROUP_NAME = 'Default Leave Group';

export interface LeaveTypeRecord {
  id: string;
  entityId: string;
  code: string;
  name: string;
  description?: string;
  isPaid: boolean;
  isSystem: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveConditionPolicy {
  id: string;
  entityId: string;
  name: string;
  deductionBasis: LeaveDeductionBasis;
  roundingRule: LeaveRoundingRule;
  prorationRule: LeaveProrationRule;
  entitlementDays: number;
  paidTreatment: LeavePaidTreatment;
  excessLeaveHandling: LeaveExcessHandling;
  payrollDeductionEnabled: boolean;
  dailyRateDivisor?: number | null;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveCarryoverSetting {
  id: string;
  entityId: string;
  name: string;
  enabled: boolean;
  maxCarryForwardDays: number;
  expiryDate?: string;
  expiryAfterMonths?: number | null;
  ruleDescription?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveGroup {
  id: string;
  entityId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveGroupItem {
  id: string;
  entityId: string;
  groupId: string;
  leaveTypeId: string;
  conditionPolicyId: string;
  carryoverSettingId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeLeaveGroupAssignment {
  id: string;
  entityId: string;
  employeeId: string;
  groupId: string;
  effectiveDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveRequestRecord {
  id: string;
  entityId: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveRequestStatus;
  appliedDate: string;
  reviewedAt?: string;
  reviewedBy?: string;
  source: 'admin' | 'employee_portal';
  payrollDeductionAmount?: number;
  payrollSyncStatus?: 'not_required' | 'pending' | 'synced' | 'failed';
  createdAt?: string;
  updatedAt?: string;
}

export interface OffInLieuRequest {
  id: string;
  entityId: string;
  status: OffInLieuStatus;
  submissionMode: 'single' | 'bulk';
  submittedAt: string;
  submittedBy?: string;
  expiryDate: string;
  totalDays: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OffInLieuEntry {
  id: string;
  entityId: string;
  requestId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  otDate: string;
  startTime: string;
  endTime: string;
  hoursWorked: number;
  eligibleDays: number;
  expiryDate: string;
  status: OffInLieuStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveBalanceLedgerEntry {
  id: string;
  entityId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveType: string;
  source: LeaveLedgerSource;
  requestId?: string;
  effectiveDate: string;
  expiryDate?: string;
  amountDays: number;
  remainingDays: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeavePayrollDeduction {
  id: string;
  entityId: string;
  employeeId: string;
  employeeEmail: string;
  leaveRequestId: string;
  payrollMonth: number;
  payrollYear: number;
  deductionDays: number;
  deductionAmount: number;
  dailyRate: number;
  status: 'pending' | 'synced' | 'failed';
  syncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveDataState {
  leaveTypes: LeaveTypeRecord[];
  conditionPolicies: LeaveConditionPolicy[];
  carryoverSettings: LeaveCarryoverSetting[];
  leaveGroups: LeaveGroup[];
  groupItems: LeaveGroupItem[];
  assignments: EmployeeLeaveGroupAssignment[];
  requests: LeaveRequestRecord[];
  offInLieuRequests: OffInLieuRequest[];
  offInLieuEntries: OffInLieuEntry[];
  ledger: LeaveBalanceLedgerEntry[];
  payrollDeductions: LeavePayrollDeduction[];
}

export interface LeaveBalance {
  leaveTypeId: string;
  leaveType: string;
  policyId?: string;
  paidTreatment: LeavePaidTreatment;
  entitlementDays: number;
  carriedForwardDays: number;
  creditedDays: number;
  takenDays: number;
  pendingDays: number;
  remainingDays: number;
  expiryDate?: string;
}

export interface LeaveAssignmentConflict {
  leaveType: string;
  groupNames: string[];
}

export interface LeavePayrollDeductionInput {
  employee: Employee;
  request: LeaveRequestRecord;
  policy?: LeaveConditionPolicy;
  availableBeforeApproval: number;
}

const TABLES = {
  leaveTypes: 'leave_types',
  conditionPolicies: 'leave_condition_policies',
  carryoverSettings: 'leave_carryover_settings',
  leaveGroups: 'leave_groups',
  groupItems: 'leave_group_items',
  assignments: 'employee_leave_group_assignments',
  requests: 'leave_requests',
  offInLieuRequests: 'off_in_lieu_requests',
  offInLieuEntries: 'off_in_lieu_entries',
  ledger: 'leave_balance_ledger',
  payrollDeductions: 'leave_payroll_deductions',
} as const;

const emptyLeaveData = (): LeaveDataState => ({
  leaveTypes: [],
  conditionPolicies: [],
  carryoverSettings: [],
  leaveGroups: [],
  groupItems: [],
  assignments: [],
  requests: [],
  offInLieuRequests: [],
  offInLieuEntries: [],
  ledger: [],
  payrollDeductions: [],
});

const localKey = (entityId: string) => `leave_engine_${entityId || 'default'}`;

const hasLocalStorage = () => typeof localStorage !== 'undefined';

const readLocalLeaveData = (entityId: string): LeaveDataState | null => {
  if (!hasLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(localKey(entityId));
    if (!raw) return null;
    return JSON.parse(raw) as LeaveDataState;
  } catch (_error) {
    return null;
  }
};

const saveLocalLeaveData = (entityId: string, data: LeaveDataState) => {
  if (!hasLocalStorage()) return;
  localStorage.setItem(localKey(entityId), JSON.stringify(data));
};

const toSnakeCase = (obj: any): any => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result: any = {};
  Object.keys(obj).forEach((key) => {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = obj[key] === undefined ? null : obj[key];
  });
  return result;
};

const toCamelCase = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  const result: any = {};
  Object.keys(obj).forEach((key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  });
  return result;
};

const slug = (value: string) =>
  String(value || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'default';

export const makeLeaveId = (entityId: string, suffix: string) => `leave-${slug(entityId)}-${suffix}`;

export const makeRuntimeLeaveId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeLeaveCode = (name: string) => slug(name).replace(/-/g, '_');

export const DEFAULT_LEAVE_TYPE_NAMES = [
  'Annual Leave',
  'Sick Leave',
  'Hospitalisation Leave',
  'Maternity Leave',
  'Paternity Leave',
  'Compassionate Leave',
  'Unpaid Leave',
  'Replacement Leave',
];

export function buildDefaultLeaveData(entityId: string): LeaveDataState {
  const now = getGmt8Timestamp();
  const carryNoneId = makeLeaveId(entityId, 'carry-none');
  const carryAnnualId = makeLeaveId(entityId, 'carry-annual');
  const defaultGroupId = makeLeaveId(entityId, 'group-default');

  const leaveTypes: LeaveTypeRecord[] = DEFAULT_LEAVE_TYPE_NAMES.map((name) => {
    const code = name === 'Replacement Leave' ? REPLACEMENT_LEAVE_CODE : normalizeLeaveCode(name);
    return {
      id: makeLeaveId(entityId, `type-${code}`),
      entityId,
      code,
      name,
      description: name === 'Replacement Leave' ? 'System-managed Off in Lieu credit leave.' : '',
      isPaid: name !== 'Unpaid Leave',
      isSystem: name === 'Replacement Leave',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  });

  const policyDefaults: Array<{
    leaveName: string;
    days: number;
    paidTreatment: LeavePaidTreatment;
    excessLeaveHandling: LeaveExcessHandling;
    payrollDeductionEnabled: boolean;
  }> = [
    { leaveName: 'Annual Leave', days: 18, paidTreatment: 'paid', excessLeaveHandling: 'allow_unpaid', payrollDeductionEnabled: true },
    { leaveName: 'Sick Leave', days: 14, paidTreatment: 'paid', excessLeaveHandling: 'allow_unpaid', payrollDeductionEnabled: true },
    { leaveName: 'Hospitalisation Leave', days: 60, paidTreatment: 'paid', excessLeaveHandling: 'allow_unpaid', payrollDeductionEnabled: true },
    { leaveName: 'Maternity Leave', days: 98, paidTreatment: 'paid', excessLeaveHandling: 'block', payrollDeductionEnabled: false },
    { leaveName: 'Paternity Leave', days: 7, paidTreatment: 'paid', excessLeaveHandling: 'block', payrollDeductionEnabled: false },
    { leaveName: 'Compassionate Leave', days: 3, paidTreatment: 'paid', excessLeaveHandling: 'allow_unpaid', payrollDeductionEnabled: true },
    { leaveName: 'Unpaid Leave', days: 0, paidTreatment: 'unpaid', excessLeaveHandling: 'allow_unpaid', payrollDeductionEnabled: true },
    { leaveName: 'Replacement Leave', days: 0, paidTreatment: 'paid', excessLeaveHandling: 'block', payrollDeductionEnabled: false },
  ];

  const conditionPolicies: LeaveConditionPolicy[] = policyDefaults.map((policy) => {
    const code = policy.leaveName === 'Replacement Leave' ? REPLACEMENT_LEAVE_CODE : normalizeLeaveCode(policy.leaveName);
    return {
      id: makeLeaveId(entityId, `policy-${code}`),
      entityId,
      name: `${policy.leaveName} Policy`,
      deductionBasis: 'calendar_day',
      roundingRule: 'nearest_half_day',
      prorationRule: policy.leaveName === 'Annual Leave' ? 'join_date' : 'none',
      entitlementDays: policy.days,
      paidTreatment: policy.paidTreatment,
      excessLeaveHandling: policy.excessLeaveHandling,
      payrollDeductionEnabled: policy.payrollDeductionEnabled,
      dailyRateDivisor: null,
      description: policy.paidTreatment === 'unpaid'
        ? 'Deduct full approved unpaid leave from payroll.'
        : 'Paid entitlement; excess can follow the configured excess rule.',
      createdAt: now,
      updatedAt: now,
    };
  });

  const carryoverSettings: LeaveCarryoverSetting[] = [
    {
      id: carryNoneId,
      entityId,
      name: 'No Carry Forward',
      enabled: false,
      maxCarryForwardDays: 0,
      expiryAfterMonths: null,
      ruleDescription: 'Unused balance expires at year end.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: carryAnnualId,
      entityId,
      name: 'Annual Carry Forward',
      enabled: true,
      maxCarryForwardDays: 5,
      expiryAfterMonths: 3,
      ruleDescription: 'Carry forward up to 5 days, expiring after 3 months.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const leaveGroups: LeaveGroup[] = [{
    id: defaultGroupId,
    entityId,
    name: DEFAULT_LEAVE_GROUP_NAME,
    description: 'Default leave group assigned to active employees.',
    isDefault: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }];

  const groupItems: LeaveGroupItem[] = leaveTypes.map((leaveType) => {
    const policy = conditionPolicies.find((item) => item.name.startsWith(leaveType.name)) || conditionPolicies[0];
    return {
      id: makeLeaveId(entityId, `item-default-${leaveType.code}`),
      entityId,
      groupId: defaultGroupId,
      leaveTypeId: leaveType.id,
      conditionPolicyId: policy.id,
      carryoverSettingId: leaveType.name === 'Annual Leave' ? carryAnnualId : carryNoneId,
      createdAt: now,
      updatedAt: now,
    };
  });

  return {
    ...emptyLeaveData(),
    leaveTypes,
    conditionPolicies,
    carryoverSettings,
    leaveGroups,
    groupItems,
  };
}

export function mergeWithDefaultLeaveData(entityId: string, data: LeaveDataState): LeaveDataState {
  const defaults = buildDefaultLeaveData(entityId);
  const mergeById = <T extends { id: string }>(base: T[], incoming: T[]) => {
    const map = new Map<string, T>();
    base.forEach((item) => map.set(item.id, item));
    incoming.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  };
  return {
    leaveTypes: mergeById(defaults.leaveTypes, data.leaveTypes || []),
    conditionPolicies: mergeById(defaults.conditionPolicies, data.conditionPolicies || []),
    carryoverSettings: mergeById(defaults.carryoverSettings, data.carryoverSettings || []),
    leaveGroups: mergeById(defaults.leaveGroups, data.leaveGroups || []),
    groupItems: mergeById(defaults.groupItems, data.groupItems || []),
    assignments: data.assignments || [],
    requests: data.requests || [],
    offInLieuRequests: data.offInLieuRequests || [],
    offInLieuEntries: data.offInLieuEntries || [],
    ledger: data.ledger || [],
    payrollDeductions: data.payrollDeductions || [],
  };
}

export function calculateInclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function addMonthsToDate(dateString: string, months: number): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() < day) date.setDate(0);
  return date.toISOString().slice(0, 10);
}

export function getDefaultOffInLieuExpiry(submittedDate: string = getGmt8DateString()): string {
  return addMonthsToDate(submittedDate, 1);
}

export function calculateHoursWorked(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) return 0;
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  return Number(((end - start) / 60).toFixed(2));
}

export function calculateOffInLieuEligibleDays(startTime: string, endTime: string): number {
  const hours = calculateHoursWorked(startTime, endTime);
  if (hours <= 0) return 0;
  return hours <= 6 ? 0.5 : 1;
}

export function roundLeaveDays(days: number, rule: LeaveRoundingRule): number {
  if (days <= 0) return 0;
  switch (rule) {
    case 'nearest_half_day':
      return Math.round(days * 2) / 2;
    case 'half_day_up':
      return Math.ceil(days * 2) / 2;
    case 'full_day_up':
      return Math.ceil(days);
    case 'none':
    default:
      return Number(days.toFixed(2));
  }
}

export function calculatePolicyDeductionDays(days: number, policy?: LeaveConditionPolicy): number {
  return roundLeaveDays(days, policy?.roundingRule || 'nearest_half_day');
}

export function getActiveAssignmentsForEmployee(
  employeeId: string,
  assignments: EmployeeLeaveGroupAssignment[],
  asOfDate: string = getGmt8DateString()
) {
  return assignments.filter((assignment) => (
    assignment.employeeId === employeeId &&
    assignment.isActive &&
    (!assignment.effectiveDate || assignment.effectiveDate <= asOfDate) &&
    (!assignment.endDate || assignment.endDate >= asOfDate)
  ));
}

export function getEmployeeLeaveGroupItems(employeeId: string, data: LeaveDataState, asOfDate = getGmt8DateString()) {
  const activeAssignments = getActiveAssignmentsForEmployee(employeeId, data.assignments, asOfDate);
  const activeGroupIds = new Set(activeAssignments.map((assignment) => assignment.groupId));
  const defaultGroupIds = data.leaveGroups
    .filter((group) => group.isDefault && group.isActive)
    .map((group) => group.id);

  if (activeGroupIds.size === 0) {
    defaultGroupIds.forEach((groupId) => activeGroupIds.add(groupId));
  }

  return data.groupItems.filter((item) => activeGroupIds.has(item.groupId));
}

export function findAssignmentConflicts(
  employeeId: string,
  assignments: EmployeeLeaveGroupAssignment[],
  groups: LeaveGroup[],
  groupItems: LeaveGroupItem[],
  leaveTypes: LeaveTypeRecord[]
): LeaveAssignmentConflict[] {
  const activeGroupIds = getActiveAssignmentsForEmployee(employeeId, assignments).map((assignment) => assignment.groupId);
  const leaveTypeToGroups = new Map<string, string[]>();
  groupItems
    .filter((item) => activeGroupIds.includes(item.groupId))
    .forEach((item) => {
      const leaveType = leaveTypes.find((type) => type.id === item.leaveTypeId);
      const group = groups.find((candidate) => candidate.id === item.groupId);
      if (!leaveType || !group) return;
      const current = leaveTypeToGroups.get(leaveType.id) || [];
      current.push(group.name);
      leaveTypeToGroups.set(leaveType.id, current);
    });

  return Array.from(leaveTypeToGroups.entries())
    .filter(([, groupNames]) => groupNames.length > 1)
    .map(([leaveTypeId, groupNames]) => ({
      leaveType: leaveTypes.find((type) => type.id === leaveTypeId)?.name || leaveTypeId,
      groupNames,
    }));
}

export function calculateLeaveBalances(
  employeeId: string,
  data: LeaveDataState,
  asOfDate: string = getGmt8DateString()
): LeaveBalance[] {
  const items = getEmployeeLeaveGroupItems(employeeId, data, asOfDate);
  const usedLeaveTypeIds = new Set<string>();
  const balances: LeaveBalance[] = [];

  items.forEach((item) => {
    if (usedLeaveTypeIds.has(item.leaveTypeId)) return;
    usedLeaveTypeIds.add(item.leaveTypeId);

    const leaveType = data.leaveTypes.find((type) => type.id === item.leaveTypeId);
    const policy = data.conditionPolicies.find((candidate) => candidate.id === item.conditionPolicyId);
    const carryover = data.carryoverSettings.find((candidate) => candidate.id === item.carryoverSettingId);
    if (!leaveType || !policy) return;

    const approved = data.requests
      .filter((request) => (
        request.employeeId === employeeId &&
        request.leaveTypeId === leaveType.id &&
        request.status === 'Approved'
      ))
      .reduce((sum, request) => sum + request.totalDays, 0);

    const pending = data.requests
      .filter((request) => (
        request.employeeId === employeeId &&
        request.leaveTypeId === leaveType.id &&
        request.status === 'Pending'
      ))
      .reduce((sum, request) => sum + request.totalDays, 0);

    const credits = data.ledger
      .filter((entry) => (
        entry.employeeId === employeeId &&
        entry.leaveTypeId === leaveType.id &&
        entry.amountDays > 0 &&
        (!entry.expiryDate || entry.expiryDate >= asOfDate)
      ));

    const carriedForwardDays = credits
      .filter((entry) => entry.source === 'carry_over')
      .reduce((sum, entry) => sum + entry.remainingDays, 0);
    const creditedDays = credits
      .filter((entry) => entry.source === 'off_in_lieu' || entry.source === 'adjustment')
      .reduce((sum, entry) => sum + entry.remainingDays, 0);
    const entitlementDays = policy.entitlementDays;
    const available = entitlementDays + carriedForwardDays + creditedDays;

    balances.push({
      leaveTypeId: leaveType.id,
      leaveType: leaveType.name,
      policyId: policy.id,
      paidTreatment: policy.paidTreatment,
      entitlementDays,
      carriedForwardDays,
      creditedDays,
      takenDays: approved,
      pendingDays: pending,
      remainingDays: Math.max(0, Number((available - approved).toFixed(2))),
      expiryDate: carryover?.expiryDate || (carryover?.expiryAfterMonths ? addMonthsToDate(`${new Date().getFullYear()}-01-01`, carryover.expiryAfterMonths) : undefined),
    });
  });

  const replacementType = data.leaveTypes.find((type) => type.code === REPLACEMENT_LEAVE_CODE);
  if (replacementType && !balances.some((balance) => balance.leaveTypeId === replacementType.id)) {
    const replacementCredits = data.ledger
      .filter((entry) => (
        entry.employeeId === employeeId &&
        entry.leaveTypeId === replacementType.id &&
        entry.source === 'off_in_lieu' &&
        (!entry.expiryDate || entry.expiryDate >= asOfDate)
      ))
      .reduce((sum, entry) => sum + entry.remainingDays, 0);
    if (replacementCredits > 0) {
      const approved = data.requests
        .filter((request) => request.employeeId === employeeId && request.leaveTypeId === replacementType.id && request.status === 'Approved')
        .reduce((sum, request) => sum + request.totalDays, 0);
      const pending = data.requests
        .filter((request) => request.employeeId === employeeId && request.leaveTypeId === replacementType.id && request.status === 'Pending')
        .reduce((sum, request) => sum + request.totalDays, 0);
      balances.push({
        leaveTypeId: replacementType.id,
        leaveType: replacementType.name,
        paidTreatment: 'paid',
        entitlementDays: 0,
        carriedForwardDays: 0,
        creditedDays: replacementCredits,
        takenDays: approved,
        pendingDays: pending,
        remainingDays: Math.max(0, Number((replacementCredits - approved).toFixed(2))),
      });
    }
  }

  return balances.sort((left, right) => left.leaveType.localeCompare(right.leaveType));
}

function splitDaysByMonth(startDate: string, endDate: string): Array<{ payrollMonth: number; payrollYear: number; days: number }> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const map = new Map<string, { payrollMonth: number; payrollYear: number; days: number }>();
  const current = new Date(start);
  while (current <= end) {
    const payrollYear = current.getFullYear();
    const payrollMonth = current.getMonth() + 1;
    const key = `${payrollYear}-${payrollMonth}`;
    const existing = map.get(key) || { payrollMonth, payrollYear, days: 0 };
    existing.days += 1;
    map.set(key, existing);
    current.setDate(current.getDate() + 1);
  }
  return Array.from(map.values());
}

export function calculateLeavePayrollDeductions({
  employee,
  request,
  policy,
  availableBeforeApproval,
}: LeavePayrollDeductionInput): LeavePayrollDeduction[] {
  if (!policy?.payrollDeductionEnabled) return [];
  const totalDeductibleDays = policy.paidTreatment === 'unpaid'
    ? request.totalDays
    : policy.excessLeaveHandling === 'allow_unpaid'
      ? Math.max(0, request.totalDays - availableBeforeApproval)
      : 0;

  if (totalDeductibleDays <= 0) return [];

  let remainingDeductibleDays = totalDeductibleDays;
  return splitDaysByMonth(request.startDate, request.endDate).map((monthPart) => {
    const daysInMonth = new Date(monthPart.payrollYear, monthPart.payrollMonth, 0).getDate();
    const dailyRate = Number((employee.basicSalary / (policy.dailyRateDivisor || daysInMonth)).toFixed(2));
    const deductionDays = Math.min(monthPart.days, remainingDeductibleDays);
    remainingDeductibleDays = Math.max(0, remainingDeductibleDays - deductionDays);
    return {
      id: makeRuntimeLeaveId('leave-payroll-deduction'),
      entityId: request.entityId,
      employeeId: employee.id,
      employeeEmail: employee.email,
      leaveRequestId: request.id,
      payrollMonth: monthPart.payrollMonth,
      payrollYear: monthPart.payrollYear,
      deductionDays,
      deductionAmount: Number((deductionDays * dailyRate).toFixed(2)),
      dailyRate,
      status: 'pending' as const,
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
  }).filter((deduction) => deduction.deductionDays > 0);
}

export function consumeReplacementLeaveCredits(
  employeeId: string,
  leaveTypeId: string,
  daysToConsume: number,
  ledger: LeaveBalanceLedgerEntry[],
  asOfDate: string = getGmt8DateString()
): LeaveBalanceLedgerEntry[] {
  let remaining = daysToConsume;
  const consumedById = new Map<string, LeaveBalanceLedgerEntry>();

  ledger
    .filter((entry) => entry.employeeId === employeeId && entry.leaveTypeId === leaveTypeId && entry.source === 'off_in_lieu')
    .sort((left, right) => (left.expiryDate || '9999-12-31').localeCompare(right.expiryDate || '9999-12-31'))
    .forEach((entry) => {
      if (remaining <= 0 || (entry.expiryDate && entry.expiryDate < asOfDate)) return entry;
      const consumed = Math.min(entry.remainingDays, remaining);
      remaining = Number((remaining - consumed).toFixed(2));
      consumedById.set(entry.id, {
        ...entry,
        remainingDays: Number((entry.remainingDays - consumed).toFixed(2)),
        updatedAt: getGmt8Timestamp(),
      });
    });

  return ledger.map((entry) => consumedById.get(entry.id) || entry);
}

async function selectByEntity<T>(table: string, entityId: string): Promise<T[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select('*').eq('entity_id', entityId);
  if (error) throw error;
  return (data || []).map(toCamelCase) as T[];
}

async function upsertMany(table: string, records: any[], ignoreDuplicates = false) {
  if (!isSupabaseConfigured || !supabase || records.length === 0) return;
  const { error } = await supabase.from(table).upsert(records.map(toSnakeCase), { ignoreDuplicates });
  if (error) throw error;
}

async function ensureDefaultSeed(entityId: string, data: LeaveDataState): Promise<LeaveDataState> {
  const merged = mergeWithDefaultLeaveData(entityId, data);
  if (isSupabaseConfigured && supabase) {
    const defaults = buildDefaultLeaveData(entityId);
    await Promise.all([
      upsertMany(TABLES.leaveTypes, defaults.leaveTypes, true),
      upsertMany(TABLES.conditionPolicies, defaults.conditionPolicies, true),
      upsertMany(TABLES.carryoverSettings, defaults.carryoverSettings, true),
      upsertMany(TABLES.leaveGroups, defaults.leaveGroups, true),
      upsertMany(TABLES.groupItems, defaults.groupItems, true),
    ]);
  }
  saveLocalLeaveData(entityId, merged);
  return merged;
}

export const leaveService = {
  async load(entityId: string): Promise<LeaveDataState> {
    const fallback = mergeWithDefaultLeaveData(entityId, readLocalLeaveData(entityId) || emptyLeaveData());
    if (!isSupabaseConfigured || !supabase) {
      saveLocalLeaveData(entityId, fallback);
      return fallback;
    }

    try {
      const [
        leaveTypes,
        conditionPolicies,
        carryoverSettings,
        leaveGroups,
        groupItems,
        assignments,
        requests,
        offInLieuRequests,
        offInLieuEntries,
        ledger,
        payrollDeductions,
      ] = await Promise.all([
        selectByEntity<LeaveTypeRecord>(TABLES.leaveTypes, entityId),
        selectByEntity<LeaveConditionPolicy>(TABLES.conditionPolicies, entityId),
        selectByEntity<LeaveCarryoverSetting>(TABLES.carryoverSettings, entityId),
        selectByEntity<LeaveGroup>(TABLES.leaveGroups, entityId),
        selectByEntity<LeaveGroupItem>(TABLES.groupItems, entityId),
        selectByEntity<EmployeeLeaveGroupAssignment>(TABLES.assignments, entityId),
        selectByEntity<LeaveRequestRecord>(TABLES.requests, entityId),
        selectByEntity<OffInLieuRequest>(TABLES.offInLieuRequests, entityId),
        selectByEntity<OffInLieuEntry>(TABLES.offInLieuEntries, entityId),
        selectByEntity<LeaveBalanceLedgerEntry>(TABLES.ledger, entityId),
        selectByEntity<LeavePayrollDeduction>(TABLES.payrollDeductions, entityId),
      ]);
      return ensureDefaultSeed(entityId, {
        leaveTypes,
        conditionPolicies,
        carryoverSettings,
        leaveGroups,
        groupItems,
        assignments,
        requests,
        offInLieuRequests,
        offInLieuEntries,
        ledger,
        payrollDeductions,
      });
    } catch (error) {
      console.warn('[Leave Service] Falling back to local leave data:', error);
      saveLocalLeaveData(entityId, fallback);
      return fallback;
    }
  },

  async saveState(entityId: string, data: LeaveDataState): Promise<void> {
    saveLocalLeaveData(entityId, data);
  },

  async upsert<T extends { id: string }>(entityId: string, tableKey: keyof typeof TABLES, record: T): Promise<T> {
    if (!isSupabaseConfigured) {
      const current = mergeWithDefaultLeaveData(entityId, readLocalLeaveData(entityId) || emptyLeaveData());
      const collection = (current as any)[tableKey] as T[];
      (current as any)[tableKey] = [record, ...collection.filter((item) => item.id !== record.id)];
      saveLocalLeaveData(entityId, current);
      return record;
    }
    return supabaseClient.upsert(TABLES[tableKey], record) as Promise<T>;
  },

  async delete(entityId: string, tableKey: keyof typeof TABLES, id: string): Promise<void> {
    if (!isSupabaseConfigured) {
      const current = mergeWithDefaultLeaveData(entityId, readLocalLeaveData(entityId) || emptyLeaveData());
      const collection = (current as any)[tableKey] as Array<{ id: string }>;
      (current as any)[tableKey] = collection.filter((item) => item.id !== id);
      saveLocalLeaveData(entityId, current);
      return;
    }
    await supabaseClient.delete(TABLES[tableKey], id);
  },
};
