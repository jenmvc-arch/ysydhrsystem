/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  Database,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { Employee } from '../types';
import EmployeeAvatar from './EmployeeAvatar';
import LeaveCalendar from './LeaveCalendar';
import { formatToDDMMMYYYY, getGmt8DateString, getGmt8Timestamp } from '../lib/dateUtils';
import {
  DEFAULT_LEAVE_GROUP_NAME,
  LeaveBalanceLedgerEntry,
  LeaveCarryoverSetting,
  LeaveConditionPolicy,
  LeaveDataState,
  LeaveGroup,
  LeaveGroupItem,
  LeavePayrollDeduction,
  LeaveRequestRecord,
  LeaveTypeRecord,
  OffInLieuStatus,
  OffInLieuEntry,
  OffInLieuRequest,
  REPLACEMENT_LEAVE_CODE,
  calculateHoursWorked,
  calculateInclusiveDays,
  calculateLeaveBalances,
  calculateLeavePayrollDeductions,
  calculateOffInLieuEligibleDays,
  calculatePolicyDeductionDays,
  consumeReplacementLeaveCredits,
  findAssignmentConflicts,
  getDefaultOffInLieuExpiry,
  getEmployeeLeaveGroupItems,
  leaveService,
  makeRuntimeLeaveId,
  mergeWithDefaultLeaveData,
  normalizeLeaveCode,
} from '../lib/leaveEngine';
import { useFeedback } from '../context/FeedbackContext';

export type LeaveRequest = LeaveRequestRecord;

export interface LeaveConfig {
  id: string;
  leaveType: string;
  daysEntitled: number;
  leaveGroup: string;
  condition: string;
}

export const DEFAULT_LEAVE_CONFIGS: LeaveConfig[] = mergeWithDefaultLeaveData('default', {
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
}).groupItems.map((item) => {
  const defaults = mergeWithDefaultLeaveData('default', {
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
  const leaveType = defaults.leaveTypes.find((type) => type.id === item.leaveTypeId);
  const policy = defaults.conditionPolicies.find((candidate) => candidate.id === item.conditionPolicyId);
  return {
    id: item.id,
    leaveType: leaveType?.name || 'Leave',
    daysEntitled: policy?.entitlementDays || 0,
    leaveGroup: DEFAULT_LEAVE_GROUP_NAME,
    condition: policy?.description || '',
  };
});

type LeaveTab = 'requests' | 'oil' | 'groups' | 'assignments' | 'types' | 'policies' | 'carryover' | 'calendar';

interface LeaveManagementViewProps {
  employees: Employee[];
  onShowNotification: (title: string, message: string) => void;
  activeEntityId: string;
  onSyncLeavePayrollDeduction?: (deduction: LeavePayrollDeduction) => Promise<void>;
}

interface OffInLieuEmployeeDraft {
  id: string;
  employeeId: string;
  rows: Array<{
    id: string;
    otDate: string;
    startTime: string;
    endTime: string;
  }>;
}

const blankLeaveData = (entityId: string): LeaveDataState => mergeWithDefaultLeaveData(entityId, {
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

const inputClass = 'w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-xs outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40';
const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant mb-1.5';
const panelClass = 'rounded-2xl border border-neutral-border bg-white shadow-sm';

const numberValue = (value: number | undefined | null, fallback = 0) => Number(value || fallback);

const getEmployeeLabel = (employee?: Employee) => employee ? `${employee.name} (${employee.department || 'No department'})` : 'Select employee';

export default function LeaveManagementView({
  employees,
  onShowNotification,
  activeEntityId,
  onSyncLeavePayrollDeduction,
}: LeaveManagementViewProps) {
  const { confirmAction } = useFeedback();
  const [activeTab, setActiveTab] = useState<LeaveTab>('requests');
  const [data, setData] = useState<LeaveDataState>(() => blankLeaveData(activeEntityId));
  const [isLoading, setIsLoading] = useState(false);
  const [syncWarningShown, setSyncWarningShown] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id || '');

  const [requestEmployeeId, setRequestEmployeeId] = useState(employees[0]?.id || '');
  const [requestLeaveTypeId, setRequestLeaveTypeId] = useState('');
  const [requestStartDate, setRequestStartDate] = useState(getGmt8DateString());
  const [requestEndDate, setRequestEndDate] = useState(getGmt8DateString());
  const [requestReason, setRequestReason] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Draft'>('All');

  const [leaveTypeDraft, setLeaveTypeDraft] = useState({ name: '', description: '', isPaid: true });
  const [policyDraft, setPolicyDraft] = useState({
    name: '',
    entitlementDays: 14,
    paidTreatment: 'paid' as const,
    deductionBasis: 'calendar_day' as const,
    roundingRule: 'nearest_half_day' as const,
    prorationRule: 'none' as const,
    excessLeaveHandling: 'allow_unpaid' as const,
    payrollDeductionEnabled: true,
    dailyRateDivisor: '',
    description: '',
  });
  const [carryDraft, setCarryDraft] = useState({
    name: '',
    enabled: false,
    maxCarryForwardDays: 0,
    expiryDate: '',
    expiryAfterMonths: 3,
    ruleDescription: '',
  });
  const [groupDraft, setGroupDraft] = useState({ name: '', description: '' });
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupItemDraft, setGroupItemDraft] = useState({ leaveTypeId: '', conditionPolicyId: '', carryoverSettingId: '' });
  const [assignmentDraft, setAssignmentDraft] = useState({ employeeId: employees[0]?.id || '', groupId: '', effectiveDate: getGmt8DateString() });

  const [oilSubmissionMode, setOilSubmissionMode] = useState<'single' | 'bulk'>('single');
  const [oilExpiryDate, setOilExpiryDate] = useState(getDefaultOffInLieuExpiry());
  const [oilNotes, setOilNotes] = useState('');
  const [oilEmployees, setOilEmployees] = useState<OffInLieuEmployeeDraft[]>(() => [{
    id: makeRuntimeLeaveId('oil-employee'),
    employeeId: employees[0]?.id || '',
    rows: [{ id: makeRuntimeLeaveId('oil-row'), otDate: getGmt8DateString(), startTime: '18:00', endTime: '22:00' }],
  }]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const loaded = await leaveService.load(activeEntityId);
        if (!cancelled) setData(loaded);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [activeEntityId]);

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]) setSelectedEmployeeId(employees[0].id);
    if (!requestEmployeeId && employees[0]) setRequestEmployeeId(employees[0].id);
    if (!assignmentDraft.employeeId && employees[0]) {
      setAssignmentDraft((previous) => ({ ...previous, employeeId: employees[0].id }));
    }
  }, [assignmentDraft.employeeId, employees, requestEmployeeId, selectedEmployeeId]);

  useEffect(() => {
    const firstGroupId = data.leaveGroups[0]?.id || '';
    if (!selectedGroupId && firstGroupId) setSelectedGroupId(firstGroupId);
    if (!assignmentDraft.groupId && firstGroupId) {
      setAssignmentDraft((previous) => ({ ...previous, groupId: firstGroupId }));
    }
  }, [assignmentDraft.groupId, data.leaveGroups, selectedGroupId]);

  useEffect(() => {
    const firstTypeId = data.leaveTypes.find((type) => type.isActive)?.id || '';
    if (!requestLeaveTypeId && firstTypeId) setRequestLeaveTypeId(firstTypeId);
    if (!groupItemDraft.leaveTypeId && firstTypeId) {
      setGroupItemDraft((previous) => ({ ...previous, leaveTypeId: firstTypeId }));
    }
    const firstPolicyId = data.conditionPolicies[0]?.id || '';
    const firstCarryId = data.carryoverSettings[0]?.id || '';
    setGroupItemDraft((previous) => ({
      ...previous,
      conditionPolicyId: previous.conditionPolicyId || firstPolicyId,
      carryoverSettingId: previous.carryoverSettingId || firstCarryId,
    }));
  }, [data.carryoverSettings, data.conditionPolicies, data.leaveTypes, groupItemDraft.leaveTypeId, requestLeaveTypeId]);

  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const leaveTypesById = useMemo(() => new Map(data.leaveTypes.map((type) => [type.id, type])), [data.leaveTypes]);
  const policiesById = useMemo(() => new Map(data.conditionPolicies.map((policy) => [policy.id, policy])), [data.conditionPolicies]);
  const carryoverById = useMemo(() => new Map(data.carryoverSettings.map((setting) => [setting.id, setting])), [data.carryoverSettings]);
  const groupsById = useMemo(() => new Map(data.leaveGroups.map((group) => [group.id, group])), [data.leaveGroups]);

  const activeEmployee = employeesById.get(selectedEmployeeId) || employees[0];
  const requestEmployee = employeesById.get(requestEmployeeId) || employees[0];
  const selectedGroup = groupsById.get(selectedGroupId) || data.leaveGroups[0];
  const requestLeaveType = leaveTypesById.get(requestLeaveTypeId);

  const selectedEmployeeBalances = useMemo(
    () => selectedEmployeeId ? calculateLeaveBalances(selectedEmployeeId, data) : [],
    [data, selectedEmployeeId]
  );

  const requestEmployeeBalances = useMemo(
    () => requestEmployeeId ? calculateLeaveBalances(requestEmployeeId, data, requestStartDate) : [],
    [data, requestEmployeeId, requestStartDate]
  );

  const selectableRequestLeaveTypes = requestEmployeeBalances.length > 0
    ? requestEmployeeBalances.map((balance) => leaveTypesById.get(balance.leaveTypeId)).filter(Boolean) as LeaveTypeRecord[]
    : data.leaveTypes.filter((type) => type.isActive);

  const requestPolicy = useMemo(() => {
    if (!requestEmployeeId || !requestLeaveTypeId) return undefined;
    const item = getEmployeeLeaveGroupItems(requestEmployeeId, data, requestStartDate)
      .find((candidate) => candidate.leaveTypeId === requestLeaveTypeId);
    if (item) return policiesById.get(item.conditionPolicyId);
    return data.conditionPolicies.find((policy) => policy.name.toLowerCase().includes((requestLeaveType?.name || '').toLowerCase()));
  }, [data, policiesById, requestEmployeeId, requestLeaveType?.name, requestLeaveTypeId, requestStartDate]);

  const rawRequestDays = calculateInclusiveDays(requestStartDate, requestEndDate);
  const computedRequestDays = calculatePolicyDeductionDays(rawRequestDays, requestPolicy);

  const filteredRequests = useMemo(() => {
    const sorted = [...data.requests].sort((left, right) => {
      const statusRank = { Pending: 0, Draft: 1, Approved: 2, Rejected: 3, Cancelled: 4 } as Record<string, number>;
      return (statusRank[left.status] ?? 5) - (statusRank[right.status] ?? 5) || right.appliedDate.localeCompare(left.appliedDate);
    });
    return requestStatusFilter === 'All'
      ? sorted
      : sorted.filter((request) => request.status === requestStatusFilter);
  }, [data.requests, requestStatusFilter]);

  const pendingRequestsCount = data.requests.filter((request) => request.status === 'Pending').length;
  const pendingOilCount = data.offInLieuRequests.filter((request) => request.status === 'Pending').length;

  const persistRecord = async <T extends { id: string }>(
    next: LeaveDataState,
    tableKey: keyof LeaveDataState,
    record: T
  ) => {
    setData(next);
    await leaveService.saveState(activeEntityId, next);
    try {
      await leaveService.upsert(activeEntityId, tableKey as any, record);
    } catch (error) {
      console.warn('[Leave Management] Supabase leave sync failed:', error);
      if (!syncWarningShown) {
        setSyncWarningShown(true);
        onShowNotification('Leave Saved Locally', 'Supabase leave tables are not available yet. Apply the new migration to sync online.');
      }
    }
  };

  const persistMany = async (
    next: LeaveDataState,
    records: Array<{ tableKey: keyof LeaveDataState; record: { id: string } }>
  ) => {
    setData(next);
    await leaveService.saveState(activeEntityId, next);
    await Promise.all(records.map(async ({ tableKey, record }) => {
      try {
        await leaveService.upsert(activeEntityId, tableKey as any, record);
      } catch (error) {
        console.warn('[Leave Management] Supabase leave sync failed:', error);
      }
    }));
  };

  const deleteRecord = async (next: LeaveDataState, tableKey: keyof LeaveDataState, id: string) => {
    setData(next);
    await leaveService.saveState(activeEntityId, next);
    try {
      await leaveService.delete(activeEntityId, tableKey as any, id);
    } catch (error) {
      console.warn('[Leave Management] Supabase leave delete failed:', error);
    }
  };

  const patchRecord = async <T extends { id: string }>(
    tableKey: keyof LeaveDataState,
    id: string,
    patch: Partial<T>
  ) => {
    const collection = (data[tableKey] as T[]);
    const existing = collection.find((item) => item.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch, updatedAt: getGmt8Timestamp() };
    const next = { ...data, [tableKey]: collection.map((item) => item.id === id ? updated : item) } as LeaveDataState;
    await persistRecord(next, tableKey, updated);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    const loaded = await leaveService.load(activeEntityId);
    setData(loaded);
    setIsLoading(false);
    onShowNotification('Leave Data Refreshed', 'Latest leave settings and requests were loaded.');
  };

  const handleAddLeaveType = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = leaveTypeDraft.name.trim();
    if (!name) {
      onShowNotification('Leave Type Required', 'Please enter a leave type name.');
      return;
    }
    const code = normalizeLeaveCode(name);
    if (data.leaveTypes.some((type) => type.code === code)) {
      onShowNotification('Duplicate Leave Type', `${name} already exists.`);
      return;
    }
    const record: LeaveTypeRecord = {
      id: makeRuntimeLeaveId('leave-type'),
      entityId: activeEntityId,
      code,
      name,
      description: leaveTypeDraft.description.trim(),
      isPaid: leaveTypeDraft.isPaid,
      isSystem: false,
      isActive: true,
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    await persistRecord({ ...data, leaveTypes: [record, ...data.leaveTypes] }, 'leaveTypes', record);
    setLeaveTypeDraft({ name: '', description: '', isPaid: true });
    onShowNotification('Leave Type Added', `${name} is now available for leave groups.`);
  };

  const handleAddPolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!policyDraft.name.trim()) {
      onShowNotification('Policy Required', 'Please enter a conditioning policy name.');
      return;
    }
    const record: LeaveConditionPolicy = {
      id: makeRuntimeLeaveId('leave-policy'),
      entityId: activeEntityId,
      name: policyDraft.name.trim(),
      deductionBasis: policyDraft.deductionBasis,
      roundingRule: policyDraft.roundingRule,
      prorationRule: policyDraft.prorationRule,
      entitlementDays: numberValue(policyDraft.entitlementDays),
      paidTreatment: policyDraft.paidTreatment,
      excessLeaveHandling: policyDraft.excessLeaveHandling,
      payrollDeductionEnabled: policyDraft.payrollDeductionEnabled,
      dailyRateDivisor: policyDraft.dailyRateDivisor ? Number(policyDraft.dailyRateDivisor) : null,
      description: policyDraft.description.trim(),
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    await persistRecord({ ...data, conditionPolicies: [record, ...data.conditionPolicies] }, 'conditionPolicies', record);
    setPolicyDraft({
      name: '',
      entitlementDays: 14,
      paidTreatment: 'paid',
      deductionBasis: 'calendar_day',
      roundingRule: 'nearest_half_day',
      prorationRule: 'none',
      excessLeaveHandling: 'allow_unpaid',
      payrollDeductionEnabled: true,
      dailyRateDivisor: '',
      description: '',
    });
    onShowNotification('Policy Added', `${record.name} has been saved.`);
  };

  const handleAddCarryover = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!carryDraft.name.trim()) {
      onShowNotification('Carry Over Required', 'Please enter a carry over setting name.');
      return;
    }
    const record: LeaveCarryoverSetting = {
      id: makeRuntimeLeaveId('leave-carryover'),
      entityId: activeEntityId,
      name: carryDraft.name.trim(),
      enabled: carryDraft.enabled,
      maxCarryForwardDays: numberValue(carryDraft.maxCarryForwardDays),
      expiryDate: carryDraft.expiryDate || undefined,
      expiryAfterMonths: carryDraft.expiryAfterMonths ? Number(carryDraft.expiryAfterMonths) : null,
      ruleDescription: carryDraft.ruleDescription.trim(),
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    await persistRecord({ ...data, carryoverSettings: [record, ...data.carryoverSettings] }, 'carryoverSettings', record);
    setCarryDraft({ name: '', enabled: false, maxCarryForwardDays: 0, expiryDate: '', expiryAfterMonths: 3, ruleDescription: '' });
    onShowNotification('Carry Over Added', `${record.name} has been saved.`);
  };

  const handleAddGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupDraft.name.trim()) {
      onShowNotification('Group Required', 'Please enter a leave group name.');
      return;
    }
    const record: LeaveGroup = {
      id: makeRuntimeLeaveId('leave-group'),
      entityId: activeEntityId,
      name: groupDraft.name.trim(),
      description: groupDraft.description.trim(),
      isDefault: false,
      isActive: true,
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    await persistRecord({ ...data, leaveGroups: [record, ...data.leaveGroups] }, 'leaveGroups', record);
    setSelectedGroupId(record.id);
    setGroupDraft({ name: '', description: '' });
    onShowNotification('Leave Group Added', `${record.name} is ready for policy rows.`);
  };

  const handleAddGroupItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId || !groupItemDraft.leaveTypeId || !groupItemDraft.conditionPolicyId || !groupItemDraft.carryoverSettingId) {
      onShowNotification('Incomplete Group Rule', 'Please select a leave type, policy, and carry over rule.');
      return;
    }
    if (data.groupItems.some((item) => item.groupId === selectedGroupId && item.leaveTypeId === groupItemDraft.leaveTypeId)) {
      onShowNotification('Duplicate Group Rule', 'This leave type is already in the selected leave group.');
      return;
    }
    const record: LeaveGroupItem = {
      id: makeRuntimeLeaveId('leave-group-item'),
      entityId: activeEntityId,
      groupId: selectedGroupId,
      leaveTypeId: groupItemDraft.leaveTypeId,
      conditionPolicyId: groupItemDraft.conditionPolicyId,
      carryoverSettingId: groupItemDraft.carryoverSettingId,
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    await persistRecord({ ...data, groupItems: [record, ...data.groupItems] }, 'groupItems', record);
    onShowNotification('Leave Group Rule Added', 'The leave type, policy, and carry over setting were linked.');
  };

  const handleAssignGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assignmentDraft.employeeId || !assignmentDraft.groupId) {
      onShowNotification('Assignment Required', 'Please choose an employee and leave group.');
      return;
    }
    const record = {
      id: makeRuntimeLeaveId('leave-assignment'),
      entityId: activeEntityId,
      employeeId: assignmentDraft.employeeId,
      groupId: assignmentDraft.groupId,
      effectiveDate: assignmentDraft.effectiveDate,
      isActive: true,
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    const nextAssignments = [record, ...data.assignments];
    const conflicts = findAssignmentConflicts(
      assignmentDraft.employeeId,
      nextAssignments,
      data.leaveGroups,
      data.groupItems,
      data.leaveTypes
    );
    if (conflicts.length > 0) {
      onShowNotification(
        'Leave Group Conflict',
        `Cannot assign overlapping leave types: ${conflicts.map((conflict) => conflict.leaveType).join(', ')}.`
      );
      return;
    }
    await persistRecord({ ...data, assignments: nextAssignments }, 'assignments', record);
    onShowNotification('Leave Group Assigned', `${getEmployeeLabel(employeesById.get(record.employeeId))} was assigned to ${groupsById.get(record.groupId)?.name}.`);
  };

  const handleSubmitLeaveRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requestEmployee || !requestLeaveType || !requestReason.trim()) {
      onShowNotification('Leave Request Incomplete', 'Please select employee, leave type, and reason.');
      return;
    }
    if (new Date(requestEndDate) < new Date(requestStartDate)) {
      onShowNotification('Invalid Dates', 'End date cannot be earlier than start date.');
      return;
    }
    const record: LeaveRequestRecord = {
      id: makeRuntimeLeaveId('leave-request'),
      entityId: activeEntityId,
      employeeId: requestEmployee.id,
      employeeName: requestEmployee.name,
      leaveTypeId: requestLeaveType.id,
      leaveType: requestLeaveType.name,
      startDate: requestStartDate,
      endDate: requestEndDate,
      totalDays: computedRequestDays,
      reason: requestReason.trim(),
      status: 'Pending',
      appliedDate: getGmt8DateString(),
      source: 'admin',
      payrollSyncStatus: 'not_required',
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    await persistRecord({ ...data, requests: [record, ...data.requests] }, 'requests', record);
    setRequestReason('');
    onShowNotification('Leave Request Created', `${record.leaveType} request for ${record.employeeName} is pending approval.`);
  };

  const applyLeaveStatus = async (request: LeaveRequestRecord, status: 'Approved' | 'Rejected') => {
    if (status === 'Rejected') {
      const updated = { ...request, status, reviewedAt: getGmt8Timestamp(), reviewedBy: 'Admin', updatedAt: getGmt8Timestamp() };
      await persistRecord(
        { ...data, requests: data.requests.map((item) => item.id === request.id ? updated : item) },
        'requests',
        updated
      );
      onShowNotification('Request Rejected', `${request.leaveType} request was rejected.`);
      return;
    }

    const employee = employeesById.get(request.employeeId);
    if (!employee) {
      onShowNotification('Employee Missing', 'The employee for this leave request cannot be found.');
      return;
    }

    const balancesBeforeApproval = calculateLeaveBalances(request.employeeId, data, request.startDate);
    const balance = balancesBeforeApproval.find((item) => item.leaveTypeId === request.leaveTypeId);
    const policy = getEmployeeLeaveGroupItems(request.employeeId, data, request.startDate)
      .map((item) => policiesById.get(item.conditionPolicyId))
      .find((candidate) => candidate && data.groupItems.some((item) => item.leaveTypeId === request.leaveTypeId && item.conditionPolicyId === candidate.id));
    const effectivePolicy = policy || data.conditionPolicies.find((candidate) => candidate.name.toLowerCase().includes(request.leaveType.toLowerCase()));
    const availableBeforeApproval = balance?.remainingDays || 0;

    if ((effectivePolicy?.excessLeaveHandling === 'block' || request.leaveTypeId === data.leaveTypes.find((type) => type.code === REPLACEMENT_LEAVE_CODE)?.id) && request.totalDays > availableBeforeApproval) {
      onShowNotification('Insufficient Leave Balance', `${request.employeeName} has ${availableBeforeApproval} day(s) available for ${request.leaveType}.`);
      return;
    }

    let nextLedger = data.ledger;
    const replacementType = data.leaveTypes.find((type) => type.code === REPLACEMENT_LEAVE_CODE);
    if (replacementType && request.leaveTypeId === replacementType.id) {
      nextLedger = consumeReplacementLeaveCredits(request.employeeId, request.leaveTypeId, request.totalDays, data.ledger, request.startDate);
    }

    const payrollDeductions = calculateLeavePayrollDeductions({
      employee,
      request,
      policy: effectivePolicy,
      availableBeforeApproval,
    });

    const updatedRequest: LeaveRequestRecord = {
      ...request,
      status: 'Approved',
      reviewedAt: getGmt8Timestamp(),
      reviewedBy: 'Admin',
      payrollDeductionAmount: payrollDeductions.reduce((sum, deduction) => sum + deduction.deductionAmount, 0),
      payrollSyncStatus: payrollDeductions.length > 0 ? 'pending' : 'not_required',
      updatedAt: getGmt8Timestamp(),
    };

    const next: LeaveDataState = {
      ...data,
      requests: data.requests.map((item) => item.id === request.id ? updatedRequest : item),
      ledger: nextLedger,
      payrollDeductions: [...payrollDeductions, ...data.payrollDeductions],
    };

    await persistMany(next, [
      { tableKey: 'requests', record: updatedRequest },
      ...nextLedger.filter((entry) => data.ledger.some((original) => original.id === entry.id && original.remainingDays !== entry.remainingDays)).map((record) => ({ tableKey: 'ledger' as const, record })),
      ...payrollDeductions.map((record) => ({ tableKey: 'payrollDeductions' as const, record })),
    ]);

    if (payrollDeductions.length > 0 && onSyncLeavePayrollDeduction) {
      const syncedDeductions: LeavePayrollDeduction[] = [];
      for (const deduction of payrollDeductions) {
        try {
          await onSyncLeavePayrollDeduction(deduction);
          syncedDeductions.push({ ...deduction, status: 'synced', syncedAt: getGmt8Timestamp(), updatedAt: getGmt8Timestamp() });
        } catch (error) {
          console.error('[Leave Management] Payroll sync failed:', error);
          syncedDeductions.push({ ...deduction, status: 'failed', updatedAt: getGmt8Timestamp() });
        }
      }
      const allSynced = syncedDeductions.every((deduction) => deduction.status === 'synced');
      const requestAfterSync = { ...updatedRequest, payrollSyncStatus: allSynced ? 'synced' as const : 'failed' as const, updatedAt: getGmt8Timestamp() };
      const syncedNext = {
        ...next,
        requests: next.requests.map((item) => item.id === request.id ? requestAfterSync : item),
        payrollDeductions: next.payrollDeductions.map((deduction) => syncedDeductions.find((item) => item.id === deduction.id) || deduction),
      };
      await persistMany(syncedNext, [
        { tableKey: 'requests', record: requestAfterSync },
        ...syncedDeductions.map((record) => ({ tableKey: 'payrollDeductions' as const, record })),
      ]);
    }

    onShowNotification('Request Approved', `${request.leaveType} request was approved${payrollDeductions.length ? ' and synced to payroll deductions.' : '.'}`);
  };

  const handleUpdateLeaveStatus = async (request: LeaveRequestRecord, status: 'Approved' | 'Rejected') => {
    await confirmAction({
      title: status === 'Approved' ? 'Approve Leave Request' : 'Reject Leave Request',
      message: status === 'Approved'
        ? `Approve ${request.leaveType} for ${request.employeeName}? This will update the leave balance and may create a payroll deduction.`
        : `Reject ${request.leaveType} for ${request.employeeName}?`,
      tone: status === 'Rejected' ? 'danger' : 'warning',
      confirmLabel: status === 'Approved' ? 'Approve Request' : 'Reject Request',
      onConfirm: () => applyLeaveStatus(request, status),
    });
  };

  const addOilEmployee = () => {
    setOilSubmissionMode('bulk');
    setOilEmployees((previous) => [
      ...previous,
      {
        id: makeRuntimeLeaveId('oil-employee'),
        employeeId: employees[0]?.id || '',
        rows: [{ id: makeRuntimeLeaveId('oil-row'), otDate: getGmt8DateString(), startTime: '18:00', endTime: '22:00' }],
      },
    ]);
  };

  const updateOilEmployee = (draftId: string, employeeId: string) => {
    setOilEmployees((previous) => previous.map((draft) => draft.id === draftId ? { ...draft, employeeId } : draft));
  };

  const updateOilRow = (employeeDraftId: string, rowId: string, field: 'otDate' | 'startTime' | 'endTime', value: string) => {
    setOilEmployees((previous) => previous.map((draft) => draft.id === employeeDraftId
      ? { ...draft, rows: draft.rows.map((row) => row.id === rowId ? { ...row, [field]: value } : row) }
      : draft));
  };

  const addOilRow = (employeeDraftId: string) => {
    setOilEmployees((previous) => previous.map((draft) => draft.id === employeeDraftId
      ? { ...draft, rows: [...draft.rows, { id: makeRuntimeLeaveId('oil-row'), otDate: getGmt8DateString(), startTime: '18:00', endTime: '22:00' }] }
      : draft));
  };

  const removeOilRow = (employeeDraftId: string, rowId: string) => {
    setOilEmployees((previous) => previous.map((draft) => draft.id === employeeDraftId
      ? { ...draft, rows: draft.rows.filter((row) => row.id !== rowId) }
      : draft));
  };

  const oilTotalDays = oilEmployees.reduce((employeeSum, draft) => (
    employeeSum + draft.rows.reduce((rowSum, row) => rowSum + calculateOffInLieuEligibleDays(row.startTime, row.endTime), 0)
  ), 0);

  const handleSaveOffInLieu = async (status: OffInLieuStatus) => {
    const validDrafts = oilEmployees.filter((draft) => draft.employeeId && draft.rows.length > 0);
    if (validDrafts.length === 0 || oilTotalDays <= 0) {
      onShowNotification('Off in Lieu Incomplete', 'Please add at least one employee and valid working hours.');
      return;
    }

    const requestId = makeRuntimeLeaveId('oil-request');
    const request: OffInLieuRequest = {
      id: requestId,
      entityId: activeEntityId,
      status,
      submissionMode: oilSubmissionMode,
      submittedAt: getGmt8Timestamp(),
      submittedBy: 'Admin',
      expiryDate: oilExpiryDate,
      totalDays: oilTotalDays,
      notes: oilNotes.trim(),
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    const entries: OffInLieuEntry[] = validDrafts.flatMap((draft) => {
      const employee = employeesById.get(draft.employeeId);
      if (!employee) return [];
      return draft.rows.map((row) => ({
        id: makeRuntimeLeaveId('oil-entry'),
        entityId: activeEntityId,
        requestId,
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department || '',
        designation: employee.designation || '',
        otDate: row.otDate,
        startTime: row.startTime,
        endTime: row.endTime,
        hoursWorked: calculateHoursWorked(row.startTime, row.endTime),
        eligibleDays: calculateOffInLieuEligibleDays(row.startTime, row.endTime),
        expiryDate: oilExpiryDate,
        status,
        createdAt: getGmt8Timestamp(),
        updatedAt: getGmt8Timestamp(),
      }));
    });

    await persistMany(
      {
        ...data,
        offInLieuRequests: [request, ...data.offInLieuRequests],
        offInLieuEntries: [...entries, ...data.offInLieuEntries],
      },
      [
        { tableKey: 'offInLieuRequests', record: request },
        ...entries.map((record) => ({ tableKey: 'offInLieuEntries' as const, record })),
      ]
    );
    setOilEmployees([{
      id: makeRuntimeLeaveId('oil-employee'),
      employeeId: employees[0]?.id || '',
      rows: [{ id: makeRuntimeLeaveId('oil-row'), otDate: getGmt8DateString(), startTime: '18:00', endTime: '22:00' }],
    }]);
    setOilNotes('');
    setOilExpiryDate(getDefaultOffInLieuExpiry());
    onShowNotification(status === 'Draft' ? 'Off in Lieu Saved' : 'Off in Lieu Submitted', `${entries.length} OT row(s) saved.`);
  };

  const applyOffInLieuStatus = async (request: OffInLieuRequest, status: 'Approved' | 'Rejected') => {
    const entries = data.offInLieuEntries.filter((entry) => entry.requestId === request.id);
    const updatedRequest = { ...request, status, updatedAt: getGmt8Timestamp() };
    const updatedEntries = entries.map((entry) => ({ ...entry, status, updatedAt: getGmt8Timestamp() }));
    const replacementType = data.leaveTypes.find((type) => type.code === REPLACEMENT_LEAVE_CODE);
    const ledgerCredits: LeaveBalanceLedgerEntry[] = status === 'Approved' && replacementType
      ? updatedEntries.map((entry) => ({
        id: makeRuntimeLeaveId('leave-credit'),
        entityId: activeEntityId,
        employeeId: entry.employeeId,
        leaveTypeId: replacementType.id,
        leaveType: replacementType.name,
        source: 'off_in_lieu',
        requestId: request.id,
        effectiveDate: entry.otDate,
        expiryDate: entry.expiryDate,
        amountDays: entry.eligibleDays,
        remainingDays: entry.eligibleDays,
        notes: `Off in Lieu for ${entry.otDate} (${entry.startTime}-${entry.endTime})`,
        createdAt: getGmt8Timestamp(),
        updatedAt: getGmt8Timestamp(),
      }))
      : [];
    await persistMany(
      {
        ...data,
        offInLieuRequests: data.offInLieuRequests.map((item) => item.id === request.id ? updatedRequest : item),
        offInLieuEntries: data.offInLieuEntries.map((entry) => updatedEntries.find((updated) => updated.id === entry.id) || entry),
        ledger: [...ledgerCredits, ...data.ledger],
      },
      [
        { tableKey: 'offInLieuRequests', record: updatedRequest },
        ...updatedEntries.map((record) => ({ tableKey: 'offInLieuEntries' as const, record })),
        ...ledgerCredits.map((record) => ({ tableKey: 'ledger' as const, record })),
      ]
    );
    onShowNotification(status === 'Approved' ? 'Off in Lieu Approved' : 'Off in Lieu Rejected', status === 'Approved' ? `${request.totalDays} replacement leave day(s) credited.` : 'The Off in Lieu request was rejected.');
  };

  const handleUpdateOffInLieuStatus = async (request: OffInLieuRequest, status: 'Approved' | 'Rejected') => {
    await confirmAction({
      title: status === 'Approved' ? 'Approve Off in Lieu' : 'Reject Off in Lieu',
      message: status === 'Approved'
        ? `Approve ${request.totalDays} replacement leave day(s)? This will credit Replacement Leave to the selected employees.`
        : 'Reject this Off in Lieu request?',
      tone: status === 'Rejected' ? 'danger' : 'warning',
      confirmLabel: status === 'Approved' ? 'Approve Off in Lieu' : 'Reject Request',
      onConfirm: () => applyOffInLieuStatus(request, status),
    });
  };

  const renderStatCards = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {[
        { label: 'Active leave types', value: data.leaveTypes.filter((type) => type.isActive).length, icon: FileText },
        { label: 'Leave groups', value: data.leaveGroups.filter((group) => group.isActive).length, icon: Layers },
        { label: 'Pending leave', value: pendingRequestsCount, icon: Clock },
        { label: 'Pending Off in Lieu', value: pendingOilCount, icon: UserCheck },
      ].map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className={`${panelClass} p-4`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-on-surface-variant">{item.label}</p>
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-3 text-2xl font-bold text-on-background">{item.value}</p>
          </div>
        );
      })}
    </div>
  );

  const renderRequests = () => (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className={`${panelClass} p-5`}>
        <h2 className="text-base font-bold text-on-background">Submit Leave Request</h2>
        <p className="mt-1 text-xs text-on-surface-variant">Admin can submit on behalf of employees. Employee portal requests appear in the same queue.</p>
        <form onSubmit={handleSubmitLeaveRequest} className="mt-5 space-y-4">
          <label>
            <span className={labelClass}>Employee</span>
            <select value={requestEmployeeId} onChange={(event) => setRequestEmployeeId(event.target.value)} className={inputClass}>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{getEmployeeLabel(employee)}</option>)}
            </select>
          </label>
          {requestEmployee && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-border bg-neutral-50 p-3 text-xs">
              <div><span className="text-on-surface-variant">Department</span><p className="font-bold">{requestEmployee.department || 'N/A'}</p></div>
              <div><span className="text-on-surface-variant">Designation</span><p className="font-bold">{requestEmployee.designation || 'N/A'}</p></div>
            </div>
          )}
          <label>
            <span className={labelClass}>Leave Type</span>
            <select value={requestLeaveTypeId} onChange={(event) => setRequestLeaveTypeId(event.target.value)} className={inputClass}>
              {selectableRequestLeaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelClass}>Start Date</span>
              <input type="date" value={requestStartDate} onChange={(event) => setRequestStartDate(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className={labelClass}>End Date</span>
              <input type="date" value={requestEndDate} onChange={(event) => setRequestEndDate(event.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-primary">Computed Deduction Days</p>
            <p className="mt-1 text-2xl font-bold text-primary">{computedRequestDays}</p>
            <p className="mt-1 text-on-surface-variant">{requestPolicy?.name || 'No policy assigned yet'}</p>
          </div>
          <label>
            <span className={labelClass}>Reason / Notes</span>
            <textarea rows={4} value={requestReason} onChange={(event) => setRequestReason(event.target.value)} className={inputClass} placeholder="Reason, supporting document reference, or HR note..." />
          </label>
          <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white">
            <Plus className="h-4 w-4" /> Save and Submit
          </button>
        </form>
      </section>

      <section className={`${panelClass} p-5`}>
        <div className="flex flex-col gap-3 border-b border-neutral-border pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-bold text-on-background">Applications Queue & Logs</h2>
            <p className="text-xs text-on-surface-variant">Approving unpaid or excess leave syncs into payroll unpaid leave deductions.</p>
          </div>
          <select value={requestStatusFilter} onChange={(event) => setRequestStatusFilter(event.target.value as any)} className={`${inputClass} md:w-40`}>
            {['All', 'Pending', 'Draft', 'Approved', 'Rejected'].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="mt-4 max-h-[680px] space-y-3 overflow-y-auto pr-1">
          {filteredRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-border p-10 text-center text-xs text-on-surface-variant">No leave requests found.</div>
          ) : filteredRequests.map((request) => {
            const employee = employeesById.get(request.employeeId);
            return (
              <div key={request.id} className="rounded-xl border border-neutral-border bg-neutral-50/50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <EmployeeAvatar employee={employee} className="h-8 w-8 rounded-full" />
                      <div>
                        <p className="text-sm font-bold text-on-background">{request.employeeName}</p>
                        <p className="text-[11px] text-on-surface-variant">{employee?.department || 'N/A'} · {employee?.designation || 'N/A'} · Applied {formatToDDMMMYYYY(request.appliedDate)}</p>
                      </div>
                    </div>
                    <div className="grid gap-2 text-xs md:grid-cols-3">
                      <div className="rounded-lg bg-white p-2"><span className="text-on-surface-variant">Type</span><p className="font-bold text-primary">{request.leaveType}</p></div>
                      <div className="rounded-lg bg-white p-2"><span className="text-on-surface-variant">Dates</span><p className="font-mono font-bold">{formatToDDMMMYYYY(request.startDate)} - {formatToDDMMMYYYY(request.endDate)}</p></div>
                      <div className="rounded-lg bg-white p-2"><span className="text-on-surface-variant">Days</span><p className="font-mono font-bold">{request.totalDays}</p></div>
                    </div>
                    <p className="rounded-lg bg-white p-2 text-xs italic text-on-surface-variant">{request.reason}</p>
                    {request.payrollDeductionAmount ? (
                      <p className="text-[11px] font-semibold text-amber-700">Payroll unpaid leave deduction: RM {request.payrollDeductionAmount.toFixed(2)} · {request.payrollSyncStatus}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-end">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${
                      request.status === 'Approved' ? 'bg-green-100 text-green-700' :
                      request.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{request.status}</span>
                    {request.status === 'Pending' && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void handleUpdateLeaveStatus(request, 'Approved')} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-[11px] font-bold text-white">
                          <CheckCircle className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button type="button" onClick={() => void handleUpdateLeaveStatus(request, 'Rejected')} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-[11px] font-bold text-white">
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  const renderBalances = () => (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-bold text-on-background">Employee Leave Balance</h2>
          <p className="text-xs text-on-surface-variant">Balances combine assigned leave groups, carry-over ledger, and approved Off in Lieu credits.</p>
        </div>
        <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} className={`${inputClass} md:w-72`}>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{getEmployeeLabel(employee)}</option>)}
        </select>
      </div>
      {activeEmployee && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-neutral-border bg-neutral-50 p-3">
          <EmployeeAvatar employee={activeEmployee} className="h-10 w-10 rounded-full" />
          <div>
            <p className="font-bold text-on-background">{activeEmployee.name}</p>
            <p className="text-xs text-on-surface-variant">{activeEmployee.department || 'N/A'} · {activeEmployee.designation || 'N/A'}</p>
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {selectedEmployeeBalances.map((balance) => (
          <div key={balance.leaveTypeId} className="rounded-xl border border-neutral-border bg-[#fffaf4] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">{balance.leaveType}</p>
            <p className="mt-2 text-2xl font-bold text-primary">{balance.remainingDays}</p>
            <p className="text-xs text-on-surface-variant">remaining of {(balance.entitlementDays + balance.carriedForwardDays + balance.creditedDays).toFixed(1)} day(s)</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
              <span>Taken <strong>{balance.takenDays}</strong></span>
              <span>Pending <strong>{balance.pendingDays}</strong></span>
              <span>Credit <strong>{balance.creditedDays}</strong></span>
            </div>
          </div>
        ))}
        {selectedEmployeeBalances.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-neutral-border p-8 text-center text-xs text-on-surface-variant">No leave group is available for this employee yet.</div>
        )}
      </div>
    </section>
  );

  const renderOffInLieu = () => (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className={`${panelClass} p-5`}>
        <h2 className="text-base font-bold text-on-background">Off in Lieu Request (Replacement)</h2>
        <p className="mt-1 text-xs text-on-surface-variant">For OT or work outside normal hours. Hours/day ≤ 6 = 0.5 day; &gt; 6 = 1 day.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label>
            <span className={labelClass}>Submission</span>
            <select value={oilSubmissionMode} onChange={(event) => setOilSubmissionMode(event.target.value as 'single' | 'bulk')} className={inputClass}>
              <option value="single">Single Submission</option>
              <option value="bulk">Bulk Submission</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>Expiry Date</span>
            <input type="date" value={oilExpiryDate} onChange={(event) => setOilExpiryDate(event.target.value)} className={inputClass} />
          </label>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Total Off in Lieu</p>
            <p className="mt-1 text-2xl font-bold text-primary">{oilTotalDays} day(s)</p>
          </div>
        </div>
        <div className="mt-5 space-y-5">
          {oilEmployees.map((draft, employeeIndex) => {
            const employee = employeesById.get(draft.employeeId);
            return (
              <div key={draft.id} className="rounded-2xl border border-neutral-border bg-neutral-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Employee Details {employeeIndex + 1}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label>
                    <span className={labelClass}>Name</span>
                    <select value={draft.employeeId} onChange={(event) => updateOilEmployee(draft.id, event.target.value)} className={inputClass}>
                      {employees.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white p-3"><span className="text-on-surface-variant">Department</span><p className="font-bold">{employee?.department || 'N/A'}</p></div>
                    <div className="rounded-xl bg-white p-3"><span className="text-on-surface-variant">Designation</span><p className="font-bold">{employee?.designation || 'N/A'}</p></div>
                  </div>
                </div>
                <div className="mt-4 border-t border-neutral-border pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">Date of OT</p>
                  <div className="mt-3 space-y-3">
                    {draft.rows.map((row, rowIndex) => {
                      const hours = calculateHoursWorked(row.startTime, row.endTime);
                      const eligibleDays = calculateOffInLieuEligibleDays(row.startTime, row.endTime);
                      return (
                        <div key={row.id} className="grid gap-3 rounded-xl bg-white p-3 md:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] md:items-end">
                          <label>
                            <span className={labelClass}>Date {rowIndex + 1}</span>
                            <input type="date" value={row.otDate} onChange={(event) => updateOilRow(draft.id, row.id, 'otDate', event.target.value)} className={inputClass} />
                          </label>
                          <label>
                            <span className={labelClass}>From</span>
                            <input type="time" value={row.startTime} onChange={(event) => updateOilRow(draft.id, row.id, 'startTime', event.target.value)} className={inputClass} />
                          </label>
                          <label>
                            <span className={labelClass}>To</span>
                            <input type="time" value={row.endTime} onChange={(event) => updateOilRow(draft.id, row.id, 'endTime', event.target.value)} className={inputClass} />
                          </label>
                          <div>
                            <span className={labelClass}>Eligible</span>
                            <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary">{eligibleDays} day(s) · {hours}h</p>
                          </div>
                          <button type="button" onClick={() => removeOilRow(draft.id, row.id)} className="rounded-xl border border-red-200 p-2 text-red-600 disabled:opacity-40" disabled={draft.rows.length === 1}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => addOilRow(draft.id)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-xs font-bold text-primary">
                    <Plus className="h-4 w-4" /> Add Additional Date and Time
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={addOilEmployee} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-xs font-bold text-primary">
          <Plus className="h-4 w-4" /> Add Additional Employee
        </button>
        <label className="mt-4 block">
          <span className={labelClass}>Notes</span>
          <textarea rows={3} value={oilNotes} onChange={(event) => setOilNotes(event.target.value)} className={inputClass} placeholder="Event, approval reference, or support notes..." />
        </label>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleSaveOffInLieu('Draft')} className="rounded-xl border border-neutral-border px-4 py-2.5 text-xs font-bold text-on-surface">Save</button>
          <button type="button" onClick={() => void handleSaveOffInLieu('Pending')} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">Save and Submit</button>
          <button type="button" onClick={() => setOilNotes('')} className="rounded-xl border border-neutral-border px-4 py-2.5 text-xs font-bold text-on-surface-variant">Cancel</button>
        </div>
      </section>

      <section className={`${panelClass} p-5`}>
        <h2 className="text-base font-bold text-on-background">Off in Lieu Queue</h2>
        <div className="mt-4 space-y-3">
          {data.offInLieuRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-border p-10 text-center text-xs text-on-surface-variant">No Off in Lieu requests yet.</div>
          ) : data.offInLieuRequests.map((request) => {
            const entries = data.offInLieuEntries.filter((entry) => entry.requestId === request.id);
            return (
              <div key={request.id} className="rounded-xl border border-neutral-border bg-neutral-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-on-background">{request.submissionMode === 'bulk' ? 'Bulk' : 'Single'} Off in Lieu · {request.totalDays} day(s)</p>
                    <p className="text-xs text-on-surface-variant">Submitted {formatToDDMMMYYYY(request.submittedAt)} · Expires {formatToDDMMMYYYY(request.expiryDate)}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">{request.status}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {entries.map((entry) => (
                    <div key={entry.id} className="rounded-lg bg-white p-3 text-xs">
                      <p className="font-bold">{entry.employeeName} · {entry.department} · {entry.designation}</p>
                      <p className="text-on-surface-variant">{formatToDDMMMYYYY(entry.otDate)} · {entry.startTime}-{entry.endTime} · {entry.hoursWorked}h · {entry.eligibleDays} day(s)</p>
                    </div>
                  ))}
                </div>
                {request.status === 'Pending' && (
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void handleUpdateOffInLieuStatus(request, 'Approved')} className="rounded-lg bg-green-600 px-3 py-2 text-[11px] font-bold text-white">Approve</button>
                    <button type="button" onClick={() => void handleUpdateOffInLieuStatus(request, 'Rejected')} className="rounded-lg bg-red-600 px-3 py-2 text-[11px] font-bold text-white">Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  const renderGroups = () => {
    const selectedGroupItems = data.groupItems.filter((item) => item.groupId === selectedGroupId);
    return (
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className={`${panelClass} p-5`}>
          <h2 className="text-base font-bold text-on-background">Leave Groups</h2>
          <form onSubmit={handleAddGroup} className="mt-4 space-y-3">
            <label><span className={labelClass}>Group Name</span><input value={groupDraft.name} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })} className={inputClass} placeholder="e.g. Retail Operations" /></label>
            <label><span className={labelClass}>Description</span><textarea rows={3} value={groupDraft.description} onChange={(event) => setGroupDraft({ ...groupDraft, description: event.target.value })} className={inputClass} /></label>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">Add Leave Group</button>
          </form>
          <div className="mt-5 space-y-2">
            {data.leaveGroups.map((group) => (
              <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className={`w-full rounded-xl border p-3 text-left text-xs ${selectedGroupId === group.id ? 'border-primary bg-primary/5' : 'border-neutral-border bg-white'}`}>
                <p className="font-bold text-on-background">{group.name}</p>
                <p className="mt-1 text-on-surface-variant">{group.description || 'No description'} {group.isDefault ? '· Default' : ''}</p>
              </button>
            ))}
          </div>
        </section>

        <section className={`${panelClass} p-5`}>
          <h2 className="text-base font-bold text-on-background">{selectedGroup?.name || 'Leave Group'} Rules</h2>
          <p className="mt-1 text-xs text-on-surface-variant">(Type of Leave + Conditioning Leave Policy) + Carry Over Leave Balance Settings = A leave group.</p>
          <form onSubmit={handleAddGroupItem} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <label><span className={labelClass}>Type of Leave</span><select value={groupItemDraft.leaveTypeId} onChange={(event) => setGroupItemDraft({ ...groupItemDraft, leaveTypeId: event.target.value })} className={inputClass}>{data.leaveTypes.filter((type) => type.isActive).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
            <label><span className={labelClass}>Conditioning Policy</span><select value={groupItemDraft.conditionPolicyId} onChange={(event) => setGroupItemDraft({ ...groupItemDraft, conditionPolicyId: event.target.value })} className={inputClass}>{data.conditionPolicies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label>
            <label><span className={labelClass}>Carry Over Setting</span><select value={groupItemDraft.carryoverSettingId} onChange={(event) => setGroupItemDraft({ ...groupItemDraft, carryoverSettingId: event.target.value })} className={inputClass}>{data.carryoverSettings.map((setting) => <option key={setting.id} value={setting.id}>{setting.name}</option>)}</select></label>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">Add Rule</button>
          </form>
          <div className="mt-5 overflow-x-auto rounded-xl border border-neutral-border">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-neutral-50 text-[10px] uppercase tracking-[0.22em] text-on-surface-variant">
                <tr><th className="p-3">Leave Type</th><th className="p-3">Policy</th><th className="p-3">Carry Over</th><th className="p-3">Entitlement</th><th className="p-3">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-border">
                {selectedGroupItems.map((item) => {
                  const leaveType = leaveTypesById.get(item.leaveTypeId);
                  const policy = policiesById.get(item.conditionPolicyId);
                  const carry = carryoverById.get(item.carryoverSettingId);
                  return (
                    <tr key={item.id}>
                      <td className="p-3 font-bold text-primary">{leaveType?.name}</td>
                      <td className="p-3">{policy?.name}</td>
                      <td className="p-3">{carry?.name}</td>
                      <td className="p-3 font-mono">{policy?.entitlementDays || 0} day(s)</td>
                      <td className="p-3"><button type="button" onClick={() => void deleteRecord({ ...data, groupItems: data.groupItems.filter((candidate) => candidate.id !== item.id) }, 'groupItems', item.id)} className="text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  };

  const renderAssignments = () => (
    <section className={`${panelClass} p-5`}>
      <h2 className="text-base font-bold text-on-background">Employee Leave Group Assignment</h2>
      <p className="mt-1 text-xs text-on-surface-variant">Employees can have multiple groups, but active groups with the same leave type are blocked.</p>
      <form onSubmit={handleAssignGroup} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_0.7fr_auto] lg:items-end">
        <label><span className={labelClass}>Employee</span><select value={assignmentDraft.employeeId} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, employeeId: event.target.value })} className={inputClass}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{getEmployeeLabel(employee)}</option>)}</select></label>
        <label><span className={labelClass}>Leave Group</span><select value={assignmentDraft.groupId} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, groupId: event.target.value })} className={inputClass}>{data.leaveGroups.filter((group) => group.isActive).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label><span className={labelClass}>Effective Date</span><input type="date" value={assignmentDraft.effectiveDate} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, effectiveDate: event.target.value })} className={inputClass} /></label>
        <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">Assign Group</button>
      </form>
      <div className="mt-5 overflow-x-auto rounded-xl border border-neutral-border">
        <table className="w-full min-w-[780px] text-left text-xs">
          <thead className="bg-neutral-50 text-[10px] uppercase tracking-[0.22em] text-on-surface-variant">
            <tr><th className="p-3">Employee</th><th className="p-3">Group</th><th className="p-3">Effective</th><th className="p-3">Status</th><th className="p-3">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-border">
            {data.assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td className="p-3 font-bold">{employeesById.get(assignment.employeeId)?.name || assignment.employeeId}</td>
                <td className="p-3 text-primary font-bold">{groupsById.get(assignment.groupId)?.name || assignment.groupId}</td>
                <td className="p-3 font-mono">{formatToDDMMMYYYY(assignment.effectiveDate)}</td>
                <td className="p-3">{assignment.isActive ? 'Active' : 'Inactive'}</td>
                <td className="p-3"><button type="button" onClick={() => void patchRecord('assignments', assignment.id, { isActive: !assignment.isActive } as any)} className="rounded-lg border border-neutral-border px-3 py-1 text-[11px] font-bold">{assignment.isActive ? 'Disable' : 'Enable'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderTypes = () => (
    <section className={`${panelClass} p-5`}>
      <h2 className="text-base font-bold text-on-background">Type of Leave</h2>
      <p className="mt-1 text-xs text-on-surface-variant">Default leave types are kept. Add self-defined leave types as needed.</p>
      <form onSubmit={handleAddLeaveType} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr_0.35fr_auto] lg:items-end">
        <label><span className={labelClass}>Name</span><input value={leaveTypeDraft.name} onChange={(event) => setLeaveTypeDraft({ ...leaveTypeDraft, name: event.target.value })} className={inputClass} placeholder="e.g. Marriage Leave" /></label>
        <label><span className={labelClass}>Description</span><input value={leaveTypeDraft.description} onChange={(event) => setLeaveTypeDraft({ ...leaveTypeDraft, description: event.target.value })} className={inputClass} /></label>
        <label><span className={labelClass}>Paid</span><select value={leaveTypeDraft.isPaid ? 'yes' : 'no'} onChange={(event) => setLeaveTypeDraft({ ...leaveTypeDraft, isPaid: event.target.value === 'yes' })} className={inputClass}><option value="yes">Yes</option><option value="no">No</option></select></label>
        <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">Add Type</button>
      </form>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.leaveTypes.map((type) => (
          <div key={type.id} className="rounded-xl border border-neutral-border p-4">
            <input value={type.name} onChange={(event) => void patchRecord<LeaveTypeRecord>('leaveTypes', type.id, { name: event.target.value, code: normalizeLeaveCode(event.target.value) })} disabled={type.isSystem} className="w-full bg-transparent text-sm font-bold text-on-background outline-none disabled:text-on-surface" />
            <p className="mt-1 text-xs text-on-surface-variant">{type.description || (type.isSystem ? 'System managed' : 'Custom leave type')}</p>
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="rounded-full bg-neutral-100 px-2 py-1">{type.isPaid ? 'Paid' : 'Unpaid'}</span>
              <button type="button" onClick={() => void patchRecord<LeaveTypeRecord>('leaveTypes', type.id, { isActive: !type.isActive })} className="font-bold text-primary">{type.isActive ? 'Active' : 'Inactive'}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const renderPolicies = () => (
    <section className={`${panelClass} p-5`}>
      <h2 className="text-base font-bold text-on-background">Conditioning Leave Policy</h2>
      <form onSubmit={handleAddPolicy} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label><span className={labelClass}>Policy Name</span><input value={policyDraft.name} onChange={(event) => setPolicyDraft({ ...policyDraft, name: event.target.value })} className={inputClass} placeholder="e.g. Annual Leave Policy" /></label>
        <label><span className={labelClass}>Entitlement Days</span><input type="number" step="0.5" value={policyDraft.entitlementDays} onChange={(event) => setPolicyDraft({ ...policyDraft, entitlementDays: Number(event.target.value) })} className={inputClass} /></label>
        <label><span className={labelClass}>Deduction Basis</span><select value={policyDraft.deductionBasis} onChange={(event) => setPolicyDraft({ ...policyDraft, deductionBasis: event.target.value as any })} className={inputClass}><option value="calendar_day">Calendar Day</option><option value="working_day">Working Day</option><option value="fixed_daily_rate">Fixed Daily Rate</option></select></label>
        <label><span className={labelClass}>Rounding Rule</span><select value={policyDraft.roundingRule} onChange={(event) => setPolicyDraft({ ...policyDraft, roundingRule: event.target.value as any })} className={inputClass}><option value="nearest_half_day">Nearest 0.5 Day</option><option value="half_day_up">Round Up 0.5 Day</option><option value="full_day_up">Round Up Full Day</option><option value="none">No Rounding</option></select></label>
        <label><span className={labelClass}>Proration Rule</span><select value={policyDraft.prorationRule} onChange={(event) => setPolicyDraft({ ...policyDraft, prorationRule: event.target.value as any })} className={inputClass}><option value="none">None</option><option value="join_date">Join Date</option><option value="confirmation_date">Confirmation Date</option><option value="calendar_year">Calendar Year</option></select></label>
        <label><span className={labelClass}>Paid Treatment</span><select value={policyDraft.paidTreatment} onChange={(event) => setPolicyDraft({ ...policyDraft, paidTreatment: event.target.value as any })} className={inputClass}><option value="paid">Paid Leave</option><option value="unpaid">Unpaid Leave</option></select></label>
        <label><span className={labelClass}>Excess Handling</span><select value={policyDraft.excessLeaveHandling} onChange={(event) => setPolicyDraft({ ...policyDraft, excessLeaveHandling: event.target.value as any })} className={inputClass}><option value="block">Block</option><option value="allow_unpaid">Allow as Unpaid</option><option value="allow_negative">Allow Negative</option></select></label>
        <label><span className={labelClass}>Daily Rate Divisor</span><input value={policyDraft.dailyRateDivisor} onChange={(event) => setPolicyDraft({ ...policyDraft, dailyRateDivisor: event.target.value })} className={inputClass} placeholder="Blank = calendar days" /></label>
        <label className="md:col-span-2 xl:col-span-3"><span className={labelClass}>Description</span><input value={policyDraft.description} onChange={(event) => setPolicyDraft({ ...policyDraft, description: event.target.value })} className={inputClass} /></label>
        <label className="flex items-center gap-2 rounded-xl border border-neutral-border px-3 py-2 text-xs font-bold"><input type="checkbox" checked={policyDraft.payrollDeductionEnabled} onChange={(event) => setPolicyDraft({ ...policyDraft, payrollDeductionEnabled: event.target.checked })} /> Sync payroll deduction</label>
        <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white md:col-span-2 xl:col-span-4">Add Conditioning Policy</button>
      </form>
      <div className="mt-5 overflow-x-auto rounded-xl border border-neutral-border">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="bg-neutral-50 text-[10px] uppercase tracking-[0.22em] text-on-surface-variant">
            <tr><th className="p-3">Policy</th><th className="p-3">Days</th><th className="p-3">Deduction</th><th className="p-3">Rounding</th><th className="p-3">Proration</th><th className="p-3">Treatment</th><th className="p-3">Excess</th><th className="p-3">Payroll</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-border">
            {data.conditionPolicies.map((policy) => (
              <tr key={policy.id}>
                <td className="p-3 font-bold text-primary">{policy.name}</td>
                <td className="p-3"><input type="number" step="0.5" value={policy.entitlementDays} onChange={(event) => void patchRecord<LeaveConditionPolicy>('conditionPolicies', policy.id, { entitlementDays: Number(event.target.value) })} className={`${inputClass} w-24`} /></td>
                <td className="p-3">{policy.deductionBasis}</td>
                <td className="p-3">{policy.roundingRule}</td>
                <td className="p-3">{policy.prorationRule}</td>
                <td className="p-3">{policy.paidTreatment}</td>
                <td className="p-3">{policy.excessLeaveHandling}</td>
                <td className="p-3">{policy.payrollDeductionEnabled ? 'Enabled' : 'Off'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderCarryover = () => (
    <section className={`${panelClass} p-5`}>
      <h2 className="text-base font-bold text-on-background">Carry Over Leave Balance Settings</h2>
      <form onSubmit={handleAddCarryover} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label><span className={labelClass}>Setting Name</span><input value={carryDraft.name} onChange={(event) => setCarryDraft({ ...carryDraft, name: event.target.value })} className={inputClass} /></label>
        <label><span className={labelClass}>Max Carry Forward Days</span><input type="number" step="0.5" value={carryDraft.maxCarryForwardDays} onChange={(event) => setCarryDraft({ ...carryDraft, maxCarryForwardDays: Number(event.target.value) })} className={inputClass} /></label>
        <label><span className={labelClass}>Expiry Date</span><input type="date" value={carryDraft.expiryDate} onChange={(event) => setCarryDraft({ ...carryDraft, expiryDate: event.target.value })} className={inputClass} /></label>
        <label><span className={labelClass}>Expiry After Months</span><input type="number" value={carryDraft.expiryAfterMonths} onChange={(event) => setCarryDraft({ ...carryDraft, expiryAfterMonths: Number(event.target.value) })} className={inputClass} /></label>
        <label className="md:col-span-2 xl:col-span-3"><span className={labelClass}>Carry Forward Rules</span><input value={carryDraft.ruleDescription} onChange={(event) => setCarryDraft({ ...carryDraft, ruleDescription: event.target.value })} className={inputClass} /></label>
        <label className="flex items-center gap-2 rounded-xl border border-neutral-border px-3 py-2 text-xs font-bold"><input type="checkbox" checked={carryDraft.enabled} onChange={(event) => setCarryDraft({ ...carryDraft, enabled: event.target.checked })} /> Enable carry forward</label>
        <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white md:col-span-2 xl:col-span-4">Add Carry Over Setting</button>
      </form>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.carryoverSettings.map((setting) => (
          <div key={setting.id} className="rounded-xl border border-neutral-border p-4">
            <p className="font-bold text-on-background">{setting.name}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{setting.ruleDescription || 'No rule details'}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <span>Enabled <strong>{setting.enabled ? 'Yes' : 'No'}</strong></span>
              <span>Max <strong>{setting.maxCarryForwardDays}</strong></span>
              <span>Expiry <strong>{setting.expiryDate ? formatToDDMMMYYYY(setting.expiryDate) : `${setting.expiryAfterMonths || 0} mo.`}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const tabContent = () => {
    switch (activeTab) {
      case 'oil':
        return renderOffInLieu();
      case 'groups':
        return renderGroups();
      case 'assignments':
        return renderAssignments();
      case 'types':
        return renderTypes();
      case 'policies':
        return renderPolicies();
      case 'carryover':
        return renderCarryover();
      case 'calendar':
        return <LeaveCalendar requests={data.requests} employees={employees} />;
      case 'requests':
      default:
        return (
          <div className="space-y-6">
            {renderBalances()}
            {renderRequests()}
          </div>
        );
    }
  };

  const tabs: Array<{ id: LeaveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'requests', label: 'Requests & Balances', icon: Calendar },
    { id: 'oil', label: 'Off in Lieu', icon: Clock },
    { id: 'groups', label: 'Leave Groups', icon: Layers },
    { id: 'assignments', label: 'Employee Assignment', icon: Users },
    { id: 'types', label: 'Type of Leave', icon: FileText },
    { id: 'policies', label: 'Conditioning Policy', icon: Settings },
    { id: 'carryover', label: 'Carry Over Settings', icon: Briefcase },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-left animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-on-background">Leave Management</h1>
          <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">
            Supabase-backed leave setup, employee group assignment, Off in Lieu credits, request approvals, and payroll-linked unpaid leave deductions.
          </p>
        </div>
        <button type="button" onClick={() => void handleRefresh()} className="inline-flex items-center gap-2 rounded-xl border border-neutral-border bg-white px-4 py-2.5 text-xs font-bold text-on-surface shadow-sm">
          {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Refresh Leave Data
        </button>
      </div>

      {renderStatCards()}

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-neutral-border bg-white p-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                activeTab === tab.id ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-neutral-50 hover:text-on-surface'
              }`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <div className="flex gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Leave groups can be combined per employee, but the assignment screen blocks overlapping active groups with the same leave type. Replacement Leave is credited only by approved Off in Lieu requests.
          </p>
        </div>
      </div>

      {tabContent()}
    </div>
  );
}
