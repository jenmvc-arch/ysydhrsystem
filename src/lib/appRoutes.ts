import type { AppTab } from '../types';

export const APP_TAB_PATHS: Record<AppTab, string> = {
  dashboard: '/dashboard',
  'employee-portal': '/employee-portal',
  directory: '/employee-directory',
  payroll: '/payroll',
  'payroll-mockup': '/payroll/mockup',
  'payslip-viewer': '/payroll/payslip',
  performance: '/performance-appraisal',
  reports: '/reports',
  settings: '/settings',
  help: '/help',
  entities: '/entities',
  'tax-settings': '/tax-compliance',
  'leave-management': '/leave-management',
  'work-shift-groups': '/work-shift-groups',
  'forms-directory': '/forms-directory',
  'hire-onboarding': '/hire-onboarding',
  'department-role': '/department-roles',
  'socso-config': '/socso-config'
};

const APP_PATH_ALIASES: Partial<Record<string, AppTab>> = {
  '/directory': 'directory',
  '/employees': 'directory',
  '/performance': 'performance',
  '/tax-settings': 'tax-settings',
  '/department-role': 'department-role'
};

const normalizePath = (pathname: string) => {
  const path = pathname.trim() || '/';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
};

export const getPathForAppTab = (tab: AppTab) => APP_TAB_PATHS[tab];

export const getAppTabFromPath = (pathname: string): AppTab | null => {
  const normalizedPath = normalizePath(pathname);
  const alias = APP_PATH_ALIASES[normalizedPath];
  if (alias) return alias;

  const matches = (Object.entries(APP_TAB_PATHS) as Array<[AppTab, string]>)
    .sort(([, left], [, right]) => right.length - left.length);

  const match = matches.find(([, path]) => (
    normalizedPath === path || normalizedPath.startsWith(`${path}/`)
  ));

  return match?.[0] || null;
};

export type HireOnboardingSection =
  | 'pipeline'
  | 'application-form'
  | 'onboarding-form'
  | 'onboarding-portal';

export const HIRE_ONBOARDING_SECTION_PATHS: Record<HireOnboardingSection, string> = {
  pipeline: '/hire-onboarding',
  'application-form': '/hire-onboarding/job-application',
  'onboarding-form': '/hire-onboarding/employee-enrollment',
  'onboarding-portal': '/hire-onboarding/onboarding-portal'
};

export const getPathForHireOnboardingSection = (section: HireOnboardingSection) => (
  HIRE_ONBOARDING_SECTION_PATHS[section]
);

export const getHireOnboardingSectionFromPath = (pathname: string): HireOnboardingSection => {
  const normalizedPath = normalizePath(pathname);
  const match = (Object.entries(HIRE_ONBOARDING_SECTION_PATHS) as Array<[HireOnboardingSection, string]>)
    .sort(([, left], [, right]) => right.length - left.length)
    .find(([, path]) => normalizedPath === path);

  return match?.[0] || 'pipeline';
};
