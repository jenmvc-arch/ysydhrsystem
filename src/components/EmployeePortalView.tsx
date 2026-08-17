/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Home,
  User,
  Wallet,
  CalendarDays,
  TrendingUp,
  FileText,
  LifeBuoy,
  Menu,
  ChevronRight,
  ArrowUpRight,
  Download,
  Send,
  BookOpen,
  Heart,
  MessageSquareText,
  Mail,
  Phone,
  ShieldCheck,
  CheckCircle2,
  BriefcaseBusiness,
  Sparkles,
  Clock3,
  FileDown,
  ExternalLink,
  ClipboardList,
} from 'lucide-react';
import { Candidate, Employee, EmployeePerformance, CorporateEntity, PayrollRecord2026, ReviewCycle } from '../types';
import EmployeeAvatar from './EmployeeAvatar';
import PayslipDocumentView from './PayslipDocumentView';
import PerformanceAppraisalForm from './PerformanceAppraisalForm';
import { formatToDDMMMYYYY, getGmt8DateString, getGmt8LongDateString, getGmt8Timestamp } from '../lib/dateUtils';
import { calculatePayslip, calculatePayslipFromRecord, getPayrollDocumentProfile, sortPayrollRecords } from '../data';
import {
  LeaveDataState,
  LeaveRequestRecord,
  calculateInclusiveDays,
  calculateLeaveBalances,
  calculatePolicyDeductionDays,
  getEmployeeLeaveGroupItems,
  leaveService,
  makeRuntimeLeaveId,
  mergeWithDefaultLeaveData,
} from '../lib/leaveEngine';

const OnboardingPortalView = React.lazy(() => import('./OnboardingPortalView'));

type PortalSection =
  | 'home'
  | 'profile'
  | 'payslips'
  | 'leave'
  | 'onboarding'
  | 'growth'
  | 'documents'
  | 'support';

interface SupportRequest {
  id: string;
  category: string;
  subject: string;
  description: string;
  priority: 'Low' | 'Normal' | 'High';
  status: 'Open' | 'In Progress' | 'Resolved';
  createdAt: string;
  updatedAt: string;
}

interface EmployeePortalViewProps {
  employees: Employee[];
  payrollRecords2026: PayrollRecord2026[];
  entities: CorporateEntity[];
  candidates: Candidate[];
  performances: EmployeePerformance[];
  reviewCycles: ReviewCycle[];
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  currentUserRole?: string | null;
  onShowNotification: (title: string, message: string) => void;
  onUpdateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  onUpdateCandidate?: (id: string, updates: Partial<Candidate>) => Promise<void> | void;
  onSavePerformance: (performance: EmployeePerformance) => void;
  onSignOut: () => void;
  isPreviewMode?: boolean;
  previewEmployeeId?: string;
}

const PORTAL_NAV_ITEMS: Array<{
  id: PortalSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'payslips', label: 'Payslips', icon: Wallet },
  { id: 'leave', label: 'Leave', icon: CalendarDays },
  { id: 'onboarding', label: 'Onboarding', icon: ClipboardList },
  { id: 'growth', label: 'Performance & Appraisal', icon: TrendingUp },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'support', label: 'Support', icon: LifeBuoy },
];

const SUPPORT_CATEGORIES = [
  'Profile update',
  'Payslip issue',
  'Leave question',
  'Document request',
  'Bank details review',
  'Other',
];

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (_error) {
    return fallback;
  }
};

const saveJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

type PreviewEmployeeOverrides = Partial<Employee>;

const readPreviewEmployeeOverrides = (employeeId: string): PreviewEmployeeOverrides =>
  readJson<PreviewEmployeeOverrides>(`employee_portal_demo_employee_${employeeId}`, {});

const savePreviewEmployeeOverrides = (employeeId: string, updates: PreviewEmployeeOverrides) => {
  const key = `employee_portal_demo_employee_${employeeId}`;
  saveJson(key, {
    ...readPreviewEmployeeOverrides(employeeId),
    ...updates,
  });
};

const currency = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export default function EmployeePortalView({
  employees,
  payrollRecords2026,
  entities,
  candidates,
  performances,
  reviewCycles,
  currentUserName,
  currentUserEmail,
  currentUserRole,
  onShowNotification,
  onUpdateEmployee,
  onUpdateCandidate,
  onSavePerformance,
  onSignOut,
  isPreviewMode = false,
  previewEmployeeId = '',
}: EmployeePortalViewProps) {
  const [activeSection, setActiveSection] = useState<PortalSection>(() => {
    const saved = localStorage.getItem('employee_portal_active_section');
    return (saved as PortalSection) || 'home';
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(previewEmployeeId);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<{ month: number; year: number; record?: PayrollRecord2026 } | null>(null);
  const [leaveData, setLeaveData] = useState<LeaveDataState>(() => blankLeaveData('portal'));
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [leaveStartDate, setLeaveStartDate] = useState(getGmt8DateString());
  const [leaveEndDate, setLeaveEndDate] = useState(getGmt8DateString());
  const [leaveReason, setLeaveReason] = useState('');
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [supportCategory, setSupportCategory] = useState(SUPPORT_CATEGORIES[0]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDescription, setSupportDescription] = useState('');
  const [supportPriority, setSupportPriority] = useState<'Low' | 'Normal' | 'High'>('Normal');

  const effectiveEmployeeEmail = String(currentUserEmail || '').toLowerCase();

  const employeeFromSession = useMemo(
    () => employees.find((employee) => String(employee.email || '').toLowerCase() === effectiveEmployeeEmail) || null,
    [employees, effectiveEmployeeEmail]
  );

  const selectedEmployee = useMemo(() => {
    if (isPreviewMode) {
      const previewEmployee = employees.find((employee) => employee.id === selectedEmployeeId)
        || employeeFromSession
        || employees[0]
        || null;
      if (!previewEmployee) return null;
      return {
        ...previewEmployee,
        ...readPreviewEmployeeOverrides(previewEmployee.id),
      };
    }
    return employeeFromSession || null;
  }, [employees, employeeFromSession, isPreviewMode, selectedEmployeeId]);

  const onboardingCandidates = useMemo(() => {
    const employeeEmail = String(selectedEmployee?.email || '').toLowerCase();
    if (!employeeEmail) return [];
    return candidates.filter((candidate) => String(candidate.email || '').toLowerCase() === employeeEmail);
  }, [candidates, selectedEmployee?.email]);

  const employeeEntity = useMemo(
    () => entities.find((entity) => entity.id === selectedEmployee?.entityId) || entities[0] || null,
    [entities, selectedEmployee?.entityId]
  );
  const portalCompanyName = employeeEntity?.name || 'YSYD HRMS';

  const employeePayrollHistory = useMemo(() => {
    if (!selectedEmployee) return [];
    const directHistory = selectedEmployee.historicalPayrollRecords || [];
    const fallbackHistory = sortPayrollRecords(
      payrollRecords2026.filter((record) => record.employeeEmail.toLowerCase() === selectedEmployee.email.toLowerCase())
    );
    const merged = [...directHistory];
    fallbackHistory.forEach((record) => {
      if (!merged.some((existing) => existing.id === record.id)) {
        merged.push(record);
      }
    });
    return sortPayrollRecords(merged as PayrollRecord2026[]);
  }, [payrollRecords2026, selectedEmployee]);

  const latestPayrollRecord = employeePayrollHistory[0] || null;
  const latestPayrollMonth = latestPayrollRecord?.payrollMonth || new Date().getMonth() + 1;
  const latestPayrollYear = latestPayrollRecord?.payrollYear || new Date().getFullYear();
  const latestPayrollBreakdown = selectedEmployee
    ? latestPayrollRecord
      ? calculatePayslipFromRecord(selectedEmployee, latestPayrollRecord)
      : calculatePayslip(selectedEmployee, latestPayrollMonth, latestPayrollYear)
    : null;
  const latestPayrollDate = latestPayrollRecord?.paymentDate || selectedEmployee?.paymentDate || `${latestPayrollYear}-${String(latestPayrollMonth).padStart(2, '0')}-28`;

  const activeReviewCycle = reviewCycles[0] || null;
  const selectedPerformance = selectedEmployee && activeReviewCycle
    ? performances.find((performance) =>
        performance.reviewCycleId === activeReviewCycle.id &&
        (
          performance.employeeId.toLowerCase() === selectedEmployee.id.toLowerCase() ||
          performance.employeeId.toLowerCase() === selectedEmployee.email.toLowerCase()
        )
      ) || null
    : null;

  const selectedCareerHistory = selectedEmployee?.careerHistory || [];
  const selectedDependants = selectedEmployee?.dependants || [];

  const storagePrefix = isPreviewMode ? 'employee_portal_demo_' : 'employee_portal_';
  const supportStorageKey = selectedEmployee?.id ? `${storagePrefix}employee_support_requests_${selectedEmployee.id}` : '';
  const activeSectionStorageKey = `${storagePrefix}active_section`;

  useEffect(() => {
    localStorage.setItem(activeSectionStorageKey, activeSection);
  }, [activeSection, activeSectionStorageKey]);

  useEffect(() => {
    if (!isPreviewMode) {
      setSelectedEmployeeId('');
      return;
    }
    if (previewEmployeeId && employees.some((employee) => employee.id === previewEmployeeId)) {
      setSelectedEmployeeId(previewEmployeeId);
      return;
    }
    if (!selectedEmployeeId && employees[0]) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, isPreviewMode, previewEmployeeId, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployee?.entityId) return;
    let cancelled = false;
    void leaveService.load(selectedEmployee.entityId).then((loaded) => {
      if (cancelled) return;
      setLeaveData(loaded);
      const balances = calculateLeaveBalances(selectedEmployee.id, loaded);
      setLeaveTypeId(balances[0]?.leaveTypeId || loaded.leaveTypes.find((type) => type.isActive)?.id || '');
    });
    setLeaveStartDate(getGmt8DateString());
    setLeaveEndDate(getGmt8DateString());
    setLeaveReason('');
    return () => {
      cancelled = true;
    };
  }, [selectedEmployee?.entityId, selectedEmployee?.id]);

  useEffect(() => {
    if (!selectedEmployee?.id) return;
    const requests = readJson<SupportRequest[]>(supportStorageKey, []);
    setSupportRequests(requests);
    setSupportCategory(SUPPORT_CATEGORIES[0]);
    setSupportSubject('');
    setSupportDescription('');
    setSupportPriority('Normal');
  }, [selectedEmployee?.id, supportStorageKey]);

  const [profileDraft, setProfileDraft] = useState({
    contactNumber: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: '',
    avatarUrl: '',
  });

  useEffect(() => {
    if (!selectedEmployee?.id) return;
    const previewOverrides = isPreviewMode
      ? readPreviewEmployeeOverrides(selectedEmployee.id)
      : {};
    setProfileDraft({
      contactNumber: selectedEmployee.contactNumber || '',
      emergencyContactName: selectedEmployee.emergencyContactName || '',
      emergencyContactRelation: selectedEmployee.emergencyContactRelation || '',
      emergencyContactPhone: selectedEmployee.emergencyContactPhone || '',
      avatarUrl: selectedEmployee.avatarUrl || '',
    });
  }, [isPreviewMode, selectedEmployee?.id]);

  useEffect(() => {
    if (!selectedEmployee) return;
    const balances = calculateLeaveBalances(selectedEmployee.id, leaveData);
    const availableTypes = balances.length > 0
      ? balances.map((balance) => leaveData.leaveTypes.find((type) => type.id === balance.leaveTypeId)).filter(Boolean)
      : leaveData.leaveTypes.filter((type) => type.isActive);
    if (!availableTypes.some((type) => type?.id === leaveTypeId)) {
      setLeaveTypeId(availableTypes[0]?.id || '');
    }
  }, [leaveData, leaveTypeId, selectedEmployee]);

  const visibleLeaveRequests = useMemo(
    () => leaveData.requests
      .filter((request) => request.employeeId === selectedEmployee?.id)
      .sort((left, right) => right.appliedDate.localeCompare(left.appliedDate)),
    [leaveData.requests, selectedEmployee?.id]
  );

  const leaveBalances = useMemo(
    () => selectedEmployee ? calculateLeaveBalances(selectedEmployee.id, leaveData) : [],
    [leaveData, selectedEmployee]
  );
  const annualLeaveBalance = leaveBalances.find((balance) => balance.leaveType === 'Annual Leave') || leaveBalances[0];
  const sickLeaveBalance = leaveBalances.find((balance) => balance.leaveType === 'Sick Leave') || leaveBalances[1] || leaveBalances[0];
  const pendingLeaveCount = visibleLeaveRequests.filter((request) => request.status === 'Pending').length;
  const annualLeaveRemaining = annualLeaveBalance?.remainingDays || 0;
  const sickLeaveRemaining = sickLeaveBalance?.remainingDays || 0;
  const selectableLeaveTypes = leaveBalances.length > 0
    ? leaveBalances.map((balance) => leaveData.leaveTypes.find((type) => type.id === balance.leaveTypeId)).filter(Boolean)
    : leaveData.leaveTypes.filter((type) => type.isActive);

  const profileCompleteness = useMemo(() => {
    if (!selectedEmployee) return 0;
    const checks = [
      selectedEmployee.contactNumber,
      selectedEmployee.emergencyContactName,
      selectedEmployee.emergencyContactRelation,
      selectedEmployee.emergencyContactPhone,
      selectedEmployee.bankName,
      selectedEmployee.accountNo,
      selectedEmployee.taxNumber,
      selectedEmployee.epfNumber,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [selectedEmployee]);

  const currentMonthLeaveRequests = visibleLeaveRequests.filter((request) =>
    request.appliedDate.startsWith(getGmt8DateString().slice(0, 7))
  );

  const performanceRating = selectedPerformance?.reviewStatus === 'Completed' && selectedPerformance.rating > 0
    ? selectedPerformance.rating.toFixed(1)
    : '—';

  const portalTheme = {
    '--color-primary': '#825500',
    '--color-primary-container': '#f4a300',
    '--color-on-primary-container': '#613e00',
    '--color-secondary': '#5f5e5e',
    '--color-secondary-container': '#e5e2e1',
    '--color-on-secondary-container': '#474646',
    '--color-tertiary': '#c00018',
    '--color-on-tertiary': '#ffffff',
    '--color-background': '#f5fafe',
    '--color-on-background': '#171c1f',
    '--color-surface': '#ffffff',
    '--color-surface-container-lowest': '#ffffff',
    '--color-surface-container-low': '#eff4f8',
    '--color-surface-container': '#eaeef2',
    '--color-surface-container-high': '#e4e9ed',
    '--color-surface-container-highest': '#dee3e7',
    '--color-on-surface': '#171c1f',
    '--color-on-surface-variant': '#524533',
    '--color-outline': '#857461',
    '--color-outline-variant': '#d7c3ad',
    '--color-error': '#ba1a1a',
    '--color-parchment': '#f5fafe',
    '--color-neutral-border': '#d9dee2',
    '--color-inverse-surface': '#2c3134',
    '--color-inverse-on-surface': '#ecf1f5',
  } as React.CSSProperties;

  const updateSupportRequests = (next: SupportRequest[]) => {
    setSupportRequests(next);
    if (supportStorageKey) {
      saveJson(supportStorageKey, next);
    }
  };

  const handleSaveProfile = async () => {
    if (!selectedEmployee) return;
    setIsSavingProfile(true);
    try {
      const profileUpdates: Partial<Employee> = {
        contactNumber: profileDraft.contactNumber.trim(),
        emergencyContactName: profileDraft.emergencyContactName.trim(),
        emergencyContactRelation: profileDraft.emergencyContactRelation.trim(),
        emergencyContactPhone: profileDraft.emergencyContactPhone.trim(),
        avatarUrl: profileDraft.avatarUrl.trim(),
      };
      if (isPreviewMode) {
        savePreviewEmployeeOverrides(selectedEmployee.id, {
          ...profileUpdates,
        });
      } else {
        await onUpdateEmployee(selectedEmployee.id, profileUpdates);
      }
      onShowNotification('Profile Updated', 'Your contact details were saved.');
    } catch (error) {
      console.error('[Employee Portal] Profile save failed:', error);
      onShowNotification('Profile Update Failed', 'We could not save your profile details right now.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSubmitLeave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEmployee) return;
    if (!leaveReason.trim()) {
      onShowNotification('Leave request', 'Please add a reason for the leave request.');
      return;
    }
    const start = new Date(leaveStartDate);
    const end = new Date(leaveEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      onShowNotification('Leave request', 'Please choose a valid leave date range.');
      return;
    }
    const selectedType = leaveData.leaveTypes.find((type) => type.id === leaveTypeId);
    if (!selectedType) {
      onShowNotification('Leave request', 'Please choose a valid leave type.');
      return;
    }
    const assignedItem = getEmployeeLeaveGroupItems(selectedEmployee.id, leaveData, leaveStartDate)
      .find((item) => item.leaveTypeId === selectedType.id);
    const policy = assignedItem
      ? leaveData.conditionPolicies.find((candidate) => candidate.id === assignedItem.conditionPolicyId)
      : undefined;
    const totalDays = calculatePolicyDeductionDays(calculateInclusiveDays(leaveStartDate, leaveEndDate), policy);
    const newRequest: LeaveRequestRecord = {
      id: makeRuntimeLeaveId('leave-request'),
      entityId: selectedEmployee.entityId,
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      leaveTypeId: selectedType.id,
      leaveType: selectedType.name,
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      totalDays,
      reason: leaveReason.trim(),
      status: 'Pending',
      appliedDate: getGmt8DateString(),
      source: 'employee_portal',
      payrollSyncStatus: 'not_required',
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    const next = { ...leaveData, requests: [newRequest, ...leaveData.requests] };
    setLeaveData(next);
    await leaveService.saveState(selectedEmployee.entityId, next);
    try {
      await leaveService.upsert(selectedEmployee.entityId, 'requests', newRequest);
    } catch (error) {
      console.warn('[Employee Portal] Leave Supabase sync failed:', error);
    }
    setLeaveReason('');
    onShowNotification('Leave request submitted', `Your ${selectedType.name.toLowerCase()} request is now pending review.`);
  };

  const handleSubmitSupport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEmployee) return;
    if (!supportSubject.trim() || !supportDescription.trim()) {
      onShowNotification('Support request', 'Please complete the subject and description.');
      return;
    }
    const newRequest: SupportRequest = {
      id: `SR-${Date.now()}`,
      category: supportCategory,
      subject: supportSubject.trim(),
      description: supportDescription.trim(),
      priority: supportPriority,
      status: 'Open',
      createdAt: getGmt8Timestamp(),
      updatedAt: getGmt8Timestamp(),
    };
    const nextRequests = [newRequest, ...supportRequests];
    updateSupportRequests(nextRequests);
    setSupportSubject('');
    setSupportDescription('');
    setSupportPriority('Normal');
    onShowNotification('Request submitted', 'Your message has been queued for HR.');
  };

  const openPayslip = (record?: PayrollRecord2026) => {
    if (!selectedEmployee) return;
    if (record) {
      setSelectedPayslip({ month: record.payrollMonth, year: record.payrollYear, record });
      return;
    }
    setSelectedPayslip({ month: latestPayrollMonth, year: latestPayrollYear, record: latestPayrollRecord || undefined });
  };

  const currentSectionTitle = PORTAL_NAV_ITEMS.find((item) => item.id === activeSection)?.label || 'Home';
  const employeeInitials = (selectedEmployee?.name || 'Employee Portal')
    .split(' ')
    .map((namePart) => namePart[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  const employeeMetaLine = [selectedEmployee?.department, selectedEmployee?.designation].filter(Boolean).join(' · ') || 'Employee Portal';

  const tabButtonClass = (section: PortalSection) => [
    'w-full flex items-center gap-3 px-4 py-2 rounded text-left text-[11px] font-semibold transition-all duration-150',
    activeSection === section
      ? 'bg-white/10 text-inverse-on-surface border-l-4 border-primary-container'
      : 'text-inverse-on-surface/75 hover:bg-white/5 hover:text-inverse-on-surface',
  ].join(' ');

  const cardClass = 'rounded-lg border border-neutral-border bg-surface-container-lowest shadow-sm';

  if (!selectedEmployee) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-left" style={portalTheme}>
        <div className={`${cardClass} max-w-lg w-full p-8 space-y-4`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-on-background">Employee portal loading</h1>
              <p className="text-sm text-on-surface-variant">We&apos;re still connecting your profile.</p>
            </div>
          </div>
          <p className="text-sm text-on-surface-variant">
            If this keeps happening, sign out and sign back in with the same employee account.
          </p>
          <button
            onClick={onSignOut}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-inverse-surface py-6 text-inverse-on-surface">
      <div className="mx-3 mb-6 flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-[#DEE3E7] p-4">
        <div className="flex h-12 w-36 items-center justify-center overflow-hidden rounded">
          <img src="/redpoint-logo.png" alt="YSYD HRMS Logo" className="h-full w-full object-contain" />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#524533]">YSYD HRMS</p>
          <p className="mt-1 text-[11px] font-semibold text-[#171c1f]">{portalCompanyName}</p>
        </div>
      </div>

      <div className="mx-4 mb-5 rounded-lg border border-white/10 bg-white/8 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-3">
          <EmployeeAvatar employee={selectedEmployee} className="h-11 w-11 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{selectedEmployee.name}</p>
            <p className="truncate text-[10px] text-inverse-on-surface/70">{selectedEmployee.department || 'Department'} · {selectedEmployee.designation || 'Designation'}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-inverse-on-surface/70">
          <ShieldCheck className="h-3.5 w-3.5" />
          {isPreviewMode ? 'Preview mode' : 'Secure account'}
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 style-scrollbar">
        <div>
          <div className="mb-1 px-4 py-1 text-[9px] font-bold uppercase tracking-widest text-inverse-on-surface/45">
            Employee Workspace
          </div>
          <div className="space-y-0.5">
        {PORTAL_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveSection(item.id);
                setIsMobileNavOpen(false);
              }}
              className={tabButtonClass(item.id)}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${activeSection === item.id ? 'text-primary-container' : 'text-inverse-on-surface/75'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
          </div>
        </div>
      </nav>

      <div className="mt-auto space-y-3 border-t border-white/10 px-4 pt-4">
        <button
          onClick={onSignOut}
          className="w-full rounded border border-white/15 bg-white/8 px-4 py-2 text-left text-xs font-semibold text-inverse-on-surface/90 transition-colors hover:bg-white/12"
        >
          Sign out
        </button>
        <p className="text-[10px] leading-relaxed text-inverse-on-surface/55">
          Need help? Use the Support tab to raise a request with HR.
        </p>
      </div>
    </div>
  );

  const renderHome = () => (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Employee workspace
            </div>
            <div>
              <h1 className="text-3xl font-bold text-on-background md:text-4xl">
                Good day, {selectedEmployee.name.split(' ')[0]}.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
                Here&apos;s your personal view of payroll, leave, onboarding, handbook, performance, and support in one workspace.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => openPayslip(latestPayrollRecord || undefined)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Download className="h-4 w-4" />
                Open latest payslip
              </button>
              <button
                onClick={() => setActiveSection('leave')}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-border bg-white px-4 py-2.5 text-sm font-semibold text-on-surface"
              >
                <CalendarDays className="h-4 w-4 text-primary" />
                Apply for leave
              </button>
              <button
                onClick={() => setActiveSection('onboarding')}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-border bg-white px-4 py-2.5 text-sm font-semibold text-on-surface"
              >
                <ClipboardList className="h-4 w-4 text-primary" />
                Continue onboarding
              </button>
              <button
                onClick={() => setActiveSection('support')}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-border bg-white px-4 py-2.5 text-sm font-semibold text-on-surface"
              >
                <LifeBuoy className="h-4 w-4 text-primary" />
                Contact HR
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-on-surface-variant">Latest pay</p>
              <p className="mt-2 text-2xl font-bold text-on-background">
                RM {latestPayrollBreakdown ? currency(latestPayrollBreakdown.netPay) : '0.00'}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Paid {formatToDDMMMYYYY(latestPayrollDate)}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-on-surface-variant">Profile complete</p>
              <p className="mt-2 text-2xl font-bold text-on-background">{profileCompleteness}%</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Contact and banking records are up to date.
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-on-surface-variant">Leave balance</p>
              <p className="mt-2 text-2xl font-bold text-on-background">{annualLeaveRemaining} days</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {pendingLeaveCount} request{pendingLeaveCount === 1 ? '' : 's'} pending
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-on-surface-variant">Performance</p>
              <p className="mt-2 text-2xl font-bold text-on-background">{performanceRating}/5</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {selectedPerformance?.reviewStatus || 'No review yet'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <section className={cardClass}>
          <div className="flex items-center justify-between border-b border-neutral-border/70 px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-on-background">What&apos;s due</h2>
              <p className="text-xs text-on-surface-variant">Small, actionable items that need your attention.</p>
            </div>
            <button
              onClick={() => setActiveSection('support')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
            >
              View support <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-4 p-6 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <div className="flex items-center gap-2 text-primary">
                <Clock3 className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.35em]">Payroll</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-on-background">Latest payout</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {latestPayrollRecord ? `${latestPayrollRecord.documentType || getPayrollDocumentProfile(selectedEmployee).documentType} for ${latestPayrollMonth}/${latestPayrollYear}` : 'No payroll record yet'}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <div className="flex items-center gap-2 text-primary">
                <ClipboardList className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.35em]">Profile</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-on-background">Update contact details</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Emergency contact and mobile number can be saved from the My Profile tab.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <div className="flex items-center gap-2 text-primary">
                <CalendarDays className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.35em]">Leave</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-on-background">Requests this month</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {currentMonthLeaveRequests.length} leave request{currentMonthLeaveRequests.length === 1 ? '' : 's'} logged.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <div className="flex items-center gap-2 text-primary">
                <BookOpen className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.35em]">Onboarding</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-on-background">Handbook & compliance</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Continue your employee handbook, onboarding checklist, and compliance quiz.
              </p>
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <div className="border-b border-neutral-border/70 px-6 py-4">
            <h2 className="text-lg font-bold text-on-background">Announcements</h2>
            <p className="text-xs text-on-surface-variant">A small feed of company updates and reminders.</p>
          </div>
          <div className="space-y-4 p-6">
            {[
              {
                title: 'Payroll cut-off reminder',
                body: 'Timesheets and claims close on the 25th of each month for the next payroll run.',
                tag: 'Payroll',
              },
              {
                title: 'Profile verification',
                body: 'Please keep your emergency contact and mobile number current so HR can reach you quickly.',
                tag: 'Profile',
              },
              {
                title: 'Handbook refresh',
                body: 'Check the Onboarding tab for the latest handbook, compliance quiz, and completion record.',
                tag: 'Onboarding',
              },
            ].map((announcement) => (
              <article key={announcement.title} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.35em] text-primary">
                    {announcement.tag}
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-on-background">{announcement.title}</h3>
                <p className="mt-1 text-xs leading-6 text-on-surface-variant">{announcement.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <section className={`${cardClass} p-6`}>
        <div className="flex items-start justify-between gap-4 border-b border-neutral-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold text-on-background">My Profile</h2>
            <p className="text-xs text-on-surface-variant">Update your contact details and review your employment record.</p>
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={isSavingProfile}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
          >
            {isSavingProfile ? 'Saving...' : 'Save changes'}
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div className="flex items-center gap-4 rounded-3xl border border-neutral-border bg-surface-container-low p-5">
            <EmployeeAvatar employee={selectedEmployee} className="h-16 w-16 rounded-3xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-on-background">{selectedEmployee.name}</h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
                  {selectedEmployee.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-on-surface-variant">
                {selectedEmployee.designation} · {selectedEmployee.department}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">{selectedEmployee.email}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Mobile number</span>
              <input
                value={profileDraft.contactNumber}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, contactNumber: event.target.value }))}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Avatar URL</span>
              <input
                value={profileDraft.avatarUrl}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, avatarUrl: event.target.value }))}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Emergency contact</span>
              <input
                value={profileDraft.emergencyContactName}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, emergencyContactName: event.target.value }))}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Relationship</span>
              <input
                value={profileDraft.emergencyContactRelation}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, emergencyContactRelation: event.target.value }))}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Emergency phone</span>
              <input
                value={profileDraft.emergencyContactPhone}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, emergencyContactPhone: event.target.value }))}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>
          </div>

          <div className="rounded-3xl border border-neutral-border bg-surface-container-low p-5">
            <div className="flex items-center gap-2 text-primary">
              <BriefcaseBusiness className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-[0.35em]">Employment record</span>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">Joined</p>
                <p className="mt-1 font-semibold text-on-background">{formatToDDMMMYYYY(selectedEmployee.dateOfJoined)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">Employment type</p>
                <p className="mt-1 font-semibold text-on-background">{selectedEmployee.employmentType}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">Bank</p>
                <p className="mt-1 font-semibold text-on-background">{selectedEmployee.bankName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">Bank account</p>
                <p className="mt-1 font-mono text-sm font-semibold text-on-background">{selectedEmployee.accountNo || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">Tax number</p>
                <p className="mt-1 font-mono text-sm font-semibold text-on-background">{selectedEmployee.taxNumber || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">EPF number</p>
                <p className="mt-1 font-mono text-sm font-semibold text-on-background">{selectedEmployee.epfNumber || 'Not provided'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className={`${cardClass} p-6`}>
          <h3 className="text-base font-bold text-on-background">Family details</h3>
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-2xl border border-neutral-border bg-surface-container-low px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Marital status</span>
              <span className="font-semibold text-on-background">{selectedEmployee.maritalStatus}</span>
            </div>
            {selectedEmployee.spouseName ? (
              <div className="grid gap-3 rounded-2xl border border-neutral-border bg-surface-container-low p-4">
                <div className="flex items-center gap-2 text-primary">
                  <Heart className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.35em]">Spouse</span>
                </div>
                <p className="font-semibold text-on-background">{selectedEmployee.spouseName}</p>
                <p className="text-xs text-on-surface-variant">{selectedEmployee.spouseIsWorking === 'Yes' ? `${selectedEmployee.spouseCompany} · ${selectedEmployee.spousePosition}` : 'Not working / home-maker'}</p>
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-neutral-border bg-white px-4 py-5 text-center text-sm text-on-surface-variant">
                No spouse record on file.
              </p>
            )}
            {selectedDependants.length > 0 ? (
              <div className="space-y-3">
                {selectedDependants.map((dependant) => (
                  <div key={dependant.id} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
                    <p className="font-semibold text-on-background">{dependant.name}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {dependant.gender} · {formatToDDMMMYYYY(dependant.dob)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-neutral-border bg-white px-4 py-5 text-center text-sm text-on-surface-variant">
                No dependants declared.
              </p>
            )}
          </div>
        </div>

        <div className={`${cardClass} p-6`}>
          <h3 className="text-base font-bold text-on-background">Quick request</h3>
          <p className="mt-2 text-sm text-on-surface-variant">
            Need to change your bank details or submit a correction? Open Support and file a request.
          </p>
          <button
            onClick={() => setActiveSection('support')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary"
          >
            Create support request <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );

  const renderPayslips = () => (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between border-b border-neutral-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold text-on-background">Payslips</h2>
            <p className="text-xs text-on-surface-variant">Review monthly payslips and open the printable PDF viewer.</p>
          </div>
          <button
            onClick={() => openPayslip(latestPayrollRecord || undefined)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Download className="h-4 w-4" />
            Latest PDF
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-on-surface-variant">Document type</p>
            <p className="mt-2 text-lg font-bold text-on-background">
              {getPayrollDocumentProfile(selectedEmployee).documentType}
            </p>
          </div>
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-on-surface-variant">Net pay</p>
            <p className="mt-2 text-lg font-bold text-on-background">
              RM {latestPayrollBreakdown ? currency(latestPayrollBreakdown.netPay) : '0.00'}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {employeePayrollHistory.length > 0 ? employeePayrollHistory.map((record) => {
            const breakdown = calculatePayslipFromRecord(selectedEmployee, record);
            const documentProfile = getPayrollDocumentProfile(selectedEmployee);
            return (
              <button
                key={record.id}
                onClick={() => openPayslip(record)}
                className="w-full rounded-2xl border border-neutral-border bg-surface-container-lowest p-4 text-left transition-colors hover:border-primary hover:bg-surface-container-low"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-on-background">
                      {new Date(record.payrollYear, record.payrollMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {record.documentType || documentProfile.documentType} · Paid {formatToDDMMMYYYY(record.paymentDate || latestPayrollDate)}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.35em] text-primary">
                    RM {currency(breakdown.netPay)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary">
                  View payslip <ChevronRight className="h-4 w-4" />
                </div>
              </button>
            );
          }) : (
            <div className="rounded-3xl border border-dashed border-neutral-border bg-surface-container-low p-8 text-center">
              <FileDown className="mx-auto h-6 w-6 text-primary" />
              <p className="mt-3 text-sm font-semibold text-on-background">No archived payroll records yet.</p>
              <p className="mt-1 text-xs text-on-surface-variant">A current payroll snapshot will still be available for preview.</p>
              <button
                onClick={() => openPayslip(undefined)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Open current payslip
              </button>
            </div>
          )}
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <h3 className="text-base font-bold text-on-background">Quick breakdown</h3>
        <p className="mt-1 text-xs text-on-surface-variant">
          This summary is based on your latest payroll data.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Basic salary', value: latestPayrollBreakdown?.grossEarnings ? `RM ${currency(latestPayrollBreakdown.grossEarnings - (latestPayrollBreakdown.allowancesSum + latestPayrollBreakdown.reimbursementsSum + latestPayrollBreakdown.netPay ? 0 : 0))}` : '—' },
            { label: 'Total deductions', value: latestPayrollBreakdown ? `RM ${currency(latestPayrollBreakdown.totalDeductions)}` : '—' },
            { label: 'Employer contributions', value: latestPayrollBreakdown ? `RM ${currency(
              latestPayrollBreakdown.epfEmployerValue +
              latestPayrollBreakdown.socsoEmployerVal +
              latestPayrollBreakdown.eisEmployerVal +
              latestPayrollBreakdown.skbbkEmplyrVal
            )}` : '—' },
            { label: 'Tax / PCB', value: latestPayrollBreakdown ? `RM ${currency(latestPayrollBreakdown.taxPcbVal)}` : '—' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface-variant">{item.label}</p>
              <p className="mt-2 text-sm font-semibold text-on-background">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-neutral-border bg-surface-container-low p-5">
          <div className="flex items-center gap-2 text-primary">
            <MessageSquareText className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.35em]">Need a PDF?</span>
          </div>
          <p className="mt-3 text-sm text-on-surface-variant">
            Open any record in the viewer to print or download the official payslip PDF.
          </p>
        </div>
      </section>
    </div>
  );

  const renderLeave = () => (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <section className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between border-b border-neutral-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold text-on-background">Leave</h2>
            <p className="text-xs text-on-surface-variant">View balances and submit a new leave request.</p>
          </div>
          <CalendarDays className="h-5 w-5 text-primary" />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-on-surface-variant">Annual leave</p>
            <p className="mt-2 text-2xl font-bold text-on-background">{annualLeaveRemaining}</p>
            <p className="mt-1 text-xs text-on-surface-variant">of {annualLeaveBalance?.entitlementDays || 0} days remaining</p>
          </div>
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-on-surface-variant">Sick leave</p>
            <p className="mt-2 text-2xl font-bold text-on-background">{sickLeaveRemaining}</p>
            <p className="mt-1 text-xs text-on-surface-variant">of {sickLeaveBalance?.entitlementDays || 0} days remaining</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {leaveBalances.length > 0 ? leaveBalances.map((balance) => (
              <div key={balance.leaveTypeId} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-background">{balance.leaveType}</p>
                    <p className="text-xs text-on-surface-variant">
                      {balance.remainingDays} day(s) remaining · {balance.pendingDays} pending
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.35em] text-primary">
                    {(balance.entitlementDays + balance.carriedForwardDays + balance.creditedDays).toFixed(1)} days
                  </span>
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">
                  {balance.takenDays} approved day{balance.takenDays === 1 ? '' : 's'} taken
                  {balance.creditedDays > 0 ? ` · ${balance.creditedDays} replacement/adjustment credit` : ''}
                </p>
              </div>
          )) : (
            <div className="rounded-3xl border border-dashed border-neutral-border bg-white p-8 text-center text-sm text-on-surface-variant">
              No leave group has been assigned yet.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <div className={`${cardClass} p-6`}>
          <h3 className="text-base font-bold text-on-background">Apply for leave</h3>
          <form onSubmit={handleSubmitLeave} className="mt-5 space-y-4">
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Leave type</span>
              <select
                value={leaveTypeId}
                onChange={(event) => setLeaveTypeId(event.target.value)}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
              >
                {selectableLeaveTypes.map((type) => type && (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Start date</span>
                <input
                  type="date"
                  value={leaveStartDate}
                  onChange={(event) => setLeaveStartDate(event.target.value)}
                  className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">End date</span>
                <input
                  type="date"
                  value={leaveEndDate}
                  onChange={(event) => setLeaveEndDate(event.target.value)}
                  className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Reason</span>
              <textarea
                value={leaveReason}
                onChange={(event) => setLeaveReason(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
                placeholder="Tell HR why you need this leave"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Send className="h-4 w-4" />
              Submit leave request
            </button>
          </form>
        </div>

        <div className={`${cardClass} p-6`}>
          <h3 className="text-base font-bold text-on-background">My requests</h3>
          <div className="mt-4 space-y-3">
            {visibleLeaveRequests.length > 0 ? visibleLeaveRequests.map((request) => (
              <div key={request.id} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-background">{request.leaveType}</p>
                    <p className="text-xs text-on-surface-variant">
                      {formatToDDMMMYYYY(request.startDate)} - {formatToDDMMMYYYY(request.endDate)}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.35em] text-primary">
                    {request.status}
                  </span>
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">{request.reason}</p>
              </div>
            )) : (
              <div className="rounded-3xl border border-dashed border-neutral-border bg-white p-8 text-center text-sm text-on-surface-variant">
                No leave requests have been submitted yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );

  const renderGrowth = () => {
    const effectiveReviewCycle = activeReviewCycle || {
      id: 'cycle-2026-annual',
      name: 'Annual Review 2026',
      period: 'Jan 1 - Feb 28, 2026',
      status: 'In Progress' as const,
    };

    return (
      <div className="space-y-6">
        <PerformanceAppraisalForm
          employee={selectedEmployee}
          reviewCycle={effectiveReviewCycle}
          performance={selectedPerformance}
          mode="employee"
          currentUserName={currentUserName || selectedEmployee.name}
          onSavePerformance={onSavePerformance}
          onShowNotification={onShowNotification}
        />

        <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
          <section className={`${cardClass} p-6`}>
            <div className="flex items-center justify-between border-b border-neutral-border/70 pb-4">
              <div>
                <h2 className="text-lg font-bold text-on-background">Career timeline</h2>
                <p className="text-xs text-on-surface-variant">Employment changes and progression history for appraisal context.</p>
              </div>
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-5 space-y-3">
              {selectedCareerHistory.length > 0 ? selectedCareerHistory.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-on-background">{entry.type}</p>
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
                      {formatToDDMMMYYYY(entry.date)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-on-surface-variant">{entry.notes}</p>
                  <p className="mt-2 text-xs text-on-surface-variant">
                    {entry.previousValue} - {entry.newValue}
                  </p>
                </div>
              )) : (
                <div className="rounded-3xl border border-dashed border-neutral-border bg-white p-8 text-center text-sm text-on-surface-variant">
                  No career history is available yet.
                </div>
              )}
            </div>
          </section>

          <section className={`${cardClass} p-6`}>
            <h3 className="text-base font-bold text-on-background">Appraisal reminders</h3>
            <div className="mt-4 space-y-3">
              {[
                selectedPerformance?.reviewStatus === 'Completed'
                  ? 'Review your final manager feedback and agreed score.'
                  : 'Complete your self scores, evidence, and acknowledgement before submitting.',
                profileCompleteness < 100
                  ? 'Update missing contact or emergency details in My Profile.'
                  : 'Your profile details are complete.',
                'Use evidence links for documents, approvals, or analytics screenshots that support each KPI.',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4 text-sm text-on-surface-variant">
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  };

  const renderDocuments = () => (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between border-b border-neutral-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold text-on-background">Documents</h2>
            <p className="text-xs text-on-surface-variant">Find payslips, handbook access, and uploaded records.</p>
          </div>
          <FileText className="h-5 w-5 text-primary" />
        </div>

        <div className="mt-6 space-y-3">
          <button
            onClick={() => openPayslip(latestPayrollRecord || undefined)}
            className="flex w-full items-center justify-between rounded-2xl border border-neutral-border bg-surface-container-low p-4 text-left"
          >
            <div>
              <p className="font-semibold text-on-background">Latest payslip</p>
              <p className="text-xs text-on-surface-variant">Open the printable payroll PDF viewer.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary" />
          </button>
          <button
            onClick={() => setActiveSection('onboarding')}
            className="flex w-full items-center justify-between rounded-2xl border border-neutral-border bg-surface-container-low p-4 text-left"
          >
            <div>
              <p className="font-semibold text-on-background">Onboarding, handbook & compliance</p>
              <p className="text-xs text-on-surface-variant">Open your handbook, quiz, and completion record inside this employee site.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary" />
          </button>
          <div className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
            <p className="font-semibold text-on-background">Tax / HR forms</p>
            <p className="mt-1 text-xs text-on-surface-variant">Use Support for ad-hoc document requests or corrections.</p>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <h3 className="text-base font-bold text-on-background">Uploaded records</h3>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            { label: 'IC Front', url: selectedEmployee.icFrontUrl },
            { label: 'IC Back', url: selectedEmployee.icBackUrl },
            { label: 'Education cert', url: selectedEmployee.educationCertUrl },
          ].map((document) => (
            <div key={document.label} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">{document.label}</p>
              {document.url ? (
                <a
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                >
                  Open file <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <p className="mt-3 text-xs text-on-surface-variant">Not uploaded</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-neutral-border bg-surface-container-low p-5">
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.35em]">Need handbook access?</span>
          </div>
          <p className="mt-3 text-sm text-on-surface-variant">
            The handbook and compliance quiz are now grouped with Onboarding in this employee portal.
          </p>
        </div>
      </section>
    </div>
  );

  const renderOnboarding = () => (
    <section className={`${cardClass} p-4 sm:p-6`}>
      <React.Suspense
        fallback={
          <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-neutral-border bg-surface-container-low p-8 text-center">
            <div>
              <ClipboardList className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 text-sm font-bold text-on-background">Loading onboarding workspace...</p>
              <p className="mt-1 text-xs text-on-surface-variant">Preparing your handbook, quiz, and completion record.</p>
            </div>
          </div>
        }
      >
        <OnboardingPortalView
          employees={[selectedEmployee]}
          candidates={onboardingCandidates}
          currentUserName={currentUserName || selectedEmployee.name}
          currentUserEmail={currentUserEmail || selectedEmployee.email}
          currentUserRole={currentUserRole || 'Employee'}
          onShowNotification={onShowNotification}
          onUpdateEmployee={onUpdateEmployee}
          onUpdateCandidate={onUpdateCandidate}
          embeddedEmployeeMode
        />
      </React.Suspense>
    </section>
  );

  const renderSupport = () => (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between border-b border-neutral-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold text-on-background">Support</h2>
            <p className="text-xs text-on-surface-variant">Submit questions, requests, and corrections to HR.</p>
          </div>
          <LifeBuoy className="h-5 w-5 text-primary" />
        </div>

        <form onSubmit={handleSubmitSupport} className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Category</span>
              <select
                value={supportCategory}
                onChange={(event) => setSupportCategory(event.target.value)}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
              >
                {SUPPORT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Priority</span>
              <select
                value={supportPriority}
                onChange={(event) => setSupportPriority(event.target.value as 'Low' | 'Normal' | 'High')}
                className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
              </select>
            </label>
          </div>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Subject</span>
            <input
              value={supportSubject}
              onChange={(event) => setSupportSubject(event.target.value)}
              className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
              placeholder="Short summary of the issue"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface-variant">Description</span>
            <textarea
              value={supportDescription}
              onChange={(event) => setSupportDescription(event.target.value)}
              rows={5}
              className="w-full rounded-2xl border border-neutral-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
              placeholder="Tell HR what you need and any relevant dates or details."
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Send className="h-4 w-4" />
            Send request
          </button>
        </form>
      </section>

      <section className="space-y-6">
        <div className={`${cardClass} p-6`}>
          <h3 className="text-base font-bold text-on-background">Contact HR</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <Mail className="h-4 w-4 text-primary" />
              <span>hr@redpoint.com.my</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <Phone className="h-4 w-4 text-primary" />
              <span>+60 3-0000 0000</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-border bg-surface-container-low p-4">
              <Clock3 className="h-4 w-4 text-primary" />
              <span>Mon-Fri, 9:00 AM to 6:00 PM</span>
            </div>
          </div>
        </div>

        <div className={`${cardClass} p-6`}>
          <h3 className="text-base font-bold text-on-background">Open requests</h3>
          <div className="mt-4 space-y-3">
            {supportRequests.length > 0 ? supportRequests.map((request) => (
              <div key={request.id} className="rounded-2xl border border-neutral-border bg-surface-container-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-background">{request.subject}</p>
                    <p className="text-xs text-on-surface-variant">{request.category} · {request.priority}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.35em] text-primary">
                    {request.status}
                  </span>
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">{request.description}</p>
              </div>
            )) : (
              <div className="rounded-3xl border border-dashed border-neutral-border bg-white p-8 text-center text-sm text-on-surface-variant">
                You do not have any support requests yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );

  const mainContent = () => {
    switch (activeSection) {
      case 'profile':
        return renderProfile();
      case 'payslips':
        return renderPayslips();
      case 'leave':
        return renderLeave();
      case 'onboarding':
        return renderOnboarding();
      case 'growth':
        return renderGrowth();
      case 'documents':
        return renderDocuments();
      case 'support':
        return renderSupport();
      case 'home':
      default:
        return renderHome();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans text-on-background select-none" style={portalTheme}>
      <aside className="hidden w-[240px] shrink-0 border-r border-outline-variant/20 bg-primary lg:block">
        <div className="h-screen">
          {sidebarContent}
        </div>
      </aside>

      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[240px] transform transition-transform duration-300 lg:hidden ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-neutral-border bg-surface px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setIsMobileNavOpen(true)}
              className="rounded p-2 transition-colors hover:bg-surface-container lg:hidden"
              aria-label="Open employee navigation"
            >
              <Menu className="h-5 w-5 text-primary" />
            </button>
            <div className="min-w-0">
              <span className="inline-block max-w-[52vw] truncate rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary align-middle sm:max-w-none">
                {portalCompanyName} Employee Site
              </span>
              <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {currentSectionTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <div className="hidden text-right md:block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Kuala Lumpur Date</span>
              <span className="block text-xs font-mono font-bold text-on-surface">{getGmt8LongDateString()}</span>
            </div>
            {isPreviewMode && employees.length > 1 && (
              <select
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
                className="hidden min-w-[220px] rounded border border-neutral-border bg-white px-3 py-2 text-sm outline-none focus:border-primary lg:block"
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} · {employee.designation}
                  </option>
                ))}
              </select>
            )}
            <div className="hidden h-8 w-px bg-neutral-border/40 md:block" />
            <div className="flex items-center gap-2.5 pl-0 md:border-l md:border-neutral-border/40 md:pl-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-border bg-primary text-xs font-bold text-[#FFDDB3]">
                {employeeInitials || 'EP'}
              </div>
              <div className="hidden text-left leading-none sm:block">
                <span className="block text-xs font-bold text-on-surface">{selectedEmployee.name}</span>
                <span className="mt-0.5 block max-w-[220px] truncate text-[10px] text-on-surface-variant">{employeeMetaLine}</span>
              </div>
              <button
                onClick={onSignOut}
                className="ml-0 border-l border-neutral-border/40 pl-2.5 text-[10px] font-bold uppercase text-primary transition-colors hover:text-primary-container md:ml-2.5"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-surface-container-low p-4 md:p-6 lg:p-8 select-text">
          <div className="mx-auto max-w-7xl space-y-6">
            {mainContent()}
          </div>
        </main>
      </div>

      {selectedPayslip && selectedEmployee && (
        <div className="fixed inset-0 z-[80] bg-black/60 p-0 lg:p-4">
          <div className="h-full w-full overflow-hidden bg-white lg:rounded-[2rem]">
            <PayslipDocumentView
              employees={[selectedEmployee]}
              selectedEmployeeId={selectedEmployee.id}
              onBack={() => setSelectedPayslip(null)}
              onShowNotification={onShowNotification}
              activeEntity={employeeEntity || undefined}
              payrollRecordOverride={selectedPayslip.record}
              payMonth={selectedPayslip.month}
              payYear={selectedPayslip.year}
              userRole={currentUserRole || 'Employee'}
              entities={entities}
            />
          </div>
        </div>
      )}
    </div>
  );
}
