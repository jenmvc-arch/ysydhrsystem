/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Bell, 
  User, 
  X, 
  Settings, 
  HelpCircle, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Briefcase,
  FileText,
  DollarSign,
  Sun,
  Moon
} from 'lucide-react';
import { AppTab, Employee, EmployeePerformance, ReviewCycle, CorporateEntity, Candidate, PayrollRecord2026 } from './types';
import { 
  INITIAL_EMPLOYEES, 
  INITIAL_REVIEW_CYCLES, 
  INITIAL_PERFORMANCES,
  INITIAL_ENTITIES,
  INITIAL_CANDIDATES,
  UserAccount,
  seedSocsoConfigurationsAndBrackets,
  compressLogoFile,
  getPayrollDocumentDisplaySettings,
  getPayrollDocumentProfile,
  getCurrentActiveEmployees,
  mergePayrollRecords2026,
  isSeparatePayrollRecord
} from './data';
import { getGmt8Timestamp, getGmt8DateString } from './lib/dateUtils';
import { formatNricOrPassport } from './lib/employeeInput';
import { getAppTabFromPath, getPathForAppTab } from './lib/appRoutes';
import { isAdminPortalRole, isEmployeePortalRole } from './lib/userRoles';

import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import PayrollView from './components/PayrollView';
import PayrollEditorMockupView from './components/PayrollEditorMockupView';
import PayslipDocumentView from './components/PayslipDocumentView';
import PerformanceView from './components/PerformanceView';
import EmployeeDirectoryView from './components/EmployeeDirectoryView';
import ReportsView from './components/ReportsView';
import EntitiesView from './components/EntitiesView';
import TaxSettingsView from './components/TaxSettingsView';
import LeaveManagementView from './components/LeaveManagementView';
import FormsDirectoryView from './components/FormsDirectoryView';
import HireOnboardingView from './components/HireOnboardingView';
import DepartmentRoleView from './components/DepartmentRoleView';
import SocsoConfigAdminView from './components/SocsoConfigAdminView';
import EmployeePortalView from './components/EmployeePortalView';
import AppAccessSettingsPreview from './components/AppAccessSettingsPreview';
import LoginView from './components/LoginView';
import JobApplicationForm from './components/JobApplicationForm';
import OnboardingForm from './components/OnboardingForm';
import { EntityContextProvider } from './context/EntityContext';

import { googleSheetsClient, isGoogleConfigured, SheetsDataPayload } from './lib/googleSheetsClient';
import {
  employeeSupabase,
  supabase,
  supabaseClient,
  isSupabaseConfigured,
} from './lib/supabaseClient';

const parseOptionalJson = <T,>(value: unknown): T | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (_error) {
      return undefined;
    }
  }
  return value as T;
};

const REMOTE_DATA_LOAD_TIMEOUT_MS = import.meta.env.DEV ? 7000 : 30000;
const LOCAL_DATA_RESET_VERSION = '20260812-industrial-empty';

const clearLegacyLocalDataOnce = () => {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('hr-nexus-local-data-reset') === LOCAL_DATA_RESET_VERSION) return;

  const keysToRemove = [
    'offline_entities',
    'offline_employees',
    'offline_performances',
    'offline_review_cycles',
    'offline_candidates',
    'active_corporate_entity_id',
    'company_tax_rate',
    'company_departments',
    'company_roles',
    'preview_employee_portal_access_settings',
    'preview_employee_account_actions',
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (
      key.startsWith('active_tab_') ||
      key.startsWith('user_entity_preferences_') ||
      key.startsWith('company_departments_') ||
      key.startsWith('company_roles_') ||
      key.startsWith('leave_requests_') ||
      key.startsWith('leave_configs_') ||
      key.startsWith('employee_portal_') ||
      key.startsWith('employee_portal_demo_') ||
      key.startsWith('performance_appraisal_draft_v1_')
    ) {
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem('hr-nexus-local-data-reset', LOCAL_DATA_RESET_VERSION);
};

const withRemoteLoadTimeout = async <T,>(
  promise: Promise<T>,
  label: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out. Using local preview data instead.`));
    }, REMOTE_DATA_LOAD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    this.props.onError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export default function App() {
  clearLegacyLocalDataOnce();
  useState(() => {
    seedSocsoConfigurationsAndBrackets();
    return true;
  });

  // Navigation & View States
  const [activeEntityId, setActiveEntityId] = useState<string>(() => {
    return localStorage.getItem('active_corporate_entity_id') || '';
  });
  const [isSwitchingEntity, setIsSwitchingEntity] = useState<boolean>(false);
  const [switchingToEntityName, setSwitchingToEntityName] = useState<string>('');

  const [currentTab, setCurrentTab] = useState<AppTab>(() => (
    getAppTabFromPath(window.location.pathname) || 'dashboard'
  ));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(() => (
    new URLSearchParams(window.location.search).get('employeeId') || ''
  ));
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [globalError, setGlobalError] = useState<{ message: string; stack?: string } | null>(null);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      setGlobalError({
        message: event.message || 'Unknown window error',
        stack: event.error?.stack || 'No stack trace available'
      });
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      setGlobalError({
        message: event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
        stack: event.reason?.stack || 'No stack trace available'
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Check if we are in print/Puppeteer mode
  const isPrintMode = window.location.search.includes('print=true');

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserMustChangePassword, setCurrentUserMustChangePassword] = useState(false);
  const isEmployeePortalDemoPath = window.location.pathname.startsWith('/employee-portal/demo');
  const isEmployeeAccount = isEmployeePortalRole(currentUserRole);
  const employeePortalQueryEmployeeId = new URLSearchParams(window.location.search).get('employeeId') || '';

  const handleLoginSuccess = (user: UserAccount) => {
    localStorage.setItem('hr-nexus-auth', 'true');
    localStorage.setItem('hr-nexus-user-email', user.email);
    localStorage.setItem('hr-nexus-user-name', user.name);
    localStorage.setItem('hr-nexus-user-role', user.role);
    localStorage.removeItem('hr-nexus-user-nickname');
    localStorage.setItem(
      'hr-nexus-user-must-change-password',
      String(Boolean(user.mustChangePassword))
    );
    setIsAuthenticated(true);
    setCurrentUserEmail(user.email);
    setCurrentUserName(user.name);
    setCurrentUserRole(user.role);
    setCurrentUserMustChangePassword(Boolean(user.mustChangePassword));

    if (isEmployeePortalRole(user.role)) {
      setCurrentTab('employee-portal');
      if (!window.location.pathname.startsWith('/employee-portal')) {
        window.history.replaceState({ tab: 'employee-portal' }, '', '/employee-portal');
      }
    } else if (isAdminPortalRole(user.role) && window.location.pathname.startsWith('/employee-portal')) {
      setCurrentTab('dashboard');
      window.history.replaceState({ tab: 'dashboard' }, '', '/dashboard');
    }

    // Read and restore preferences
    const prefJson = localStorage.getItem(`user_entity_preferences_${user.email}`);
    if (prefJson) {
      try {
        const pref = JSON.parse(prefJson);
        if (pref && pref.last_selected_entity_id) {
          const matched = entities.find(e => e.id === pref.last_selected_entity_id && e.isActive);
          if (matched) {
            setActiveEntityId(pref.last_selected_entity_id);
            return;
          }
        }
      } catch (e) {}
    }
    const activeEntities = entities.filter(e => e.isActive);
    if (activeEntities.length > 0) {
      setActiveEntityId(activeEntities[0].id);
    }
  };

  const handleSignOut = () => {
    void supabase?.auth.signOut({ scope: 'local' });
    void employeeSupabase?.auth.signOut({ scope: 'local' });
    localStorage.removeItem('hr-nexus-auth');
    localStorage.removeItem('hr-nexus-user-email');
    localStorage.removeItem('hr-nexus-user-name');
    localStorage.removeItem('hr-nexus-user-role');
    localStorage.removeItem('hr-nexus-user-must-change-password');
    localStorage.removeItem('hr-nexus-user-nickname');
    setIsAuthenticated(false);
    setCurrentUserEmail(null);
    setCurrentUserName(null);
    setCurrentUserRole(null);
    setCurrentUserMustChangePassword(false);
    setCurrentTab('dashboard');
    window.history.replaceState({}, '', '/');
  };

  // Core Database States
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('offline_employees');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_EMPLOYEES;
  });
  const [performances, setPerformances] = useState<EmployeePerformance[]>(() => {
    const saved = localStorage.getItem('offline_performances');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_PERFORMANCES;
  });
  const [reviewCycles, setReviewCycles] = useState<ReviewCycle[]>(() => {
    const saved = localStorage.getItem('offline_review_cycles');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_REVIEW_CYCLES;
  });
  const [entities, setEntities] = useState<CorporateEntity[]>(() => {
    const saved = localStorage.getItem('offline_entities');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_ENTITIES;
  });
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    const saved = localStorage.getItem('offline_candidates');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_CANDIDATES;
  });
  const [payrollRecords2026, setPayrollRecords2026] = useState<PayrollRecord2026[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(isGoogleConfigured);

  // Offline persistence sync
  React.useEffect(() => {
    localStorage.setItem('offline_entities', JSON.stringify(entities));
  }, [entities]);

  React.useEffect(() => {
    localStorage.setItem('offline_employees', JSON.stringify(employees));
  }, [employees]);

  React.useEffect(() => {
    localStorage.setItem('offline_performances', JSON.stringify(performances));
  }, [performances]);

  React.useEffect(() => {
    localStorage.setItem('offline_review_cycles', JSON.stringify(reviewCycles));
  }, [reviewCycles]);

  React.useEffect(() => {
    localStorage.setItem('offline_candidates', JSON.stringify(candidates));
  }, [candidates]);

  const employeesWithHistory = React.useMemo(() => {
    return employees.map(emp => {
      const records = (payrollRecords2026 || []).filter(r => r && r.employeeEmail && emp.email && r.employeeEmail.toLowerCase() === emp.email.toLowerCase());
      const employeeRecords = emp.historicalPayrollRecords || [];
      const mapped = records.map(r => {
        const existing = employeeRecords.find(history => (
          isSeparatePayrollRecord(r)
            ? history.id === r.id
            : !isSeparatePayrollRecord(history) &&
              history.payrollMonth === r.payrollMonth &&
              (history.payrollYear === undefined || history.payrollYear === r.payrollYear)
        ));
        return {
          ...existing,
          id: r.id,
          payrollMonth: r.payrollMonth,
          payrollYear: r.payrollYear,
          paymentDate: r.paymentDate ?? existing?.paymentDate,
          basicSalary: r.basicSalary,
          allowanceGeneral: r.allowanceGeneral,
          allowanceTransport: r.allowanceTransport,
          allowanceParking: r.allowanceParking,
          allowanceMeal: r.allowanceMeal,
          allowanceAccommodation: r.allowanceAccommodation,
          allowancePhone: r.allowancePhone,
          overtime: r.overtime,
          bonusAmount: r.bonusAmount,
          bonusDesc: r.bonusDesc ?? existing?.bonusDesc,
          commissionAmount: r.commissionAmount,
          commissionDesc: r.commissionDesc ?? existing?.commissionDesc,
          backPayAmount: r.backPayAmount,
          backPayDesc: r.backPayDesc ?? existing?.backPayDesc,
          awsAmount: r.awsAmount,
          awsDesc: r.awsDesc ?? existing?.awsDesc,
          compensationAmount: r.compensationAmount,
          compensationDesc: r.compensationDesc ?? existing?.compensationDesc,
          reimbursementAmount: r.reimbursementAmount,
          reimbursementDesc: r.reimbursementDesc ?? existing?.reimbursementDesc,
          unpaidLeave: r.unpaidLeave,
          deductionInLieu: r.deductionInLieu,
          deductionCp38: r.deductionCp38,
	          deductionOthers: r.deductionOthers,
	          deductionOthersDesc: r.deductionOthersDesc ?? existing?.deductionOthersDesc,
	          payslipDescriptions: r.payslipDescriptions ?? existing?.payslipDescriptions,
	          payoutKind: r.payoutKind ?? existing?.payoutKind ?? 'regular',
	          isSeparatePayout: r.isSeparatePayout ?? existing?.isSeparatePayout ?? false,
	          statutoryTreatment: r.statutoryTreatment ?? existing?.statutoryTreatment,
	          payoutTitle: r.payoutTitle ?? existing?.payoutTitle,
	          payoutDescription: r.payoutDescription ?? existing?.payoutDescription,
	          lineNotes: r.lineNotes ?? existing?.lineNotes,
	          documentType: r.documentType ?? existing?.documentType,
	          compensationLabel: r.compensationLabel ?? existing?.compensationLabel,
	          displaySettingsSnapshot: r.displaySettingsSnapshot ?? existing?.displaySettingsSnapshot,
	          actualPCBDeducted: r.actualPCBDeducted,
          epfEmployee: r.epfEmployee,
          epfEmployer: r.epfEmployer,
          socsoEmployee: r.socsoEmployee,
          socsoEmployer: r.socsoEmployer,
          lindung24Employee: r.lindung24Employee ?? existing?.lindung24Employee,
          eisEmployee: r.eisEmployee,
          eisEmployer: r.eisEmployer,
          hrdCorp: r.hrdCorp ?? existing?.hrdCorp,
          zakat: existing?.zakat || 0,
          cp38: r.deductionCp38,
          netPay: r.netPay
        };
      });
      const employeeOnlyRecords = employeeRecords.filter(record => !mapped.some(mappedRecord => (
        isSeparatePayrollRecord(record)
          ? mappedRecord.id && mappedRecord.id === record.id
          : !isSeparatePayrollRecord(mappedRecord) &&
            mappedRecord.payrollMonth === record.payrollMonth &&
            (record.payrollYear === undefined || mappedRecord.payrollYear === record.payrollYear)
      )));
      return {
        ...emp,
        historicalPayrollRecords: [...employeeOnlyRecords, ...mapped].sort((a, b) =>
          ((a.payrollYear || 0) - (b.payrollYear || 0)) || (a.payrollMonth - b.payrollMonth)
        )
      };
    });
  }, [employees, payrollRecords2026]);

  // Corporate scopes data isolation filters
  const currentActiveEmployees = React.useMemo(() => (
    getCurrentActiveEmployees(employees)
  ), [employees]);

  const filteredEmployees = React.useMemo(() => {
    return currentActiveEmployees.filter(e => e.entityId === activeEntityId);
  }, [currentActiveEmployees, activeEntityId]);

  const filteredEmployeesWithHistory = React.useMemo(() => {
    return getCurrentActiveEmployees(employeesWithHistory)
      .filter(e => e.entityId === activeEntityId);
  }, [employeesWithHistory, activeEntityId]);

  const directoryEmployees = React.useMemo(() => (
    employees.filter(e => e.entityId === activeEntityId)
  ), [employees, activeEntityId]);

  const filteredPerformances = React.useMemo(() => {
    return performances.filter(p => filteredEmployees.some(e => e.id === p.employeeId));
  }, [performances, filteredEmployees]);

  const filteredCandidates = React.useMemo(() => {
    return candidates.filter(c => c.entityId === activeEntityId);
  }, [candidates, activeEntityId]);

  const filteredPayrollRecords2026 = React.useMemo(() => {
    return payrollRecords2026.filter(r => filteredEmployees.some(e => e.email.toLowerCase() === r.employeeEmail.toLowerCase()));
  }, [payrollRecords2026, filteredEmployees]);

  // Reset selectedEmployeeId if the employee doesn't belong to the active entity
  React.useEffect(() => {
    if (selectedEmployeeId) {
      const match = currentActiveEmployees.find(e => e.id === selectedEmployeeId);
      if (match && match.entityId !== activeEntityId) {
        const entityEmployees = currentActiveEmployees.filter(e => e.entityId === activeEntityId);
        if (entityEmployees.length > 0) {
          setSelectedEmployeeId(entityEmployees[0].id);
        } else {
          setSelectedEmployeeId('');
        }
      }
    }
  }, [activeEntityId, currentActiveEmployees, selectedEmployeeId]);

  // Persist user entity switching preferences
  React.useEffect(() => {
    if (currentUserEmail && activeEntityId) {
      localStorage.setItem(
        `user_entity_preferences_${currentUserEmail}`,
        JSON.stringify({
          user_id: currentUserEmail,
          last_selected_entity_id: activeEntityId,
          updated_at: new Date().toISOString()
        })
      );
    }
  }, [activeEntityId, currentUserEmail]);

  const handleClearData = async () => {
    setIsSeeding(true);
    try {
      if (isSupabaseConfigured) {
        const tables = [
          'corporate_entities',
          'employees',
          'candidates',
          'performances',
          'payroll_records_2026',
          'audit_logs'
        ];
        for (const table of tables) {
          const { error } = await supabase?.from(table).delete().neq('id', '__keep_empty__') || {};
          if (error) {
            throw new Error(`Supabase ${table} clear failed: ${error.message}`);
          }
        }
      }

      if (isGoogleConfigured) {
        const scriptUrls = Array.from(new Set([
          import.meta.env.VITE_GOOGLE_SCRIPT_URL,
          ...entities.map(entity => entity.googleScriptUrl).filter(Boolean)
        ])) as string[];
        for (const scriptUrl of scriptUrls) {
          await googleSheetsClient.clearData([
            'corporate_entities',
            'employees',
            'candidates',
            'performances',
            'payroll_records_2026',
            'audit_logs'
          ], scriptUrl);
        }
      }

      setEntities([]);
      setEmployees([]);
      setCandidates([]);
      setPerformances([]);
      setReviewCycles([]);
      setPayrollRecords2026([]);

      localStorage.removeItem('offline_entities');
      localStorage.removeItem('offline_employees');
      localStorage.removeItem('offline_performances');
      localStorage.removeItem('offline_review_cycles');
      localStorage.removeItem('offline_candidates');
      localStorage.removeItem('active_corporate_entity_id');
      localStorage.removeItem('company_tax_rate');
      localStorage.removeItem('company_departments');
      localStorage.removeItem('company_roles');
      localStorage.removeItem('preview_employee_portal_access_settings');
      localStorage.removeItem('preview_employee_account_actions');

      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (!key) continue;
        if (
          key.startsWith('active_tab_') ||
          key.startsWith('user_entity_preferences_') ||
          key.startsWith('company_departments_') ||
          key.startsWith('company_roles_') ||
          key.startsWith('leave_requests_') ||
          key.startsWith('leave_configs_') ||
          key.startsWith('employee_portal_') ||
          key.startsWith('employee_portal_demo_') ||
          key.startsWith('performance_appraisal_draft_v1_')
        ) {
          localStorage.removeItem(key);
        }
      }

      setActiveEntityId('');
      setSelectedEmployeeId('');
      triggerNotification(
        'Data Cleared',
        'Personnel, payroll, candidate, performance, audit, and local workspace data has been removed. Authentication and statutory reference data were preserved.'
      );
    } catch (err: any) {
      console.error('[Data Clear] Failed:', err);
      triggerNotification('Clear Failed', `Could not clear data: ${err.message || err}`, 'info');
    } finally {
      setIsSeeding(false);
    }
  };

  // Load session from local storage on mount
  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      // The demo portal is intentionally isolated from every real account.
      // Do not restore a stale admin or employee session into preview mode.
      if (isEmployeePortalDemoPath) return;
      if (localStorage.getItem('hr-nexus-auth') !== 'true') return;

      const storedEmail = localStorage.getItem('hr-nexus-user-email');
      const storedRole = localStorage.getItem('hr-nexus-user-role');
      const accountPreview = new URLSearchParams(window.location.search).get('accountPreview') === '1';

      if (storedRole && isAdminPortalRole(storedRole)) {
        try {
          const response = await fetch('/api/auth/session', {
            credentials: 'include',
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload.user) {
            if (cancelled) return;
            const user = payload.user;
            setIsAuthenticated(true);
            setCurrentUserEmail(user.username || user.email || storedEmail);
            setCurrentUserName(user.name || localStorage.getItem('hr-nexus-user-name'));
            setCurrentUserRole(user.role || storedRole);
            localStorage.removeItem('hr-nexus-user-nickname');
            setCurrentUserMustChangePassword(false);
            return;
          }

          if (!accountPreview) {
            localStorage.removeItem('hr-nexus-auth');
            return;
          }
        } catch (error) {
          console.warn('[Admin Session] Secure session validation unavailable:', error);
          if (!accountPreview) {
            localStorage.removeItem('hr-nexus-auth');
            return;
          }
        }
      }

      if (storedRole && isEmployeePortalRole(storedRole)) {
        const employeeAuthClient = employeeSupabase || supabase;
        if (employeeAuthClient && !isEmployeePortalDemoPath) {
          const { data } = await employeeAuthClient.auth.getUser();
          if (!data.user && !accountPreview) {
            localStorage.removeItem('hr-nexus-auth');
            return;
          }
          if (data.user?.email) {
            try {
              const {
                data: { session },
              } = await employeeAuthClient.auth.getSession();
              if (session?.access_token) {
                const profileResponse = await fetch('/api/employee-auth/profile', {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (profileResponse.ok) {
                  const profile = await profileResponse.json();
                  localStorage.removeItem('hr-nexus-user-nickname');
                  localStorage.setItem(
                    'hr-nexus-user-must-change-password',
                    String(Boolean(profile.mustChangePassword))
                  );
                  if (cancelled) return;
                  setIsAuthenticated(true);
                  setCurrentUserEmail(data.user.email);
                  setCurrentUserName(localStorage.getItem('hr-nexus-user-name'));
                  setCurrentUserRole(storedRole);
                  setCurrentUserMustChangePassword(Boolean(profile.mustChangePassword));
                  return;
                }
              }
            } catch (error) {
              console.warn('[Employee Profile] Secure profile restore unavailable:', error);
              if (!accountPreview) {
                localStorage.removeItem('hr-nexus-auth');
                return;
              }
            }
          }
        }
      }

      if (cancelled) return;
      setIsAuthenticated(true);
      setCurrentUserEmail(storedEmail);
      setCurrentUserName(localStorage.getItem('hr-nexus-user-name'));
      setCurrentUserRole(storedRole);
      setCurrentUserMustChangePassword(
        localStorage.getItem('hr-nexus-user-must-change-password') === 'true'
      );
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [isEmployeePortalDemoPath]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserRole) return;

    const onEmployeePortalPath = window.location.pathname.startsWith('/employee-portal');

    if (isEmployeePortalRole(currentUserRole)) {
      if (!onEmployeePortalPath) {
        setCurrentTab('employee-portal');
        window.history.replaceState({ tab: 'employee-portal' }, '', '/employee-portal');
      }
      return;
    }

    if (isAdminPortalRole(currentUserRole) && onEmployeePortalPath) {
      setCurrentTab('dashboard');
      window.history.replaceState({ tab: 'dashboard' }, '', '/dashboard');
    }
  }, [isAuthenticated, currentUserRole]);

  // Load data from Supabase or Google Sheets dynamically if configured
  useEffect(() => {
    if (!isSupabaseConfigured && !isGoogleConfigured) {
      setIsLoadingDb(false);
      return;
    }

    async function loadData() {
      try {
        let mainPayload: any = null;
        if (isSupabaseConfigured) {
          console.log('[App] Fetching database from Supabase...');
          mainPayload = await withRemoteLoadTimeout(
            supabaseClient.loadData(),
            'Supabase database load'
          );
        } else if (isGoogleConfigured) {
          console.log('[App] Fetching database from Google Sheets...');
          mainPayload = await withRemoteLoadTimeout(
            googleSheetsClient.loadData(),
            'Google Sheets database load'
          );
        }

        if (!mainPayload) {
          setIsLoadingDb(false);
          return;
        }

        // 1. Fetch corporate entities
        let loadedEntities: CorporateEntity[] = [];
        if (mainPayload.corporate_entities) {
          loadedEntities = mainPayload.corporate_entities.map((e: any) => ({
            id: e.id || e.name || '',
            name: e.name || '',
            registrationNumber: e.registrationNumber || '',
            address: e.address || '',
            taxReferenceNo: e.taxReferenceNo || '',
            epfReferenceNo: e.epfReferenceNo || '',
            socsoReferenceNo: e.socsoReferenceNo || '',
            currency: e.currency || 'RM',
            isActive: String(e.isActive) !== 'false' && e.isActive !== false,
            theme: e.theme as any,
            logoUrl: e.logoUrl || '',
            googleScriptUrl: e.googleScriptUrl || ''
          }));
          setEntities(loadedEntities);
        }

        // 1.5. Group and load other payloads from individual scripts
        const payloadsByUrl: Record<string, SheetsDataPayload> = {};
        payloadsByUrl['default'] = mainPayload;

        const customUrlFetchPromises = loadedEntities
          .filter(e => e.googleScriptUrl && e.googleScriptUrl.trim() !== '')
          .map(async (ent) => {
            const url = ent.googleScriptUrl!.trim();
            if (payloadsByUrl[url]) return;
            try {
              console.log(`[Multi-Script] Fetching data for entity ${ent.name} from:`, url);
              const customPayload = await withRemoteLoadTimeout(
                googleSheetsClient.loadData(url),
                `Google Sheets data load for ${ent.name}`
              );
              payloadsByUrl[url] = customPayload;
            } catch (fetchErr) {
              console.error(`[Multi-Script] Failed to load data for entity ${ent.name} from:`, url, fetchErr);
            }
          });

        await Promise.all(customUrlFetchPromises);

        const allRawEmployees: any[] = [];
        const allRawPerformances: any[] = [];
        const allRawPayrollRecords: any[] = [];
        const allRawCandidates: any[] = [];

        for (const [url, payload] of Object.entries(payloadsByUrl)) {
          const isDefault = url === 'default';

          if (payload.employees) {
            payload.employees.forEach((e: any) => {
              allRawEmployees.push(e);
            });
          }

          if (payload.performances) {
            payload.performances.forEach((p: any) => {
              allRawPerformances.push(p);
            });
          }

          if (payload.payroll_records_2026) {
            payload.payroll_records_2026.forEach((r: any) => {
              allRawPayrollRecords.push(r);
            });
          }

          if (payload.candidates) {
            payload.candidates.forEach((c: any) => {
              allRawCandidates.push(c);
            });
          }
        }

        // Deduplicate using Map to ensure zero overlap/duplicate keys
        const uniqueEmployees = Array.from(new Map(allRawEmployees.map(e => [String(e.email || '').toLowerCase(), e])).values());
        const uniquePerformances = Array.from(new Map(allRawPerformances.map(p => [`${String(p.employeeEmail || p.employeeId || '').toLowerCase()}_${p.reviewCycleId}`, p])).values());
        const uniquePayrollRecords = Array.from(new Map(allRawPayrollRecords.map(r => [r.id || `${r.employeeEmail}_${r.payrollMonth}_${r.payrollYear}`, r])).values());
        const uniqueCandidates = Array.from(new Map(allRawCandidates.map(c => [c.id || c.email || c.name, c])).values());

        const parsedEmployees = uniqueEmployees.map((e: any) => {
          let careerHistory = [];
          let dependants = [];
          let historicalPayrollRecords = [];
          let effectiveDatedProfiles = [];
          let historicalPcbResults = [];
          let historicalVariances = [];
          let tp1Declarations = [];
          let tp3Data = undefined;
          let socsoProfile = undefined;
          let employeePcbHistoryLedger = [];
          let employeeTp3Declarations = [];
          
          try {
            if (e.careerHistory && typeof e.careerHistory === 'string') {
              careerHistory = JSON.parse(e.careerHistory);
            } else if (Array.isArray(e.careerHistory)) {
              careerHistory = e.careerHistory;
            }
          } catch (err) {
            console.error('Error parsing career history for employee', e.id, err);
          }
          try {
            if (e.dependants && typeof e.dependants === 'string') {
              dependants = JSON.parse(e.dependants);
            } else if (Array.isArray(e.dependants)) {
              dependants = e.dependants;
            }
          } catch (err) {
            console.error('Error parsing dependants for employee', e.id, err);
          }
          try {
            if (e.historicalPayrollRecords && typeof e.historicalPayrollRecords === 'string') {
              historicalPayrollRecords = JSON.parse(e.historicalPayrollRecords);
            } else if (Array.isArray(e.historicalPayrollRecords)) {
              historicalPayrollRecords = e.historicalPayrollRecords;
            }
          } catch (err) {
            console.error('Error parsing historicalPayrollRecords for employee', e.id, err);
          }
          try {
            if (e.effectiveDatedProfiles && typeof e.effectiveDatedProfiles === 'string') {
              effectiveDatedProfiles = JSON.parse(e.effectiveDatedProfiles);
            } else if (Array.isArray(e.effectiveDatedProfiles)) {
              effectiveDatedProfiles = e.effectiveDatedProfiles;
            }
          } catch (err) {
            console.error('Error parsing effectiveDatedProfiles for employee', e.id, err);
          }
          try {
            if (e.historicalPcbResults && typeof e.historicalPcbResults === 'string') {
              historicalPcbResults = JSON.parse(e.historicalPcbResults);
            } else if (Array.isArray(e.historicalPcbResults)) {
              historicalPcbResults = e.historicalPcbResults;
            }
          } catch (err) {
            console.error('Error parsing historicalPcbResults for employee', e.id, err);
          }
          try {
            if (e.historicalVariances && typeof e.historicalVariances === 'string') {
              historicalVariances = JSON.parse(e.historicalVariances);
            } else if (Array.isArray(e.historicalVariances)) {
              historicalVariances = e.historicalVariances;
            }
          } catch (err) {
            console.error('Error parsing historicalVariances for employee', e.id, err);
          }
          try {
            if (e.tp1Declarations && typeof e.tp1Declarations === 'string') {
              tp1Declarations = JSON.parse(e.tp1Declarations);
            } else if (Array.isArray(e.tp1Declarations)) {
              tp1Declarations = e.tp1Declarations;
            }
          } catch (err) {
            console.error('Error parsing tp1Declarations for employee', e.id, err);
          }
          try {
            if (e.tp3Data && typeof e.tp3Data === 'string') {
              tp3Data = JSON.parse(e.tp3Data);
            } else if (typeof e.tp3Data === 'object' && e.tp3Data !== null) {
              tp3Data = e.tp3Data;
            }
          } catch (err) {
            console.error('Error parsing tp3Data for employee', e.id, err);
          }
          try {
            if (e.socsoProfile && typeof e.socsoProfile === 'string') {
              socsoProfile = JSON.parse(e.socsoProfile);
            } else if (typeof e.socsoProfile === 'object' && e.socsoProfile !== null) {
              socsoProfile = e.socsoProfile;
            }
          } catch (err) {
            console.error('Error parsing socsoProfile for employee', e.id, err);
          }
          try {
            if (e.employeePcbHistoryLedger && typeof e.employeePcbHistoryLedger === 'string') {
              employeePcbHistoryLedger = JSON.parse(e.employeePcbHistoryLedger);
            } else if (Array.isArray(e.employeePcbHistoryLedger)) {
              employeePcbHistoryLedger = e.employeePcbHistoryLedger;
            }
          } catch (err) {
            console.error('Error parsing employeePcbHistoryLedger for employee', e.id, err);
          }
          try {
            if (e.employeeTp3Declarations && typeof e.employeeTp3Declarations === 'string') {
              employeeTp3Declarations = JSON.parse(e.employeeTp3Declarations);
            } else if (Array.isArray(e.employeeTp3Declarations)) {
              employeeTp3Declarations = e.employeeTp3Declarations;
            }
          } catch (err) {
            console.error('Error parsing employeeTp3Declarations for employee', e.id, err);
          }
          let salaryAdjustments = [];
          try {
            if (e.salaryAdjustments && typeof e.salaryAdjustments === 'string') {
              salaryAdjustments = JSON.parse(e.salaryAdjustments);
            } else if (Array.isArray(e.salaryAdjustments)) {
              salaryAdjustments = e.salaryAdjustments;
            }
          } catch (err) {
            console.error('Error parsing salaryAdjustments for employee', e.id, err);
          }
          let resolvedEntityId = e.entityId || e.entityName || '';
          if (!resolvedEntityId) {
            resolvedEntityId = loadedEntities[0]?.id || '';
          }

          return {
            id: e.email || '',
            entityId: resolvedEntityId,
            name: e.name || '',
            email: e.email || '',
            designation: e.designation || '',
            department: e.department || '',
            status: (e.status || 'Active') as any,
            bankName: e.bankName || '',
            accountNo: e.accountNo || '',
            basicSalary: Number(e.basicSalary || 0),
            housingAllowance: Number(e.housingAllowance || 0),
            transportAllowance: Number(e.transportAllowance || 0),
            overtime: Number(e.overtime || 0),
            performanceBonus: Number(e.performanceBonus || 0),
            epfRateEmployee: Number(e.epfRateEmployee !== undefined ? e.epfRateEmployee : 11),
            epfRateEmployer: Number(e.epfRateEmployer !== undefined ? e.epfRateEmployer : 13),
            socsoEmployee: Number(e.socsoEmployee || 0),
            socsoEmployer: Number(e.socsoEmployer || 0),
            eisEmployee: Number(e.eisEmployee || 0),
            eisEmployer: Number(e.eisEmployer || 0),
            taxPcb: Number(e.taxPcb || 0),
            unpaidLeave: Number(e.unpaidLeave || 0),
            hrdCorp: Number(e.hrdCorp || 0),
            avatarUrl: e.avatarUrl || '',
            gender: e.gender || 'Male',
            nricPassport: formatNricOrPassport(e.nricPassport || ''),
            nationality: e.nationality || 'Malaysian',
            contactNumber: e.contactNumber || '',
            taxNumber: e.taxNumber || '',
            epfNumber: e.epfNumber || '',
            employmentType: e.employmentType || 'Confirmation',
            maritalStatus: e.maritalStatus || 'Single',
            eligibleForStatutory: e.eligibleForStatutory || 'Yes',
            contractStatutoryTreatment: e.contractStatutoryTreatment || undefined,
            payrollDocumentDisplaySettings: parseOptionalJson(e.payrollDocumentDisplaySettings),
            emergencyContactName: e.emergencyContactName || '',
            emergencyContactRelation: e.emergencyContactRelation || '',
            emergencyContactPhone: e.emergencyContactPhone || '',
            dateOfJoined: e.dateOfJoined || '',
            dateOfConfirmation: e.dateOfConfirmation || '',
            dateOfTermination: e.dateOfTermination || '',
            careerHistory,
            dependants,
            allowanceGeneral: Number(e.allowanceGeneral || 0),
            allowanceTransport: Number(e.allowanceTransport || 0),
            allowanceParking: Number(e.allowanceParking || 0),
            allowanceMeal: Number(e.allowanceMeal || 0),
            allowanceAccommodation: Number(e.allowanceAccommodation || 0),
            allowancePhone: Number(e.allowancePhone || 0),
            reimbursementAmount: Number(e.reimbursementAmount || 0),
            reimbursementDesc: e.reimbursementDesc || '',
            bonusAmount: Number(e.bonusAmount || 0),
            bonusDesc: e.bonusDesc || '',
            commissionAmount: Number(e.commissionAmount || 0),
            commissionDesc: e.commissionDesc || '',
            backPayAmount: Number(e.backPayAmount || 0),
            backPayDesc: e.backPayDesc || '',
            awsAmount: Number(e.awsAmount || 0),
            awsDesc: e.awsDesc || '',
            compensationAmount: Number(e.compensationAmount || 0),
            compensationDesc: e.compensationDesc || '',
            deductionInLieu: Number(e.deductionInLieu || 0),
            deductionCp38: Number(e.deductionCp38 || 0),
            deductionOthers: Number(e.deductionOthers || 0),
            deductionOthersDesc: e.deductionOthersDesc || '',
            spouseName: e.spouseName || '',
            spouseNric: e.spouseNric || '',
            spouseIsWorking: e.spouseIsWorking || 'No',
            spouseCompany: e.spouseCompany || '',
            spousePosition: e.spousePosition || '',
            hasDependants: e.hasDependants || 'No',
            icFrontUrl: e.icFrontUrl || '',
            icBackUrl: e.icBackUrl || '',
            educationCertUrl: e.educationCertUrl || '',
            skbbkEmployee: Number(e.skbbkEmployee || 0),
            skbbkEmployer: Number(e.skbbkEmployer || 0),
            optInEpf: e.optInEpf !== false,
            optInSocso: e.optInSocso !== false,
            optInEis: e.optInEis !== false,
            optInPcb: e.optInPcb !== false,
            enableLindung24: e.enableLindung24 === true,
            historicalPayrollRecords,
            effectiveDatedProfiles,
            historicalPcbResults,
            historicalVariances,
            tp1Declarations,
            tp3Data,
            salaryAdjustments,
            socsoProfile,
            employee_pcb_history_ledger: employeePcbHistoryLedger,
            employee_tp3_declarations: employeeTp3Declarations
          };
        });
        setEmployees(parsedEmployees);
        const activeLoadedEntityIds = new Set(
          loadedEntities
            .filter(entity => entity.isActive)
            .map(entity => entity.id)
        );
        const savedEntityId = localStorage.getItem('active_corporate_entity_id') || '';
        const savedEntityHasEmployees = parsedEmployees.some(employee => employee.entityId === savedEntityId);
        const firstEntityWithEmployees = loadedEntities.find(entity => (
          entity.isActive &&
          parsedEmployees.some(employee => employee.entityId === entity.id)
        ));
        const nextActiveEntityId = (
          savedEntityId &&
          activeLoadedEntityIds.has(savedEntityId) &&
          (savedEntityHasEmployees || !firstEntityWithEmployees)
        )
          ? savedEntityId
          : (firstEntityWithEmployees?.id || loadedEntities.find(entity => entity.isActive)?.id || loadedEntities[0]?.id || '');
        setActiveEntityId(nextActiveEntityId);
        if (nextActiveEntityId) {
          localStorage.setItem('active_corporate_entity_id', nextActiveEntityId);
        }

        // Parse performances
        setPerformances(uniquePerformances.map((p: any) => ({
          employeeId: p.employeeEmail || p.employeeId || '',
          reviewCycleId: p.reviewCycleId || '',
          managerName: p.managerName || '',
          reviewStatus: p.reviewStatus || 'Not Started',
          rating: Number(p.rating || 0),
          teamworkScore: Number(p.teamworkScore || 0),
          communicationScore: Number(p.communicationScore || 0),
          problemSolvingScore: Number(p.problemSolvingScore || 0),
          selfEvaluation: p.selfEvaluation || '',
          managerComments: p.managerComments || '',
          goals: (() => {
            try {
              if (p.goals && typeof p.goals === 'string') {
                return JSON.parse(p.goals);
              }
              return Array.isArray(p.goals) ? p.goals : [];
            } catch (err) {
              return [];
            }
          })()
        })));

        const parsedCandidates = uniqueCandidates.map((c: any) => {
          let resolvedEntityId = c.entityName || c.entityId || '';
          if (!resolvedEntityId) {
            resolvedEntityId = loadedEntities[0]?.id || '';
          }
          return {
            id: c.id || '',
            name: c.name || '',
            email: c.email || '',
            phone: c.phone || '',
            designation: c.designation || '',
            department: c.department || 'Engineering',
            entityId: resolvedEntityId,
            stage: c.stage as any,
            progress: Number(c.progress || 0),
            dateJoined: c.dateJoined || ''
          };
        });
        setCandidates(parsedCandidates);

        // Parse payroll records
        setPayrollRecords2026(uniquePayrollRecords.map((r: any) => ({
          id: r.id || '',
          employeeEmail: r.employeeEmail || '',
          payrollMonth: Number(r.payrollMonth || 1),
          payrollYear: Number(r.payrollYear || 2026),
          basicSalary: Number(r.basicSalary || 0),
          allowanceGeneral: Number(r.allowanceGeneral || 0),
          allowanceTransport: Number(r.allowanceTransport || 0),
          allowanceParking: Number(r.allowanceParking || 0),
          allowanceMeal: Number(r.allowanceMeal || 0),
          allowanceAccommodation: Number(r.allowanceAccommodation || 0),
          allowancePhone: Number(r.allowancePhone || 0),
          overtime: Number(r.overtime || 0),
          bonusAmount: Number(r.bonusAmount || 0),
          bonusDesc: r.bonusDesc === undefined ? undefined : String(r.bonusDesc || ''),
          commissionAmount: Number(r.commissionAmount || 0),
          commissionDesc: r.commissionDesc === undefined ? undefined : String(r.commissionDesc || ''),
          backPayAmount: Number(r.backPayAmount || 0),
          backPayDesc: r.backPayDesc === undefined ? undefined : String(r.backPayDesc || ''),
          awsAmount: Number(r.awsAmount || 0),
          awsDesc: r.awsDesc === undefined ? undefined : String(r.awsDesc || ''),
          compensationAmount: Number(r.compensationAmount || 0),
          compensationDesc: r.compensationDesc === undefined ? undefined : String(r.compensationDesc || ''),
          reimbursementAmount: Number(r.reimbursementAmount || 0),
          reimbursementDesc: r.reimbursementDesc === undefined ? undefined : String(r.reimbursementDesc || ''),
          unpaidLeave: Number(r.unpaidLeave || 0),
          deductionInLieu: Number(r.deductionInLieu || 0),
          deductionCp38: Number(r.deductionCp38 || 0),
          deductionOthers: Number(r.deductionOthers || 0),
          deductionOthersDesc: r.deductionOthersDesc === undefined ? undefined : String(r.deductionOthersDesc || ''),
          paymentDate: r.paymentDate ? String(r.paymentDate) : undefined,
          payslipDescriptions: (() => {
            return parseOptionalJson(r.payslipDescriptions);
          })(),
          payoutKind: r.payoutKind || 'regular',
          isSeparatePayout: r.isSeparatePayout === true || r.isSeparatePayout === 'true',
          statutoryTreatment: r.statutoryTreatment || undefined,
          payoutTitle: r.payoutTitle === undefined ? undefined : String(r.payoutTitle || ''),
          payoutDescription: r.payoutDescription === undefined ? undefined : String(r.payoutDescription || ''),
          lineNotes: parseOptionalJson(r.lineNotes),
          documentType: r.documentType || undefined,
          compensationLabel: r.compensationLabel || undefined,
          displaySettingsSnapshot: parseOptionalJson(r.displaySettingsSnapshot),
          actualPCBDeducted: Number(r.actualPCBDeducted ?? r.taxPcb ?? 0),
          epfEmployee: Number(r.epfEmployee || 0),
          epfEmployer: Number(r.epfEmployer || 0),
          socsoEmployee: Number(r.socsoEmployee || 0),
          socsoEmployer: Number(r.socsoEmployer || 0),
          lindung24Employee: r.lindung24Employee === undefined ? undefined : Number(r.lindung24Employee || 0),
          eisEmployee: Number(r.eisEmployee || 0),
          eisEmployer: Number(r.eisEmployer || 0),
          hrdCorp: r.hrdCorp === undefined ? undefined : Number(r.hrdCorp || 0),
          netPay: Number(r.netPay || 0),
          createdAt: r.createdAt || ''
        })));
      } catch (err) {
        console.error('[Google Sheets Load] Error loading database tables:', err);
      } finally {
        setIsLoadingDb(false);
      }
    }

    loadData();
  }, []);

  // Active corporate views
  const activeEntity = entities.find(e => e.id === activeEntityId) || entities[0];

  const handleCorporateSwitch = (id: string) => {
    const matched = entities.find(e => e.id === id);
    if (matched) {
      setSwitchingToEntityName(matched.name);
      setIsSwitchingEntity(true);
      localStorage.setItem('active_corporate_entity_id', id);

      // Step 1: Update active entity ID in the background (hidden under solid cover) after mount
      setTimeout(() => {
        setActiveEntityId(id);
        setIsMobileSidebarOpen(false);

        // Step 2: Smoothly dismiss loader after layout updates have settled
        setTimeout(() => {
          setIsSwitchingEntity(false);

          triggerNotification(
            'Corporate View Switched',
            `Now viewing as ${matched.name}. App branding, colors, and logo have synced.`,
            'success'
          );
        }, 300);
      }, 200);
    }
  };

  const handleTabChange = (tab: AppTab, options?: { replace?: boolean; search?: string }) => {
    setCurrentTab(tab);
    if (activeEntityId && tab !== 'payroll-mockup') {
      localStorage.setItem(`active_tab_${activeEntityId}`, tab);
    }

    const search = options?.search
      ? (options.search.startsWith('?') ? options.search : `?${options.search}`)
      : '';
    const nextUrl = `${getPathForAppTab(tab)}${search}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history[options?.replace ? 'replaceState' : 'pushState']({ tab }, '', nextUrl);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const routeTab = getAppTabFromPath(window.location.pathname);
      if (!routeTab) return;

      setCurrentTab(routeTab);
      const employeeId = new URLSearchParams(window.location.search).get('employeeId');
      if (routeTab === 'payslip-viewer' && employeeId) {
        setSelectedEmployeeId(employeeId);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Dynamic Theme style provider
  const getThemeStyles = (_themeName?: 'theme1' | 'theme2' | 'theme3') => ({}) as React.CSSProperties;

  // Global Interactive Settings (State-driven for extra precision)
  const [companyName, setCompanyName] = useState('Acme Global Enterprise');
  const [currencySymbol, setCurrencySymbol] = useState('RM');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState('');
  const [companyTaxReferenceNo, setCompanyTaxReferenceNo] = useState('');
  const [companyEpfReferenceNo, setCompanyEpfReferenceNo] = useState('');
  const [companySocsoReferenceNo, setCompanySocsoReferenceNo] = useState('');
  const [isSavingCompanySettings, setIsSavingCompanySettings] = useState(false);

  const [taxRate, setTaxRate] = useState(() => {
    const saved = localStorage.getItem('company_tax_rate');
    return saved ? Number(saved) : 11;
  });

  // Keep settings states in sync with active subsidiary (activeEntity)
  useEffect(() => {
    if (activeEntity) {
      setCompanyName(activeEntity.name);
      setCurrencySymbol(activeEntity.currency);
      setCompanyAddress(activeEntity.address || '');
      setCompanyRegistrationNumber(activeEntity.registrationNumber || '');
      setCompanyTaxReferenceNo(activeEntity.taxReferenceNo || '');
      setCompanyEpfReferenceNo(activeEntity.epfReferenceNo || '');
      setCompanySocsoReferenceNo(activeEntity.socsoReferenceNo || '');

    }
  }, [activeEntityId, activeEntity]);

  // Restore persisted tab per-entity on entity switch
  useEffect(() => {
    if (activeEntityId) {
      const params = new URLSearchParams(window.location.search);
      if (params.has('form') || params.has('print')) return;

      const routeTab = getAppTabFromPath(window.location.pathname);
      if (routeTab) {
        setCurrentTab(routeTab);
        if (routeTab !== 'payroll-mockup') {
          localStorage.setItem(`active_tab_${activeEntityId}`, routeTab);
        }
        return;
      }

      const persistedTab = localStorage.getItem(`active_tab_${activeEntityId}`);
      if (persistedTab) {
        handleTabChange(persistedTab as AppTab, { replace: true });
      } else {
        handleTabChange('dashboard', { replace: true });
      }
    }
  }, [activeEntityId]);

  // GMT+8 Real-Time Clock
  const [gmt8TimeStr, setGmt8TimeStr] = useState('');
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(now);
      const timeStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(now);
      setGmt8TimeStr(`${dateStr} ${timeStr}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Toast System
  const [toast, setToast] = useState<{ show: boolean; title: string; message: string; type: 'success' | 'info' }>({
    show: false,
    title: '',
    message: '',
    type: 'success'
  });

  // New Request Modal state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestType, setRequestType] = useState('Annual Leave');
  const [requestDesc, setRequestDesc] = useState('');
  const [requestDate, setRequestDate] = useState(() => getGmt8DateString());

  // Trigger toast helper
  const triggerNotification = (title: string, message: string, type: 'success' | 'info' = 'success') => {
    setToast({ show: true, title, message, type });
  };

  // Dismiss toast after timeout
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const getScriptUrlForEntity = (entityNameOrId?: string): string | undefined => {
    if (!entityNameOrId) return undefined;

    const ent = entities.find(e => e.name === entityNameOrId || e.id === entityNameOrId);
    return ent?.googleScriptUrl && ent.googleScriptUrl.trim() !== '' 
      ? ent.googleScriptUrl.trim() 
      : undefined;
  };

  const handleAddCandidate = async (candidateInput: Candidate) => {
    const newCandidate: Candidate = {
      ...candidateInput,
      email: candidateInput.email.trim().toLowerCase(),
      entityId: candidateInput.entityId || activeEntityId || ''
    };

    if (candidates.some(candidate => candidate.email.toLowerCase() === newCandidate.email)) {
      throw new Error('A candidate with this email address already exists.');
    }

    if (isSupabaseConfigured) {
      try {
        await supabaseClient.insert('candidates', newCandidate);
      } catch (err: any) {
        console.error('[Supabase Candidate Insert] Failed:', err);
        throw new Error(`Could not save new candidate to Supabase: ${err.message || err}`);
      }
    } else if (isGoogleConfigured) {
      try {
        const scriptUrl = getScriptUrlForEntity(newCandidate.entityId);
        await googleSheetsClient.insert('candidates', {
          id: newCandidate.id,
          name: newCandidate.name,
          email: newCandidate.email,
          phone: newCandidate.phone,
          designation: newCandidate.designation,
          department: newCandidate.department,
          entityName: entities.find(entity => entity.id === newCandidate.entityId)?.name || newCandidate.entityId,
          stage: newCandidate.stage,
          progress: newCandidate.progress,
          dateJoined: newCandidate.dateJoined
        }, scriptUrl);
      } catch (err) {
        console.error('[Google Sheets Candidate Insert] Failed:', err);
        throw err;
      }
    }

    setCandidates(prev => [...prev, newCandidate]);
  };

  const handleUpdateCandidate = async (id: string, updates: Partial<Candidate>) => {
    if (isSupabaseConfigured) {
      try {
        await supabaseClient.update('candidates', id, updates, 'id');
      } catch (err: any) {
        console.error('[Supabase Candidate Update] Failed:', err);
        throw new Error(`Could not update candidate in Supabase: ${err.message || err}`);
      }
    } else if (isGoogleConfigured) {
      try {
        const candidateObj = candidates.find(c => c.id === id);
        const scriptUrl = getScriptUrlForEntity(updates.entityId || candidateObj?.entityId);
        const payloadUpdates: any = { ...updates };
        if (updates.entityId !== undefined) {
          payloadUpdates.entityName = updates.entityId;
          delete payloadUpdates.entityId;
        }
        await googleSheetsClient.update('candidates', id, payloadUpdates, 'id', scriptUrl);
      } catch (err) {
        console.error('[Google Sheets Candidate Update] Failed:', err);
        throw err;
      }
    }

    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleAddEmployee = async (employeeInput: Employee) => {
    const normalizedEmail = employeeInput.email.trim().toLowerCase();
    const newEmployee: Employee = {
      ...employeeInput,
      id: employeeInput.id === employeeInput.email ? normalizedEmail : employeeInput.id,
      email: normalizedEmail,
      bankName: employeeInput.bankName.trim(),
      nricPassport: formatNricOrPassport(employeeInput.nricPassport),
      entityId: employeeInput.entityId || activeEntityId || ''
    };

    if (employees.some(employee => employee.email.toLowerCase() === newEmployee.email)) {
      throw new Error('An employee with this email address already exists.');
    }

    if (isSupabaseConfigured) {
      try {
        await supabaseClient.insert('employees', newEmployee);
      } catch (err: any) {
        console.error('[Supabase Insert Error]', err);
        triggerNotification('Sync Failed', `Could not save new employee to Supabase: ${err.message || err}`, 'info');
        throw err;
      }

      try {
        await supabaseClient.insert('audit_logs', {
          id: `log_${Date.now()}`,
          employeeEmail: newEmployee.email,
          changedBy: currentUserEmail || 'admin@acme.com',
          changeType: 'CREATE_EMPLOYEE',
          oldValue: '',
          newValue: JSON.stringify(newEmployee),
          createdAt: getGmt8Timestamp()
        });
      } catch (auditError) {
        console.warn('[Supabase Audit Warning] Employee was created but audit logging failed:', auditError);
      }
    } else if (isGoogleConfigured) {
      try {
        const scriptUrl = getScriptUrlForEntity(newEmployee.entityId);
        await googleSheetsClient.insert('employees', {
          entityName: entities.find(entity => entity.id === newEmployee.entityId)?.name || newEmployee.entityId,
          name: newEmployee.name,
          email: newEmployee.email,
          designation: newEmployee.designation,
          department: newEmployee.department,
          status: newEmployee.status,
          bankName: newEmployee.bankName,
          accountNo: newEmployee.accountNo,
          basicSalary: newEmployee.basicSalary,
          housingAllowance: newEmployee.housingAllowance,
          transportAllowance: newEmployee.transportAllowance,
          overtime: newEmployee.overtime,
          performanceBonus: newEmployee.performanceBonus,
          epfRateEmployee: newEmployee.epfRateEmployee,
          epfRateEmployer: newEmployee.epfRateEmployer,
          socsoEmployee: newEmployee.socsoEmployee,
          socsoEmployer: newEmployee.socsoEmployer,
          eisEmployee: newEmployee.eisEmployee,
          eisEmployer: newEmployee.eisEmployer,
          taxPcb: newEmployee.taxPcb,
          unpaidLeave: newEmployee.unpaidLeave,
          hrdCorp: newEmployee.hrdCorp,
          avatarUrl: newEmployee.avatarUrl || '',
          gender: newEmployee.gender || 'Male',
          nricPassport: newEmployee.nricPassport,
          nationality: newEmployee.nationality,
          contactNumber: newEmployee.contactNumber,
          taxNumber: newEmployee.taxNumber,
          epfNumber: newEmployee.epfNumber || '',
          employmentType: newEmployee.employmentType,
          maritalStatus: newEmployee.maritalStatus,
          eligibleForStatutory: newEmployee.eligibleForStatutory || 'Yes',
          contractStatutoryTreatment: newEmployee.contractStatutoryTreatment || '',
          payrollDocumentDisplaySettings: JSON.stringify(newEmployee.payrollDocumentDisplaySettings || {}),
          emergencyContactName: newEmployee.emergencyContactName,
          emergencyContactRelation: newEmployee.emergencyContactRelation,
          emergencyContactPhone: newEmployee.emergencyContactPhone,
          dateOfJoined: newEmployee.dateOfJoined,
          dateOfConfirmation: newEmployee.dateOfConfirmation || '',
          dateOfTermination: newEmployee.dateOfTermination || '',
          allowanceGeneral: newEmployee.allowanceGeneral || 0,
          allowanceTransport: newEmployee.allowanceTransport !== undefined ? newEmployee.allowanceTransport : newEmployee.transportAllowance || 0,
          allowanceParking: newEmployee.allowanceParking || 0,
          allowanceMeal: newEmployee.allowanceMeal || 0,
          allowanceAccommodation: newEmployee.allowanceAccommodation !== undefined ? newEmployee.allowanceAccommodation : newEmployee.housingAllowance || 0,
          allowancePhone: newEmployee.allowancePhone || 0,
          reimbursementAmount: newEmployee.reimbursementAmount || 0,
          reimbursementDesc: newEmployee.reimbursementDesc || '',
          bonusAmount: newEmployee.bonusAmount !== undefined ? newEmployee.bonusAmount : newEmployee.performanceBonus || 0,
          bonusDesc: newEmployee.bonusDesc || '',
          commissionAmount: newEmployee.commissionAmount || 0,
          commissionDesc: newEmployee.commissionDesc || '',
          backPayAmount: newEmployee.backPayAmount || 0,
          backPayDesc: newEmployee.backPayDesc || '',
          awsAmount: newEmployee.awsAmount || 0,
          awsDesc: newEmployee.awsDesc || '',
          compensationAmount: newEmployee.compensationAmount || 0,
          compensationDesc: newEmployee.compensationDesc || '',
          deductionInLieu: newEmployee.deductionInLieu || 0,
          deductionCp38: newEmployee.deductionCp38 || 0,
          deductionOthers: newEmployee.deductionOthers || 0,
          deductionOthersDesc: newEmployee.deductionOthersDesc || '',
          spouseName: newEmployee.spouseName || '',
          spouseNric: newEmployee.spouseNric || '',
          spouseIsWorking: newEmployee.spouseIsWorking || 'No',
          spouseCompany: newEmployee.spouseCompany || '',
          spousePosition: newEmployee.spousePosition || '',
          hasDependants: newEmployee.hasDependants || 'No',
          icFrontUrl: newEmployee.icFrontUrl || '',
          icBackUrl: newEmployee.icBackUrl || '',
          educationCertUrl: newEmployee.educationCertUrl || '',
          skbbkEmployee: newEmployee.skbbkEmployee || 0,
          skbbkEmployer: newEmployee.skbbkEmployer || 0,
          careerHistory: JSON.stringify(newEmployee.careerHistory || []),
          dependants: JSON.stringify(newEmployee.dependants || []),
          salaryAdjustments: JSON.stringify(newEmployee.salaryAdjustments || [])
        }, scriptUrl);

      } catch (err: any) {
        console.error('[Google Sheets Insert] Failed to insert employee:', err);
        triggerNotification('Sync Failed', `Could not save new employee: ${err.message || err}`, 'info');
        throw err;
      }

      try {
        const scriptUrl = getScriptUrlForEntity(newEmployee.entityId);
        await googleSheetsClient.insert('audit_logs', {
          id: `log_${Date.now()}`,
          employeeEmail: newEmployee.email,
          changedBy: currentUserEmail || 'admin@acme.com',
          changeType: 'CREATE_EMPLOYEE',
          oldValue: '',
          newValue: JSON.stringify(newEmployee),
          createdAt: getGmt8Timestamp()
        }, scriptUrl);
      } catch (auditError) {
        console.warn('[Google Sheets Audit Warning] Employee was created but audit logging failed:', auditError);
      }
    }

    setEmployees(prev => [newEmployee, ...prev]);
  };

  const handleDeleteEmployee = async (id: string) => {
    const targetEmp = employees.find(e => e.id === id);
    const lookupKey = targetEmp?.name || id;
    if (!targetEmp) {
      throw new Error('The employee record could not be found.');
    }

    if (isSupabaseConfigured) {
      try {
        await supabaseClient.delete('employees', targetEmp.email || id, 'email');
        try {
          await supabaseClient.insert('audit_logs', {
            id: `log_${Date.now()}`,
            employeeEmail: targetEmp.email || lookupKey,
            changedBy: currentUserEmail || 'admin@acme.com',
            changeType: 'DELETE_EMPLOYEE',
            oldValue: JSON.stringify(targetEmp),
            newValue: '',
            createdAt: getGmt8Timestamp()
          });
        } catch (auditError) {
          console.warn('[Supabase Audit Warning] Employee was deleted but audit logging failed:', auditError);
        }
      } catch (err: any) {
        console.error('[Supabase Delete Error]', err);
        triggerNotification('Delete Failed', `Could not delete employee from Supabase: ${err.message || err}`, 'info');
        throw err;
      }
    } else if (isGoogleConfigured) {
      try {
        const scriptUrl = getScriptUrlForEntity(targetEmp?.entityId);
        await googleSheetsClient.delete('employees', lookupKey, 'name', scriptUrl);

        await googleSheetsClient.insert('audit_logs', {
          id: `log_${Date.now()}`,
          employeeEmail: lookupKey,
          changedBy: currentUserEmail || 'admin@acme.com',
          changeType: 'DELETE_EMPLOYEE',
          oldValue: `Employee Email: ${lookupKey}`,
          newValue: '',
          createdAt: getGmt8Timestamp()
        }, scriptUrl);
      } catch (err) {
        console.error('[Google Sheets Delete] Failed to delete employee:', err);
        throw err;
      }
    }

    setEmployees(prev => prev.filter(e => e.id !== id));
    setPerformances(prev => prev.filter(p => p.employeeId !== id));
  };

  const handleUpdateEmployeeSalary = async (id: string, updates: Partial<Employee>) => {
    if (updates.nricPassport !== undefined) {
      updates = { ...updates, nricPassport: formatNricOrPassport(updates.nricPassport) };
    }
    const oldEmp = employees.find(e => e.id?.toLowerCase() === id?.toLowerCase() || e.email?.toLowerCase() === id?.toLowerCase());
    if (!oldEmp) {
      throw new Error('The employee record could not be found.');
    }

    if (isSupabaseConfigured) {
      try {
        await supabaseClient.update('employees', id, updates, 'id');
        try {
          await supabaseClient.insert('audit_logs', {
            id: `log_${Date.now()}`,
            employeeEmail: oldEmp.email || id,
            changedBy: currentUserEmail || 'admin@acme.com',
            changeType: 'UPDATE_EMPLOYEE',
            oldValue: JSON.stringify(oldEmp),
            newValue: JSON.stringify(updates),
            createdAt: getGmt8Timestamp()
          });
        } catch (auditError) {
          console.warn('[Supabase Audit Warning] Employee was updated but audit logging failed:', auditError);
        }
      } catch (err: any) {
        console.error('[Supabase Update Error]', err);
        triggerNotification('Sync Failed', `Could not update employee in Supabase: ${err.message || err}`, 'info');
        throw err;
      }
    } else if (isGoogleConfigured) {
      try {
        const payloadUpdates: any = {};
        if (updates.name !== undefined) payloadUpdates.name = updates.name;
        if (updates.designation !== undefined) payloadUpdates.designation = updates.designation;
        if (updates.department !== undefined) payloadUpdates.department = updates.department;
        if (updates.email !== undefined) payloadUpdates.email = updates.email;
        if (updates.basicSalary !== undefined) payloadUpdates.basicSalary = updates.basicSalary;
        if (updates.bankName !== undefined) payloadUpdates.bankName = updates.bankName;
        if (updates.accountNo !== undefined) payloadUpdates.accountNo = updates.accountNo;
        if (updates.epfRateEmployee !== undefined) payloadUpdates.epfRateEmployee = updates.epfRateEmployee;
        if (updates.epfRateEmployer !== undefined) payloadUpdates.epfRateEmployer = updates.epfRateEmployer;
        if (updates.socsoEmployee !== undefined) payloadUpdates.socsoEmployee = updates.socsoEmployee;
        if (updates.socsoEmployer !== undefined) payloadUpdates.socsoEmployer = updates.socsoEmployer;
        if (updates.eisEmployee !== undefined) payloadUpdates.eisEmployee = updates.eisEmployee;
        if (updates.eisEmployer !== undefined) payloadUpdates.eisEmployer = updates.eisEmployer;
        if (updates.taxPcb !== undefined) payloadUpdates.taxPcb = updates.taxPcb;
        if (updates.unpaidLeave !== undefined) payloadUpdates.unpaidLeave = updates.unpaidLeave;
        if (updates.status !== undefined) payloadUpdates.status = updates.status;
        if (updates.entityId !== undefined) payloadUpdates.entityName = updates.entityId;
        if (updates.avatarUrl !== undefined) payloadUpdates.avatarUrl = updates.avatarUrl;
        if (updates.gender !== undefined) payloadUpdates.gender = updates.gender;
        if (updates.nricPassport !== undefined) payloadUpdates.nricPassport = updates.nricPassport;
        if (updates.nationality !== undefined) payloadUpdates.nationality = updates.nationality;
        if (updates.contactNumber !== undefined) payloadUpdates.contactNumber = updates.contactNumber;
        if (updates.taxNumber !== undefined) payloadUpdates.taxNumber = updates.taxNumber;
        if (updates.epfNumber !== undefined) payloadUpdates.epfNumber = updates.epfNumber;
        if (updates.employmentType !== undefined) payloadUpdates.employmentType = updates.employmentType;
        if (updates.maritalStatus !== undefined) payloadUpdates.maritalStatus = updates.maritalStatus;
        if (updates.eligibleForStatutory !== undefined) payloadUpdates.eligibleForStatutory = updates.eligibleForStatutory;
        if (updates.contractStatutoryTreatment !== undefined) payloadUpdates.contractStatutoryTreatment = updates.contractStatutoryTreatment;
        if (updates.payrollDocumentDisplaySettings !== undefined) payloadUpdates.payrollDocumentDisplaySettings = JSON.stringify(updates.payrollDocumentDisplaySettings);
        if (updates.emergencyContactName !== undefined) payloadUpdates.emergencyContactName = updates.emergencyContactName;
        if (updates.emergencyContactRelation !== undefined) payloadUpdates.emergencyContactRelation = updates.emergencyContactRelation;
        if (updates.emergencyContactPhone !== undefined) payloadUpdates.emergencyContactPhone = updates.emergencyContactPhone;
        if (updates.dateOfJoined !== undefined) payloadUpdates.dateOfJoined = updates.dateOfJoined;
        if (updates.dateOfConfirmation !== undefined) payloadUpdates.dateOfConfirmation = updates.dateOfConfirmation;
        if (updates.dateOfTermination !== undefined) payloadUpdates.dateOfTermination = updates.dateOfTermination;
        if (updates.housingAllowance !== undefined) payloadUpdates.housingAllowance = updates.housingAllowance;
        if (updates.transportAllowance !== undefined) payloadUpdates.transportAllowance = updates.transportAllowance;
        if (updates.overtime !== undefined) payloadUpdates.overtime = updates.overtime;
        if (updates.performanceBonus !== undefined) payloadUpdates.performanceBonus = updates.performanceBonus;
        if (updates.allowanceGeneral !== undefined) payloadUpdates.allowanceGeneral = updates.allowanceGeneral;
        if (updates.allowanceTransport !== undefined) payloadUpdates.allowanceTransport = updates.allowanceTransport;
        if (updates.allowanceParking !== undefined) payloadUpdates.allowanceParking = updates.allowanceParking;
        if (updates.allowanceMeal !== undefined) payloadUpdates.allowanceMeal = updates.allowanceMeal;
        if (updates.allowanceAccommodation !== undefined) payloadUpdates.allowanceAccommodation = updates.allowanceAccommodation;
        if (updates.allowancePhone !== undefined) payloadUpdates.allowancePhone = updates.allowancePhone;
        if (updates.reimbursementAmount !== undefined) payloadUpdates.reimbursementAmount = updates.reimbursementAmount;
        if (updates.reimbursementDesc !== undefined) payloadUpdates.reimbursementDesc = updates.reimbursementDesc;
        if (updates.bonusAmount !== undefined) payloadUpdates.bonusAmount = updates.bonusAmount;
        if (updates.bonusDesc !== undefined) payloadUpdates.bonusDesc = updates.bonusDesc;
        if (updates.commissionAmount !== undefined) payloadUpdates.commissionAmount = updates.commissionAmount;
        if (updates.commissionDesc !== undefined) payloadUpdates.commissionDesc = updates.commissionDesc;
        if (updates.backPayAmount !== undefined) payloadUpdates.backPayAmount = updates.backPayAmount;
        if (updates.backPayDesc !== undefined) payloadUpdates.backPayDesc = updates.backPayDesc;
        if (updates.awsAmount !== undefined) payloadUpdates.awsAmount = updates.awsAmount;
        if (updates.awsDesc !== undefined) payloadUpdates.awsDesc = updates.awsDesc;
        if (updates.compensationAmount !== undefined) payloadUpdates.compensationAmount = updates.compensationAmount;
        if (updates.compensationDesc !== undefined) payloadUpdates.compensationDesc = updates.compensationDesc;
        if (updates.deductionInLieu !== undefined) payloadUpdates.deductionInLieu = updates.deductionInLieu;
        if (updates.deductionCp38 !== undefined) payloadUpdates.deductionCp38 = updates.deductionCp38;
        if (updates.deductionOthers !== undefined) payloadUpdates.deductionOthers = updates.deductionOthers;
        if (updates.deductionOthersDesc !== undefined) payloadUpdates.deductionOthersDesc = updates.deductionOthersDesc;
        if (updates.spouseName !== undefined) payloadUpdates.spouseName = updates.spouseName;
        if (updates.spouseNric !== undefined) payloadUpdates.spouseNric = updates.spouseNric;
        if (updates.spouseIsWorking !== undefined) payloadUpdates.spouseIsWorking = updates.spouseIsWorking;
        if (updates.spouseCompany !== undefined) payloadUpdates.spouseCompany = updates.spouseCompany;
        if (updates.spousePosition !== undefined) payloadUpdates.spousePosition = updates.spousePosition;
        if (updates.hasDependants !== undefined) payloadUpdates.hasDependants = updates.hasDependants;
        if (updates.icFrontUrl !== undefined) payloadUpdates.icFrontUrl = updates.icFrontUrl;
        if (updates.icBackUrl !== undefined) payloadUpdates.icBackUrl = updates.icBackUrl;
        if (updates.educationCertUrl !== undefined) payloadUpdates.educationCertUrl = updates.educationCertUrl;
        if (updates.skbbkEmployee !== undefined) payloadUpdates.skbbkEmployee = updates.skbbkEmployee;
        if (updates.skbbkEmployer !== undefined) payloadUpdates.skbbkEmployer = updates.skbbkEmployer;
        if (updates.optInEpf !== undefined) payloadUpdates.optInEpf = updates.optInEpf;
        if (updates.optInSocso !== undefined) payloadUpdates.optInSocso = updates.optInSocso;
        if (updates.optInEis !== undefined) payloadUpdates.optInEis = updates.optInEis;
        if (updates.optInPcb !== undefined) payloadUpdates.optInPcb = updates.optInPcb;
        if (updates.enableLindung24 !== undefined) payloadUpdates.enableLindung24 = updates.enableLindung24;
        if (updates.careerHistory !== undefined) payloadUpdates.careerHistory = JSON.stringify(updates.careerHistory);
        if (updates.dependants !== undefined) payloadUpdates.dependants = JSON.stringify(updates.dependants);
        if (updates.historicalPayrollRecords !== undefined) payloadUpdates.historicalPayrollRecords = JSON.stringify(updates.historicalPayrollRecords);
        if (updates.effectiveDatedProfiles !== undefined) payloadUpdates.effectiveDatedProfiles = JSON.stringify(updates.effectiveDatedProfiles);
        if (updates.historicalPcbResults !== undefined) payloadUpdates.historicalPcbResults = JSON.stringify(updates.historicalPcbResults);
        if (updates.historicalVariances !== undefined) payloadUpdates.historicalVariances = JSON.stringify(updates.historicalVariances);
        if (updates.tp1Declarations !== undefined) payloadUpdates.tp1Declarations = JSON.stringify(updates.tp1Declarations);
        if (updates.tp3Data !== undefined) payloadUpdates.tp3Data = JSON.stringify(updates.tp3Data);
        if (updates.salaryAdjustments !== undefined) payloadUpdates.salaryAdjustments = JSON.stringify(updates.salaryAdjustments);

        const lookupKey = oldEmp?.email || oldEmp?.name || oldEmp?.id || id;
        const keyField = oldEmp?.email ? 'email' : (oldEmp?.name ? 'name' : 'id');
        const scriptUrl = getScriptUrlForEntity(updates.entityId || oldEmp?.entityId);
        await googleSheetsClient.update('employees', lookupKey, payloadUpdates, keyField, scriptUrl);

        await googleSheetsClient.insert('audit_logs', {
          id: `log_${Date.now()}`,
          employeeEmail: lookupKey,
          changedBy: currentUserEmail || 'admin@acme.com',
          changeType: 'UPDATE_EMPLOYEE',
          oldValue: JSON.stringify(oldEmp),
          newValue: JSON.stringify(updates),
          createdAt: getGmt8Timestamp()
        }, scriptUrl);
      } catch (err: any) {
        console.error('[Google Sheets Update] Failed to update employee:', err);
        triggerNotification('Sync Failed', `Could not update employee: ${err.message || err}`, 'info');
        throw err;
      }
    }

    setEmployees(prev => prev.map(e => {
      const matches = e.id?.toLowerCase() === id?.toLowerCase() || e.email?.toLowerCase() === id?.toLowerCase();
      if (!matches) return e;
      const nextId = updates.email && e.id === e.email ? updates.email : e.id;
      return { ...e, ...updates, id: nextId };
    }));
  };

  const handleSavePayrollRecord2026 = async (record: PayrollRecord2026) => {
    const payrollEmployee = employees.find(e => e.email?.toLowerCase() === record.employeeEmail?.toLowerCase());
    const documentProfile = payrollEmployee ? getPayrollDocumentProfile(payrollEmployee) : null;
    const recordToSave: PayrollRecord2026 = {
      ...record,
      documentType: record.documentType || documentProfile?.documentType,
      compensationLabel: record.compensationLabel || documentProfile?.compensationLabel,
      displaySettingsSnapshot: record.displaySettingsSnapshot || (payrollEmployee ? getPayrollDocumentDisplaySettings(payrollEmployee) : undefined)
    };

    if (isSupabaseConfigured) {
      try {
        await supabaseClient.upsert('payroll_records_2026', {
          ...recordToSave,
          taxPcb: recordToSave.actualPCBDeducted,
          netSalary: recordToSave.netPay
        });
        console.log('[Supabase] Saved payroll record successfully:', record.id);
      } catch (err: any) {
        console.error('[Supabase] Failed to save payroll record 2026:', err);
        triggerNotification('Sync Failed', `Could not save payroll record: ${err.message || err}`, 'info');
        throw err;
      }
    } else if (isGoogleConfigured) {
      try {
        const scriptUrl = getScriptUrlForEntity(payrollEmployee?.entityId);
        const sheetRecord = {
          ...recordToSave,
          payslipDescriptions: JSON.stringify(recordToSave.payslipDescriptions || {}),
          lineNotes: JSON.stringify(recordToSave.lineNotes || {}),
          displaySettingsSnapshot: JSON.stringify(recordToSave.displaySettingsSnapshot || {})
        };
        try {
          await googleSheetsClient.update('payroll_records_2026', recordToSave.id, sheetRecord, 'id', scriptUrl);
          console.log('[Google Sheets] Updated payroll record successfully:', recordToSave.id);
        } catch (updateErr: any) {
          console.warn('[Google Sheets] Update failed or record not found, inserting:', updateErr);
          await googleSheetsClient.insert('payroll_records_2026', sheetRecord, scriptUrl);
          console.log('[Google Sheets] Inserted payroll record successfully:', record.id);
        }
      } catch (err: any) {
        console.error('[Google Sheets] Failed to save payroll record 2026:', err);
        triggerNotification('Sync Failed', `Could not save payroll record: ${err.message || err}`, 'info');
        throw err;
      }
    }

    setPayrollRecords2026(prev => mergePayrollRecords2026(prev, recordToSave));
  };

  const handleSavePerformance = async (updatedPerf: EmployeePerformance) => {
    setPerformances(prev => {
      const exists = prev.some(p => p.employeeId === updatedPerf.employeeId && p.reviewCycleId === updatedPerf.reviewCycleId);
      if (exists) {
        return prev.map(p => (p.employeeId === updatedPerf.employeeId && p.reviewCycleId === updatedPerf.reviewCycleId) ? updatedPerf : p);
      } else {
        return [updatedPerf, ...prev];
      }
    });

    if (isSupabaseConfigured) {
      try {
        await supabaseClient.upsert('performances', updatedPerf);
      } catch (err: any) {
        console.error('[Supabase Save Performance] Failed:', err);
      }
    } else if (isGoogleConfigured) {
      try {
        const emp = employees.find(e => e.email?.toLowerCase() === updatedPerf.employeeId?.toLowerCase());
        const scriptUrl = getScriptUrlForEntity(emp?.entityId);
        const payloadPerf = {
          employeeEmail: updatedPerf.employeeId,
          reviewCycleId: updatedPerf.reviewCycleId,
          managerName: updatedPerf.managerName,
          reviewStatus: updatedPerf.reviewStatus,
          rating: updatedPerf.rating,
          teamworkScore: updatedPerf.teamworkScore,
          communicationScore: updatedPerf.communicationScore,
          problemSolvingScore: updatedPerf.problemSolvingScore,
          selfEvaluation: updatedPerf.selfEvaluation,
          managerComments: updatedPerf.managerComments,
          goals: JSON.stringify(updatedPerf.goals)
        };

        await googleSheetsClient.upsert('performances', {
          employeeEmail: updatedPerf.employeeId,
          reviewCycleId: updatedPerf.reviewCycleId
        }, payloadPerf, scriptUrl);
      } catch (err) {
        console.error('[Google Sheets Save Performance] Failed:', err);
      }
    }
  };

  const handleAddEntity = async (newEntity: CorporateEntity) => {
    setEntities(prev => [...prev, newEntity]);

    if (isSupabaseConfigured) {
      try {
        await supabaseClient.insert('corporate_entities', newEntity);
      } catch (err: any) {
        console.error('[Supabase Entity Insert] Failed:', err);
        triggerNotification('Sync Failed', `Could not save new entity to Supabase: ${err.message || err}`, 'info');
      }
    } else if (isGoogleConfigured) {
      try {
        await googleSheetsClient.insert('corporate_entities', {
          name: newEntity.name,
          registrationNumber: newEntity.registrationNumber,
          address: newEntity.address,
          taxReferenceNo: newEntity.taxReferenceNo,
          epfReferenceNo: newEntity.epfReferenceNo,
          socsoReferenceNo: newEntity.socsoReferenceNo,
          currency: newEntity.currency,
          isActive: newEntity.isActive,
          theme: newEntity.theme,
          logoUrl: newEntity.logoUrl || '',
          googleScriptUrl: newEntity.googleScriptUrl || ''
        });
      } catch (err: any) {
        console.error('[Google Sheets Entity Insert] Failed:', err);
        triggerNotification('Sync Failed', `Could not save new entity: ${err.message || err}`, 'info');
      }
    }
  };

  const handleUpdateEntity = async (id: string, updates: Partial<CorporateEntity>) => {
    // Resolve the original company name to use as lookup key in Google Sheets
    const existingEntity = entities.find(ent => ent.id === id);
    const lookupName = existingEntity ? existingEntity.name : id;

    if (isSupabaseConfigured) {
      try {
        await supabaseClient.update('corporate_entities', id, updates, 'id');
      } catch (err: any) {
        console.error('[Supabase Entity Update] Failed:', err);
        throw new Error(`Could not update company details in Supabase: ${err.message || err}`);
      }
    } else if (isGoogleConfigured) {
      try {
        const payloadUpdates: any = {};
        if (updates.name !== undefined) payloadUpdates.name = updates.name;
        if (updates.registrationNumber !== undefined) payloadUpdates.registrationNumber = updates.registrationNumber;
        if (updates.address !== undefined) payloadUpdates.address = updates.address;
        if (updates.taxReferenceNo !== undefined) payloadUpdates.taxReferenceNo = updates.taxReferenceNo;
        if (updates.epfReferenceNo !== undefined) payloadUpdates.epfReferenceNo = updates.epfReferenceNo;
        if (updates.socsoReferenceNo !== undefined) payloadUpdates.socsoReferenceNo = updates.socsoReferenceNo;
        if (updates.currency !== undefined) payloadUpdates.currency = updates.currency;
        if (updates.isActive !== undefined) payloadUpdates.isActive = updates.isActive;
        if (updates.theme !== undefined) payloadUpdates.theme = updates.theme;
        if (updates.logoUrl !== undefined) payloadUpdates.logoUrl = updates.logoUrl;
        if (updates.googleScriptUrl !== undefined) payloadUpdates.googleScriptUrl = updates.googleScriptUrl;

        await googleSheetsClient.update('corporate_entities', lookupName, payloadUpdates, 'name');
      } catch (err: any) {
        console.error('[Google Sheets Entity Update] Failed:', err);
        throw new Error(`Could not update company details: ${err.message || err}`);
      }
    }

    setEntities(prev => prev.map(ent => (
      ent.id === id ? { ...ent, ...updates } : ent
    )));
  };

  // Navigate to document utility
  const handleNavigateToDocument = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    handleTabChange('payslip-viewer', {
      search: new URLSearchParams({ employeeId }).toString()
    });
  };

  // New request submission
  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestDesc.trim()) {
      triggerNotification('Request Error', 'Please specify details for your administrative request.', 'info');
      return;
    }
    setIsRequestModalOpen(false);
    setRequestDesc('');
    triggerNotification(
      'Request Submitted',
      `Your administrative request for ${requestType} on ${requestDate} is queued for Director approval.`
    );
  };

  // The demo URL is always a local preview, even if another tab left a real
  // account session in localStorage.
  const isEmployeePortalPreview = isEmployeePortalDemoPath;
  const employeePortalSessionEmail = String(currentUserEmail || '').toLowerCase();
  const employeePortalDemoEmployee = getCurrentActiveEmployees(employees).find(employee =>
    employee.id === employeePortalQueryEmployeeId ||
    employee.email.toLowerCase() === employeePortalQueryEmployeeId.toLowerCase()
  ) || getCurrentActiveEmployees(employees)[0] || null;
  const employeePortalLiveEmployee = isEmployeeAccount
    ? (
      currentActiveEmployees.find(employee => employee.email.toLowerCase() === employeePortalSessionEmail) ||
      getCurrentActiveEmployees(employees).find(employee => employee.email.toLowerCase() === employeePortalSessionEmail) ||
      null
    )
    : null;
  const employeePortalEmployee = isEmployeePortalPreview
    ? employeePortalDemoEmployee
    : employeePortalLiveEmployee;
  const employeePortalEmployeeEmail = String(employeePortalEmployee?.email || '').toLowerCase();
  const employeePortalEmployees = employeePortalEmployee ? [employeePortalEmployee] : [];
  const employeePortalEntitiesSource = entities;
  const employeePortalEntity = employeePortalEmployee
    ? (
      employeePortalEntitiesSource.find(entity => entity.id === employeePortalEmployee.entityId) ||
      entities.find(entity => entity.id === employeePortalEmployee.entityId)
    )
    : null;
  const employeePortalEntities = employeePortalEntity ? [employeePortalEntity] : employeePortalEntitiesSource;
  const employeePortalPayrollRecords = employeePortalEmployeeEmail
    ? payrollRecords2026.filter(record => record.employeeEmail.toLowerCase() === employeePortalEmployeeEmail)
    : [];
  const employeePortalEmployeeKeys = new Set(
    [employeePortalEmployee?.id, employeePortalEmployee?.email]
      .filter(Boolean)
      .map(value => String(value).toLowerCase())
  );
  const employeePortalPerformances = performances
    .filter(performance => employeePortalEmployeeKeys.has(performance.employeeId.toLowerCase()));
  const employeePortalReviewCycles = reviewCycles;
  const shouldRenderEmployeePortal = isEmployeePortalPreview || (isAuthenticated && isEmployeeAccount);
  const handleEmployeePortalUpdateEmployee = async (id: string, updates: Partial<Employee>) => {
    const normalizedId = id.toLowerCase();
    const existingEmployee = employees.find(employee =>
      employee.id.toLowerCase() === normalizedId ||
      employee.email.toLowerCase() === normalizedId
    );
    if (existingEmployee) {
      await handleUpdateEmployeeSalary(id, updates);
      return;
    }

    const fallbackEmployee = getCurrentActiveEmployees(employees).find(employee =>
      employee.id.toLowerCase() === normalizedId ||
      employee.email.toLowerCase() === normalizedId
    );
    if (!fallbackEmployee) {
      throw new Error('The employee record could not be found.');
    }

    setEmployees(prev => [{ ...fallbackEmployee, ...updates }, ...prev]);
  };

  if (isLoadingDb && !shouldRenderEmployeePortal) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-mono font-bold text-on-surface uppercase tracking-widest animate-pulse">Synchronizing HR Database...</p>
        </div>
      </div>
    );
  }

  if (isPrintMode) {
    const params = new URLSearchParams(window.location.search);
    const empId = params.get('employeeId') || selectedEmployeeId;
    return (
      <div style={getThemeStyles(activeEntity?.theme)} className="bg-white min-h-screen p-0">
        <PayslipDocumentView 
          employees={currentActiveEmployees}
          selectedEmployeeId={empId}
          onBack={() => {}}
          onShowNotification={() => {}}
          activeEntity={activeEntity}
          isPrintView={true}
          userRole={currentUserRole || 'Global Administrator'}
          entities={entities}
          allEmployeesForHrdCorp={currentActiveEmployees}
        />
      </div>
    );
  }

  const isJobApplyMode = window.location.search.includes('form=job-apply');
  const isOnboardingMode = window.location.search.includes('form=onboarding');

  if (isJobApplyMode) {
    return (
      <div style={getThemeStyles(activeEntity?.theme)} className="min-h-screen bg-neutral-100 flex items-center justify-center p-4 md:p-8 select-text overflow-y-auto">
        <div className="w-full max-w-4xl bg-white border border-neutral-border rounded-xl shadow-md p-2">
          <JobApplicationForm 
            onShowNotification={triggerNotification}
            onApplicationSubmit={handleAddCandidate}
          />
        </div>
      </div>
    );
  }

  if (isOnboardingMode) {
    return (
      <div style={getThemeStyles(activeEntity?.theme)} className="min-h-screen bg-neutral-100 flex items-center justify-center p-4 md:p-8 select-text overflow-y-auto">
        <div className="w-full max-w-4xl bg-white border border-neutral-border rounded-xl shadow-md p-2">
          <OnboardingForm 
            candidates={candidates}
            entities={entities}
            onShowNotification={triggerNotification}
            onOnboardingComplete={handleAddEmployee}
            onAdvanceCandidateStage={(id, stage) => handleUpdateCandidate(id, { stage, progress: 100 })}
          />
        </div>
      </div>
    );
  }

  if (globalError) {
    return (
      <div className="min-h-screen bg-inverse-surface text-inverse-on-surface p-6 font-mono text-left flex flex-col justify-start gap-4">
        <div className="bg-error/15 border border-error rounded p-5 space-y-3">
          <h1 className="text-lg font-bold text-error flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Application Crash Detected
          </h1>
          <p className="text-sm font-semibold">{globalError.message}</p>
          {globalError.stack && (
            <pre className="text-xs bg-black/40 p-4 rounded overflow-x-auto max-h-96 whitespace-pre-wrap leading-relaxed select-text border border-white/5">
              {globalError.stack}
            </pre>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="px-4 py-2 bg-tertiary hover:bg-tertiary/90 text-white rounded text-sm font-semibold cursor-pointer"
          >
            Clear Caches & Reset App
          </button>
          <button
            onClick={() => {
              setGlobalError(null);
              window.location.reload();
            }}
            className="px-4 py-2 bg-white hover:bg-surface-container text-on-background rounded text-sm font-semibold cursor-pointer"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isEmployeePortalPreview) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const needsPasswordSetup = isAuthenticated && isEmployeeAccount && currentUserMustChangePassword;

  if (needsPasswordSetup) {
    return (
      <div className="min-h-screen bg-inverse-surface flex items-center justify-center p-4 font-sans relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-full pointer-events-none opacity-20">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full text-primary fill-current">
            <path d="M0,0 C50,30 20,70 0,100 Z" />
          </svg>
        </div>
        <div className="absolute bottom-0 right-0 w-96 h-64 pointer-events-none opacity-20">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full text-primary fill-current">
            <path d="M100,100 C60,80 80,30 100,0 Z" />
          </svg>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center relative z-10 border border-neutral-border">
          <h2 className="text-xl font-bold text-on-background mb-2">Welcome, {currentUserName}!</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            Set a new password before entering the employee portal.
          </p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement | null)?.value || '';
            const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement | null)?.value || '';

            if (newPassword.length < 8) {
              triggerNotification('Password Required', 'Your new password must be at least 8 characters.', 'info');
              return;
            }
            if (newPassword !== confirmPassword) {
              triggerNotification('Password Mismatch', 'The new password and confirmation do not match.', 'info');
              return;
            }

            const employeeAuthClient = employeeSupabase || supabase;
            if (employeeAuthClient) {
              const { error: passwordError } = await employeeAuthClient.auth.updateUser({
                password: newPassword,
                data: {
                  must_change_password: false,
                },
              });
              if (passwordError) {
                triggerNotification('Setup Failed', passwordError.message, 'info');
                return;
              }

              const {
                data: { session },
              } = await employeeAuthClient.auth.getSession();
              if (session?.access_token) {
                const setupResponse = await fetch('/api/employee-auth/complete-setup', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                });
                if (!setupResponse.ok) {
                  const setupPayload = await setupResponse.json().catch(() => ({}));
                  triggerNotification(
                    'Setup Sync Failed',
                    setupPayload.error || 'Your password was updated, but the employee account status could not be synchronized.',
                    'info'
                  );
                  return;
                }
              }
            }

            localStorage.setItem('hr-nexus-user-must-change-password', 'false');
            setCurrentUserMustChangePassword(false);
          }}>
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              placeholder="New password"
            className="w-full h-12 px-4 bg-white border border-neutral-border rounded-xl text-sm text-on-background mb-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all text-center"
            />
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              placeholder="Confirm new password"
            className="w-full h-12 px-4 bg-white border border-neutral-border rounded-xl text-sm text-on-background mb-4 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all text-center"
            />
            <button type="submit" className="w-full h-12 bg-primary hover:bg-primary-container text-white font-semibold rounded-xl shadow-md shadow-primary/20 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50">
              Save New Password
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (shouldRenderEmployeePortal) {
    return (
      <ErrorBoundary onError={(err) => setGlobalError({ message: err.message, stack: err.stack })}>
        <EmployeePortalView
          employees={employeePortalEmployees}
          payrollRecords2026={employeePortalPayrollRecords}
          entities={employeePortalEntities}
          performances={employeePortalPerformances}
          reviewCycles={employeePortalReviewCycles}
          currentUserName={isEmployeePortalPreview ? employeePortalEmployee?.name || 'Employee' : currentUserName}
          currentUserEmail={isEmployeePortalPreview ? employeePortalEmployee?.email || 'employee@redpoint.com' : currentUserEmail}
          currentUserRole={isEmployeePortalPreview ? 'Employee' : currentUserRole}
          onShowNotification={triggerNotification}
          onUpdateEmployee={isEmployeePortalPreview ? async () => {} : handleEmployeePortalUpdateEmployee}
          onSavePerformance={isEmployeePortalPreview ? () => {} : handleSavePerformance}
          onSignOut={handleSignOut}
          isPreviewMode={isEmployeePortalPreview}
          previewEmployeeId={isEmployeePortalPreview ? employeePortalEmployee?.id || employeePortalQueryEmployeeId : undefined}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary onError={(err) => setGlobalError({ message: err.message, stack: err.stack })}>
      <EntityContextProvider
        entities={entities}
        activeEntityId={activeEntityId}
        isSwitchingEntity={isSwitchingEntity}
        onSwitchEntity={async (id) => handleCorporateSwitch(id)}
      >
      <div style={getThemeStyles(activeEntity?.theme)} className="flex h-screen bg-background overflow-hidden relative font-sans text-on-background select-none">
      
      {/* Premium Glassmorphic Loading Overlay */}
      {isSwitchingEntity && (
        <div className="fixed inset-0 bg-inverse-surface z-[9999] flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in font-sans">
          <div className="relative flex flex-col items-center max-w-md w-full animate-fade-in">
            {/* Double Rotating Glowing Rings */}
            <div className="relative w-28 h-28 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-b-transparent border-primary/20 animate-spin-slow"></div>
              <div className="absolute inset-2 rounded-full border-4 border-r-transparent border-l-transparent border-primary animate-spin-reverse-slow"></div>
              
              {/* Central Glowing Core Symbol */}
              <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20 animate-pulse-glow shadow-lg">
                <span className="text-white font-bold text-sm tracking-widest uppercase">HR</span>
              </div>
            </div>

            {/* Entity Switch Metadata Info */}
            <h2 className="text-xl font-bold mt-8 tracking-wider text-white uppercase font-display">
              Corporate Context Switch
            </h2>
            <div className="w-12 h-0.5 bg-primary mt-3 mb-4 rounded-full opacity-60"></div>
            
            <p className="text-sm text-neutral-300 tracking-wide">
              Transitioning secure ledger references and statutory profiles to:
            </p>
            <p className="text-lg font-bold text-white mt-1 shadow-sm font-display tracking-tight">
              {switchingToEntityName}
            </p>

            <div className="mt-8 flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping"></div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant font-bold animate-pulse">
                Synchronizing Google sheets...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification HUD */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-white border border-neutral-border shadow-2xl rounded-lg p-4 flex items-start gap-3 animate-in slide-in-from-top-4 duration-300">
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1 text-left text-xs">
            <h4 className="font-bold text-on-background leading-tight">{toast.title}</h4>
            <p className="text-on-surface-variant mt-0.5">{toast.message}</p>
          </div>
          <button 
            onClick={() => setToast(prev => ({ ...prev, show: false }))}
            className="text-outline hover:text-on-surface transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Responsive Left Sidebar Navigation */}
      <Sidebar 
        currentTab={currentTab} 
        onTabChange={handleTabChange} 
        onNewRequest={() => setIsRequestModalOpen(true)}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        entities={entities}
        activeEntityId={activeEntityId}
        onChangeActiveEntity={handleCorporateSwitch}
      />

      {/* Right Column Layout */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Top bar (for search results & system status indicators) */}
        <header className="h-16 border-b border-neutral-border bg-surface px-6 flex justify-between items-center shrink-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile Toggle Button */}
            <button 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2 rounded hover:bg-surface-container transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5 text-primary" />
            </button>
            <span className="text-xs font-bold text-primary bg-primary/10 py-1 px-3 rounded-full hidden sm:inline-block">
              {companyName} Core Console
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Clock Date Widget */}
            <div className="text-right hidden md:block">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Local Time (Kuala Lumpur)</span>
              <span className="text-xs font-mono font-bold text-on-surface">{gmt8TimeStr || 'Loading clock...'}</span>
            </div>

            <div className="w-px h-8 bg-neutral-border/40 hidden md:block" />

            {/* Notifications Alert Bell */}
            <button 
              onClick={() => {
                const currentCycleId = reviewCycles[0]?.id || 'cycle-2026-annual';
                const completedCount = performances.filter(p => p.reviewCycleId === currentCycleId && p.reviewStatus === 'Completed').length;
                const pendingCount = Math.max(0, employees.length - completedCount);
                triggerNotification('HR Directives', `You have ${pendingCount} outstanding performance reviews due.`, 'info');
              }}
              className="p-2 rounded-full hover:bg-surface-container relative transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4 text-on-surface" />
            </button>
            {/* User Account context */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-neutral-border/40">
              <div className="w-8 h-8 rounded-full bg-primary text-[#FFDDB3] font-bold text-xs flex items-center justify-center border border-neutral-border">
                {currentUserName 
                  ? currentUserName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() 
                  : 'HR'}
              </div>
              <div className="text-left hidden sm:block leading-none">
                <span className="font-bold text-xs text-on-surface block">{currentUserName || 'System User'}</span>
                <span className="text-[10px] text-on-surface-variant mt-0.5 block">{currentUserRole || 'Global Administrator'}</span>
              </div>
              <button 
                onClick={handleSignOut}
                className="text-[10px] font-bold text-primary hover:text-primary-container ml-2.5 pl-2.5 border-l border-neutral-border/40 cursor-pointer uppercase transition-colors"
                title="Sign Out of Console"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Core Main Scrollable Content Pane */}
        <main className="flex-1 overflow-y-auto bg-surface-container-low p-6 md:p-8 select-text">
          {currentTab === 'dashboard' && (
            <DashboardView 
              employees={filteredEmployeesWithHistory}
              entities={entities}
              reviewCycles={reviewCycles}
              performances={filteredPerformances}
              payrollRecords2026={filteredPayrollRecords2026}
              onNavigate={handleTabChange}
              onOpenNewEmployeeModal={() => {
                handleTabChange('directory');
                triggerNotification('Directory Navigated', 'Click Add New Employee to register custom personnel.', 'info');
              }}
              onOpenRequestModal={() => setIsRequestModalOpen(true)}
              activeEntityId={activeEntityId}
              onChangeActiveEntity={handleCorporateSwitch}
            />
          )}

          {currentTab === 'payroll' && (
            <PayrollView 
	              employees={filteredEmployeesWithHistory}
	              payrollRecords2026={filteredPayrollRecords2026}
	              onUpdateEmployee={handleUpdateEmployeeSalary}
	              onSavePayrollRecord={handleSavePayrollRecord2026}
	              onShowNotification={triggerNotification}
	              activeEntity={activeEntity}
	            />
          )}

          {currentTab === 'payroll-mockup' && (
            <PayrollEditorMockupView
              employees={filteredEmployeesWithHistory}
              payrollRecords2026={filteredPayrollRecords2026}
              activeEntity={activeEntity}
              onBack={() => handleTabChange('payroll')}
              onSavePayrollRecord={handleSavePayrollRecord2026}
              onShowNotification={triggerNotification}
            />
          )}

          {currentTab === 'payslip-viewer' && (
            <PayslipDocumentView 
              employees={filteredEmployeesWithHistory}
              selectedEmployeeId={selectedEmployeeId}
              onBack={() => handleTabChange('payroll')}
              onShowNotification={triggerNotification}
              activeEntity={activeEntity}
              userRole={currentUserRole || 'Global Administrator'}
              entities={entities}
              allEmployeesForHrdCorp={currentActiveEmployees}
            />
          )}

          {currentTab === 'performance' && (
            <PerformanceView 
              employees={filteredEmployees}
              performances={filteredPerformances}
              reviewCycles={reviewCycles}
              onSavePerformance={handleSavePerformance}
              onShowNotification={triggerNotification}
            />
          )}

          {currentTab === 'directory' && (
            <EmployeeDirectoryView 
              employees={directoryEmployees}
              entities={entities}
              onAddEmployee={handleAddEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              onUpdateEmployee={handleUpdateEmployeeSalary}
              onShowNotification={triggerNotification}
              activeEntityId={activeEntityId}
              currentUserEmail={currentUserEmail}
            />
          )}

          {currentTab === 'entities' && (
            <EntitiesView 
              entities={entities}
              employees={currentActiveEmployees}
              onAddEntity={handleAddEntity}
              onUpdateEntity={handleUpdateEntity}
              onShowNotification={triggerNotification}
            />
          )}

          {currentTab === 'tax-settings' && (
            <TaxSettingsView 
              employees={filteredEmployees}
              onUpdateEmployee={handleUpdateEmployeeSalary}
              onShowNotification={triggerNotification}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsView 
              employees={filteredEmployeesWithHistory}
              performances={filteredPerformances}
              onShowNotification={triggerNotification}
            />
          )}

          {currentTab === 'leave-management' && (
            <LeaveManagementView 
              employees={filteredEmployees}
              onShowNotification={triggerNotification}
              activeEntityId={activeEntityId}
            />
          )}

          {currentTab === 'forms-directory' && (
            <FormsDirectoryView 
              employees={filteredEmployees}
              onShowNotification={triggerNotification}
              activeEntity={activeEntity}
            />
          )}

          {currentTab === 'hire-onboarding' && (
            <HireOnboardingView 
              entities={entities}
              onShowNotification={triggerNotification}
              onAddEmployee={handleAddEmployee}
              employees={filteredEmployees}
              candidates={filteredCandidates}
              onAddCandidate={handleAddCandidate}
              onUpdateCandidate={handleUpdateCandidate}
              onUpdateEmployee={handleUpdateEmployeeSalary}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              currentUserRole={currentUserRole}
            />
          )}

          {currentTab === 'department-role' && (
            <DepartmentRoleView 
              onShowNotification={triggerNotification}
              activeEntityId={activeEntityId}
              employees={filteredEmployees}
              onUpdateEmployee={handleUpdateEmployeeSalary}
            />
          )}

          {/* Tab: Settings Panel */}
          {currentTab === 'settings' && (
            <div className="space-y-6 text-left animate-in fade-in duration-200">
              <div className="max-w-2xl mx-auto bg-white border border-neutral-border rounded-lg p-6 shadow-sm space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-primary tracking-tight">System Settings</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">Customize global calculations constants, brand properties, and metadata.</p>
                </div>

                <div className="space-y-4 text-sm">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Company Legal Entity Name</label>
                    <input 
                      type="text" 
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="pt-2 border-t border-neutral-border space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-primary uppercase">Company Registration Details</h3>
                      <p className="text-[11px] text-on-surface-variant mt-1">Details shown on statutory records, payroll documents and company reports.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Company Address</label>
                      <textarea
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        rows={3}
                        className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none resize-y"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">SSM Registration Number</label>
                        <input
                          type="text"
                          value={companyRegistrationNumber}
                          onChange={(e) => setCompanyRegistrationNumber(e.target.value)}
                          className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Tax Reference (Employer Number)</label>
                        <input
                          type="text"
                          value={companyTaxReferenceNo}
                          onChange={(e) => setCompanyTaxReferenceNo(e.target.value)}
                          className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">EPF Reference Number</label>
                        <input
                          type="text"
                          value={companyEpfReferenceNo}
                          onChange={(e) => setCompanyEpfReferenceNo(e.target.value)}
                          className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">SOCSO Reference Number</label>
                        <input
                          type="text"
                          value={companySocsoReferenceNo}
                          onChange={(e) => setCompanySocsoReferenceNo(e.target.value)}
                          className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      </div>
                    </div>
                  </div>


                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Currency Symbol</label>
                      <select
                        value={currencySymbol}
                        onChange={(e) => setCurrencySymbol(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="RM">Malaysian Ringgit (RM)</option>
                        <option value="$">US Dollar ($)</option>
                        <option value="£">British Pound (£)</option>
                        <option value="€">Euro (€)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Standard EPF Employee Rate</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={taxRate}
                          onChange={(e) => setTaxRate(Number(e.target.value))}
                          className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none pr-8"
                        />
                        <span className="absolute right-2 top-2 text-xs font-bold text-outline">%</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-parchment/40 rounded border border-neutral-border text-xs leading-relaxed">
                    <h4 className="font-bold text-primary mb-1">Enterprise Configuration Standard</h4>
                    <p className="text-on-surface-variant text-[11px]">These global overrides apply automatically across the dynamic payslip calculators, report generators, and directory sheets in real-time.</p>
                  </div>

                  {isGoogleConfigured && (
                    <div className="pt-6 border-t border-neutral-border space-y-4">
                      <div>
                        <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Google Sheets Database Administration</h3>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">Clear personnel and payroll records from connected sheets so the workspace stays empty until real data is entered.</p>
                      </div>
                      <div>
                        <button
                          onClick={handleClearData}
                          disabled={isSeeding}
                          className="bg-primary text-white text-xs font-semibold py-2 px-4 rounded hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isSeeding ? 'Clearing Data...' : 'Clear Demo Data'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-neutral-border flex justify-end">
                  <button 
                    onClick={async () => {
                      if (isSavingCompanySettings) return;
                      if (!companyName.trim()) {
                        triggerNotification('Validation Error', 'Company legal entity name is required.', 'info');
                        return;
                      }
                      setIsSavingCompanySettings(true);
                      try {
                        localStorage.setItem('company_tax_rate', String(taxRate));
                        if (activeEntity) {
                          await handleUpdateEntity(activeEntity.id, {
                            name: companyName.trim(),
                            address: companyAddress.trim(),
                            registrationNumber: companyRegistrationNumber.trim(),
                            taxReferenceNo: companyTaxReferenceNo.trim(),
                            epfReferenceNo: companyEpfReferenceNo.trim(),
                            socsoReferenceNo: companySocsoReferenceNo.trim(),
                            currency: currencySymbol
                          });
                          triggerNotification('Settings Saved', 'Company profile and global settings synchronized successfully.');
                        } else {
                          triggerNotification('Settings Saved', 'Global override variables recalculated successfully.');
                        }
                        handleTabChange('dashboard');
                      } catch (err: any) {
                        triggerNotification('Save Failed', err.message || 'Company settings could not be saved.', 'info');
                      } finally {
                        setIsSavingCompanySettings(false);
                      }
                    }}
                    disabled={isSavingCompanySettings}
                    className="bg-primary text-white text-xs font-semibold py-2 px-6 rounded hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingCompanySettings ? 'Saving...' : 'Apply System Changes'}
                  </button>
                </div>
              </div>

              <AppAccessSettingsPreview
                employees={currentActiveEmployees}
                currentUserEmail={currentUserEmail}
                onShowNotification={triggerNotification}
              />

              {/* Card 2: PERKESO Statutory Configuration */}
              <div className="max-w-6xl mx-auto bg-white border border-neutral-border rounded-lg p-6 shadow-sm space-y-4">
                <div className="border-b border-neutral-border pb-3">
                  <h2 className="text-base font-bold text-primary uppercase tracking-wider">PERKESO Statutory Contribution Configuration</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5 font-medium">Manage rules, brackets, and phase compliance matrices for PERKESO.</p>
                </div>
                <SocsoConfigAdminView />
              </div>
            </div>
          )}

          {/* Tab: Help Support */}
          {currentTab === 'help' && (
            <div className="max-w-2xl mx-auto bg-white border border-neutral-border rounded-lg p-6 shadow-sm text-left animate-in fade-in duration-200 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-primary tracking-tight">Support Documentation & Guides</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Statutory compliance frameworks, EPF calculations, and directory procedures.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-surface-container-low rounded border-l-4 border-primary">
                  <h3 className="font-bold text-sm text-on-surface mb-1">How is EPF and SOCSO calculated?</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    EPF (Employees Provident Fund) is calculated at a standard rate of 11% for employees under 60 years old. SOCSO and EIS contributions are tiered matching statutory schedules for local payroll.
                  </p>
                </div>

                <div className="p-4 bg-surface-container-low rounded border-l-4 border-primary">
                  <h3 className="font-bold text-sm text-on-surface mb-1">Adding New Employees</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Registering a new employee in the Workforce Directory dynamically inserts their record into active memory. They immediately appear in the Payroll previews and evaluation scorecards for Oct 2026.
                  </p>
                </div>

                <div className="p-4 bg-surface-container-low rounded border-l-4 border-primary">
                  <h3 className="font-bold text-sm text-on-surface mb-1">Who do I contact for payroll audit changes?</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    For manual overrides, use the Adjust Salary options directly inside the active payslip preview or contact administrative support at <strong>support@acme-global.com</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Interactive Modal: New Request Form */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-neutral-border rounded-lg shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-border flex justify-between items-center bg-surface-container-low text-left">
              <h3 className="font-bold text-base text-primary">Submit Administrative Request</h3>
              <button 
                onClick={() => setIsRequestModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleRequestSubmit} className="p-6 text-left space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Request Type</label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                >
                  <option>Annual Leave</option>
                  <option>Travel Expense Reimbursement</option>
                  <option>Medical Allowance Claim</option>
                  <option>Corporate IT Hardware Request</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Target Effective Date</label>
                <input
                  type="date"
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Justification Details *</label>
                <textarea
                  rows={3}
                  required
                  value={requestDesc}
                  onChange={(e) => setRequestDesc(e.target.value)}
                  placeholder="Provide brief details/justification for your request..."
                  className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-neutral-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 bg-white border border-neutral-border hover:bg-surface-container rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded text-xs font-semibold hover:bg-primary-container"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
    </EntityContextProvider>
    </ErrorBoundary>
  );
}
